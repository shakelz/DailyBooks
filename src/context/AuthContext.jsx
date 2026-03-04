import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

const GLOBAL_ADMIN_ROLES = ['super_admin'];
const ADMIN_ROLES = ['super_admin', 'owner', 'admin', 'superadmin', 'superuser'];
const DB_ADMIN_ROLES = ['super_admin', 'owner'];
const AUTH_TOKEN_KEY = 'token';
const AUTH_ROLE_STATE_KEY = 'dailybooks_auth_role_v1';
const AUTH_USER_STATE_KEY = 'dailybooks_auth_user_v1';
const AUTH_SHOP_STATE_KEY = 'dailybooks_auth_shop_v1';
const SALESMAN_META_STORAGE_KEY = 'dailybooks_salesman_meta_v1';
const SHOP_META_STORAGE_KEY = 'dailybooks_shop_meta_v1';
const SLOW_MOVING_DAYS_KEY = 'dailybooks_slow_moving_days_v1';
const AUTO_LOCK_ENABLED_KEY = 'dailybooks_auto_lock_enabled_v1';
const AUTO_LOCK_TIMEOUT_KEY = 'dailybooks_auto_lock_timeout_v1';
const AUTH_RATE_LIMIT_KEY = 'dailybooks_auth_rate_limit_v1';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const AUTH_RATE_LIMIT_ENABLED = false; // temporary: disable failed-attempt lockout

const volatileAuthStore = {
    role: '',
    user: '',
    shop: ''
};

const DEFAULT_SALESMAN_PERMISSIONS = {
    canEditTransactions: false,
    canBulkEdit: false
};

async function ensureSupabaseSession() {
    // Custom auth mode: no Supabase Auth session required.
    const existingToken = asString(readStorage(AUTH_TOKEN_KEY, ''));
    if (existingToken) return { ok: true, error: null };
    return { ok: true, error: null };
}

function setAuthTokenFromSupabaseSession(session) {
    const token = asString(session?.access_token || session?.token);
    if (token) {
        writeStorage(AUTH_TOKEN_KEY, token);
        return;
    }
    removeStorage(AUTH_TOKEN_KEY);
}

function makeLocalSessionToken(userId = '', role = '') {
    const payload = {
        uid: asString(userId),
        role: asString(role),
        issuedAt: Date.now(),
        nonce: Math.random().toString(36).slice(2)
    };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

async function hashPlainText(value = '') {
    const input = asString(value);
    if (!input) return '';
    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.subtle.digest) {
        return input;
    }
    const encoded = new TextEncoder().encode(input);
    const digestBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const digestArray = Array.from(new Uint8Array(digestBuffer));
    return digestArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyAgainstStoredHash(plainText = '', stored = '') {
    const rawValue = asString(plainText);
    const storedValue = asString(stored);
    if (!rawValue || !storedValue) return false;
    if (rawValue === storedValue) return true;
    const hashed = await hashPlainText(rawValue);
    return asString(hashed) === storedValue;
}

function clearPersistedAuthState() {
    volatileAuthStore.role = '';
    volatileAuthStore.user = '';
    volatileAuthStore.shop = '';
    removeStorage(AUTH_ROLE_STATE_KEY);
    removeStorage(AUTH_USER_STATE_KEY);
    removeStorage(AUTH_SHOP_STATE_KEY);
}

function readAuthState(key, fallback = '') {
    let value = '';
    if (key === AUTH_ROLE_STATE_KEY) value = volatileAuthStore.role || readStorage(AUTH_ROLE_STATE_KEY, '');
    if (key === AUTH_USER_STATE_KEY) value = volatileAuthStore.user || readStorage(AUTH_USER_STATE_KEY, '');
    if (key === AUTH_SHOP_STATE_KEY) value = volatileAuthStore.shop || readStorage(AUTH_SHOP_STATE_KEY, '');
    return value ?? fallback;
}

function writeAuthState(key, value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    if (key === AUTH_ROLE_STATE_KEY) volatileAuthStore.role = normalized;
    if (key === AUTH_USER_STATE_KEY) volatileAuthStore.user = normalized;
    if (key === AUTH_SHOP_STATE_KEY) volatileAuthStore.shop = normalized;
    writeStorage(key, normalized);
}

function readStorage(key, fallback = '') {
    if (typeof window === 'undefined') return fallback;
    try {
        const value = window.localStorage.getItem(key);
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

function writeStorage(key, value) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(key, value === null || value === undefined ? '' : String(value));
    } catch {
        return;
    }
}

function removeStorage(key) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        return;
    }
}

function readSessionStorage(key, fallback = '') {
    if (typeof window === 'undefined') return fallback;
    try {
        const value = window.sessionStorage.getItem(key);
        return value ?? fallback;
    } catch {
        return fallback;
    }
}

function writeSessionStorage(key, value) {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(key, value === null || value === undefined ? '' : String(value));
    } catch {
        return;
    }
}

function removeSessionStorage(key) {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        return;
    }
}

function safeParseJSON(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function asString(value) {
    return value === null || value === undefined ? '' : String(value).trim();
}

function asBoolean(value) {
    if (typeof value === 'boolean') return value;
    const normalized = asString(value).toLowerCase();
    if (!normalized) return false;
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'online';
}

function asNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function isStackDepthError(error) {
    const message = asString(error?.message).toLowerCase();
    return message.includes('stack depth limit exceeded');
}

function isMissingColumnError(error, columnName = '') {
    const message = asString(error?.message).toLowerCase();
    if (!message) return false;
    const missingColumn =
        message.includes('column')
        && (
            message.includes('does not exist')
            || message.includes('schema cache')
            || message.includes('could not find')
        );
    if (!missingColumn) return false;
    const target = asString(columnName).toLowerCase();
    return target ? message.includes(target) : true;
}

function shouldSkipAdminRateLimit(errorMessage = '') {
    const message = asString(errorMessage).toLowerCase();
    if (!message) return false;
    if (message.includes('column') && (message.includes('does not exist') || message.includes('schema cache'))) return true;
    return false;
}

function isInvalidAuthCredentialsError(error) {
    const message = asString(error?.message).toLowerCase();
    return message.includes('invalid login credentials');
}

function normalizeRoleName(value) {
    const role = asString(value).toLowerCase();
    if (!role) return '';
    if (role === 'admin') return 'owner';
    if (role === 'superadmin' || role === 'superuser') return 'super_admin';
    return role;
}

function normalizeDbRoleFilter(roles = []) {
    const input = Array.isArray(roles) ? roles : [roles];
    const canonical = input
        .map((role) => normalizeRoleName(role))
        .filter(Boolean);
    const allowed = canonical.filter((role) => role === 'super_admin' || role === 'owner' || role === 'salesman');
    return Array.from(new Set(allowed));
}

function isSuperAdminRole(value) {
    return normalizeRoleName(value) === 'super_admin';
}

function isAdminRoleName(value) {
    const role = normalizeRoleName(value);
    return role === 'super_admin' || role === 'owner';
}

function getAdminRedirectPath(role) {
    return isSuperAdminRole(role) ? '/admin/dashboard' : '/admin/owner-dashboard';
}

function getProfileId(profile = {}) {
    return asString(profile?.user_id || profile?.id);
}

function getShopId(shop = {}) {
    return asString(shop?.shop_id || shop?.id);
}

function readRateLimitState() {
    return readLocalJSON(AUTH_RATE_LIMIT_KEY, {});
}

function writeRateLimitState(state = {}) {
    writeStorage(AUTH_RATE_LIMIT_KEY, JSON.stringify(state || {}));
}

function getRateLimitEntry(scope = '') {
    const key = asString(scope) || 'default';
    const state = readRateLimitState();
    const entry = state?.[key] && typeof state[key] === 'object' ? state[key] : {};
    const lockUntil = asNumber(entry.lockUntil, 0);
    const failed = asNumber(entry.failed, 0);
    return {
        key,
        failed: Math.max(0, Math.floor(failed)),
        lockUntil: Math.max(0, Math.floor(lockUntil)),
    };
}

function clearRateLimit(scope = '') {
    if (!AUTH_RATE_LIMIT_ENABLED) return;
    const key = asString(scope) || 'default';
    const state = readRateLimitState();
    if (!Object.prototype.hasOwnProperty.call(state, key)) return;
    delete state[key];
    writeRateLimitState(state);
}

function bumpRateLimit(scope = '') {
    if (!AUTH_RATE_LIMIT_ENABLED) return { failed: 0, lockUntil: 0 };
    const key = asString(scope) || 'default';
    const current = getRateLimitEntry(key);
    const nextFailed = current.failed + 1;
    const now = Date.now();
    const lockUntil = nextFailed >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : 0;
    const state = readRateLimitState();
    state[key] = { failed: nextFailed, lockUntil };
    writeRateLimitState(state);
    return { failed: nextFailed, lockUntil };
}

function getLockoutMessage(scope = '') {
    if (!AUTH_RATE_LIMIT_ENABLED) return '';
    const entry = getRateLimitEntry(scope);
    if (!entry.lockUntil || entry.lockUntil <= Date.now()) return '';
    const remaining = Math.max(1, Math.ceil((entry.lockUntil - Date.now()) / 60000));
    return `Too many failed attempts. Try again in ${remaining} minute(s).`;
}

async function computePinDigest(shopId, pin) {
    const rawPin = asString(pin);
    if (!rawPin) return '';

    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.subtle.digest) {
        return '';
    }

    const encoded = new TextEncoder().encode(rawPin);
    const digestBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const digestArray = Array.from(new Uint8Array(digestBuffer));
    return digestArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function computeOwnerPasswordHash(password) {
    const rawPassword = asString(password);
    if (!rawPassword) return '';
    if (typeof crypto === 'undefined' || !crypto.subtle || !crypto.subtle.digest) {
        return rawPassword;
    }
    const encoded = new TextEncoder().encode(rawPassword);
    const digestBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const digestArray = Array.from(new Uint8Array(digestBuffer));
    return digestArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyOwnerLogin(identifier, password) {
    const normalizedIdentifier = asString(identifier).toLowerCase();
    const normalizedPassword = asString(password);
    if (!normalizedIdentifier || !normalizedPassword) {
        return { profile: null, error: 'Identifier and password are required' };
    }

    const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_email', normalizedIdentifier)
        .limit(1);

    if (error) {
        return { profile: null, error: asString(error?.message) || 'Invalid credentials' };
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { profile: null, error: 'Invalid credentials' };

    const directPassword = asString(row?.owner_password_hash || row?.owner_password);
    const isPasswordValid = await verifyAgainstStoredHash(normalizedPassword, directPassword);
    if (!isPasswordValid) {
        return { profile: null, error: 'Invalid credentials' };
    }

    return {
        profile: {
            user_id: '',
            shop_id: asString(row?.shop_id),
            full_name: asString(row?.shop_name || row?.name || 'Owner'),
            role: 'owner',
            active: true,
            email: asString(row?.owner_email),
        },
        error: null,
    };
}

async function verifySalesmanPin(pin, shopId = '') {
    const safePin = asString(pin);
    if (!safePin) return { profile: null, error: 'PIN required' };

    const sid = asString(shopId);

    const digest = await computePinDigest(shopId, safePin);
    if (!digest) {
        return { profile: null, error: 'Unable to verify PIN.' };
    }

    let query = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'salesman')
        .eq('pin_digest', digest)
        .limit(2);

    if (sid) {
        query = query.eq('shop_id', sid);
    }

    const { data, error } = await query;

    if (error) {
        return { profile: null, error: asString(error?.message) || 'Invalid PIN' };
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 1) {
        return { profile: null, error: 'PIN conflict found. Ask admin to reset duplicate PINs.' };
    }

    const row = rows[0];
    if (!row) return { profile: null, error: 'Invalid PIN' };
    if (row.active === false) return { profile: null, error: 'User disabled' };
    return { profile: row, error: null };
}

async function findShopById(shopId = '') {
    const sid = asString(shopId);
    if (!sid) return null;

    const byShopId = await supabase
        .from('shops')
        .select('*')
        .eq('shop_id', sid)
        .limit(1);
    if (!byShopId.error && Array.isArray(byShopId.data) && byShopId.data[0]) {
        return byShopId.data[0];
    }

    return null;
}

async function runShopMutationById(shopId = '', mutateByColumn) {
    const sid = asString(shopId);
    if (!sid || typeof mutateByColumn !== 'function') {
        return { data: null, error: { message: 'Invalid shop lookup.' } };
    }

    return mutateByColumn('shop_id', sid);
}

async function selectSingleShopById(shopId = '') {
    const sid = asString(shopId);
    if (!sid) {
        return { data: null, error: { message: 'Invalid shop lookup.' } };
    }

    return supabase.from('shops').select('*').eq('shop_id', sid).maybeSingle();
}

async function updateShopById(shopId = '', payload = {}, withSelect = false) {
    return runShopMutationById(shopId, (column, sid) => {
        let query = supabase.from('shops').update(payload).eq(column, sid);
        if (withSelect) {
            query = query.select().single();
        }
        return query;
    });
}

async function deleteShopById(shopId = '') {
    return runShopMutationById(shopId, (column, sid) => supabase.from('shops').delete().eq(column, sid));
}

async function resolveAdminEmailFromProfile(profile = {}) {
    const directEmail = asString(profile?.owner_email).toLowerCase();
    if (directEmail) return directEmail;

    const sid = asString(profile?.shop_id || profile?.shopId);
    if (!sid) return '';

    const shop = await findShopById(sid);
    return asString(shop?.owner_email).toLowerCase();
}

async function findAdminProfileByIdentifier(identifier = '') {
    const key = asString(identifier);
    if (!key) return { profile: null, error: null };

    const lookupFields = ['username', 'full_name'];
    for (const field of lookupFields) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .ilike(field, key)
            .in('role', DB_ADMIN_ROLES)
            .limit(1);

        if (error) {
            if (isMissingColumnError(error, field)) {
                continue;
            }
            return { profile: null, error: asString(error?.message) || 'Unable to validate admin username.' };
        }

        const row = Array.isArray(data) ? data[0] : null;
        if (row) {
            return { profile: row, error: null };
        }
    }

    return { profile: null, error: null };
}

async function findAdminProfileByPrimaryId(primaryId = '') {
    const pid = asString(primaryId);
    if (!pid) return null;

    const byUserId = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', pid)
        .in('role', DB_ADMIN_ROLES)
        .limit(1);
    if (!byUserId.error && Array.isArray(byUserId.data) && byUserId.data[0]) {
        return byUserId.data[0];
    }

    return null;
}

async function resolveAdminAuthFromIdentifier(identifier = '') {
    const key = asString(identifier);
    if (!key) return { authEmail: '', profileId: '', role: '', shopId: '', error: '' };

    const profileLookup = await findAdminProfileByIdentifier(key);
    const row = profileLookup?.profile || null;

    if (!row) {
        if (key.includes('@')) {
            const byShopOwnerEmail = await findAdminProfileByShopOwnerEmail(key);
            if (!byShopOwnerEmail) {
                return { authEmail: '', profileId: '', role: '', shopId: '', error: '' };
            }
            return {
                authEmail: asString(key).toLowerCase(),
                profileId: asString(getProfileId(byShopOwnerEmail)),
                role: normalizeRoleName(byShopOwnerEmail?.role),
                shopId: asString(byShopOwnerEmail?.shop_id),
                error: '',
            };
        }
        return { authEmail: '', profileId: '', role: '', shopId: '', error: '' };
    }

    return {
        authEmail: asString(row?.email || row?.owner_email || '').toLowerCase(),
        profileId: asString(getProfileId(row)),
        role: normalizeRoleName(row?.role),
        shopId: asString(row?.shop_id),
        error: '',
    };
}

async function findAdminProfileByShopOwnerEmail(email = '') {
    const normalizedEmail = asString(email).toLowerCase();
    if (!normalizedEmail) return null;

    const { data: shopsByEmail, error: shopsError } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_email', normalizedEmail);

    if (shopsError || !Array.isArray(shopsByEmail) || shopsByEmail.length === 0) {
        return null;
    }

    const shopIds = shopsByEmail
        .map((row) => asString(row?.id || row?.shop_id))
        .filter(Boolean);
    if (!shopIds.length) return null;

    const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('shop_id', shopIds)
        .in('role', DB_ADMIN_ROLES)
        .limit(1);

    if (profileError || !Array.isArray(profileRows) || !profileRows[0]) {
        return null;
    }

    return profileRows[0];
}

async function requestAdminLogin({ identifier, password }) {
    const normalizedIdentifier = asString(identifier);
    const normalizedPassword = asString(password);
    if (!normalizedIdentifier || !normalizedPassword) {
        return { profile: null, error: 'Email/username and password are required.' };
    }

    const identifierLower = normalizedIdentifier.toLowerCase();
    const selectFields = 'user_id,id,shop_id,full_name,role,active,password_hash,password,email,username';

    let query = supabase
        .from('profiles')
        .select(selectFields)
        .in('role', DB_ADMIN_ROLES)
        .eq('active', true)
        .limit(20);

    if (identifierLower.includes('@')) {
        query = query.or(`email.ilike.${identifierLower},username.ilike.${identifierLower}`);
    } else {
        query = query.ilike('full_name', normalizedIdentifier);
    }

    const { data, error } = await query;
    if (error) {
        return { profile: null, error: asString(error?.message) || 'Unable to validate admin credentials.' };
    }

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) {
        return { profile: null, error: 'Invalid credentials.' };
    }

    let matchedProfile = null;
    for (const candidate of rows) {
        const storedHash = asString(candidate?.password_hash || candidate?.password);
        const passwordOk = await verifyAgainstStoredHash(normalizedPassword, storedHash);
        if (passwordOk) {
            matchedProfile = candidate;
            break;
        }
    }

    if (!matchedProfile) {
        return { profile: null, error: 'Invalid credentials.' };
    }

    const normalizedRole = normalizeRoleName(matchedProfile?.role);
    if (!isAdminRoleName(normalizedRole)) {
        return { profile: null, error: 'Not allowed.' };
    }

    const fallbackProfileId = asString(getProfileId(matchedProfile));
    const profile = {
        ...matchedProfile,
        id: fallbackProfileId,
        user_id: fallbackProfileId,
        role: normalizedRole,
        email: asString(matchedProfile?.email || matchedProfile?.username).toLowerCase(),
        active: matchedProfile?.active !== false,
    };

    return {
        profile: {
            ...profile,
            role: normalizedRole,
            email: asString(profile.email),
            user_id: fallbackProfileId,
        },
        error: null,
    };
}

async function requestAttendanceLogs(shopId) {
    const sid = asString(shopId);
    if (!sid) return { data: [], error: 'shop_id is required' };

    const { data: rows, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('shop_id', sid)
        .order('created_at', { ascending: false });

    if (error) {
        return { data: [], error: asString(error.message) || 'Failed to load attendance.' };
    }

    const userIds = Array.from(new Set((Array.isArray(rows) ? rows : []).map((row) => asString(row?.user_id)).filter(Boolean)));
    let profileNameById = {};
    if (userIds.length) {
        const { data: profileRows } = await supabase
            .from('profiles')
            .select('user_id,full_name')
            .in('user_id', userIds);

        profileNameById = (Array.isArray(profileRows) ? profileRows : []).reduce((acc, row) => {
            acc[asString(row?.user_id)] = asString(row?.full_name);
            return acc;
        }, {});
    }

    const expanded = (Array.isArray(rows) ? rows : []).flatMap((row) => {
        const userName = asString(profileNameById[asString(row?.user_id)] || '');
        const base = {
            ...row,
            userId: asString(row?.user_id),
            userName,
            workerId: asString(row?.user_id),
            workerName: userName,
        };

        const events = [];
        const attendanceRowId = asString(row?.attendance_id);
        if (asString(row?.check_in)) {
            events.push({ ...base, id: `${attendanceRowId}:IN`, type: 'IN', timestamp: asString(row?.check_in) });
        }
        if (asString(row?.check_out)) {
            events.push({ ...base, id: `${attendanceRowId}:OUT`, type: 'OUT', timestamp: asString(row?.check_out) });
        }
        if (!events.length) {
            events.push({ ...base, id: attendanceRowId, type: 'IN', timestamp: asString(row?.created_at) });
        }
        return events;
    });

    return { data: expanded, error: null };
}

async function requestAttendanceAction({ userId, shopId, type, timestamp }) {
    const uid = asString(userId);
    const sid = asString(shopId);
    const punchType = asString(type).toUpperCase();
    const ts = asString(timestamp) || new Date().toISOString();

    if (!uid || !sid || (punchType !== 'IN' && punchType !== 'OUT')) {
        return { data: null, error: 'user_id, shop_id and type(IN/OUT) are required.' };
    }

    if (punchType === 'IN') {
        let hourlyRateSnapshot = null;
        const { data: profileRow } = await supabase
            .from('profiles')
            .select('hourly_rate')
            .eq('user_id', uid)
            .eq('shop_id', sid)
            .limit(1)
            .maybeSingle();

        const parsedRate = asNumber(profileRow?.hourly_rate, NaN);
        if (Number.isFinite(parsedRate)) {
            hourlyRateSnapshot = parsedRate;
        }

        const insertPayload = {
            shop_id: sid,
            user_id: uid,
            check_in: ts,
            hourly_rate_snapshot: hourlyRateSnapshot,
        };
        const { error: inError } = await supabase
            .from('attendance')
            .insert([insertPayload]);

        if (inError) {
            console.error('Attendance punch IN insert failed:', {
                payload: insertPayload,
                error: inError,
            });
            return { data: null, error: asString(inError.message) || 'Failed to punch in.' };
        }
    } else {
        const { data: openRow, error: openError } = await supabase
            .from('attendance')
            .select('attendance_id,check_in,hourly_rate_snapshot')
            .eq('shop_id', sid)
            .eq('user_id', uid)
            .not('check_in', 'is', null)
            .is('check_out', null)
            .order('check_in', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (openError) {
            console.error('Attendance open-row lookup failed before punch OUT:', {
                shop_id: sid,
                user_id: uid,
                error: openError,
            });
            return { data: null, error: asString(openError.message) || 'Failed to punch out.' };
        }
        const openAttendanceId = asString(openRow?.attendance_id);
        if (!openAttendanceId) return { data: null, error: 'Cannot punch out without an active punch in.' };

        const startMs = new Date(asString(openRow.check_in)).getTime();
        const endMs = new Date(ts).getTime();
        const hours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
            ? Math.round(((endMs - startMs) / 3600000) * 100) / 100
            : 0;
        const rateSnapshot = asNumber(openRow?.hourly_rate_snapshot, NaN);
        const payAmount = Number.isFinite(rateSnapshot)
            ? Math.round((hours * rateSnapshot) * 100) / 100
            : null;

        const { error: outError } = await supabase
            .from('attendance')
            .update({
                check_out: ts,
                hours,
                pay_amount: payAmount,
            })
            .eq('attendance_id', openAttendanceId);

        if (outError) {
            console.error('Attendance punch OUT update failed:', {
                attendance_id: openAttendanceId,
                shop_id: sid,
                user_id: uid,
                check_out: ts,
                hours,
                pay_amount: payAmount,
                error: outError,
            });
            return { data: null, error: asString(outError.message) || 'Failed to punch out.' };
        }
    }

    await syncProfileOnlineStatus(sid, uid);

    return { data: { type: punchType, timestamp: ts }, error: null };
}

async function requestUserStatus({ shopId, userId }) {
    const sid = asString(shopId);
    const uid = asString(userId);
    if (!sid || !uid) return { data: null, error: 'shop_id and user_id are required' };

    const { data: openRow, error } = await supabase
        .from('attendance')
        .select('attendance_id,check_in,check_out,created_at')
        .eq('shop_id', sid)
        .eq('user_id', uid)
        .not('check_in', 'is', null)
        .is('check_out', null)
        .order('check_in', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        return { data: null, error: asString(error.message) || 'Failed to load user status.' };
    }

    return {
        data: {
            user_id: uid,
            shop_id: sid,
            is_punched_in: Boolean(openRow),
            active_attendance: openRow ? {
                id: openRow.attendance_id || null,
                punch_in_time: openRow.check_in || null,
                punch_out_time: openRow.check_out || null,
                created_at: openRow.created_at || null,
            } : null,
        },
        error: null,
    };
}

async function requestStaffStatus(shopId) {
    const sid = asString(shopId);
    if (!sid) return { data: [], error: 'shop_id is required' };

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id,full_name,role,is_online,shop_id')
        .eq('shop_id', sid)
        .order('full_name', { ascending: true });

    if (error) return { data: [], error: asString(error.message) || 'Failed to load staff status.' };

    return {
        data: (Array.isArray(profiles) ? profiles : []).map((row) => ({
            user_id: asString(row.user_id),
            name: asString(row.full_name),
            role: asString(row.role),
            is_online: asBoolean(row.is_online),
        })),
        error: null,
    };
}

function readLocalJSON(key, fallback) {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function sanitizeSalesmanMeta(meta = {}) {
    const numberRaw = asNumber(meta.salesmanNumber, NaN);
    return {
        salesmanNumber: Number.isFinite(numberRaw) && numberRaw > 0 ? Math.floor(numberRaw) : 0,
        canEditTransactions: asBoolean(meta.canEditTransactions),
        canBulkEdit: asBoolean(meta.canBulkEdit)
    };
}

function getSalesmanMeta(metaMap = {}, shopId = '', salesmanId = '') {
    const sid = asString(shopId);
    const uid = asString(salesmanId);
    if (!sid || !uid) {
        return { salesmanNumber: 0, ...DEFAULT_SALESMAN_PERMISSIONS };
    }
    const raw = metaMap?.[sid]?.[uid] || {};
    return {
        ...DEFAULT_SALESMAN_PERMISSIONS,
        ...sanitizeSalesmanMeta(raw)
    };
}

function mergeSalesmanMeta(profile = {}, metaMap = {}) {
    if (!profile || typeof profile !== 'object') return profile;
    const sid = asString(profile.shop_id);
    const uid = asString(getProfileId(profile));
    const hasMeta = Boolean(metaMap?.[sid] && typeof metaMap[sid] === 'object' && metaMap[sid][uid]);
    const meta = hasMeta ? sanitizeSalesmanMeta(metaMap[sid][uid]) : null;

    const dbSalesmanNumber = Math.max(0, Math.floor(asNumber(profile.salesmanNumber ?? profile.salesman_number, 0)));
    const dbCanEdit = asBoolean(profile.canEditTransactions ?? profile.can_edit_transactions);
    const dbCanBulk = asBoolean(profile.canBulkEdit ?? profile.can_bulk_edit);

    return {
        ...profile,
        salesmanNumber: hasMeta ? (meta.salesmanNumber || dbSalesmanNumber) : dbSalesmanNumber,
        canEditTransactions: hasMeta ? meta.canEditTransactions : dbCanEdit,
        canBulkEdit: hasMeta ? meta.canBulkEdit : dbCanBulk
    };
}

function getNextSalesmanNumber(existingSalesmen = [], metaMap = {}, shopId = '') {
    const sid = asString(shopId);
    if (!sid) return 1;
    const existingNumbers = (Array.isArray(existingSalesmen) ? existingSalesmen : [])
        .map((salesman) => {
            const direct = asNumber(salesman?.salesmanNumber, NaN);
            if (Number.isFinite(direct) && direct > 0) return Math.floor(direct);
            const meta = getSalesmanMeta(metaMap, sid, salesman?.id);
            return asNumber(meta.salesmanNumber, 0);
        })
        .filter((value) => Number.isFinite(value) && value > 0);

    const max = existingNumbers.length ? Math.max(...existingNumbers) : 0;
    return max + 1;
}

function getShopMeta(metaMap = {}, shopId = '') {
    const sid = asString(shopId);
    if (!sid) return {};
    return metaMap?.[sid] && typeof metaMap[sid] === 'object' ? metaMap[sid] : {};
}

function mergeShopMeta(shop = {}, metaMap = {}) {
    if (!shop || typeof shop !== 'object') return shop;
    const meta = getShopMeta(metaMap, shop.id);
    const resolvedAddress = asString(meta.address || shop.address || '');
    const resolvedTelephone = asString(
        meta.telephone
        || shop.telephone
        || shop.phone
        || shop.shop_phone
        || shop.telephone_number
        || shop.phone_number
        || shop.contact_number
        || shop.mobile
        || shop.telefon
        || shop.tel
        || ''
    );
    const showTax = meta.billShowTax === undefined ? true : asBoolean(meta.billShowTax);
    return {
        ...shop,
        address: resolvedAddress,
        telephone: resolvedTelephone,
        phone: resolvedTelephone,
        billShowTax: showTax
    };
}

function makeRowId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
        const rand = Math.floor(Math.random() * 16);
        const val = ch === 'x' ? rand : ((rand & 0x3) | 0x8);
        return val.toString(16);
    });
}

function normalizeUserFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const resolvedEmail = asString(profile.email || profile.username || profile.owner_email || profile.auth_email).toLowerCase();
    const name =
        asString(profile.full_name)
        || asString(profile.workerName)
        || (resolvedEmail.split('@')[0] || 'User');
    const normalizedRole = normalizeRoleName(profile.role) || 'salesman';

    return {
        ...profile,
        id: getProfileId(profile),
        name,
        email: resolvedEmail,
        role: normalizedRole,
        pin: '',
        hourlyRate: parseFloat(profile.hourlyRate ?? profile.hourly_rate ?? 12.5) || 12.5,
        photo: asString(profile.avatar_url || profile.photo || profile.photo_url),
        active: profile.active !== false,
        shop_id: asString(profile.shop_id || profile.shopId),
        is_online: asBoolean(profile.is_online ?? profile.isOnline ?? profile.online),
        salesmanNumber: Math.max(0, Math.floor(asNumber(profile.salesmanNumber ?? profile.salesman_number, 0))),
        canEditTransactions: asBoolean(profile.canEditTransactions ?? profile.can_edit_transactions),
        canBulkEdit: asBoolean(profile.canBulkEdit ?? profile.can_bulk_edit),
    };
}

function normalizeSalesman(profile) {
    const user = normalizeUserFromProfile(profile);
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        pin: user.pin,
        active: user.active,
        hourlyRate: user.hourlyRate,
        photo: user.photo,
        role: user.role,
        email: user.email,
        shop_id: user.shop_id,
        is_online: asBoolean(user.is_online ?? user.isOnline ?? user.online),
        salesmanNumber: Math.max(0, Math.floor(asNumber(user.salesmanNumber, 0))),
        canEditTransactions: asBoolean(user.canEditTransactions),
        canBulkEdit: asBoolean(user.canBulkEdit),
    };
}

function normalizeShop(shop) {
    if (!shop || typeof shop !== 'object') return null;
    const resolvedTelephone = asString(
        shop.telephone
        || shop.phone
        || shop.shop_phone
        || shop.telephone_number
        || shop.phone_number
        || shop.contact_number
        || shop.mobile
        || shop.telefon
        || shop.tel
        || shop.shopPhone
        || shop.contact_phone
        || shop.contactPhone
        || ''
    );
    return {
        ...shop,
        id: getShopId(shop),
        name: asString(shop.shop_name || 'Shop'),
        location: asString(shop.address || ''),
        address: asString(shop.address || ''),
        owner_email: asString(shop.owner_email || shop.ownerEmail || ''),
        owner_password_hash: asString(shop.owner_password_hash || ''),
        owner_password: asString(shop.owner_password_hash || ''),
        password: asString(shop.owner_password_hash || ''),
        telephone: resolvedTelephone,
        phone: resolvedTelephone,
    };
}

function getProfilePassword(profile) {
    return asString(profile?.password || profile?.adminPassword || profile?.passcode || profile?.pass_code);
}

async function attachShopOwnerCredentials(shopList = []) {
    const normalizedShops = Array.isArray(shopList) ? shopList : [];
    if (normalizedShops.length === 0) return normalizedShops;

    const shopIds = normalizedShops.map((shop) => asString(shop.id)).filter(Boolean);
    if (shopIds.length === 0) return normalizedShops;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', DB_ADMIN_ROLES)
        .in('shop_id', shopIds);

    if (error || !Array.isArray(data)) return normalizedShops;

    const ownersByShop = new Map();
    data.forEach((profile) => {
        const sid = asString(profile.shop_id);
        if (!sid || ownersByShop.has(sid)) return;
        ownersByShop.set(sid, {
            owner_profile_id: asString(getProfileId(profile)),
            owner_email: '',
            owner_password_hash: getProfilePassword(profile),
        });
    });

    const enrichedShops = normalizedShops.map((shop) => {
        const owner = ownersByShop.get(asString(shop.id));
        if (!owner) return shop;
        return {
            ...shop,
            owner_email: shop.owner_email || owner.owner_email,
            owner_password_hash: owner.owner_password_hash || asString(shop.owner_password_hash) || '',
            owner_password: owner.owner_password_hash || asString(shop.owner_password_hash) || '',
            password: asString(shop.owner_password_hash) || owner.owner_password_hash || '',
            owner_profile_id: owner.owner_profile_id || '',
        };
    });

    return enrichedShops;
}

function buildShopInsertPayloads({ name, address, ownerEmail, telephone, ownerPassword = '' }) {
    const safeName = asString(name);
    const safeAddress = asString(address);
    const safeOwnerEmail = asString(ownerEmail).toLowerCase();
    const safeTelephone = asString(telephone);
    const safeOwnerPassword = asString(ownerPassword);
    if (!safeName) return [];

    const generatedId = makeRowId();
    const payload = cleanPayload({
        shop_id: generatedId,
        shop_name: safeName,
        address: safeAddress,
        owner_email: safeOwnerEmail,
        telephone: safeTelephone,
        owner_password_hash: safeOwnerPassword || undefined,
    });

    return dedupePayloads([
        payload,
    ])
        .filter((payload) => Object.keys(payload).length > 0);
}

function cleanPayload(payload) {
    const next = {};
    Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined) next[key] = value;
    });
    return next;
}

function dedupePayloads(payloads) {
    const seen = new Set();
    return payloads.filter((payload) => {
        const key = JSON.stringify(payload);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildTimestampFromTime(baseTimestamp, timeValue) {
    const base = new Date(baseTimestamp);
    if (Number.isNaN(base.getTime())) return null;
    const safeTime = asString(timeValue);
    if (!safeTime) return null;
    const timeMatch = safeTime.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
    if (!timeMatch) return null;

    let [, hours, minutes, ampm] = timeMatch;
    hours = parseInt(hours, 10);
    minutes = parseInt(minutes, 10);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
    }

    base.setHours(hours, minutes, 0, 0);
    return base.toISOString();
}

function parseAttendanceEventId(eventId, fallbackType = 'IN') {
    const rawId = asString(eventId);
    if (!rawId) {
        return { baseId: '', eventType: asString(fallbackType).toUpperCase() === 'OUT' ? 'OUT' : 'IN' };
    }

    const [baseCandidate, suffixCandidate] = rawId.split(':');
    const suffixUpper = asString(suffixCandidate).toUpperCase();
    const eventType = suffixUpper === 'OUT' ? 'OUT' : (suffixUpper === 'IN' ? 'IN' : (asString(fallbackType).toUpperCase() === 'OUT' ? 'OUT' : 'IN'));
    return {
        baseId: asString(baseCandidate || rawId),
        eventType,
    };
}

async function syncProfileOnlineStatus(shopId, userId) {
    const sid = asString(shopId);
    const uid = asString(userId);
    if (!sid || !uid) return;

    const { data: openAttendance } = await supabase
        .from('attendance')
        .select('attendance_id')
        .eq('shop_id', sid)
        .eq('user_id', uid)
        .not('check_in', 'is', null)
        .is('check_out', null)
        .limit(1);

    await supabase
        .from('profiles')
        .update({ is_online: Array.isArray(openAttendance) && openAttendance.length > 0 })
        .eq('user_id', uid);
}

function buildShopUpdatePayloads({ name, address, ownerEmail, telephone, ownerPassword }) {
    const safeName = name === undefined ? undefined : asString(name);
    const safeAddress = address === undefined ? undefined : asString(address);
    const safeOwnerEmail = ownerEmail === undefined ? undefined : asString(ownerEmail).toLowerCase();
    const safeTelephone = telephone === undefined ? undefined : asString(telephone);
    const safeOwnerPassword = ownerPassword === undefined ? undefined : asString(ownerPassword);

    const payload = cleanPayload({
        ...(safeName === undefined ? {} : { shop_name: safeName }),
        ...(safeAddress === undefined ? {} : { address: safeAddress }),
        ...(safeOwnerEmail === undefined ? {} : { owner_email: safeOwnerEmail }),
        ...(safeTelephone === undefined ? {} : { telephone: safeTelephone }),
        ...(safeOwnerPassword === undefined ? {} : { owner_password_hash: safeOwnerPassword }),
    });

    return dedupePayloads([
        payload,
    ]).filter((payload) => Object.keys(payload).length > 0);
}

function buildShopOwnerProfileUpdatePayloads({ ownerEmail, ownerPassword }) {
    const safeOwnerEmail = ownerEmail === undefined ? undefined : asString(ownerEmail).toLowerCase();
    const safeOwnerPassword = ownerPassword === undefined ? undefined : asString(ownerPassword);
    const payload = cleanPayload({
        ...(safeOwnerEmail === undefined ? {} : { email: safeOwnerEmail }),
        ...(safeOwnerEmail === undefined ? {} : { username: safeOwnerEmail }),
        ...(safeOwnerPassword === undefined ? {} : { password_hash: safeOwnerPassword }),
    });

    return Object.keys(payload).length ? [payload] : [];
}

function buildProfileInsertPayloads({
    name,
    username = '',
    email = '',
    passwordHash = '',
    role = 'salesman',
    shopId,
    profileId = '',
    pinDigest = '',
    hourlyRate = 12.5,
    includePinDigest = true,
    requireUserId = false
}) {
    const safeName = asString(name) || 'User';
    const safeUsername = asString(username).toLowerCase();
    const safeEmail = asString(email).toLowerCase();
    const safePasswordHash = asString(passwordHash);
    const safePinDigest = asString(pinDigest);
    const resolvedProfileId = asString(profileId) || makeRowId();

    const sid = asString(shopId);

    const idVariants = requireUserId
        ? [{ user_id: resolvedProfileId }]
        : [{}, { user_id: resolvedProfileId }];
    const shopVariants = sid ? [{ shop_id: sid }] : [{}];
    const usernameVariants = safeUsername ? [{ username: safeUsername }] : [{}];
    const emailVariants = safeEmail ? [{ email: safeEmail }] : [{}];
    const passwordVariants = safePasswordHash ? [{ password_hash: safePasswordHash }] : [{}];
    const rateValue = Number(hourlyRate);
    const hourlyVariants = Number.isFinite(rateValue)
        ? [{ hourly_rate: rateValue }, {}]
        : [{}];
    const pinVariants = (includePinDigest && safePinDigest)
        ? [{ pin_digest: safePinDigest }]
        : [{}];

    const payloads = [];
    for (const idVariant of idVariants) {
        for (const shopVariant of shopVariants) {
            for (const usernameVariant of usernameVariants) {
                for (const emailVariant of emailVariants) {
                    for (const passwordVariant of passwordVariants) {
                        for (const hourlyVariant of hourlyVariants) {
                            for (const pinVariant of pinVariants) {
                                payloads.push(cleanPayload({
                                    ...idVariant,
                                    ...shopVariant,
                                    role: normalizeRoleName(role) || 'salesman',
                                    full_name: safeName,
                                    ...usernameVariant,
                                    ...emailVariant,
                                    ...passwordVariant,
                                    ...hourlyVariant,
                                    active: true,
                                    is_online: false,
                                    ...pinVariant,
                                }));
                            }
                        }
                    }
                }
            }
        }
    }

    return dedupePayloads(payloads).filter((payload) => Object.keys(payload).length > 0);
}

function buildManagerProfilePayloads({ ownerName, ownerEmail, ownerPasswordHash = '', shopId }) {
    return buildProfileInsertPayloads({
        name: ownerName,
        email: ownerEmail,
        username: ownerEmail,
        passwordHash: ownerPasswordHash,
        role: 'owner',
        shopId,
        hourlyRate: 12.5,
        includePinDigest: false
    });
}

function buildSalesmanInsertPayloads({
    name,
    username = '',
    profileId = '',
    pinDigest,
    shopId,
    hourlyRate = 12.5,
    requireUserId = false,
}) {
    return buildProfileInsertPayloads({
        name,
        username,
        profileId,
        role: 'salesman',
        shopId,
        pinDigest,
        hourlyRate,
        includePinDigest: true,
        requireUserId,
    });
}

function buildProfileUpdatePayloads(updates = {}) {
    const payload = cleanPayload({
        ...(updates.name === undefined ? {} : { full_name: asString(updates.name) }),
        ...(updates.email === undefined ? {} : { email: asString(updates.email).toLowerCase() }),
        ...(updates.passwordHash === undefined ? {} : { password_hash: asString(updates.passwordHash) }),
        ...(updates.role === undefined ? {} : { role: normalizeRoleName(updates.role) }),
        ...(updates.shop_id === undefined
            ? {}
            : { shop_id: updates.shop_id === null ? null : asString(updates.shop_id) }),
        ...(updates.pin_digest === undefined ? {} : { pin_digest: asString(updates.pin_digest) }),
        ...(updates.hourlyRate === undefined ? {} : { hourly_rate: Number(updates.hourlyRate) || 0 }),
        ...(updates.active === undefined ? {} : { active: asBoolean(updates.active) }),
        ...((updates.photo === undefined && updates.photoUrl === undefined && updates.avatar_url === undefined)
            ? {}
            : { avatar_url: asString(updates.photo ?? updates.photoUrl ?? updates.avatar_url) }),
        ...(updates.salesmanNumber === undefined ? {} : { salesman_number: Math.max(0, Math.floor(asNumber(updates.salesmanNumber, 0))) }),
        ...(updates.canEditTransactions === undefined ? {} : { can_edit_transactions: asBoolean(updates.canEditTransactions) }),
        ...(updates.canBulkEdit === undefined ? {} : { can_bulk_edit: asBoolean(updates.canBulkEdit) }),
        ...((updates.is_online === undefined && updates.isOnline === undefined && updates.online === undefined)
            ? {}
            : { is_online: asBoolean(updates.is_online ?? updates.isOnline ?? updates.online) }),
    });

    return Object.keys(payload).length ? [payload] : [];
}

async function trySelectProfileByField(field, value, roles) {
    if (!asString(value)) return null;
    const safeRoles = normalizeDbRoleFilter(roles);
    let query = supabase
        .from('profiles')
        .select('*')
        .eq(field, value)
        .limit(20);

    if (safeRoles.length > 0) {
        query = query.in('role', safeRoles);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) return null;
    const firstAllowed = data.find((row) => {
        if (safeRoles.length === 0) return true;
        const normalized = normalizeRoleName(row?.role);
        return safeRoles.includes(normalized);
    });
    return firstAllowed || null;
}

async function trySelectSalesmanByPin(pinValue, shopId = '') {
    const { profile } = await verifySalesmanPin(pinValue, shopId);
    return profile || null;
}

async function listSalesmenByPin(pinValue, shopId = '') {
    const safePin = asString(pinValue);
    if (!safePin) return [];
    const digest = await computePinDigest(shopId, safePin);
    if (!digest) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'salesman')
        .eq('pin_digest', digest)
        .limit(5);

    if (error || !Array.isArray(data)) return [];
    return data;
}

async function checkSalesmanPinAvailability(pinValue, excludeSalesmanId = '', shopId = '') {
    const safePin = asString(pinValue);
    const excludedId = asString(excludeSalesmanId);
    if (!safePin) {
        return { available: false, message: 'PIN is required.' };
    }
    if (safePin.length !== 4) {
        return { available: false, message: 'PIN must be exactly 4 digits.' };
    }

    const digest = await computePinDigest(shopId, safePin);
    if (!digest) {
        return { available: false, message: 'Unable to compute PIN digest.' };
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('role', 'salesman')
        .eq('pin_digest', digest);

    if (error) {
        return { available: false, message: asString(error.message) || 'Unable to validate PIN.' };
    }

    const conflicts = Array.isArray(data) ? data : [];
    const hasConflict = conflicts.some((row) => asString(row?.user_id) !== excludedId);
    if (hasConflict) {
        return { available: false, message: 'PIN already in use. Use a globally unique PIN.' };
    }

    return { available: true, message: '' };
}

export function AuthProvider({ children }) {
    const initialAuthState = (() => {
        const rawSavedUser = safeParseJSON(readAuthState(AUTH_USER_STATE_KEY, ''), null);
        const savedUser = rawSavedUser && typeof rawSavedUser === 'object'
            ? {
                ...rawSavedUser,
                id: getProfileId(rawSavedUser),
                user_id: getProfileId(rawSavedUser),
                shop_id: asString(rawSavedUser.shop_id || rawSavedUser.shopId),
            }
            : null;
        return {
            role: readAuthState(AUTH_ROLE_STATE_KEY, '') || null,
            user: savedUser && typeof savedUser === 'object' ? savedUser : null,
            activeShopId: readAuthState(AUTH_SHOP_STATE_KEY, '')
        };
    })();

    const [role, setRole] = useState(() => initialAuthState.role); // superadmin | admin | salesman | null
    const [user, setUser] = useState(() => initialAuthState.user);
    const [activeShopId, setActiveShopIdState] = useState(() => initialAuthState.activeShopId);
    const [shops, setShops] = useState([]);
    const [authLoading, setAuthLoading] = useState(false);

    const [lowStockAlerts, setLowStockAlerts] = useState([]);
    const [salesmanMetaMap, setSalesmanMetaMap] = useState(() => readLocalJSON(SALESMAN_META_STORAGE_KEY, {}));
    const [shopMetaMap, setShopMetaMap] = useState(() => readLocalJSON(SHOP_META_STORAGE_KEY, {}));

    // ── Persistent Config Data ──
    const [adminPassword, setAdminPassword] = useState('');
    const [slowMovingDays, setSlowMovingDays] = useState(() => {
        const parsed = parseInt(readStorage(SLOW_MOVING_DAYS_KEY, '30'), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
    });
    const [autoLockEnabled, setAutoLockEnabled] = useState(() => {
        const raw = readStorage(AUTO_LOCK_ENABLED_KEY, 'true');
        return asBoolean(raw === '' ? true : raw);
    });
    const [autoLockTimeout, setAutoLockTimeout] = useState(() => {
        const parsed = parseInt(readStorage(AUTO_LOCK_TIMEOUT_KEY, '120'), 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
    });

    const [salesmen, setSalesmen] = useState([]);

    const normalizedAuthRole = normalizeRoleName(role);
    const isSuperAdmin = isSuperAdminRole(normalizedAuthRole);
    const isAdminLike = isAdminRoleName(normalizedAuthRole);
    const activeShopMeta = useMemo(() => getShopMeta(shopMetaMap, activeShopId), [shopMetaMap, activeShopId]);
    const billShowTax = activeShopMeta.billShowTax === undefined ? true : asBoolean(activeShopMeta.billShowTax);

    const patchSalesmanMeta = useCallback((shopId, salesmanId, patch = {}) => {
        const sid = asString(shopId);
        const uid = asString(salesmanId);
        if (!sid || !uid) return;
        setSalesmanMetaMap((prev) => {
            const byShop = prev?.[sid] && typeof prev[sid] === 'object' ? prev[sid] : {};
            const current = byShop?.[uid] && typeof byShop[uid] === 'object' ? byShop[uid] : {};
            const nextMeta = {
                ...current,
                ...sanitizeSalesmanMeta({ ...current, ...patch })
            };
            return {
                ...prev,
                [sid]: {
                    ...byShop,
                    [uid]: nextMeta
                }
            };
        });
    }, []);

    const patchShopMeta = useCallback((shopId, patch = {}) => {
        const sid = asString(shopId);
        if (!sid) return;
        setShopMetaMap((prev) => {
            const current = prev?.[sid] && typeof prev[sid] === 'object' ? prev[sid] : {};
            return {
                ...prev,
                [sid]: {
                    ...current,
                    ...patch
                }
            };
        });
    }, []);

    useEffect(() => {
        if (readStorage(AUTH_TOKEN_KEY, '')) return;
        removeStorage(AUTH_TOKEN_KEY);
    }, []);

    useEffect(() => {
        writeAuthState(AUTH_ROLE_STATE_KEY, role || '');
    }, [role]);

    useEffect(() => {
        writeAuthState(AUTH_USER_STATE_KEY, user ? JSON.stringify(user) : '');
    }, [user]);

    useEffect(() => {
        writeAuthState(AUTH_SHOP_STATE_KEY, activeShopId || '');
    }, [activeShopId]);

    useEffect(() => {
        writeStorage(SLOW_MOVING_DAYS_KEY, String(slowMovingDays));
    }, [slowMovingDays]);

    useEffect(() => {
        writeStorage(AUTO_LOCK_ENABLED_KEY, String(asBoolean(autoLockEnabled)));
    }, [autoLockEnabled]);

    useEffect(() => {
        writeStorage(AUTO_LOCK_TIMEOUT_KEY, String(Math.max(0, asNumber(autoLockTimeout, 120))));
    }, [autoLockTimeout]);

    useEffect(() => {
        writeStorage(SALESMAN_META_STORAGE_KEY, JSON.stringify(salesmanMetaMap || {}));
    }, [salesmanMetaMap]);

    useEffect(() => {
        writeStorage(SHOP_META_STORAGE_KEY, JSON.stringify(shopMetaMap || {}));
    }, [shopMetaMap]);

    // ── Live Broadcasting for Settings ──
    const broadcastSetting = useCallback(async (key, value) => {
        await supabase.channel('public:settings').send({
            type: 'broadcast',
            event: 'settings_sync',
            payload: { key, value }
        });
    }, []);

    useEffect(() => {
        const channel = supabase.channel('public:settings')
            .on('broadcast', { event: 'settings_sync' }, (payload) => {
                const { key, value } = payload.payload;
                if (key === 'salesmen') setSalesmen(value);
                else if (key === 'slowMovingDays') setSlowMovingDays(value);
                else if (key === 'autoLockEnabled') setAutoLockEnabled(value);
                else if (key === 'autoLockTimeout') setAutoLockTimeout(value);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const syncShopTelephoneColumn = useCallback(async (shopRows = []) => {
        const sourceRows = Array.isArray(shopRows) ? shopRows : [];
        for (const shop of sourceRows) {
            const sid = asString(shop?.id || shop?.shop_id);
            if (!sid) continue;

            const currentTelephone = asString(shop?.telephone);
            const resolvedTelephone = asString(
                shop?.telephone
                || shop?.phone
                || shop?.shop_phone
                || shop?.telephone_number
                || shop?.phone_number
                || shop?.contact_number
                || shop?.mobile
                || shop?.telefon
                || shop?.tel
                || ''
            );

            if (!resolvedTelephone || currentTelephone === resolvedTelephone) continue;

            await updateShopById(sid, { telephone: resolvedTelephone });
        }
    }, []);

    const refreshShops = useCallback(async (preferredShopId = '') => {
        if (!role || !user) {
            setShops([]);
            return [];
        }

        const isIndependentAdmin = isAdminRoleName(role) && !isSuperAdminRole(role) && !asString(user?.shop_id);

        if (isSuperAdminRole(role) || isIndependentAdmin) {
            let data = null;
            let error = null;
            const orderCandidates = ['shop_name', 'created_at'];
            for (const orderField of orderCandidates) {
                const response = await supabase.from('shops').select('*').order(orderField, { ascending: true });
                if (!response.error && Array.isArray(response.data)) {
                    data = response.data;
                    error = null;
                    break;
                }

                error = response.error;
                if (!isMissingColumnError(response.error, orderField)) {
                    break;
                }
            }

            if (!Array.isArray(data)) {
                const fallback = await supabase.from('shops').select('*');
                data = fallback.data;
                error = fallback.error;
            }

            if (!error && Array.isArray(data) && data.length === 0) {
                const preferredSid = asString(preferredShopId);
                if (preferredSid) {
                    const singleById = await selectSingleShopById(preferredSid);
                    if (!singleById?.error && singleById?.data) {
                        data = [singleById.data];
                    }
                }
            }

            if (error || !Array.isArray(data)) {
                setShops([]);
                return [];
            }

            await syncShopTelephoneColumn(data);

            const normalized = data.map(normalizeShop).filter(Boolean);
            const enriched = await attachShopOwnerCredentials(normalized);
            const merged = enriched.map((shop) => mergeShopMeta(shop, shopMetaMap));
            setShops(merged);

            // Prefer an explicitly provided preferredShopId, then current activeShopId, then user's mapped shop
            const preferred = asString(preferredShopId || activeShopId || user.shop_id);
            const preferredExists = preferred && merged.some(s => s.id === preferred);

            // Keep active shop valid: if preferred is missing/stale, fall back to first available shop.
            if (preferredExists) {
                setActiveShopIdState(preferred);
            } else if (merged.length > 0) {
                setActiveShopIdState(merged[0].id);
            } else {
                setActiveShopIdState('');
            }
            return merged;
        }

        const sid = asString(preferredShopId || user.shop_id || activeShopId);
        if (!sid) {
            const ownerEmail = asString(user?.email).toLowerCase();
            if (!ownerEmail) {
                setShops([]);
                return [];
            }

            const byOwnerEmail = await supabase
                .from('shops')
                .select('*')
                .eq('owner_email', ownerEmail)
                .limit(1);

            if (!byOwnerEmail.error && Array.isArray(byOwnerEmail.data) && byOwnerEmail.data[0]) {
                const normalizedByEmail = normalizeShop(byOwnerEmail.data[0]);
                const enrichedByEmail = normalizedByEmail ? await attachShopOwnerCredentials([normalizedByEmail]) : [];
                const mergedByEmail = enrichedByEmail.map((shop) => mergeShopMeta(shop, shopMetaMap));
                setShops(mergedByEmail);
                setActiveShopIdState(asString(mergedByEmail[0]?.id));
                return mergedByEmail;
            }

            setShops([]);
            return [];
        }

        const { data, error } = await selectSingleShopById(sid);
        if (error || !data) {
            const fallback = [mergeShopMeta({ id: sid, name: user.shopName || 'My Shop', address: '', owner_email: '' }, shopMetaMap)];
            setShops(fallback);
            setActiveShopIdState(sid);
            return fallback;
        }

        await syncShopTelephoneColumn([data]);

        const normalized = normalizeShop(data);
        const enriched = normalized ? await attachShopOwnerCredentials([normalized]) : [];
        const merged = enriched.map((shop) => mergeShopMeta(shop, shopMetaMap));
        setShops(merged);
        setActiveShopIdState(sid);
        return merged;
    }, [role, user, activeShopId, shopMetaMap, syncShopTelephoneColumn]);

    const loadSalesmenForShop = useCallback(async (shopIdParam = '') => {
        const sid = asString(shopIdParam || activeShopId);
        if (!sid) {
            setSalesmen([]);
            return [];
        }

        let data = null;
        let error = null;
        const orderCandidates = ['full_name', 'created_at'];

        for (const orderByField of orderCandidates) {
            const response = await supabase
                .from('profiles')
                .select('*')
                .eq('shop_id', sid)
                .eq('role', 'salesman')
                .order(orderByField, { ascending: true });

            if (!response.error && Array.isArray(response.data)) {
                data = response.data;
                error = null;
                break;
            }

            error = response.error;
            const message = asString(response.error?.message).toLowerCase();
            if (!message.includes('schema cache') && !message.includes('column')) {
                break;
            }
        }

        if (!Array.isArray(data)) {
            const fallback = await supabase
                .from('profiles')
                .select('*')
                .eq('shop_id', sid)
                .eq('role', 'salesman');
            data = fallback.data;
            error = fallback.error;
        }

        if (error || !Array.isArray(data)) {
            setSalesmen([]);
            return [];
        }

        const mapped = data
            .map(normalizeSalesman)
            .filter(Boolean)
            .map((salesman) => mergeSalesmanMeta(salesman, salesmanMetaMap));
        setSalesmen(mapped);
        return mapped;
    }, [activeShopId, salesmanMetaMap]);

    useEffect(() => {
        if (!role || !user) {
            setShops([]);
            return;
        }
        refreshShops();
    }, [role, user, refreshShops]);

    useEffect(() => {
        if (!activeShopId) {
            setSalesmen([]);
            return;
        }
        loadSalesmenForShop(activeShopId);
    }, [activeShopId, loadSalesmenForShop]);

    useEffect(() => {
        if (role !== 'salesman' || !user) return;
        const merged = mergeSalesmanMeta(user, salesmanMetaMap);
        const numberChanged = asNumber(merged?.salesmanNumber, 0) !== asNumber(user?.salesmanNumber, 0);
        const editChanged = asBoolean(merged?.canEditTransactions) !== asBoolean(user?.canEditTransactions);
        const bulkChanged = asBoolean(merged?.canBulkEdit) !== asBoolean(user?.canBulkEdit);
        if (!numberChanged && !editChanged && !bulkChanged) return;
        setUser((prev) => prev ? {
            ...prev,
            salesmanNumber: merged.salesmanNumber,
            canEditTransactions: merged.canEditTransactions,
            canBulkEdit: merged.canBulkEdit
        } : prev);
    }, [role, user, salesmanMetaMap]);

    const setActiveShopId = useCallback((shopId) => {
        const sid = asString(shopId);
        const isIndependentAdmin = isAdminRoleName(role) && !isSuperAdminRole(role) && !asString(user?.shop_id);
        if (isSuperAdmin || isIndependentAdmin) {
            setActiveShopIdState(sid);
            return;
        }

        // Shop-admin and salesman users are bound to their mapped shop.
        const lockedShopId = asString(user?.shop_id || activeShopId);
        setActiveShopIdState(lockedShopId || sid);
    }, [isSuperAdmin, role, user, activeShopId]);

    const createShop = useCallback(async ({ shopName, location, address, ownerEmail, telephone }) => {
        if (!isSuperAdminRole(role)) {
            throw new Error('Only super_admin can create shops.');
        }

        const name = asString(shopName);
        const shopAddress = asString(address);
        const email = asString(ownerEmail).toLowerCase();
        const shopTelephone = asString(telephone);

        if (!name) throw new Error('Shop name is required.');
        if (!email) throw new Error('Owner email is required.');

        const { data: existingShopRows, error: existingShopError } = await supabase
            .from('shops')
            .select('shop_id')
            .eq('owner_email', email)
            .limit(1);
        if (!existingShopError && Array.isArray(existingShopRows) && existingShopRows.length > 0) {
            throw new Error('Owner email is already linked to an admin account.');
        }

        const generatedOwnerPassword = Math.random().toString(36).slice(-8);
        let createdShop = null;
        let shopError = null;

        const shopPayloads = buildShopInsertPayloads({
            name,
            address: shopAddress,
            ownerEmail: email,
            telephone: shopTelephone,
            ownerPassword: generatedOwnerPassword,
        });

        for (const payload of shopPayloads) {
            const { data, error } = await supabase.from('shops').insert([payload]).select().single();
            if (!error && data) {
                createdShop = normalizeShop(data);
                shopError = null;
                break;
            }
            shopError = error;
        }

        if (!createdShop) {
            throw new Error(shopError?.message || 'Failed to create shop.');
        }

        const shopId = asString(createdShop.id);
        if (!shopId) {
            throw new Error('Shop created without a valid id. Please re-run migration/schema and try again.');
        }
        const ownerName = email.split('@')[0] || name;
        const tempPassword = generatedOwnerPassword;
        const ownerPasswordHash = await hashPlainText(tempPassword);

        let createdProfile = null;
        let profileError = null;
        let ownerSetupWarning = '';

        const profilePayloads = buildManagerProfilePayloads({
            ownerName,
            ownerEmail: email,
            ownerPasswordHash: ownerPasswordHash || tempPassword,
            shopId,
            tempPassword
        });

        for (const payload of profilePayloads) {
            const { data, error } = await supabase.from('profiles').insert([payload]).select().single();
            if (!error && data) {
                createdProfile = normalizeUserFromProfile(data);
                profileError = null;
                break;
            }
            profileError = error;
        }

        if (!createdProfile) {
            ownerSetupWarning = isStackDepthError(profileError)
                ? 'Owner profile setup skipped due database trigger recursion. Shop was created successfully.'
                : (asString(profileError?.message) || 'Owner profile could not be auto-created.');
        }

        const createdShopWithCredentials = {
            ...createdShop,
            owner_email: createdShop.owner_email || email,
            owner_password_hash: getProfilePassword(createdProfile) || tempPassword,
            owner_password: getProfilePassword(createdProfile) || tempPassword,
            password: getProfilePassword(createdProfile) || tempPassword,
            owner_profile_id: asString(createdProfile?.id),
        };
        const resolvedAddress = asString(shopAddress || createdShopWithCredentials.address);
        const resolvedTelephone = asString(shopTelephone || createdShopWithCredentials.telephone || createdShopWithCredentials.phone || '');

        patchShopMeta(shopId, { address: resolvedAddress, telephone: resolvedTelephone, billShowTax: true });
        const createdShopWithMeta = mergeShopMeta({
            ...createdShopWithCredentials,
            address: resolvedAddress,
            telephone: resolvedTelephone,
            phone: resolvedTelephone
        }, {
            ...shopMetaMap,
            [shopId]: {
                ...(shopMetaMap?.[shopId] || {}),
                address: resolvedAddress,
                telephone: resolvedTelephone,
                billShowTax: true
            }
        });

        setShops(prev => {
            const merged = [...prev, createdShopWithMeta]
                .filter((s, idx, arr) => s && arr.findIndex(x => x.id === s.id) === idx)
                .sort((a, b) => a.name.localeCompare(b.name));
            return merged;
        });

        if (role !== 'salesman' && !activeShopId) {
            setActiveShopIdState(shopId);
        }

        return {
            shop: createdShopWithMeta,
            admin: createdProfile,
            credentials: {
                email,
                pin: '',
                password: getProfilePassword(createdProfile) || tempPassword
            },
            warning: ownerSetupWarning,
        };
    }, [role, activeShopId, patchShopMeta, shopMetaMap]);

    const updateShop = useCallback(async (shopId, updates = {}) => {
        if (!isSuperAdminRole(role)) {
            throw new Error('Only super_admin can update shops.');
        }

        const sid = asString(shopId);
        if (!sid) throw new Error('Invalid shop id.');
        const currentShop = (Array.isArray(shops) ? shops : []).find((shop) => shop.id === sid) || null;

        const hasName = Object.prototype.hasOwnProperty.call(updates, 'name');
        const hasAddress = Object.prototype.hasOwnProperty.call(updates, 'address');
        const hasTelephone = Object.prototype.hasOwnProperty.call(updates, 'telephone')
            || Object.prototype.hasOwnProperty.call(updates, 'phone')
            || Object.prototype.hasOwnProperty.call(updates, 'shop_phone')
            || Object.prototype.hasOwnProperty.call(updates, 'telephone_number')
            || Object.prototype.hasOwnProperty.call(updates, 'phone_number')
            || Object.prototype.hasOwnProperty.call(updates, 'contact_number')
            || Object.prototype.hasOwnProperty.call(updates, 'mobile')
            || Object.prototype.hasOwnProperty.call(updates, 'telefon')
            || Object.prototype.hasOwnProperty.call(updates, 'tel');
        const hasOwner = Object.prototype.hasOwnProperty.call(updates, 'ownerEmail')
            || Object.prototype.hasOwnProperty.call(updates, 'owner_email');
        const hasOwnerPassword = Object.prototype.hasOwnProperty.call(updates, 'ownerPassword')
            || Object.prototype.hasOwnProperty.call(updates, 'owner_password')
            || Object.prototype.hasOwnProperty.call(updates, 'owner_password_hash');

        const nextName = hasName ? asString(updates.name) : undefined;
        const nextAddress = hasAddress ? asString(updates.address) : undefined;
        const nextTelephone = hasTelephone
            ? asString(
                updates.telephone
                ?? updates.phone
                ?? updates.shop_phone
                ?? updates.telephone_number
                ?? updates.phone_number
                ?? updates.contact_number
                ?? updates.mobile
                ?? updates.telefon
                ?? updates.tel
            )
            : undefined;
        const nextOwnerEmail = hasOwner ? asString(updates.ownerEmail ?? updates.owner_email) : undefined;
        const nextOwnerPassword = hasOwnerPassword
            ? asString(updates.ownerPassword ?? updates.owner_password_hash ?? updates.owner_password)
            : undefined;
        const shouldUpdateOwnerPassword = hasOwnerPassword && !!nextOwnerPassword;
        const nextOwnerPasswordHash = shouldUpdateOwnerPassword
            ? (await hashPlainText(nextOwnerPassword)) || nextOwnerPassword
            : undefined;
        const shouldUpdateShopTable = hasName || hasAddress || hasTelephone || hasOwner || hasOwnerPassword;
        const shouldUpdateOwnerProfile = hasOwner || shouldUpdateOwnerPassword;

        if (hasName && !nextName) {
            throw new Error('Shop name is required.');
        }

        if (hasOwner && nextOwnerEmail) {
            const existingOwner = await trySelectProfileByField('email', nextOwnerEmail, ADMIN_ROLES);
            if (existingOwner) {
                const existingOwnerShopId = asString(existingOwner.shop_id);
                if (existingOwnerShopId && existingOwnerShopId !== sid) {
                    throw new Error('Owner email is already linked to another shop admin account.');
                }
            }
        }

        if (!shouldUpdateShopTable && !shouldUpdateOwnerProfile) {
            throw new Error('No valid shop fields provided.');
        }

        let updatedShop = currentShop ? { ...currentShop } : null;

        if (shouldUpdateShopTable) {
            const payloads = buildShopUpdatePayloads({
                name: nextName,
                address: nextAddress,
                ownerEmail: nextOwnerEmail,
                telephone: nextTelephone,
                ownerPassword: shouldUpdateOwnerPassword ? nextOwnerPasswordHash : undefined
            });

            if (payloads.length === 0) {
                throw new Error('No valid shop fields provided.');
            }

            let updateError = null;
            for (const payload of payloads) {
                const { data, error } = await updateShopById(sid, payload, true);

                if (!error && data) {
                    updatedShop = normalizeShop(data);
                    break;
                }
                updateError = error;
            }

            if (!updatedShop) {
                throw new Error(updateError?.message || 'Failed to update shop.');
            }

            if (hasTelephone) {
                const { error } = await updateShopById(sid, { telephone: nextTelephone || '' });
                if (error) {
                    throw new Error(error.message || 'Failed to update shop telephone column.');
                }
                updatedShop = {
                    ...updatedShop,
                    telephone: nextTelephone || '',
                    phone: nextTelephone || '',
                };
            }
        }

        let updatedOwnerProfile = null;
        if (shouldUpdateOwnerProfile) {
            const ownerPayloads = buildShopOwnerProfileUpdatePayloads({
                ownerEmail: hasOwner ? nextOwnerEmail : undefined,
                ownerPassword: shouldUpdateOwnerPassword ? nextOwnerPasswordHash : undefined
            });

            if (ownerPayloads.length > 0) {
                let ownerProfileId = asString(currentShop?.owner_profile_id);
                if (!ownerProfileId) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('shop_id', sid)
                        .in('role', DB_ADMIN_ROLES)
                        .limit(1);

                    if (error) {
                        throw new Error(error.message || 'Failed to load shop admin profile.');
                    }

                    const ownerRow = Array.isArray(data) ? data[0] : null;
                    ownerProfileId = asString(ownerRow?.user_id);
                }

                if (!ownerProfileId) {
                    throw new Error('No admin profile found for this shop.');
                }

                let ownerUpdateError = null;
                for (const payload of ownerPayloads) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .update(payload)
                        .eq('user_id', ownerProfileId)
                        .select()
                        .single();

                    if (!error && data) {
                        updatedOwnerProfile = data;
                        break;
                    }
                    ownerUpdateError = error;
                }

                if (!updatedOwnerProfile) {
                    throw new Error(ownerUpdateError?.message || 'Failed to update shop owner credentials.');
                }
            }
        }

        const mergedShop = {
            ...(updatedShop || { id: sid }),
            owner_profile_id: asString(getProfileId(updatedOwnerProfile) || updatedShop?.owner_profile_id || currentShop?.owner_profile_id),
            owner_email: hasOwner
                ? nextOwnerEmail
                : asString(updatedShop?.owner_email || currentShop?.owner_email),
            owner_password_hash: shouldUpdateOwnerPassword
                ? nextOwnerPasswordHash
                : asString(getProfilePassword(updatedOwnerProfile) || updatedShop?.owner_password_hash || currentShop?.owner_password_hash),
            owner_password: shouldUpdateOwnerPassword
                ? nextOwnerPasswordHash
                : asString(getProfilePassword(updatedOwnerProfile) || updatedShop?.owner_password_hash || currentShop?.owner_password_hash),
            password: shouldUpdateOwnerPassword
                ? nextOwnerPasswordHash
                : asString(updatedShop?.owner_password_hash || currentShop?.owner_password_hash || getProfilePassword(updatedOwnerProfile)),
            address: hasAddress
                ? nextAddress
                : asString(updatedShop?.address || currentShop?.address),
            telephone: hasTelephone
                ? nextTelephone
                : asString(
                    updatedShop?.telephone
                    || updatedShop?.phone
                    || updatedShop?.shop_phone
                    || updatedShop?.telephone_number
                    || updatedShop?.phone_number
                    || updatedShop?.contact_number
                    || updatedShop?.mobile
                    || updatedShop?.telefon
                    || updatedShop?.tel
                    || currentShop?.telephone
                    || currentShop?.phone
                    || currentShop?.shop_phone
                    || currentShop?.telephone_number
                    || currentShop?.phone_number
                    || currentShop?.contact_number
                    || currentShop?.mobile
                    || currentShop?.telefon
                    || currentShop?.tel
                    || ''
                ),
        };

        if (shouldUpdateOwnerPassword) {
            const { error } = await updateShopById(sid, { owner_password_hash: nextOwnerPasswordHash });
            if (error) {
                throw new Error(error.message || 'Failed to sync shop password.');
            }
        }

        if (hasAddress || hasTelephone) {
            patchShopMeta(sid, {
                ...(hasAddress ? { address: nextAddress } : {}),
                ...(hasTelephone ? { telephone: nextTelephone } : {})
            });
        }

        const mergedShopWithMeta = mergeShopMeta(mergedShop, {
            ...shopMetaMap,
            [sid]: {
                ...(shopMetaMap?.[sid] || {}),
                ...(hasAddress ? { address: nextAddress } : {}),
                ...(hasTelephone ? { telephone: nextTelephone } : {})
            }
        });

        setShops((prev) => prev.map((shop) => (
            shop.id === sid
                ? { ...shop, ...mergedShopWithMeta }
                : shop
        )));

        if (user && asString(user.shop_id) === sid) {
            setUser((prev) => prev ? {
                ...prev,
                shopName: mergedShopWithMeta.name || prev.shopName,
                shop_id: mergedShopWithMeta.id || prev.shop_id,
                email: asString(updatedShop?.owner_email || mergedShopWithMeta.owner_email || prev.email)
            } : prev);
        }

        return mergedShopWithMeta;
    }, [role, user, shops, patchShopMeta, shopMetaMap]);

    const deleteShop = useCallback(async (shopId) => {
        if (!isSuperAdminRole(role)) {
            throw new Error('Only super_admin can delete shops.');
        }

        const sid = asString(shopId);
        if (!sid) throw new Error('Invalid shop id.');

        const currentShops = Array.isArray(shops) ? shops : [];
        if (currentShops.length <= 1) {
            throw new Error('At least one shop must remain.');
        }

        const dependentTables = ['attendance', 'transactions', 'repairs', 'categories', 'inventory', 'profiles'];
        for (const tableName of dependentTables) {
            const { error } = await supabase.from(tableName).delete().eq('shop_id', sid);
            if (error) {
                console.warn(`Failed to cleanup ${tableName} for shop ${sid}:`, error);
            }
        }

        const { error: deleteError } = await deleteShopById(sid);
        if (deleteError) {
            throw new Error(deleteError.message || 'Failed to delete shop.');
        }

        const nextShops = currentShops.filter((shop) => shop.id !== sid);
        setShops(nextShops);
        setSalesmanMetaMap((prev) => {
            const next = { ...(prev || {}) };
            delete next[sid];
            return next;
        });
        setShopMetaMap((prev) => {
            const next = { ...(prev || {}) };
            delete next[sid];
            return next;
        });

        if (activeShopId === sid) {
            setActiveShopIdState(nextShops[0]?.id || '');
        }

        if (user && asString(user.shop_id) === sid) {
            const fallbackShopId = nextShops[0]?.id || '';
            const fallbackShopName = nextShops[0]?.name || '';
            setUser((prev) => prev ? { ...prev, shop_id: fallbackShopId, shopName: fallbackShopName } : prev);
        }

        return { success: true };
    }, [role, shops, activeShopId, user]);

    // ── Attendance State ──
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [isPunchedIn, setIsPunchedIn] = useState(false);
    const activeUserId = asString(getProfileId(user));
    const activeUserShopId = asString(user?.shop_id || activeShopId);

    const fetchAttendanceState = useCallback(async (shopIdArg, roleArg, userIdArg) => {
        const sid = asString(shopIdArg);
        if (!sid) {
            setAttendanceLogs([]);
            setIsPunchedIn(false);
            return;
        }

        const formatAttendance = (dbLog) => {
            const timestamp = asString(dbLog.timestamp || dbLog.check_out || dbLog.check_in || dbLog.created_at);
            const dObj = new Date(timestamp);
            return {
                ...dbLog,
                timestamp,
                type: asString(dbLog.type) || (asString(dbLog.check_out) ? 'OUT' : 'IN'),
                userId: asString(dbLog.userId || dbLog.workerId || dbLog.worker_id || dbLog.user_id),
                userName: asString(dbLog.userName || dbLog.workerName || dbLog.worker_name),
                date: Number.isNaN(dObj.getTime()) ? '' : dObj.toLocaleDateString('en-PK'),
                time: Number.isNaN(dObj.getTime()) ? asString(dbLog.time) : dObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
            };
        };

        const { data, error } = await requestAttendanceLogs(sid);
        const formattedLogs = !error && Array.isArray(data) ? data.map(formatAttendance) : [];
        setAttendanceLogs(formattedLogs);

        if (asString(roleArg) === 'salesman' && asString(userIdArg)) {
            const scopedUserId = asString(userIdArg);
            const { data: dbUserStatus, error: statusError } = await requestUserStatus({ shopId: sid, userId: scopedUserId });
            if (statusError) {
                console.error('Failed to fetch salesman attendance status:', {
                    shop_id: sid,
                    user_id: scopedUserId,
                    error: statusError,
                });
                return;
            }
            if (dbUserStatus) {
                setIsPunchedIn(asBoolean(dbUserStatus.is_punched_in));
            }
            return;
        }

        if (ADMIN_ROLES.includes(asString(roleArg))) {
            const { data: staffRows } = await requestStaffStatus(sid);
            if (Array.isArray(staffRows) && staffRows.length) {
                setSalesmen((prev) => (Array.isArray(prev) ? prev : []).map((staff) => {
                    const match = staffRows.find((row) => asString(row.user_id) === asString(staff?.id));
                    if (!match) return staff;
                    const isOnline = asBoolean(match.is_online);
                    return { ...staff, is_online: isOnline, isOnline, online: isOnline };
                }));
            }
        }

        if (asString(roleArg) !== 'salesman') {
            setIsPunchedIn(false);
        }
    }, []);

    useEffect(() => {
        fetchAttendanceState(activeUserShopId, role, activeUserId);
    }, [activeUserId, activeUserShopId, fetchAttendanceState, role]);

    useEffect(() => {
        const sid = asString(activeUserShopId);
        if (!sid) return;

        let cancelled = false;
        let debounce = null;

        const scheduleSync = () => {
            if (cancelled) return;
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                if (cancelled) return;
                fetchAttendanceState(sid, role, activeUserId);
            }, 120);
        };

        const filter = `shop_id=eq.${sid}`;
        const channel = supabase
            .channel(`public:attendance_presence:${sid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter }, scheduleSync)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter }, scheduleSync)
            .subscribe();

        return () => {
            cancelled = true;
            if (debounce) clearTimeout(debounce);
            supabase.removeChannel(channel);
        };
    }, [activeUserId, activeUserShopId, fetchAttendanceState, role]);

    useEffect(() => {
        const sid = asString(activeUserShopId);
        if (!sid) return;

        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            await fetchAttendanceState(sid, role, activeUserId);
        };

        tick();
        const intervalId = setInterval(tick, 3000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [activeUserId, activeUserShopId, fetchAttendanceState, role]);

    const punchIn = useCallback(async () => {
        const sid = asString(activeUserShopId);
        const uid = asString(activeUserId);
        if (!user || !sid || !uid || isPunchedIn) {
            if (!uid || !sid) {
                console.error('Punch IN blocked: missing profile session identifiers.', {
                    user,
                    resolved_user_id: uid,
                    resolved_shop_id: sid,
                });
            }
            return;
        }
        const ts = new Date();
        const optimisticId = `optimistic-in-${Date.now()}-${uid}`;
        const optimisticLog = {
            id: optimisticId,
            timestamp: ts.toISOString(),
            type: 'IN',
            userId: uid,
            userName: asString(user.name),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            __optimistic: true
        };

        setIsPunchedIn(true);
        setAttendanceLogs((prev) => [optimisticLog, ...(Array.isArray(prev) ? prev : [])]);

        const { error } = await requestAttendanceAction({
            userId: uid,
            shopId: sid,
            type: 'IN',
            timestamp: ts.toISOString()
        });

        if (error) {
            console.error('Failed to punch IN:', error);
            setIsPunchedIn(false);
            setAttendanceLogs((prev) => (Array.isArray(prev) ? prev : []).filter((log) => asString(log?.id) !== optimisticId));
            return;
        }

        fetchAttendanceState(sid, role, uid);
    }, [activeUserId, activeUserShopId, fetchAttendanceState, isPunchedIn, role, user]);

    const punchOut = useCallback(async () => {
        const sid = asString(activeUserShopId);
        const uid = asString(activeUserId);
        if (!user || !sid || !uid || !isPunchedIn) {
            if (!uid || !sid) {
                console.error('Punch OUT blocked: missing profile session identifiers.', {
                    user,
                    resolved_user_id: uid,
                    resolved_shop_id: sid,
                });
            }
            return;
        }
        const ts = new Date();
        const optimisticId = `optimistic-out-${Date.now()}-${uid}`;
        const optimisticLog = {
            id: optimisticId,
            timestamp: ts.toISOString(),
            type: 'OUT',
            userId: uid,
            userName: asString(user.name),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            __optimistic: true
        };

        setIsPunchedIn(false);
        setAttendanceLogs((prev) => [optimisticLog, ...(Array.isArray(prev) ? prev : [])]);

        const { error } = await requestAttendanceAction({
            userId: uid,
            shopId: sid,
            type: 'OUT',
            timestamp: ts.toISOString()
        });

        if (error) {
            console.error('Failed to punch OUT:', error);
            setIsPunchedIn(true);
            setAttendanceLogs((prev) => (Array.isArray(prev) ? prev : []).filter((log) => asString(log?.id) !== optimisticId));
            return;
        }

        fetchAttendanceState(sid, role, uid);
    }, [activeUserId, activeUserShopId, fetchAttendanceState, isPunchedIn, role, user]);

    const addAttendanceLog = (_userObj, type) => {
        const normalizedType = asString(type).toUpperCase();
        if (normalizedType === 'IN') {
            punchIn();
            return;
        }
        if (normalizedType === 'OUT') {
            punchOut();
        }
    };

    const updateAttendanceLog = useCallback(async (id, updates) => {
        const sid = asString(activeShopId);
        if (!sid) return;
        const existingLog = attendanceLogs.find((l) => String(l.id) === String(id));
        if (!existingLog) return;

        const { baseId, eventType } = parseAttendanceEventId(existingLog.id, existingLog.type);
        if (!baseId) return;

        const resolvedTimestamp = asString(updates.timestamp)
            || buildTimestampFromTime(existingLog.timestamp, updates.time)
            || existingLog.timestamp;

        const resolvedDateObj = new Date(resolvedTimestamp);
        const resolvedTime = updates.time
            || (Number.isNaN(resolvedDateObj.getTime())
                ? existingLog.time
                : resolvedDateObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));

        setAttendanceLogs(prev => prev.map((l) => {
            if (String(l.id) !== String(id)) return l;
            return {
                ...l,
                ...updates,
                time: resolvedTime,
                timestamp: resolvedTimestamp,
                date: Number.isNaN(resolvedDateObj.getTime())
                    ? l.date
                    : resolvedDateObj.toLocaleDateString('en-PK')
            };
        }));

        const payload = eventType === 'OUT'
            ? { check_out: resolvedTimestamp }
            : { check_in: resolvedTimestamp };

        const { error } = await supabase
            .from('attendance')
            .update(payload)
            .eq('attendance_id', baseId)
            .eq('shop_id', sid);

        if (error) {
            throw new Error(error.message || 'Failed to update attendance log.');
        }

        const targetUserId = asString(existingLog.userId || existingLog.workerId);
        if (targetUserId) {
            await syncProfileOnlineStatus(sid, targetUserId);
        }

        await fetchAttendanceState(activeUserShopId, role, activeUserId);
    }, [activeUserId, activeUserShopId, attendanceLogs, fetchAttendanceState, role]);

    const deleteAttendanceLog = useCallback(async (id) => {
        const sid = asString(activeShopId);
        if (!sid) return;
        const existingLog = attendanceLogs.find((l) => String(l.id) === String(id));
        if (!existingLog) return;

        const { baseId, eventType } = parseAttendanceEventId(existingLog.id, existingLog.type);
        if (!baseId) return;

        const targetUserId = asString(existingLog?.userId || existingLog?.workerId);
        const hasCompanion = attendanceLogs.some((log) => {
            if (String(log.id) === String(existingLog.id)) return false;
            const parsed = parseAttendanceEventId(log.id, log.type);
            return parsed.baseId === baseId && parsed.eventType !== eventType;
        });

        setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(id)));
        let error = null;
        if (hasCompanion) {
            const patch = eventType === 'OUT'
                ? { check_out: null, hours: null }
                : { check_in: null };
            const { error: updateError } = await supabase
                .from('attendance')
                .update(patch)
                .eq('attendance_id', baseId)
                .eq('shop_id', sid);
            error = updateError;
        } else {
            const { error: deleteError } = await supabase
                .from('attendance')
                .delete()
                .eq('attendance_id', baseId)
                .eq('shop_id', sid);
            error = deleteError;
        }

        if (error) {
            throw new Error(error.message || 'Failed to delete attendance log.');
        }

        if (targetUserId) {
            await syncProfileOnlineStatus(sid, targetUserId);
        }

        await fetchAttendanceState(activeUserShopId, role, activeUserId);
    }, [activeUserId, activeUserShopId, attendanceLogs, fetchAttendanceState, role]);

    // ── Auth Logic ──
    const login = useCallback(async (userData) => {
        setAuthLoading(true);
        try {
            if (userData.role === 'admin') {
                const lockMessage = getLockoutMessage('admin');
                if (lockMessage) {
                    return { success: false, message: lockMessage };
                }
                const identifier = asString(userData.identifier || userData.username || userData.email || userData.name);
                const password = asString(userData.password);
                const { profile, error } = await requestAdminLogin({ identifier, password });
                if (error || !profile) {
                    const safeError = error || 'Invalid credentials.';
                    if (shouldSkipAdminRateLimit(safeError)) {
                        clearRateLimit('admin');
                    } else {
                        bumpRateLimit('admin');
                    }
                    return { success: false, message: safeError };
                }
                clearRateLimit('admin');

                const normalized = normalizeUserFromProfile(profile);
                if (!normalized || !isAdminRoleName(normalized.role)) {
                    return { success: false, message: 'Not allowed.' };
                }
                const normalizedId = asString(getProfileId(normalized));
                const sessionUser = {
                    ...normalized,
                    id: normalizedId,
                    user_id: normalizedId,
                    shop_id: asString(normalized.shop_id || normalized.shopId),
                };
                setRole(sessionUser.role);
                setUser(sessionUser);
                writeAuthState(AUTH_USER_STATE_KEY, JSON.stringify(sessionUser));
                writeStorage(AUTH_TOKEN_KEY, makeLocalSessionToken(sessionUser.id, sessionUser.role));
                if (sessionUser.shop_id) {
                    setActiveShopIdState(sessionUser.shop_id);
                } else if (!isSuperAdminRole(sessionUser.role)) {
                    setActiveShopIdState('');
                }
                return { success: true, role: sessionUser.role, redirectTo: getAdminRedirectPath(sessionUser.role) };

            }

            if (userData.role === 'salesman') {
                const lockMessage = getLockoutMessage('salesman');
                if (lockMessage) {
                    return { success: false, message: lockMessage };
                }
                const pin = asString(userData.pin);
                if (!pin) return { success: false, message: 'PIN required' };

                const verified = await verifySalesmanPin(pin);
                if (verified?.profile) {
                    clearRateLimit('salesman');
                    const profile = verified.profile;
                    const normalized = mergeSalesmanMeta(normalizeUserFromProfile(profile), salesmanMetaMap);
                    if (normalized.active === false) {
                        return { success: false, message: 'User disabled' };
                    }
                    const normalizedId = asString(getProfileId(normalized));
                    const sessionUser = {
                        ...normalized,
                        id: normalizedId,
                        user_id: normalizedId,
                        shop_id: asString(normalized.shop_id || normalized.shopId),
                    };
                    if (!sessionUser.id || !sessionUser.shop_id) {
                        console.error('Salesman login failed to build valid profile session.', {
                            profile,
                            normalized,
                            sessionUser,
                        });
                        return { success: false, message: 'Profile mapping is invalid. Contact admin.' };
                    }
                    setRole('salesman');
                    setUser(sessionUser);
                    writeAuthState(AUTH_USER_STATE_KEY, JSON.stringify(sessionUser));
                    setActiveShopIdState(sessionUser.shop_id);
                    writeStorage(AUTH_TOKEN_KEY, makeLocalSessionToken(sessionUser.id, 'salesman'));
                    // Fetch actual punch state from attendance source of truth
                    try {
                        const { data: userStatusData, error: userStatusError } = await requestUserStatus({
                            shopId: sessionUser.shop_id,
                            userId: sessionUser.id,
                        });
                        if (userStatusError) {
                            console.error('Failed to resolve salesman punch state during login:', {
                                shop_id: sessionUser.shop_id,
                                user_id: sessionUser.id,
                                error: userStatusError,
                            });
                        }
                        if (userStatusData) {
                            setIsPunchedIn(asBoolean(userStatusData.is_punched_in));
                        }
                    } catch (statusError) {
                        console.error('Unexpected attendance status error during salesman login:', statusError);
                        setIsPunchedIn(false);
                    }
                    return { success: true, role: 'salesman', redirectTo: '/salesman/dashboard' };
                }

                bumpRateLimit('salesman');
                return { success: false, message: verified?.error || 'Invalid PIN' };
            }

            return { success: false, message: 'Unknown Role' };
        } finally {
            setAuthLoading(false);
        }
    }, [salesmanMetaMap]);

    const logout = () => {
        removeStorage(AUTH_TOKEN_KEY);
        clearPersistedAuthState();
        setRole(null);
        setUser(null);
        setActiveShopIdState('');
        setShops([]);
        setIsPunchedIn(false);
        setLowStockAlerts([]);
        setAttendanceLogs([]);
        return { success: true };
    };

    const verifySalesmanUnlockPin = useCallback(async (pinValue) => {
        const sid = asString(user?.shop_id || activeShopId);
        const uid = asString(user?.id);
        const scope = `unlock:${uid || 'unknown'}`;
        const lockMessage = getLockoutMessage(scope);
        if (lockMessage) {
            return { success: false, message: lockMessage };
        }

        if (!sid || !uid) {
            return { success: false, message: 'Session not ready. Please login again.' };
        }

        const enteredPin = asString(pinValue);
        if (!enteredPin) {
            return { success: false, message: 'PIN required.' };
        }

        const { profile, error } = await verifySalesmanPin(enteredPin, sid);
        const matchedId = asString(profile?.user_id || profile?.id);
        if (error || !profile || matchedId !== uid) {
            bumpRateLimit(scope);
            return { success: false, message: 'Invalid PIN.' };
        }

        clearRateLimit(scope);
        return { success: true };
    }, [activeShopId, user?.id, user?.shop_id]);

    // ── Management Functions ──
    const updateAdminPassword = async (newPass) => {
        const nextPass = asString(newPass);
        const userId = asString(user?.id);
        if (!nextPass) {
            throw new Error('Password is required.');
        }
        if (!userId || !ADMIN_ROLES.includes(asString(user?.role))) {
            throw new Error('Only logged-in admin users can change password.');
        }

        const nextPasswordHash = await hashPlainText(nextPass);
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ password_hash: nextPasswordHash || nextPass })
            .eq('user_id', userId);

        if (profileError && !isMissingColumnError(profileError, 'profiles.password_hash') && !isMissingColumnError(profileError, 'password_hash')) {
            throw new Error(profileError.message || 'Failed to update password.');
        }

        setUser((prev) => (prev ? { ...prev, password_hash: nextPasswordHash || nextPass } : prev));
        setAdminPassword('');
    };

    const addSalesman = async (name, pin, extra = {}) => {
        const trimmedName = asString(name);
        const trimmedPin = asString(pin);
        const sid = asString(activeShopId);
        if (!sid) {
            throw new Error('Select a shop first to add salesman.');
        }
        if (!trimmedName) {
            throw new Error('Salesman name is required.');
        }
        if (trimmedPin.length !== 4) {
            throw new Error('PIN must be exactly 4 digits.');
        }

        const existingPins = await listSalesmenByPin(trimmedPin, sid);
        if (existingPins.length > 0) {
            throw new Error('PIN already in use by another salesman (all shops). Please use a unique PIN.');
        }
        const pinDigest = await computePinDigest(sid, trimmedPin);
        if (!pinDigest) {
            throw new Error('Unable to compute PIN digest.');
        }
        const explicitNumber = asNumber(extra?.salesmanNumber, 0);
        const assignedNumber = explicitNumber > 0
            ? Math.floor(explicitNumber)
            : getNextSalesmanNumber(salesmen, salesmanMetaMap, sid);
        if (assignedNumber > 0) {
            const numberConflict = (Array.isArray(salesmen) ? salesmen : []).some((existing) => {
                const existingId = asString(existing?.id);
                if (!existingId) return false;
                const existingNumber = Math.max(0, Math.floor(asNumber(existing?.salesmanNumber, 0)));
                return existingNumber > 0 && existingNumber === assignedNumber;
            });
            if (numberConflict) {
                throw new Error(`Salesman number ${assignedNumber} is already assigned. Please use a unique number.`);
            }
        }
        const permissionPatch = {
            canEditTransactions: asBoolean(extra?.canEditTransactions),
            canBulkEdit: asBoolean(extra?.canBulkEdit)
        };

        let createdProfile = null;
        let insertError = null;
        const profileId = makeRowId();
        const payloadVariants = buildSalesmanInsertPayloads({
            name: trimmedName,
            username: '',
            profileId,
            pinDigest,
            shopId: sid,
            hourlyRate: 12.5,
            requireUserId: true,
        });

        for (const payload of payloadVariants) {
            const { data, error } = await supabase.from('profiles').insert([payload]).select().single();
            if (!error && data) {
                createdProfile = normalizeSalesman(data);
                break;
            }
            insertError = error;
        }

        if (createdProfile) {
            const createdUserId = asString(getProfileId(createdProfile));
            await supabase
                .from('profiles')
                .update({
                    salesman_number: assignedNumber,
                    can_edit_transactions: permissionPatch.canEditTransactions,
                    can_bulk_edit: permissionPatch.canBulkEdit,
                })
                .eq('user_id', createdUserId)
                .eq('shop_id', sid);

            const withMeta = {
                ...createdProfile,
                salesmanNumber: assignedNumber,
                ...permissionPatch
            };
            patchSalesmanMeta(sid, createdUserId, {
                salesmanNumber: assignedNumber,
                ...permissionPatch
            });
            setSalesmen(prev => [...prev, withMeta]);
            return withMeta;
        }

        const dbErrorMessage = asString(insertError?.message) || 'Failed to create salesman in database.';
        throw new Error(dbErrorMessage);
    };

    const checkSalesmanPinAvailabilityForShop = useCallback(async (pinValue, excludeSalesmanId = '') => {
        return checkSalesmanPinAvailability(pinValue, excludeSalesmanId, activeShopId);
    }, [activeShopId]);

    const addIndependentAdmin = async ({ name, email, password }) => {
        if (!isSuperAdminRole(role)) {
            throw new Error('Only super_admin can create independent admins.');
        }

        const adminName = asString(name) || 'Admin';
        const adminEmail = asString(email).toLowerCase();
        const adminPassword = asString(password);
        const adminPasswordHash = await hashPlainText(adminPassword);

        if (!adminEmail) throw new Error('Admin email is required.');
        if (!adminPassword || adminPassword.length < 4) throw new Error('Admin password must be at least 4 characters.');

        const existingAdmin = await trySelectProfileByField('username', adminEmail, ADMIN_ROLES);
        if (existingAdmin) {
            throw new Error('Admin email already exists.');
        }

        const payloads = buildProfileInsertPayloads({
            name: adminName,
            username: adminEmail,
            email: adminEmail,
            passwordHash: adminPasswordHash || adminPassword,
            role: 'owner',
            shopId: null,
            hourlyRate: 12.5,
            includePinDigest: false,
        });

        let created = null;
        let insertError = null;
        for (const payload of payloads) {
            const { data, error } = await supabase.from('profiles').insert([payload]).select().single();
            if (!error && data) {
                created = normalizeUserFromProfile(data);
                break;
            }
            insertError = error;
        }

        if (!created) {
            throw new Error(insertError?.message || 'Failed to create independent admin.');
        }

        return created;
    };

    const deleteSalesman = async (id) => {
        const sid = asString(activeShopId);
        if (sid) {
            await supabase.from('profiles').delete().eq('user_id', id).eq('shop_id', sid);
        }
        setSalesmanMetaMap((prev) => {
            const byShop = prev?.[sid] && typeof prev[sid] === 'object' ? { ...prev[sid] } : {};
            delete byShop[asString(id)];
            return {
                ...prev,
                [sid]: byShop
            };
        });
        setSalesmen(prev => {
            const next = prev.filter(s => String(s.id) !== String(id));
            broadcastSetting('salesmen', next);
            return next;
        });
    };

    const updateSalesman = async (id, updates) => {
        const sid = asString(activeShopId);
        const normalizedId = asString(id);
        const nextPin = asString(updates?.pin);
        const permissionUpdates = updates?.permissions && typeof updates.permissions === 'object'
            ? updates.permissions
            : {};
        const hasSalesmanNumber = Object.prototype.hasOwnProperty.call(updates || {}, 'salesmanNumber');
        const hasCanEditTransactions = Object.prototype.hasOwnProperty.call(updates || {}, 'canEditTransactions')
            || Object.prototype.hasOwnProperty.call(permissionUpdates, 'canEditTransactions');
        const hasCanBulkEdit = Object.prototype.hasOwnProperty.call(updates || {}, 'canBulkEdit')
            || Object.prototype.hasOwnProperty.call(permissionUpdates, 'canBulkEdit');
        const localMetaPatch = {};
        if (hasSalesmanNumber) {
            localMetaPatch.salesmanNumber = Math.max(0, Math.floor(asNumber(updates.salesmanNumber, 0)));
        }
        if (hasCanEditTransactions) {
            localMetaPatch.canEditTransactions = asBoolean(
                Object.prototype.hasOwnProperty.call(permissionUpdates, 'canEditTransactions')
                    ? permissionUpdates.canEditTransactions
                    : updates.canEditTransactions
            );
        }
        if (hasCanBulkEdit) {
            localMetaPatch.canBulkEdit = asBoolean(
                Object.prototype.hasOwnProperty.call(permissionUpdates, 'canBulkEdit')
                    ? permissionUpdates.canBulkEdit
                    : updates.canBulkEdit
            );
        }

        const dbUpdates = { ...(updates || {}) };
        delete dbUpdates.permissions;
        delete dbUpdates.pin;

        if (Object.prototype.hasOwnProperty.call(localMetaPatch, 'salesmanNumber') && localMetaPatch.salesmanNumber > 0) {
            const nextNumber = Math.max(0, Math.floor(asNumber(localMetaPatch.salesmanNumber, 0)));
            const numberConflict = (Array.isArray(salesmen) ? salesmen : []).some((existing) => {
                const existingId = asString(existing?.id);
                if (!existingId || existingId === normalizedId) return false;
                const existingNumber = Math.max(0, Math.floor(asNumber(existing?.salesmanNumber, 0)));
                return existingNumber > 0 && existingNumber === nextNumber;
            });
            if (numberConflict) {
                throw new Error(`Salesman number ${nextNumber} is already assigned. Please use a unique number.`);
            }
        }

        if (nextPin) {
            const conflicts = await listSalesmenByPin(nextPin, sid);
            const hasConflict = conflicts.some((row) => asString(row.user_id) !== normalizedId);
            if (hasConflict) {
                throw new Error('PIN already in use. Please choose a globally unique PIN.');
            }

            const nextDigest = await computePinDigest(sid, nextPin);
            if (!nextDigest) {
                throw new Error('Unable to compute PIN digest.');
            }
            dbUpdates.pin_digest = nextDigest;
        }

        if (sid && Object.keys(dbUpdates).length > 0) {
            let updatedOnDB = false;
            const candidates = buildProfileUpdatePayloads(dbUpdates);

            for (const payload of candidates) {
                const { error } = await supabase.from('profiles').update(payload).eq('user_id', id).eq('shop_id', sid);
                if (!error) {
                    updatedOnDB = true;
                    break;
                }
            }

            if (!updatedOnDB) {
                console.error('Failed to update salesman profile in DB for all payload variants.');
            }
        }

        if (sid && Object.keys(localMetaPatch).length > 0) {
            patchSalesmanMeta(sid, normalizedId, localMetaPatch);
        }

        setSalesmen(prev => {
            const next = prev.map(s => {
                if (String(s.id) !== String(id)) return s;
                return {
                    ...s,
                    ...dbUpdates,
                    ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'salesmanNumber')
                        ? { salesmanNumber: localMetaPatch.salesmanNumber }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'canEditTransactions')
                        ? { canEditTransactions: localMetaPatch.canEditTransactions }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'canBulkEdit')
                        ? { canBulkEdit: localMetaPatch.canBulkEdit }
                        : {})
                };
            });
            broadcastSetting('salesmen', next);
            return next;
        });
        if (user && String(user.id) === String(id)) {
            setUser(prev => ({
                ...prev,
                ...dbUpdates,
                ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'salesmanNumber')
                    ? { salesmanNumber: localMetaPatch.salesmanNumber }
                    : {}),
                ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'canEditTransactions')
                    ? { canEditTransactions: localMetaPatch.canEditTransactions }
                    : {}),
                ...(Object.prototype.hasOwnProperty.call(localMetaPatch, 'canBulkEdit')
                    ? { canBulkEdit: localMetaPatch.canBulkEdit }
                    : {})
            }));
        }
    };

    const handleSetSlowMovingDays = (val) => {
        const newVal = typeof val === 'function' ? val(slowMovingDays) : val;
        setSlowMovingDays(newVal);
        broadcastSetting('slowMovingDays', newVal);
    };

    const handleSetAutoLockEnabled = (val) => {
        const newVal = typeof val === 'function' ? val(autoLockEnabled) : val;
        setAutoLockEnabled(newVal);
        broadcastSetting('autoLockEnabled', newVal);
    };

    const handleSetAutoLockTimeout = (val) => {
        const newVal = typeof val === 'function' ? val(autoLockTimeout) : val;
        setAutoLockTimeout(newVal);
        broadcastSetting('autoLockTimeout', newVal);
    };

    const setBillShowTax = useCallback((enabled) => {
        const sid = asString(activeShopId);
        if (!sid) return;
        const nextEnabled = asBoolean(enabled);
        patchShopMeta(sid, { billShowTax: nextEnabled });
        setShops((prev) => prev.map((shop) => (
            shop.id === sid
                ? { ...shop, billShowTax: nextEnabled }
                : shop
        )));
    }, [activeShopId, patchShopMeta]);

    // ── Alert Logic ──
    const addLowStockAlert = (product) => {
        setLowStockAlerts((prev) => {
            if (prev.some((a) => a.barcode === product.barcode)) return prev;
            return [{ ...product, alertTime: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...prev];
        });
    };
    const clearAlert = (barcode) => setLowStockAlerts((prev) => prev.filter((a) => a.barcode !== barcode));
    const clearAllAlerts = () => setLowStockAlerts([]);
    const activeShop = useMemo(
        () => (Array.isArray(shops) ? shops.find((shop) => shop.id === asString(activeShopId)) : null) || null,
        [shops, activeShopId]
    );

    const value = {
        role,
        user,
        authLoading,
        isSuperAdmin,
        isAdminLike,
        login,
        verifySalesmanUnlockPin,
        logout,

        activeShopId,
        setActiveShopId,
        shops,
        activeShop,
        refreshShops,
        createShop,
        updateShop,
        deleteShop,
        billShowTax,
        setBillShowTax,

        salesmen,
        addSalesman,
        checkSalesmanPinAvailability: checkSalesmanPinAvailabilityForShop,
        addIndependentAdmin,
        deleteSalesman,
        updateSalesman,

        adminPassword,
        updateAdminPassword,
        slowMovingDays,
        setSlowMovingDays: handleSetSlowMovingDays,
        autoLockEnabled,
        setAutoLockEnabled: handleSetAutoLockEnabled,
        autoLockTimeout,
        setAutoLockTimeout: handleSetAutoLockTimeout,

        lowStockAlerts,
        addLowStockAlert,
        clearAlert,
        clearAllAlerts,

        attendanceLogs,
        punchIn,
        punchOut,
        isPunchedIn,
        addAttendanceLog,
        updateAttendanceLog,
        deleteAttendanceLog
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
