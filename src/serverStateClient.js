import { supabase } from './supabaseClient';

export async function getServerState({ key, shopId = '', userId = '' }) {
	if (!key) return { value: null, error: { message: 'State key is required.' } };

	const { data, error } = await supabase
		.from('app_state')
		.select('state_value, updated_at')
		.eq('state_key', String(key))
		.eq('shop_id', String(shopId || ''))
		.eq('user_id', String(userId || ''))
		.limit(1)
		.maybeSingle();

	if (error) {
		return { value: null, error: { message: error.message || 'Failed to load server state.' } };
	}

	return { value: data?.state_value ?? null, error: null };
}

export async function setServerState({ key, value, shopId = '', userId = '' }) {
	if (!key) return { error: { message: 'State key is required.' } };

	const payload = {
		state_key: String(key),
		shop_id: String(shopId || ''),
		user_id: String(userId || ''),
		state_value: value,
		updated_at: new Date().toISOString(),
	};

	const { error } = await supabase
		.from('app_state')
		.upsert(payload, { onConflict: 'state_key,shop_id,user_id' });

	if (error) {
		return { error: { message: error.message || 'Failed to save server state.' } };
	}

	return { error: null };
}

export async function deleteServerState({ key, shopId = '', userId = '' }) {
	if (!key) return { error: { message: 'State key is required.' } };

	const { error } = await supabase
		.from('app_state')
		.delete()
		.eq('state_key', String(key))
		.eq('shop_id', String(shopId || ''))
		.eq('user_id', String(userId || ''));

	if (error) {
		return { error: { message: error.message || 'Failed to delete server state.' } };
	}

	return { error: null };
}
