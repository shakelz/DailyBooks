import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const supabaseConfigError = (!supabaseUrl || !supabaseAnonKey)
  ? 'Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.'
  : '';

const SUPABASE_SINGLETON_KEY = '__dailybooks_supabase_singleton_v1__';

function createSupabaseSingleton() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // App runs custom profile auth; disable Supabase Auth session locks in browser.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function isSupabaseLockTimeoutError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return false;
  return (
    (message.includes('lock') && message.includes('timeout'))
    || message.includes('navigatorlockacquiretimeouterror')
    || message.includes('navigator lockmanager')
    || message.includes('auth-token')
  );
}

export async function withSupabaseLockRetry(operation, options = {}) {
  const retries = Number.isFinite(Number(options?.retries)) ? Math.max(0, Number(options.retries)) : 1;
  const delayMs = Number.isFinite(Number(options?.delayMs)) ? Math.max(0, Number(options.delayMs)) : 120;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      if (!isSupabaseLockTimeoutError(error) || attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt += 1;
    }
  }

  return operation();
}

export const supabase = (() => {
  if (supabaseConfigError) return null;
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : window;
  if (!globalScope[SUPABASE_SINGLETON_KEY]) {
    globalScope[SUPABASE_SINGLETON_KEY] = createSupabaseSingleton();
  }
  return globalScope[SUPABASE_SINGLETON_KEY];
})();
