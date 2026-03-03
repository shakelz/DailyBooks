import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

const GLOBAL_ADMIN_ROLES = ['superadmin', 'superuser'];
const ADMIN_ROLES = [...GLOBAL_ADMIN_ROLES, 'admin'];
const AUTH_TOKEN_KEY = 'token';
const AUTH_ROLE_STATE_KEY = 'dailybooks_auth_role_v1';
const AUTH_USER_STATE_KEY = 'dailybooks_auth_user_v1';
const AUTH_SHOP_STATE_KEY = 'dailybooks_auth_shop_v1';
const SALESMAN_META_STORAGE_KEY = 'dailybooks_salesman_meta_v1';
const SHOP_META_STORAGE_KEY = 'dailybooks_shop_meta_v1';
const SLOW_MOVING_DAYS_KEY = 'dailybooks_slow_moving_days_v1';
const AUTO_LOCK_ENABLED_KEY = 'dailybooks_auto_lock_enabled_v1';
const AUTO_LOCK_TIMEOUT_KEY = 'dailybooks_auto_lock_timeout_v1';

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
    const { data: existing } = await supabase.auth.getSession();
    if (existing?.session) {
        setAuthTokenFromSupabaseSession(existing.session);
        return { ok: true, error: null };
    }

    // Do not force anonymous signup; many projects disable it and it causes noisy 422 errors.
    // App-level profile authentication can still run without a Supabase auth session.
    setAuthTokenFromSupabaseSession(null);
    return { ok: true, error: null };
}

function setAuthTokenFromSupabaseSession(session) {
    const token = asString(session?.access_token);
    if (token) {
        writeStorage(AUTH_TOKEN_KEY, token);
        return;
    }
    removeStorage(AUTH_TOKEN_KEY);
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

async function requestAdminLogin({ identifier, password }) {
    const identifierNormalized = asString(identifier).toLowerCase();
    const passwordNormalized = asString(password);
    if (!identifierNormalized || !passwordNormalized) {
        return { profile: null, error: 'Identifier and password are required' };
    }

    let profile = null;
    const { data: byEmail } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'superadmin', 'superuser'])
        .eq('email', identifierNormalized)
        .limit(1)
        .maybeSingle();

    if (byEmail) {
        profile = byEmail;
    } else {
        const { data: byName } = await supabase
            .from('profiles')
            .select('*')
            .in('role', ['admin', 'superadmin', 'superuser'])
            .eq('name', asString(identifier))
            .limit(1)
            .maybeSingle();
        profile = byName;
    }

    if (!profile) {
        return { profile: null, error: 'Invalid credentials' };
    }

    if (asString(profile.password) !== passwordNormalized) {
        return { profile: null, error: 'Invalid credentials' };
    }

    return { profile, error: null };
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
            .select('id,name')
            .in('id', userIds);

        profileNameById = (Array.isArray(profileRows) ? profileRows : []).reduce((acc, row) => {
            acc[asString(row?.id)] = asString(row?.name);
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
        if (asString(row?.check_in)) {
            events.push({ ...base, id: `${asString(row?.id)}:IN`, type: 'IN', timestamp: asString(row?.check_in) });
        }
        if (asString(row?.check_out)) {
            events.push({ ...base, id: `${asString(row?.id)}:OUT`, type: 'OUT', timestamp: asString(row?.check_out) });
        }
        if (!events.length) {
            events.push({ ...base, id: asString(row?.id), type: 'IN', timestamp: asString(row?.created_at) });
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
        const attendanceId = makeRowId();
        const { error: inError } = await supabase
            .from('attendance')
            .insert([{
                id: attendanceId,
                shop_id: sid,
                user_id: uid,
                check_in: ts,
                status: 'present',
            }]);

        if (inError) return { data: null, error: asString(inError.message) || 'Failed to punch in.' };
    } else {
        const { data: openRow, error: openError } = await supabase
            .from('attendance')
            .select('id,check_in')
            .eq('shop_id', sid)
            .eq('user_id', uid)
            .not('check_in', 'is', null)
            .is('check_out', null)
            .order('check_in', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (openError) return { data: null, error: asString(openError.message) || 'Failed to punch out.' };
        if (!openRow?.id) return { data: null, error: 'Cannot punch out without an active punch in.' };

        const startMs = new Date(asString(openRow.check_in)).getTime();
        const endMs = new Date(ts).getTime();
        const hours = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
            ? Math.round(((endMs - startMs) / 3600000) * 100) / 100
            : 0;

        const { error: outError } = await supabase
            .from('attendance')
            .update({
                check_out: ts,
                hours,
                status: 'present',
            })
            .eq('id', openRow.id);

        if (outError) return { data: null, error: asString(outError.message) || 'Failed to punch out.' };
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
        .select('id,check_in,check_out,created_at')
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
                id: openRow.id || null,
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
        .select('id,name,role,is_online,shop_id')
        .eq('shop_id', sid)
        .order('name', { ascending: true });

    if (error) return { data: [], error: asString(error.message) || 'Failed to load staff status.' };

    return {
        data: (Array.isArray(profiles) ? profiles : []).map((row) => ({
            user_id: asString(row.id),
            name: asString(row.name),
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
    const uid = asString(profile.id);
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
    const timePart = Date.now().toString(36).slice(-4);
    const randomPart = Math.random().toString(36).slice(2, 6);
    return `${timePart}${randomPart}`;
}

function normalizeUserFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const name =
        asString(profile.name)
        || asString(profile.full_name)
        || asString(profile.workerName)
        || (asString(profile.email).split('@')[0] || 'User');

    return {
        ...profile,
        id: profile.id,
        name,
        email: asString(profile.email),
        role: asString(profile.role) || 'salesman',
        pin: asString(profile.pin || profile.passcode || profile.pin_code || profile.pass_code),
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
        id: asString(shop.id || shop.shop_id),
        name: asString(shop.name || shop.shop_name || 'Shop'),
        location: asString(shop.address || ''),
        address: asString(shop.address || ''),
        owner_email: asString(shop.owner_email || shop.ownerEmail || ''),
        owner_password: asString(shop.owner_password || shop.password || ''),
        password: asString(shop.password || shop.owner_password || ''),
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
        .eq('role', 'admin')
        .in('shop_id', shopIds);

    if (error || !Array.isArray(data)) return normalizedShops;

    const ownersByShop = new Map();
    data.forEach((profile) => {
        const sid = asString(profile.shop_id);
        if (!sid || ownersByShop.has(sid)) return;
        ownersByShop.set(sid, {
            owner_profile_id: asString(profile.id),
            owner_email: asString(profile.email),
            owner_password: getProfilePassword(profile),
        });
    });

    const enrichedShops = normalizedShops.map((shop) => {
        const owner = ownersByShop.get(asString(shop.id));
        if (!owner) return shop;
        return {
            ...shop,
            owner_email: shop.owner_email || owner.owner_email,
            owner_password: owner.owner_password || asString(shop.password) || '',
            password: asString(shop.password) || owner.owner_password || '',
            owner_profile_id: owner.owner_profile_id || '',
        };
    });

    await Promise.all(enrichedShops.map(async (shop) => {
        const sid = asString(shop.id);
        const currentPassword = asString(shop.password);
        const ownerPassword = asString(shop.owner_password);
        if (!sid || currentPassword || !ownerPassword) return;
        await supabase.from('shops').update({ password: ownerPassword }).eq('id', sid);
    }));

    return enrichedShops;
}

function buildShopInsertPayloads({ name, address, ownerEmail, telephone, ownerPassword }) {
    const safeName = asString(name);
    const safeAddress = asString(address);
    const safeOwnerEmail = asString(ownerEmail).toLowerCase();
    const safeTelephone = asString(telephone);
    const safeOwnerPassword = asString(ownerPassword);
    if (!safeName) return [];

    return [cleanPayload({
        id: makeRowId(),
        name: safeName,
        address: safeAddress,
        owner_email: safeOwnerEmail,
        telephone: safeTelephone,
        password: safeOwnerPassword,
    })];
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
        .select('id')
        .eq('shop_id', sid)
        .eq('user_id', uid)
        .not('check_in', 'is', null)
        .is('check_out', null)
        .limit(1);

    await supabase
        .from('profiles')
        .update({ is_online: Array.isArray(openAttendance) && openAttendance.length > 0 })
        .eq('id', uid);
}

function buildShopUpdatePayloads({ name, address, ownerEmail, telephone, ownerPassword }) {
    const payload = cleanPayload({
        ...(name === undefined ? {} : { name: asString(name) }),
        ...(address === undefined ? {} : { address: asString(address) }),
        ...(ownerEmail === undefined ? {} : { owner_email: asString(ownerEmail).toLowerCase() }),
        ...(telephone === undefined ? {} : { telephone: asString(telephone) }),
        ...(ownerPassword === undefined ? {} : { password: asString(ownerPassword) }),
    });

    return Object.keys(payload).length ? [payload] : [];
}

function buildShopOwnerProfileUpdatePayloads({ ownerEmail, ownerPassword }) {
    const payload = cleanPayload({
        ...(ownerEmail === undefined ? {} : { email: asString(ownerEmail).toLowerCase() }),
        ...(ownerPassword === undefined ? {} : { password: asString(ownerPassword) }),
    });

    return Object.keys(payload).length ? [payload] : [];
}

function buildProfileInsertPayloads({
    name,
    email = '',
    role = 'salesman',
    shopId,
    pin = '',
    password = '',
    hourlyRate = 12.5,
    includePassword = true,
    includePin = true
}) {
    const safeName = asString(name) || 'User';
    const safePin = asString(pin);
    const safePassword = asString(password);
    const profileId = makeRowId();

    const sid = asString(shopId);

    return [cleanPayload({
        id: profileId,
        ...(sid ? { shop_id: sid } : {}),
        role,
        name: safeName,
        email: asString(email).toLowerCase(),
        hourlyRate,
        active: true,
        is_online: false,
        ...(includePin && safePin ? { pin: safePin } : {}),
        ...(includePassword && safePassword ? { password: safePassword } : {}),
    })];
}

function buildManagerProfilePayloads({ ownerName, ownerEmail, shopId, tempPin, tempPassword }) {
    return buildProfileInsertPayloads({
        name: ownerName,
        email: ownerEmail,
        role: 'admin',
        shopId,
        pin: tempPin,
        password: tempPassword,
        hourlyRate: 12.5,
        includePassword: true,
        includePin: false
    });
}

function buildSalesmanInsertPayloads({ name, pin, shopId, hourlyRate = 12.5 }) {
    return buildProfileInsertPayloads({
        name,
        role: 'salesman',
        shopId,
        pin,
        hourlyRate,
        includePassword: false
    });
}

function buildProfileUpdatePayloads(updates = {}) {
    const payload = cleanPayload({
        ...(updates.name === undefined ? {} : { name: asString(updates.name) }),
        ...(updates.email === undefined ? {} : { email: asString(updates.email).toLowerCase() }),
        ...(updates.role === undefined ? {} : { role: asString(updates.role) }),
        ...(updates.shop_id === undefined
            ? {}
            : { shop_id: updates.shop_id === null ? null : asString(updates.shop_id) }),
        ...(updates.pin === undefined ? {} : { pin: asString(updates.pin) }),
        ...(updates.password === undefined ? {} : { password: asString(updates.password) }),
        ...(updates.hourlyRate === undefined ? {} : { hourlyRate: Number(updates.hourlyRate) || 0 }),
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
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq(field, value)
        .in('role', roles)
        .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0];
}

async function trySelectSalesmanByPin(pinValue, shopId = '') {
    const safePin = asString(pinValue);
    const sid = asString(shopId);
    if (!safePin) return null;

    const pinFields = ['pin', 'passcode', 'pin_code', 'pass_code'];
    let shouldFallbackScan = false;

    for (const field of pinFields) {
        let query = supabase
            .from('profiles')
            .select('*')
            .eq(field, safePin)
            .eq('role', 'salesman');
        if (sid) {
            query = query.eq('shop_id', sid);
        }
        const { data, error } = await query.limit(2);

        if (!error && Array.isArray(data) && data.length > 1 && !sid) {
            return null;
        }
        if (!error && Array.isArray(data) && data.length > 0) {
            return data[0];
        }

        const message = asString(error?.message).toLowerCase();
        if (message.includes('schema cache') || message.includes('column')) {
            shouldFallbackScan = true;
            continue;
        }

        if (!error && Array.isArray(data) && data.length === 0) {
            continue;
        }
    }

    if (!shouldFallbackScan) {
        return null;
    }

    const { data: rows, error: scanError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'salesman');

    if (scanError || !Array.isArray(rows)) return null;
    const matches = rows.filter((row) => {
        const rowShopId = asString(row.shop_id);
        if (sid && rowShopId !== sid) return false;
        return asString(row.pin || row.passcode || row.pin_code || row.pass_code) === safePin;
    });
    if (!sid && matches.length > 1) return null;
    return matches[0] || null;
}

async function listSalesmenByPin(pinValue) {
    const safePin = asString(pinValue);
    if (!safePin) return [];

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'salesman');

    if (error || !Array.isArray(data)) return [];

    return data.filter((row) => asString(row.pin || row.passcode || row.pin_code || row.pass_code) === safePin);
}

async function checkSalesmanPinAvailability(pinValue, excludeSalesmanId = '') {
    const safePin = asString(pinValue);
    const excludedId = asString(excludeSalesmanId);
    if (!safePin) {
        return { available: false, message: 'PIN is required.' };
    }
    if (safePin.length !== 4) {
        return { available: false, message: 'PIN must be exactly 4 digits.' };
    }

    const conflicts = await listSalesmenByPin(safePin);
    const hasConflict = conflicts.some((row) => asString(row?.id) !== excludedId);
    if (hasConflict) {
        return { available: false, message: 'PIN already in use by another salesman (all shops). Use a unique PIN.' };
    }

    return { available: true, message: '' };
}

export function AuthProvider({ children }) {
    const initialAuthState = (() => {
        const savedUser = safeParseJSON(readAuthState(AUTH_USER_STATE_KEY, ''), null);
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

    const isSuperAdmin = GLOBAL_ADMIN_ROLES.includes(role);
    const isAdminLike = GLOBAL_ADMIN_ROLES.includes(role) || role === 'admin';
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
        let active = true;

        const bootstrapAuthSession = async () => {
            const { data } = await supabase.auth.getSession();
            if (!active) return;

            setAuthTokenFromSupabaseSession(data?.session || null);
        };

        bootstrapAuthSession();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuthTokenFromSupabaseSession(session || null);
            if (_event === 'SIGNED_OUT') {
                clearPersistedAuthState();
                setRole(null);
                setUser(null);
                setActiveShopIdState('');
            }
        });

        return () => {
            active = false;
            authListener?.subscription?.unsubscribe?.();
        };
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

            await supabase
                .from('shops')
                .update({ telephone: resolvedTelephone })
                .eq('id', sid);
        }
    }, []);

    const refreshShops = useCallback(async (preferredShopId = '') => {
        if (!role || !user) {
            setShops([]);
            return [];
        }

        const isIndependentAdmin = asString(role) === 'admin' && !asString(user?.shop_id);

        if (GLOBAL_ADMIN_ROLES.includes(role) || isIndependentAdmin) {
            const { data, error } = await supabase.from('shops').select('*').order('name', { ascending: true });
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

            // Only update active shop when we have a clear preferred or when no active shop is set.
            if (preferredExists) {
                setActiveShopIdState(preferred);
            } else if (!asString(activeShopId)) {
                // If there is exactly one shop, default to it.
                if (merged.length === 1) {
                    setActiveShopIdState(merged[0].id);
                } else if (merged.length > 0) {
                    // Otherwise, set the first shop only when no active shop is already set.
                    setActiveShopIdState(merged[0].id);
                } else {
                    setActiveShopIdState('');
                }
            }
            return merged;
        }

        const sid = asString(preferredShopId || user.shop_id || activeShopId);
        if (!sid) {
            setShops([]);
            return [];
        }

        const { data, error } = await supabase.from('shops').select('*').eq('id', sid).maybeSingle();
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
        const orderCandidates = ['name', 'full_name', 'workerName'];

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
        const isIndependentAdmin = asString(role) === 'admin' && !asString(user?.shop_id);
        if (isSuperAdmin || isIndependentAdmin) {
            setActiveShopIdState(sid);
            return;
        }

        // Shop-admin and salesman users are bound to their mapped shop.
        const lockedShopId = asString(user?.shop_id || activeShopId);
        setActiveShopIdState(lockedShopId || sid);
    }, [isSuperAdmin, role, user, activeShopId]);

    const createShop = useCallback(async ({ shopName, location, address, ownerEmail, telephone }) => {
        if (!GLOBAL_ADMIN_ROLES.includes(role)) {
            throw new Error('Only superadmin/superuser can create shops.');
        }

        const name = asString(shopName);
        const shopAddress = asString(address);
        const email = asString(ownerEmail).toLowerCase();
        const shopTelephone = asString(telephone);

        if (!name) throw new Error('Shop name is required.');
        if (!email) throw new Error('Owner email is required.');

        const existingOwner = await trySelectProfileByField('email', email, ADMIN_ROLES);
        if (existingOwner) {
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
            ownerPassword: generatedOwnerPassword
        });

        for (const payload of shopPayloads) {
            const { data, error } = await supabase.from('shops').insert([payload]).select().single();
            if (!error && data) {
                createdShop = normalizeShop(data);
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
        const tempPin = String(Math.floor(1000 + Math.random() * 9000));
        const tempPassword = generatedOwnerPassword;

        let createdProfile = null;
        let profileError = null;
        const profilePayloads = buildManagerProfilePayloads({
            ownerName,
            ownerEmail: email,
            shopId,
            tempPin,
            tempPassword
        });

        for (const payload of profilePayloads) {
            const { data, error } = await supabase.from('profiles').insert([payload]).select().single();
            if (!error && data) {
                createdProfile = normalizeUserFromProfile(data);
                break;
            }
            profileError = error;
        }

        if (!createdProfile) {
            // Avoid leaving partially created shops without any user mapping.
            await supabase.from('shops').delete().eq('id', shopId);
            throw new Error(profileError?.message || 'Shop created but admin user creation failed.');
        }

        const createdShopWithCredentials = {
            ...createdShop,
            owner_email: createdShop.owner_email || email,
            owner_password: getProfilePassword(createdProfile) || tempPassword,
            password: getProfilePassword(createdProfile) || tempPassword,
            owner_profile_id: asString(createdProfile.id),
        };
        const resolvedAddress = asString(shopAddress || createdShopWithCredentials.address);
        const resolvedTelephone = asString(shopTelephone || createdShopWithCredentials.telephone || createdShopWithCredentials.phone || '');

        const syncShopPayload = {
            password: createdShopWithCredentials.owner_password || tempPassword,
            ...(resolvedTelephone ? { telephone: resolvedTelephone } : {})
        };
        if (Object.keys(syncShopPayload).length > 0) {
            await supabase.from('shops').update(syncShopPayload).eq('id', shopId);
        }

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
            }
        };
    }, [role, activeShopId, patchShopMeta, shopMetaMap]);

    const updateShop = useCallback(async (shopId, updates = {}) => {
        if (!GLOBAL_ADMIN_ROLES.includes(role)) {
            throw new Error('Only superadmin/superuser can update shops.');
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
            || Object.prototype.hasOwnProperty.call(updates, 'owner_password');

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
            ? asString(updates.ownerPassword ?? updates.owner_password)
            : undefined;
        const shouldUpdateOwnerPassword = hasOwnerPassword && !!nextOwnerPassword;
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
                ownerPassword: shouldUpdateOwnerPassword ? nextOwnerPassword : undefined
            });

            if (payloads.length === 0) {
                throw new Error('No valid shop fields provided.');
            }

            let updateError = null;
            for (const payload of payloads) {
                const { data, error } = await supabase
                    .from('shops')
                    .update(payload)
                    .eq('id', sid)
                    .select()
                    .single();

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
                const { error } = await supabase
                    .from('shops')
                    .update({ telephone: nextTelephone || '' })
                    .eq('id', sid);
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
                ownerPassword: shouldUpdateOwnerPassword ? nextOwnerPassword : undefined
            });

            if (ownerPayloads.length > 0) {
                let ownerProfileId = asString(currentShop?.owner_profile_id);
                if (!ownerProfileId) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('shop_id', sid)
                        .eq('role', 'admin')
                        .limit(1);

                    if (error) {
                        throw new Error(error.message || 'Failed to load shop admin profile.');
                    }

                    const ownerRow = Array.isArray(data) ? data[0] : null;
                    ownerProfileId = asString(ownerRow?.id);
                }

                if (!ownerProfileId) {
                    throw new Error('No admin profile found for this shop.');
                }

                let ownerUpdateError = null;
                for (const payload of ownerPayloads) {
                    const { data, error } = await supabase
                        .from('profiles')
                        .update(payload)
                        .eq('id', ownerProfileId)
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
            owner_profile_id: asString(updatedOwnerProfile?.id || updatedShop?.owner_profile_id || currentShop?.owner_profile_id),
            owner_email: hasOwner
                ? nextOwnerEmail
                : asString(updatedOwnerProfile?.email || updatedShop?.owner_email || currentShop?.owner_email),
            owner_password: shouldUpdateOwnerPassword
                ? nextOwnerPassword
                : asString(getProfilePassword(updatedOwnerProfile) || updatedShop?.owner_password || currentShop?.owner_password),
            password: shouldUpdateOwnerPassword
                ? nextOwnerPassword
                : asString(updatedShop?.password || currentShop?.password || getProfilePassword(updatedOwnerProfile)),
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
            const { error } = await supabase
                .from('shops')
                .update({ password: nextOwnerPassword })
                .eq('id', sid);
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
                email: asString(updatedOwnerProfile?.email || prev.email)
            } : prev);
        }

        return mergedShopWithMeta;
    }, [role, user, shops, patchShopMeta, shopMetaMap]);

    const deleteShop = useCallback(async (shopId) => {
        if (!GLOBAL_ADMIN_ROLES.includes(role)) {
            throw new Error('Only superadmin/superuser can delete shops.');
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

        const { error: deleteError } = await supabase.from('shops').delete().eq('id', sid);
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
            const { data: dbUserStatus } = await requestUserStatus({ shopId: sid, userId: asString(userIdArg) });
            setIsPunchedIn(asBoolean(dbUserStatus?.is_punched_in));
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
        fetchAttendanceState(activeShopId, role, user?.id);
    }, [activeShopId, role, user?.id, fetchAttendanceState]);

    useEffect(() => {
        const sid = asString(activeShopId);
        if (!sid) return;

        let cancelled = false;
        let debounce = null;

        const scheduleSync = () => {
            if (cancelled) return;
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                if (cancelled) return;
                fetchAttendanceState(sid, role, user?.id);
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
    }, [activeShopId, fetchAttendanceState, role, user?.id]);

    useEffect(() => {
        const sid = asString(activeShopId);
        if (!sid) return;

        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            await fetchAttendanceState(sid, role, user?.id);
        };

        tick();
        const intervalId = setInterval(tick, 3000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [activeShopId, fetchAttendanceState, role, user?.id]);

    const punchIn = useCallback(async () => {
        if (!user || !activeShopId || isPunchedIn) return;
        const ts = new Date();
        const optimisticId = `optimistic-in-${Date.now()}-${user.id}`;
        const optimisticLog = {
            id: optimisticId,
            timestamp: ts.toISOString(),
            type: 'IN',
            userId: asString(user.id),
            userName: asString(user.name),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            __optimistic: true
        };

        setIsPunchedIn(true);
        setAttendanceLogs((prev) => [optimisticLog, ...(Array.isArray(prev) ? prev : [])]);

        const { error } = await requestAttendanceAction({
            userId: user.id,
            shopId: activeShopId,
            type: 'IN',
            timestamp: ts.toISOString()
        });

        if (error) {
            console.error('Failed to punch IN:', error);
            setIsPunchedIn(false);
            setAttendanceLogs((prev) => (Array.isArray(prev) ? prev : []).filter((log) => asString(log?.id) !== optimisticId));
            return;
        }

        fetchAttendanceState(activeShopId, role, user?.id);
    }, [activeShopId, fetchAttendanceState, isPunchedIn, role, user]);

    const punchOut = useCallback(async () => {
        if (!user || !activeShopId || !isPunchedIn) return;
        const ts = new Date();
        const optimisticId = `optimistic-out-${Date.now()}-${user.id}`;
        const optimisticLog = {
            id: optimisticId,
            timestamp: ts.toISOString(),
            type: 'OUT',
            userId: asString(user.id),
            userName: asString(user.name),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            __optimistic: true
        };

        setIsPunchedIn(false);
        setAttendanceLogs((prev) => [optimisticLog, ...(Array.isArray(prev) ? prev : [])]);

        const { error } = await requestAttendanceAction({
            userId: user.id,
            shopId: activeShopId,
            type: 'OUT',
            timestamp: ts.toISOString()
        });

        if (error) {
            console.error('Failed to punch OUT:', error);
            setIsPunchedIn(true);
            setAttendanceLogs((prev) => (Array.isArray(prev) ? prev : []).filter((log) => asString(log?.id) !== optimisticId));
            return;
        }

        fetchAttendanceState(activeShopId, role, user?.id);
    }, [activeShopId, fetchAttendanceState, isPunchedIn, role, user]);

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
            .eq('id', baseId)
            .eq('shop_id', sid);

        if (error) {
            throw new Error(error.message || 'Failed to update attendance log.');
        }

        const targetUserId = asString(existingLog.userId || existingLog.workerId);
        if (targetUserId) {
            await syncProfileOnlineStatus(sid, targetUserId);
        }

        await fetchAttendanceState(activeShopId, role, user?.id);
    }, [activeShopId, attendanceLogs, fetchAttendanceState, role, user]);

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
                .eq('id', baseId)
                .eq('shop_id', sid);
            error = updateError;
        } else {
            const { error: deleteError } = await supabase
                .from('attendance')
                .delete()
                .eq('id', baseId)
                .eq('shop_id', sid);
            error = deleteError;
        }

        if (error) {
            throw new Error(error.message || 'Failed to delete attendance log.');
        }

        if (targetUserId) {
            await syncProfileOnlineStatus(sid, targetUserId);
        }

        await fetchAttendanceState(activeShopId, role, user?.id);
    }, [activeShopId, attendanceLogs, fetchAttendanceState, role, user]);

    // ── Auth Logic ──
    const login = useCallback(async (userData) => {
        setAuthLoading(true);
        try {
            const sessionResult = await ensureSupabaseSession();
            if (!sessionResult.ok) {
                return { success: false, message: sessionResult.error || 'Unable to create auth session.' };
            }

            if (userData.role === 'admin') {
                const identifier = asString(userData.username || userData.email || userData.name);
                const password = asString(userData.password);
                const { profile, error } = await requestAdminLogin({ identifier, password });
                if (error || !profile) {
                    return { success: false, message: 'Invalid Admin credentials' };
                }

                const normalized = normalizeUserFromProfile(profile);
                if (!normalized || !ADMIN_ROLES.includes(normalized.role)) {
                    return { success: false, message: 'Invalid Admin credentials' };
                }
                setRole(normalized.role);
                setUser(normalized);
                if (normalized.shop_id) {
                    setActiveShopIdState(normalized.shop_id);
                } else if (!GLOBAL_ADMIN_ROLES.includes(normalized.role)) {
                    setActiveShopIdState('');
                }
                return { success: true, role: normalized.role };

            }

            if (userData.role === 'salesman') {
                const pin = asString(userData.pin);
                if (!pin) return { success: false, message: 'PIN required' };

                const profile = await trySelectSalesmanByPin(pin);
                if (profile) {
                    const normalized = mergeSalesmanMeta(normalizeUserFromProfile(profile), salesmanMetaMap);
                    if (normalized.active === false) {
                        return { success: false, message: 'User disabled' };
                    }
                    setRole('salesman');
                    setUser(normalized);
                    setActiveShopIdState(normalized.shop_id);
                    // Fetch actual punch state from attendance source of truth
                    try {
                        const { data: userStatusData } = await requestUserStatus({ shopId: normalized.shop_id, userId: normalized.id });
                        setIsPunchedIn(userStatusData ? asBoolean(userStatusData.is_punched_in) : false);
                    } catch {
                        setIsPunchedIn(false);
                    }
                    return { success: true, role: 'salesman' };
                }

                const conflictingPins = await listSalesmenByPin(pin);
                if (conflictingPins.length > 1) {
                    return { success: false, message: 'PIN conflict across shops. Ask admin to set a unique PIN.' };
                }

                // Legacy fallback
                const salesman = salesmen.find(s => String(s.pin) === pin);
                if (salesman) {
                    const withMeta = mergeSalesmanMeta(salesman, salesmanMetaMap);
                    setRole('salesman');
                    setUser(withMeta);
                    if (withMeta.shop_id) setActiveShopIdState(asString(withMeta.shop_id));
                    // Fetch actual punch state from attendance source of truth
                    try {
                        const sid = asString(withMeta.shop_id);
                        const uid = asString(withMeta.id);
                        if (sid && uid) {
                            const { data: userStatusData } = await requestUserStatus({ shopId: sid, userId: uid });
                            setIsPunchedIn(userStatusData ? asBoolean(userStatusData.is_punched_in) : false);
                        } else {
                            setIsPunchedIn(false);
                        }
                    } catch {
                        setIsPunchedIn(false);
                    }
                    return { success: true, role: 'salesman' };
                }

                return { success: false, message: 'Invalid PIN' };
            }

            return { success: false, message: 'Unknown Role' };
        } finally {
            setAuthLoading(false);
        }
    }, [salesmen, activeShopId, salesmanMetaMap]);

    const logout = () => {
        supabase.auth.signOut().catch(() => undefined);
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

        const { error } = await supabase
            .from('profiles')
            .update({ password: nextPass })
            .eq('id', userId);

        if (error) {
            throw new Error(error.message || 'Failed to update admin password.');
        }

        setUser((prev) => (prev ? { ...prev, password: nextPass } : prev));
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

        const existingPins = await listSalesmenByPin(trimmedPin);
        if (existingPins.length > 0) {
            throw new Error('PIN already in use by another salesman (all shops). Please use a unique PIN.');
        }
        const explicitNumber = asNumber(extra?.salesmanNumber, 0);
        const assignedNumber = explicitNumber > 0
            ? Math.floor(explicitNumber)
            : getNextSalesmanNumber(salesmen, salesmanMetaMap, sid);
        const permissionPatch = {
            canEditTransactions: asBoolean(extra?.canEditTransactions),
            canBulkEdit: asBoolean(extra?.canBulkEdit)
        };

        let createdProfile = null;
        let insertError = null;
        const payloadVariants = buildSalesmanInsertPayloads({
            name: trimmedName,
            pin: trimmedPin,
            shopId: sid,
            hourlyRate: 12.5
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
            await supabase
                .from('profiles')
                .update({
                    salesman_number: assignedNumber,
                    can_edit_transactions: permissionPatch.canEditTransactions,
                    can_bulk_edit: permissionPatch.canBulkEdit,
                })
                .eq('id', createdProfile.id)
                .eq('shop_id', sid);

            const withMeta = {
                ...createdProfile,
                salesmanNumber: assignedNumber,
                ...permissionPatch
            };
            patchSalesmanMeta(sid, createdProfile.id, {
                salesmanNumber: assignedNumber,
                ...permissionPatch
            });
            setSalesmen(prev => [...prev, withMeta]);
            return withMeta;
        }

        const dbErrorMessage = asString(insertError?.message) || 'Failed to create salesman in database.';
        throw new Error(dbErrorMessage);
    };

    const addIndependentAdmin = async ({ name, email, password }) => {
        if (!GLOBAL_ADMIN_ROLES.includes(role)) {
            throw new Error('Only superadmin/superuser can create independent admins.');
        }

        const adminName = asString(name) || 'Admin';
        const adminEmail = asString(email).toLowerCase();
        const adminPassword = asString(password);

        if (!adminEmail) throw new Error('Admin email is required.');
        if (!adminPassword || adminPassword.length < 4) throw new Error('Admin password must be at least 4 characters.');

        const existingAdmin = await trySelectProfileByField('email', adminEmail, ADMIN_ROLES);
        if (existingAdmin) {
            throw new Error('Admin email already exists.');
        }

        const payloads = buildProfileInsertPayloads({
            name: adminName,
            email: adminEmail,
            role: 'admin',
            shopId: null,
            password: adminPassword,
            includePin: false,
            includePassword: true,
            hourlyRate: 12.5,
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
            await supabase.from('profiles').delete().eq('id', id).eq('shop_id', sid);
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

        if (nextPin) {
            const conflicts = await listSalesmenByPin(nextPin);
            const hasConflict = conflicts.some((row) => asString(row.id) !== normalizedId);
            if (hasConflict) {
                throw new Error('PIN already used in another shop. Please choose a different PIN.');
            }
        }

        if (sid && Object.keys(dbUpdates).length > 0) {
            let updatedOnDB = false;
            const candidates = buildProfileUpdatePayloads(dbUpdates);

            for (const payload of candidates) {
                const { error } = await supabase.from('profiles').update(payload).eq('id', id).eq('shop_id', sid);
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
        checkSalesmanPinAvailability,
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
