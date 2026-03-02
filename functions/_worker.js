const TABLES = new Set([
  'shops',
  'profiles',
  'inventory',
  'categories',
  'transactions',
  'repairs',
  'attendance'
]);

function isSafeIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function qi(identifier) {
  if (!isSafeIdentifier(identifier)) {
    throw new Error(`Unsafe identifier: ${String(identifier || '')}`);
  }
  return `"${identifier}"`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function normalizeFilters(rawFilters = []) {
  if (!Array.isArray(rawFilters)) return [];
  return rawFilters.map((item) => ({
    op: String(item?.op || '').toLowerCase(),
    column: String(item?.column || ''),
    value: item?.value,
    values: Array.isArray(item?.values) ? item.values : []
  }));
}

function buildWhere(filters = [], binds = []) {
  const clauses = [];
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

  if (!clauses.length) return '';
  return ` WHERE ${clauses.join(' AND ')}`;
}

async function executeSelect(env, spec) {
  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const binds = [];
  const filters = normalizeFilters(spec?.filters);
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
  const result = await env.DB.prepare(sql).bind(...binds).all();
  return result?.results || [];
}

async function executeInsertLike(env, spec, mode = 'insert') {
  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const rows = Array.isArray(spec?.rows) ? spec.rows : [];
  if (!rows.length) return [];

  const shouldReturn = Boolean(spec?.returning);
  const conflictColumn = isSafeIdentifier(spec?.onConflict) ? spec.onConflict : 'id';
  const out = [];

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
      const result = await env.DB.prepare(sql).bind(...binds).all();
      out.push(...(result?.results || []));
    } else {
      await env.DB.prepare(sql).bind(...binds).run();
    }
  }

  return out;
}

async function executeUpdate(env, spec) {
  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const payload = spec?.payload && typeof spec.payload === 'object' ? spec.payload : {};
  const columns = Object.keys(payload).filter(isSafeIdentifier);
  if (!columns.length) return [];

  const binds = columns.map((col) => payload[col]);
  const setSql = columns.map((col) => `${qi(col)} = ?`).join(', ');
  const filters = normalizeFilters(spec?.filters);
  const whereSql = buildWhere(filters, binds);

  let sql = `UPDATE ${qi(table)} SET ${setSql}${whereSql}`;
  if (spec?.returning) {
    sql += ' RETURNING *';
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return result?.results || [];
  }

  await env.DB.prepare(sql).bind(...binds).run();
  return [];
}

async function executeDelete(env, spec) {
  const table = String(spec?.table || '');
  if (!TABLES.has(table)) throw new Error(`Table not allowed: ${table}`);

  const binds = [];
  const filters = normalizeFilters(spec?.filters);
  const whereSql = buildWhere(filters, binds);

  let sql = `DELETE FROM ${qi(table)}${whereSql}`;
  if (spec?.returning) {
    sql += ' RETURNING *';
    const result = await env.DB.prepare(sql).bind(...binds).all();
    return result?.results || [];
  }

  await env.DB.prepare(sql).bind(...binds).run();
  return [];
}

async function handleDbRequest(request, env) {
  if (!env?.DB) {
    return json({ data: null, error: { message: 'D1 binding `DB` is missing.' } }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ data: null, error: { message: 'Invalid JSON body.' } }, 400);
  }

  const action = String(body?.action || 'select').toLowerCase();
  try {
    let data = [];

    if (action === 'select') data = await executeSelect(env, body);
    else if (action === 'insert') data = await executeInsertLike(env, body, 'insert');
    else if (action === 'upsert') data = await executeInsertLike(env, body, 'upsert');
    else if (action === 'update') data = await executeUpdate(env, body);
    else if (action === 'delete') data = await executeDelete(env, body);
    else throw new Error(`Unsupported action: ${action}`);

    return json({ data, error: null });
  } catch (error) {
    return json({ data: null, error: { message: error?.message || 'DB query failed.' } }, 400);
  }
}

function handleRuntimeRequest(request, env) {
  const url = new URL(request.url);
  return json({
    mode: env?.APP_ENV || 'production',
    branch: env?.CF_PAGES_BRANCH || '',
    commit: env?.CF_PAGES_COMMIT_SHA || '',
    origin: url.origin
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/db' && request.method === 'POST') {
      return handleDbRequest(request, env);
    }

    if (url.pathname === '/api/runtime' && request.method === 'GET') {
      return handleRuntimeRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
