function resolveApiBase() {
	const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
	if (configured) return configured.replace(/\/$/, '');
	return '';
}

const API_BASE_URL = resolveApiBase();

function buildQuery(params = {}) {
	const search = new URLSearchParams();
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === '') return;
		search.set(key, String(value));
	});
	const query = search.toString();
	return query ? `?${query}` : '';
}

export async function getServerState({ key, shopId = '', userId = '' }) {
	if (!key) return { value: null, error: { message: 'State key is required.' } };
	const endpoint = `${API_BASE_URL}/api/state${buildQuery({ key, shop_id: shopId, user_id: userId })}`;
	const response = await fetch(endpoint, { method: 'GET' });
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		return { value: null, error: payload?.error || { message: `Request failed (${response.status})` } };
	}
	return { value: payload?.data?.value ?? null, error: null };
}

export async function setServerState({ key, value, shopId = '', userId = '' }) {
	if (!key) return { error: { message: 'State key is required.' } };
	const endpoint = `${API_BASE_URL}/api/state`;
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ key, value, shop_id: shopId, user_id: userId })
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		return { error: payload?.error || { message: `Request failed (${response.status})` } };
	}
	return { error: null };
}

export async function deleteServerState({ key, shopId = '', userId = '' }) {
	if (!key) return { error: { message: 'State key is required.' } };
	const endpoint = `${API_BASE_URL}/api/state`;
	const response = await fetch(endpoint, {
		method: 'DELETE',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ key, shop_id: shopId, user_id: userId })
	});
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		return { error: payload?.error || { message: `Request failed (${response.status})` } };
	}
	return { error: null };
}
