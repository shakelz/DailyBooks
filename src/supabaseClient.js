function resolveApiBase() {
	const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
	if (configured) return configured.replace(/\/$/, '');
	return '';
}

const API_BASE_URL = resolveApiBase();

async function requestDb(spec) {
	const endpoint = `${API_BASE_URL}/api/db`;
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(spec),
	});

	let payload = null;
	try {
		payload = await response.json();
	} catch {
		payload = null;
	}

	if (!response.ok) {
		return {
			data: null,
			error: payload?.error || { message: `Request failed (${response.status})` }
		};
	}

	return {
		data: payload?.data ?? null,
		error: payload?.error ?? null
	};
}

class QueryBuilder {
	constructor(table) {
		this.table = String(table || '');
		this.action = 'select';
		this.columns = '*';
		this.filters = [];
		this.orderBy = null;
		this.limitBy = null;
		this.expectSingle = false;
		this.allowEmptySingle = false;
		this.returning = false;
		this.rows = [];
		this.payload = null;
		this.onConflict = 'id';
	}

	select(columns = '*') {
		const resolved = String(columns || '*');
		if (this.action === 'select') this.columns = resolved;
		else {
			this.returning = true;
			this.columns = resolved;
		}
		return this;
	}

	eq(column, value) {
		this.filters.push({ op: 'eq', column: String(column || ''), value });
		return this;
	}

	in(column, values) {
		this.filters.push({ op: 'in', column: String(column || ''), values: Array.isArray(values) ? values : [] });
		return this;
	}

	order(column, opts = {}) {
		this.orderBy = {
			column: String(column || ''),
			ascending: opts?.ascending !== false,
		};
		return this;
	}

	limit(value) {
		const parsed = Number(value);
		this.limitBy = Number.isFinite(parsed) ? parsed : null;
		return this;
	}

	single() {
		this.expectSingle = true;
		this.allowEmptySingle = false;
		return this;
	}

	maybeSingle() {
		this.expectSingle = true;
		this.allowEmptySingle = true;
		return this;
	}

	insert(rows) {
		this.action = 'insert';
		this.rows = Array.isArray(rows) ? rows : [rows];
		return this;
	}

	upsert(rows, options = {}) {
		this.action = 'upsert';
		this.rows = Array.isArray(rows) ? rows : [rows];
		if (typeof options?.onConflict === 'string' && options.onConflict.trim()) {
			this.onConflict = options.onConflict.trim();
		}
		return this;
	}

	update(payload) {
		this.action = 'update';
		this.payload = payload && typeof payload === 'object' ? payload : {};
		return this;
	}

	delete() {
		this.action = 'delete';
		return this;
	}

	async execute() {
		const spec = {
			action: this.action,
			table: this.table,
			columns: this.columns,
			filters: this.filters,
			order: this.orderBy,
			limit: this.limitBy,
			returning: this.returning,
			rows: this.rows,
			payload: this.payload,
			onConflict: this.onConflict,
		};

		const { data, error } = await requestDb(spec);
		if (error) return { data: null, error };

		if (!this.expectSingle) {
			return { data, error: null };
		}

		const rows = Array.isArray(data) ? data : [];
		if (rows.length > 0) return { data: rows[0], error: null };
		if (this.allowEmptySingle) return { data: null, error: null };
		return { data: null, error: { message: 'Expected a single row but none were returned.' } };
	}

	then(resolve, reject) {
		return this.execute().then(resolve, reject);
	}
}

class ChannelStub {
	constructor(name) {
		this.name = name;
	}

	on() {
		return this;
	}

	subscribe() {
		return this;
	}

	async send() {
		return { error: null };
	}
}

export const supabase = {
	from(table) {
		return new QueryBuilder(table);
	},
	channel(name) {
		return new ChannelStub(name);
	},
	removeChannel() {
		return true;
	},
};
