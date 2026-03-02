type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type D1Result<T = Record<string, JsonValue>> = {
  results?: T[];
};

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, JsonValue>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Fetcher {
  fetch(input: Request | string | URL, init?: RequestInit): Promise<Response>;
}

type Filter = {
  op?: string;
  column?: string;
  value?: JsonValue;
  values?: JsonValue[];
};

type DbSpec = {
  action?: string;
  table?: string;
  columns?: string;
  filters?: Filter[];
  order?: { column?: string; ascending?: boolean };
  limit?: number;
  returning?: boolean;
  rows?: Record<string, JsonValue>[];
  payload?: Record<string, JsonValue>;
  onConflict?: string;
};

type AdminLoginRequest = {
  identifier?: string;
  password?: string;
};

type StateRequest = {
  key?: string;
  value?: JsonValue;
  shop_id?: string;
  user_id?: string;
};

type Env = {
  carefone_db?: D1Database;
  APP_ENV?: string;
  CF_PAGES_BRANCH?: string;
  CF_PAGES_COMMIT_SHA?: string;
  ASSETS: Fetcher;
};

const TABLES = new Set([
  'shops',
  'profiles',
  'inventory',
  'categories',
  'transactions',
  'repairs',
  'attendance',
]);

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function qi(identifier: string): string {
  if (!isSafeIdentifier(identifier)) {
    throw new Error(`Unsafe identifier: ${String(identifier || '')}`);
  }
  return `"${identifier}"`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function normalizeFilters(rawFilters: Filter[] = []): Required<Filter>[] {
  if (!Array.isArray(rawFilters)) return [];
  return rawFilters.map((item) => ({
    op: String(item?.op || '').toLowerCase(),
    column: String(item?.column || ''),
    value: item?.value ?? null,
    values: Array.isArray(item?.values) ? item.values : [],
  }));
}

function buildWhere(filters: Required<Filter>[] = [], binds: JsonValue[] = []): string {
  const clauses: string[] = [];

  for (const filter of filters) {
    if (!isSafeIdentifier(filter.column)) continue;

    if (filter.op === 'eq') {
      clauses.push(`${qi(filter.column)} = ?`);
      binds.push(filter.value);
      continue;
    }

    if (filter.op === 'in') {
      const values = Array.isArray(filter.values) ? filter.values : [];
      if (values.length === 0) {
        clauses.push('1 = 0');
        continue;
      }
      clauses.push(`${qi(filter.column)} IN (${values.map(() => '?').join(', ')})`);
      binds.push(...values);
    }
  }

  return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
}

async function executeSelect(env: Env, spec: DbSpec): Promise<Record<string, JsonValue>[]> {
  const db = env.carefone_db;
  if (!db) throw new Error('D1 binding `carefone_db` is missing.');

  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const binds: JsonValue[] = [];
  const filters = normalizeFilters(spec?.filters || []);
  const whereSql = buildWhere(filters, binds);

  let selectSql = '*';
  const rawColumns = String(spec?.columns || '*').trim();
  if (rawColumns && rawColumns !== '*') {
    const parts = rawColumns.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      selectSql = parts.map((part) => qi(part)).join(', ');
    }
  }

  let orderSql = '';
  if (spec?.order?.column && isSafeIdentifier(spec.order.column)) {
    const direction = spec?.order?.ascending === false ? 'DESC' : 'ASC';
    orderSql = ` ORDER BY ${qi(spec.order.column)} ${direction}`;
  }

  let limitSql = '';
  const limit = Number(spec?.limit);
  if (Number.isFinite(limit) && limit > 0) {
    limitSql = ' LIMIT ?';
    binds.push(Math.floor(limit));
  }

  const sql = `SELECT ${selectSql} FROM ${qi(table)}${whereSql}${orderSql}${limitSql}`;
  const result = await db.prepare(sql).bind(...binds).all();
  return (result?.results || []) as Record<string, JsonValue>[];
}

async function executeInsertLike(env: Env, spec: DbSpec, mode: 'insert' | 'upsert'): Promise<Record<string, JsonValue>[]> {
  const db = env.carefone_db;
  if (!db) throw new Error('D1 binding `carefone_db` is missing.');

  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const rows = Array.isArray(spec?.rows) ? spec.rows : [];
  if (!rows.length) return [];

  const shouldReturn = Boolean(spec?.returning);
  const conflictColumn = isSafeIdentifier(spec?.onConflict) ? spec.onConflict : 'id';
  const out: Record<string, JsonValue>[] = [];

  for (const row of rows) {
    const payload = row && typeof row === 'object' ? row : {};
    const columns = Object.keys(payload).filter(isSafeIdentifier);
    if (!columns.length) continue;

    const binds = columns.map((col) => payload[col]);
    const valuesSql = columns.map(() => '?').join(', ');
    const colsSql = columns.map((col) => qi(col)).join(', ');

    let sql = `INSERT INTO ${qi(table)} (${colsSql}) VALUES (${valuesSql})`;

    if (mode === 'upsert') {
      const updateCols = columns.filter((col) => col !== conflictColumn);
      const updateSql = updateCols.length
        ? updateCols.map((col) => `${qi(col)} = excluded.${qi(col)}`).join(', ')
        : `${qi(conflictColumn)} = excluded.${qi(conflictColumn)}`;
      sql += ` ON CONFLICT (${qi(conflictColumn)}) DO UPDATE SET ${updateSql}`;
    }

    if (shouldReturn) {
      sql += ' RETURNING *';
      const result = await db.prepare(sql).bind(...binds).all();
      out.push(...((result?.results || []) as Record<string, JsonValue>[]));
    } else {
      await db.prepare(sql).bind(...binds).run();
    }
  }

  return out;
}

async function executeUpdate(env: Env, spec: DbSpec): Promise<Record<string, JsonValue>[]> {
  const db = env.carefone_db;
  if (!db) throw new Error('D1 binding `carefone_db` is missing.');

  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const payload = spec?.payload && typeof spec.payload === 'object' ? spec.payload : {};
  const columns = Object.keys(payload).filter(isSafeIdentifier);
  if (!columns.length) return [];

  const binds: JsonValue[] = columns.map((col) => payload[col]);
  const setSql = columns.map((col) => `${qi(col)} = ?`).join(', ');
  const filters = normalizeFilters(spec?.filters || []);
  const whereSql = buildWhere(filters, binds);

  let sql = `UPDATE ${qi(table)} SET ${setSql}${whereSql}`;
  if (spec?.returning) {
    sql += ' RETURNING *';
    const result = await db.prepare(sql).bind(...binds).all();
    return (result?.results || []) as Record<string, JsonValue>[];
  }

  await db.prepare(sql).bind(...binds).run();
  return [];
}

async function executeDelete(env: Env, spec: DbSpec): Promise<Record<string, JsonValue>[]> {
  const db = env.carefone_db;
  if (!db) throw new Error('D1 binding `carefone_db` is missing.');

  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const binds: JsonValue[] = [];
  const filters = normalizeFilters(spec?.filters || []);
  const whereSql = buildWhere(filters, binds);

  let sql = `DELETE FROM ${qi(table)}${whereSql}`;
  if (spec?.returning) {
    sql += ' RETURNING *';
    const result = await db.prepare(sql).bind(...binds).all();
    return (result?.results || []) as Record<string, JsonValue>[];
  }

  await db.prepare(sql).bind(...binds).run();
  return [];
}

async function handleDbRequest(request: Request, env: Env): Promise<Response> {
  let body: DbSpec;
  try {
    body = (await request.json()) as DbSpec;
  } catch {
    return json({ data: null, error: { message: 'Invalid JSON body.' } }, 400);
  }

  const action = String(body?.action || 'select').toLowerCase();

  try {
    let data: Record<string, JsonValue>[] = [];

    if (action === 'select') data = await executeSelect(env, body);
    else if (action === 'insert') data = await executeInsertLike(env, body, 'insert');
    else if (action === 'upsert') data = await executeInsertLike(env, body, 'upsert');
    else if (action === 'update') data = await executeUpdate(env, body);
    else if (action === 'delete') data = await executeDelete(env, body);
    else throw new Error(`Unsupported action: ${action}`);

    return json({ data, error: null });
  } catch (error) {
    return json({ data: null, error: { message: (error as Error)?.message || 'DB query failed.' } }, 400);
  }
}

function handleRuntimeRequest(env: Env, request: Request): Response {
  const url = new URL(request.url);
  return json({
    mode: env.APP_ENV || 'production',
    branch: env.CF_PAGES_BRANCH || '',
    commit: env.CF_PAGES_COMMIT_SHA || '',
    origin: url.origin,
  });
}

async function handleAdminLoginRequest(request: Request, env: Env): Promise<Response> {
  const db = env.carefone_db;
  if (!db) {
    return json({ success: false, error: { message: 'D1 binding `carefone_db` is missing.' } }, 500);
  }

  let body: AdminLoginRequest;
  try {
    body = (await request.json()) as AdminLoginRequest;
  } catch {
    return json({ success: false, error: { message: 'Invalid JSON body.' } }, 400);
  }

  const identifier = String(body?.identifier || '').trim();
  const password = String(body?.password || '').trim();

  if (!identifier || !password) {
    return json({ success: false, error: { message: 'Identifier and password are required.' } }, 400);
  }

  try {
    const identifierLower = identifier.toLowerCase();
    const sql = `
      SELECT *
      FROM "profiles"
      WHERE "role" IN ('admin', 'superadmin', 'superuser')
        AND (LOWER("email") = ? OR "name" = ?)
      LIMIT 1
    `;

    const result = await db.prepare(sql).bind(identifierLower, identifier).all<Record<string, JsonValue>>();
    const profile = Array.isArray(result?.results) && result.results.length > 0 ? result.results[0] : null;

    if (!profile) {
      return json({ success: false, error: { message: 'Invalid credentials.' } }, 401);
    }

    const storedPassword = String(profile.password || '').trim();
    if (!storedPassword || storedPassword !== password) {
      return json({ success: false, error: { message: 'Invalid credentials.' } }, 401);
    }

    return json({ success: true, data: profile });
  } catch (error) {
    return json({ success: false, error: { message: (error as Error)?.message || 'Auth query failed.' } }, 400);
  }
}

function normalizeStateInput(input: StateRequest = {}): { key: string; shopId: string; userId: string; value: JsonValue | null } {
  return {
    key: String(input.key || '').trim(),
    shopId: String(input.shop_id || '').trim(),
    userId: String(input.user_id || '').trim(),
    value: input.value ?? null,
  };
}

async function ensureAppStateTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS "app_state" (
      "state_key" TEXT NOT NULL,
      "shop_id" TEXT NOT NULL DEFAULT '',
      "user_id" TEXT NOT NULL DEFAULT '',
      "state_value" TEXT,
      "updated_at" TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY ("state_key", "shop_id", "user_id")
    )
  `).run();
}

async function handleStateGet(request: Request, env: Env): Promise<Response> {
  const db = env.carefone_db;
  if (!db) return json({ data: null, error: { message: 'D1 binding `carefone_db` is missing.' } }, 500);

  const url = new URL(request.url);
  const input = normalizeStateInput({
    key: url.searchParams.get('key') || '',
    shop_id: url.searchParams.get('shop_id') || '',
    user_id: url.searchParams.get('user_id') || '',
  });

  if (!input.key) {
    return json({ data: null, error: { message: 'State key is required.' } }, 400);
  }

  try {
    await ensureAppStateTable(db);
    const result = await db
      .prepare(`
        SELECT "state_value", "updated_at"
        FROM "app_state"
        WHERE "state_key" = ? AND "shop_id" = ? AND "user_id" = ?
        LIMIT 1
      `)
      .bind(input.key, input.shopId, input.userId)
      .all<{ state_value?: string; updated_at?: string }>();

    const row = Array.isArray(result?.results) && result.results.length > 0 ? result.results[0] : null;
    let parsedValue: JsonValue | null = null;
    if (row?.state_value) {
      try {
        parsedValue = JSON.parse(row.state_value) as JsonValue;
      } catch {
        parsedValue = null;
      }
    }

    return json({ data: { key: input.key, value: parsedValue, updated_at: row?.updated_at || null }, error: null });
  } catch (error) {
    return json({ data: null, error: { message: (error as Error)?.message || 'Failed to get server state.' } }, 400);
  }
}

async function handleStateUpsert(request: Request, env: Env): Promise<Response> {
  const db = env.carefone_db;
  if (!db) return json({ data: null, error: { message: 'D1 binding `carefone_db` is missing.' } }, 500);

  let body: StateRequest;
  try {
    body = (await request.json()) as StateRequest;
  } catch {
    return json({ data: null, error: { message: 'Invalid JSON body.' } }, 400);
  }

  const input = normalizeStateInput(body);
  if (!input.key) {
    return json({ data: null, error: { message: 'State key is required.' } }, 400);
  }

  try {
    await ensureAppStateTable(db);
    const serialized = JSON.stringify(input.value);
    await db
      .prepare(`
        INSERT INTO "app_state" ("state_key", "shop_id", "user_id", "state_value", "updated_at")
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT ("state_key", "shop_id", "user_id")
        DO UPDATE SET "state_value" = excluded."state_value", "updated_at" = datetime('now')
      `)
      .bind(input.key, input.shopId, input.userId, serialized)
      .run();

    return json({ data: { key: input.key, saved: true }, error: null });
  } catch (error) {
    return json({ data: null, error: { message: (error as Error)?.message || 'Failed to save server state.' } }, 400);
  }
}

async function handleStateDelete(request: Request, env: Env): Promise<Response> {
  const db = env.carefone_db;
  if (!db) return json({ data: null, error: { message: 'D1 binding `carefone_db` is missing.' } }, 500);

  let body: StateRequest;
  try {
    body = (await request.json()) as StateRequest;
  } catch {
    return json({ data: null, error: { message: 'Invalid JSON body.' } }, 400);
  }

  const input = normalizeStateInput(body);
  if (!input.key) {
    return json({ data: null, error: { message: 'State key is required.' } }, 400);
  }

  try {
    await ensureAppStateTable(db);
    await db
      .prepare(`
        DELETE FROM "app_state"
        WHERE "state_key" = ? AND "shop_id" = ? AND "user_id" = ?
      `)
      .bind(input.key, input.shopId, input.userId)
      .run();

    return json({ data: { key: input.key, deleted: true }, error: null });
  } catch (error) {
    return json({ data: null, error: { message: (error as Error)?.message || 'Failed to delete server state.' } }, 400);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/db' && request.method === 'POST') {
      return handleDbRequest(request, env);
    }

    if (url.pathname === '/api/runtime' && request.method === 'GET') {
      return handleRuntimeRequest(env, request);
    }

    if (url.pathname === '/api/auth/admin-login' && request.method === 'POST') {
      return handleAdminLoginRequest(request, env);
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      return handleStateGet(request, env);
    }

    if (url.pathname === '/api/state' && request.method === 'POST') {
      return handleStateUpsert(request, env);
    }

    if (url.pathname === '/api/state' && request.method === 'DELETE') {
      return handleStateDelete(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
