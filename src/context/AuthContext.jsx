import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

const GLOBAL_ADMIN_ROLES = ['superadmin', 'superuser'];
const ADMIN_ROLES = [...GLOBAL_ADMIN_ROLES, 'admin'];
const AUTH_SESSION_KEY = 'dailybooks_auth_session_v1';
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const AUTH_ROLE_STATE_KEY = 'dailybooks_auth_role_v1';
const AUTH_USER_STATE_KEY = 'dailybooks_auth_user_v1';
const AUTH_SHOP_STATE_KEY = 'dailybooks_auth_shop_v1';
const SALESMAN_META_STORAGE_KEY = 'dailybooks_salesman_meta_v1';
const SHOP_META_STORAGE_KEY = 'dailybooks_shop_meta_v1';

const volatileAuthStore = {
    session: null,
    role: '',
    user: '',
    shop: ''
};

const DEFAULT_SALESMAN_PERMISSIONS = {
    canEditTransactions: false,
    canBulkEdit: false
};

function readAuthSession() {
    const raw = volatileAuthStore.session;
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? safeParseJSON(raw, null) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
}

function isAuthSessionValid() {
    const session = readAuthSession();
    if (!session) return false;
    const expiresAt = Number(session.expiresAt || 0);
    if (!expiresAt || Date.now() > expiresAt) {
        volatileAuthStore.session = null;
        return false;
    }
    return true;
}

function persistAuthSession(role, user) {
    volatileAuthStore.session = {
        role: asString(role),
        userId: asString(user?.id),
        expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
    };
}

function clearAuthSession() {
    volatileAuthStore.session = null;
}

function clearPersistedAuthState() {
    volatileAuthStore.role = '';
    volatileAuthStore.user = '';
    volatileAuthStore.shop = '';
}

function readAuthState(key, fallback = '') {
    let value = '';
    if (key === AUTH_ROLE_STATE_KEY) value = volatileAuthStore.role;
    if (key === AUTH_USER_STATE_KEY) value = volatileAuthStore.user;
    if (key === AUTH_SHOP_STATE_KEY) value = volatileAuthStore.shop;
    return value ?? fallback;
}

function writeAuthState(key, value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    if (key === AUTH_ROLE_STATE_KEY) volatileAuthStore.role = normalized;
    if (key === AUTH_USER_STATE_KEY) volatileAuthStore.user = normalized;
    if (key === AUTH_SHOP_STATE_KEY) volatileAuthStore.shop = normalized;
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

function resolveApiBase() {
    return asString(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '');
}

async function requestAdminLogin({ identifier, password }) {
    const base = resolveApiBase();
    const endpoint = `${base}/api/auth/admin-login`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password })
    });

    let payload = null;
    try {
        payload = await response.json();
    } catch {
        payload = null;
    }

    if (!response.ok || !payload?.success) {
        return { profile: null, error: asString(payload?.error?.message) || 'Invalid credentials' };
    }

    const profile = payload?.data && typeof payload.data === 'object' ? payload.data : null;
    return { profile, error: null };
}

function readLocalJSON(key, fallback) {
    return fallback;
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
    const meta = getSalesmanMeta(metaMap, profile.shop_id, profile.id);
    return {
        ...profile,
        salesmanNumber: meta.salesmanNumber || profile.salesmanNumber || 0,
        canEditTransactions: meta.canEditTransactions,
        canBulkEdit: meta.canBulkEdit
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
    const resolvedAddress = asString(meta.address || shop.address || shop.location || '');
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
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
        photo: asString(profile.photo || profile.avatar_url),
        active: profile.active !== false,
        shop_id: asString(profile.shop_id || profile.shopId),
        is_online: asBoolean(profile.is_online ?? profile.isOnline ?? profile.online),
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
        location: asString(shop.location || shop.address || ''),
        address: asString(shop.address || shop.location || ''),
        owner_email: asString(shop.owner_email || shop.ownerEmail || ''),
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

    return normalizedShops.map((shop) => {
        const owner = ownersByShop.get(asString(shop.id));
        if (!owner) return shop;
        return {
            ...shop,
            owner_email: shop.owner_email || owner.owner_email,
            owner_password: owner.owner_password || '',
            owner_profile_id: owner.owner_profile_id || '',
        };
    });
}

function buildShopInsertPayloads({ name, location, address, ownerEmail, telephone }) {
    const safeName = asString(name);
    const safeLocation = asString(location);
    const safeAddress = asString(address);
    const safeOwnerEmail = asString(ownerEmail).toLowerCase();
    const safeTelephone = asString(telephone);
    if (!safeName) return [];

    return [cleanPayload({
        id: makeRowId(),
        name: safeName,
        location: safeLocation,
        address: safeAddress,
        owner_email: safeOwnerEmail,
        telephone: safeTelephone
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

function buildShopUpdatePayloads({ name, location, address, ownerEmail, telephone }) {
    const payload = cleanPayload({
        ...(name === undefined ? {} : { name: asString(name) }),
        ...(location === undefined ? {} : { location: asString(location) }),
        ...(address === undefined ? {} : { address: asString(address) }),
        ...(ownerEmail === undefined ? {} : { owner_email: asString(ownerEmail).toLowerCase() }),
        ...(telephone === undefined ? {} : { telephone: asString(telephone) }),
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

    return [cleanPayload({
        id: profileId,
        shop_id: asString(shopId),
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
        ...(updates.shop_id === undefined ? {} : { shop_id: asString(updates.shop_id) }),
        ...(updates.pin === undefined ? {} : { pin: asString(updates.pin) }),
        ...(updates.password === undefined ? {} : { password: asString(updates.password) }),
        ...(updates.hourlyRate === undefined ? {} : { hourlyRate: Number(updates.hourlyRate) || 0 }),
        ...(updates.active === undefined ? {} : { active: asBoolean(updates.active) }),
        ...(updates.photo === undefined ? {} : { photo: asString(updates.photo) }),
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

async function persistSalesmanOnlineStatus({ userId, shopId, isOnline }) {
    const uid = asString(userId);
    const sid = asString(shopId);
    if (!uid) return false;

    let query = supabase.from('profiles').update({ is_online: asBoolean(isOnline) }).eq('id', uid);
    if (sid) query = query.eq('shop_id', sid);
    const { error } = await query;
    return !error;
}

export function AuthProvider({ children }) {
    const initialAuthState = (() => {
        if (isAuthSessionValid()) {
            const savedUser = safeParseJSON(readAuthState(AUTH_USER_STATE_KEY, ''), null);
            return {
                role: readAuthState(AUTH_ROLE_STATE_KEY, '') || null,
                user: savedUser && typeof savedUser === 'object' ? savedUser : null,
                activeShopId: readAuthState(AUTH_SHOP_STATE_KEY, '')
            };
        }

        clearPersistedAuthState();
        return { role: null, user: null, activeShopId: '' };
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
    const [slowMovingDays, setSlowMovingDays] = useState(30);
    const [autoLockEnabled, setAutoLockEnabled] = useState(true);
    const [autoLockTimeout, setAutoLockTimeout] = useState(120);

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
        if (isAuthSessionValid()) return;
        if (role === 'salesman' && user) {
            persistAuthSession('salesman', user);
            return;
        }
        clearPersistedAuthState();
        setRole(null);
        setUser(null);
        setActiveShopIdState('');
    }, [role, user]);

    // ── Persistence Effects ──
    useEffect(() => {
        if (role && user) {
            persistAuthSession(role, user);
            return;
        }
        clearAuthSession();
    }, [role, user]);

    useEffect(() => {
        writeAuthState(AUTH_ROLE_STATE_KEY, role || '');
    }, [role]);

    useEffect(() => {
        writeAuthState(AUTH_USER_STATE_KEY, user ? JSON.stringify(user) : '');
    }, [user]);

    useEffect(() => {
        writeAuthState(AUTH_SHOP_STATE_KEY, activeShopId || '');
    }, [activeShopId]);

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

        if (GLOBAL_ADMIN_ROLES.includes(role)) {
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

            const preferred = asString(preferredShopId || activeShopId || user.shop_id);
            const preferredExists = preferred && merged.some(s => s.id === preferred);
            if (preferredExists) {
                setActiveShopIdState(preferred);
            } else if (role === 'superadmin' && merged.length > 0) {
                setActiveShopIdState(merged[0].id);
            } else {
                setActiveShopIdState('');
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
            const fallback = [mergeShopMeta({ id: sid, name: user.shopName || 'My Shop', location: '', owner_email: '' }, shopMetaMap)];
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
        if (isSuperAdmin) {
            setActiveShopIdState(sid);
            return;
        }

        // Shop-admin and salesman users are bound to their mapped shop.
        const lockedShopId = asString(user?.shop_id || activeShopId);
        setActiveShopIdState(lockedShopId || sid);
    }, [isSuperAdmin, user, activeShopId]);

    const createShop = useCallback(async ({ shopName, location, address, ownerEmail, telephone }) => {
        if (!GLOBAL_ADMIN_ROLES.includes(role)) {
            throw new Error('Only superadmin/superuser can create shops.');
        }

        const name = asString(shopName);
        const shopLocation = asString(location);
        const shopAddress = asString(address);
        const email = asString(ownerEmail).toLowerCase();
        const shopTelephone = asString(telephone);

        if (!name) throw new Error('Shop name is required.');
        if (!email) throw new Error('Owner email is required.');

        let createdShop = null;
        let shopError = null;
        const shopPayloads = buildShopInsertPayloads({
            name,
            location: shopLocation,
            address: shopAddress,
            ownerEmail: email,
            telephone: shopTelephone
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
        const tempPassword = Math.random().toString(36).slice(-8);

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
            owner_profile_id: asString(createdProfile.id),
        };
        const resolvedAddress = asString(shopAddress || createdShopWithCredentials.address || createdShopWithCredentials.location);
        const resolvedTelephone = asString(shopTelephone || createdShopWithCredentials.telephone || createdShopWithCredentials.phone || '');

        if (resolvedTelephone) {
            await supabase.from('shops').update({ telephone: resolvedTelephone }).eq('id', shopId);
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
        const hasLocation = Object.prototype.hasOwnProperty.call(updates, 'location');
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
        const nextLocation = hasLocation ? asString(updates.location) : undefined;
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
        const shouldUpdateShopTable = hasName || hasLocation || hasAddress || hasTelephone || hasOwner;
        const shouldUpdateOwnerProfile = hasOwner || shouldUpdateOwnerPassword;

        if (hasName && !nextName) {
            throw new Error('Shop name is required.');
        }

        if (!shouldUpdateShopTable && !shouldUpdateOwnerProfile) {
            throw new Error('No valid shop fields provided.');
        }

        let updatedShop = currentShop ? { ...currentShop } : null;

        if (shouldUpdateShopTable) {
            const payloads = buildShopUpdatePayloads({
                name: nextName,
                location: nextLocation,
                address: nextAddress,
                ownerEmail: nextOwnerEmail,
                telephone: nextTelephone
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
            address: hasAddress
                ? nextAddress
                : asString(updatedShop?.address || currentShop?.address || updatedShop?.location || currentShop?.location),
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

    useEffect(() => {
        const sid = asString(activeShopId);
        if (!sid) {
            setAttendanceLogs([]);
            setIsPunchedIn(false);
            return undefined;
        }

        const formatAttendance = (dbLog) => {
            const dObj = new Date(dbLog.timestamp);
            return {
                ...dbLog,
                userId: asString(dbLog.workerId || dbLog.userId || dbLog.worker_id || dbLog.user_id),
                userName: asString(dbLog.workerName || dbLog.userName || dbLog.worker_name || dbLog.user_name),
                date: dObj.toLocaleDateString('en-PK'),
                time: dObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
            };
        };

        const fetchAttendance = async () => {
            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .eq('shop_id', sid)
                .order('timestamp', { ascending: false });
            if (!error && data) {
                setAttendanceLogs(data.map(formatAttendance));
            } else {
                setAttendanceLogs([]);
            }
        };
        fetchAttendance();
        const attendancePollTimer = setInterval(fetchAttendance, 5000);

        const isSameShop = (row) => asString(row?.shop_id) === sid;

        const attendanceSubscription = supabase.channel(`public:attendance:${sid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, (payload) => {
                if (!isSameShop(payload.new)) return;
                const newLog = formatAttendance(payload.new);
                setAttendanceLogs(prev => {
                    if (prev.some(l => String(l.id) === String(newLog.id))) return prev;
                    return [newLog, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, (payload) => {
                if (!isSameShop(payload.new)) return;
                const updated = formatAttendance(payload.new);
                setAttendanceLogs(prev => prev.map(l => String(l.id) === String(updated.id) ? { ...l, ...updated } : l));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance' }, (payload) => {
                const oldShopId = asString(payload.old?.shop_id);
                if (oldShopId && oldShopId !== sid) return;
                setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(payload.old.id)));
            })
            .subscribe();

        return () => {
            clearInterval(attendancePollTimer);
            supabase.removeChannel(attendanceSubscription);
        };
    }, [activeShopId]);

    useEffect(() => {
        if (user && role === 'salesman') {
            const myLogs = attendanceLogs.filter((l) => String(l.userId) === String(user.id));
            if (myLogs.length > 0) {
                const latest = [...myLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                setIsPunchedIn(latest.type === 'IN');
            } else {
                setIsPunchedIn(asBoolean(user.is_online ?? user.isOnline ?? user.online));
            }
        } else {
            setIsPunchedIn(false);
        }
    }, [attendanceLogs, user, role]);

    const handlePunch = async (type) => {
        if (!user || !activeShopId) return;

        const ts = new Date();
        const uiLog = {
            id: crypto.randomUUID(),
            userId: user.id,
            userName: user.name,
            workerId: String(user.id),
            workerName: user.name,
            type,
            shop_id: activeShopId,
            timestamp: ts.toISOString(),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            note: ''
        };

        setAttendanceLogs(prev => [uiLog, ...prev]);
        setIsPunchedIn(type === 'IN');

        const { error } = await supabase.from('attendance').insert([{
            id: uiLog.id,
            workerId: String(user.id),
            workerName: user.name,
            type,
            shop_id: activeShopId,
            timestamp: uiLog.timestamp,
            note: ''
        }]);

        if (error) {
            console.error('Failed to punch attendance:', error);
            return;
        }

        const nextOnline = type === 'IN';
        setUser((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                is_online: nextOnline,
                isOnline: nextOnline,
                online: nextOnline
            };
        });
        setSalesmen((prev) => prev.map((staff) => {
            if (String(staff.id) !== String(user.id)) return staff;
            return {
                ...staff,
                is_online: nextOnline,
                isOnline: nextOnline,
                online: nextOnline
            };
        }));
        await persistSalesmanOnlineStatus({
            userId: user.id,
            shopId: activeShopId,
            isOnline: nextOnline
        });

        // Auto-save salary transaction on punch OUT
        if (type === 'OUT') {
            const todayStr = ts.toLocaleDateString('en-PK');
            const salesman = salesmen.find(s => String(s.id) === String(user.id));
            if (salesman) {
                const myLogsToday = attendanceLogs
                    .filter(l => String(l.userId) === String(user.id) && l.date === todayStr)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                const latestIn = myLogsToday.find(l => l.type === 'IN');
                if (latestIn?.timestamp) {
                    const shiftStart = new Date(latestIn.timestamp).getTime();
                    const nowMs = ts.getTime();
                    const hoursWorked = (nowMs - shiftStart) / 3600000;
                    const hourlyRate = parseFloat(salesman.hourlyRate) || 12.5;
                    const sessionSalary = hoursWorked * hourlyRate;

                    if (sessionSalary > 0.001) {
                        const salaryTxn = {
                            id: String(Date.now()),
                            desc: `Salary: ${salesman.name} (${hoursWorked.toFixed(1)}h @ €${hourlyRate}/hr)`,
                            amount: parseFloat(sessionSalary.toFixed(2)),
                            type: 'expense',
                            category: 'Salary',
                            isFixedExpense: true,
                            date: ts.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            time: ts.toLocaleTimeString('en-US', { hour12: false }),
                            timestamp: ts.toISOString(),
                            source: 'payroll-auto',
                            workerId: String(salesman.id),
                            salesmanName: salesman.name,
                            shop_id: activeShopId
                        };
                        await supabase.from('transactions').insert([salaryTxn]);
                    }
                }
            }
        }
    };

    const addAttendanceLog = (_userObj, type) => handlePunch(type);

    const updateAttendanceLog = useCallback(async (id, updates) => {
        const sid = asString(activeShopId);
        if (!sid) return;
        const existingLog = attendanceLogs.find((l) => String(l.id) === String(id));
        if (!existingLog) return;

        const resolvedTimestamp = asString(updates.timestamp)
            || buildTimestampFromTime(existingLog.timestamp, updates.time)
            || existingLog.timestamp;

        const resolvedType = updates.type ?? existingLog.type;
        const resolvedNote = updates.note ?? existingLog.note ?? '';
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
                type: resolvedType,
                note: resolvedNote,
                time: resolvedTime,
                timestamp: resolvedTimestamp,
                date: Number.isNaN(resolvedDateObj.getTime())
                    ? l.date
                    : resolvedDateObj.toLocaleDateString('en-PK')
            };
        }));

        const payload = {
            type: resolvedType,
            note: resolvedNote,
            timestamp: resolvedTimestamp
        };

        const { error } = await supabase
            .from('attendance')
            .update(payload)
            .eq('id', id)
            .eq('shop_id', sid);

        if (error) {
            throw new Error(error.message || 'Failed to update attendance log.');
        }
        const targetUserId = asString(existingLog.userId || existingLog.workerId);
        if (!targetUserId) return;

        const nextLogsForUser = attendanceLogs
            .map((l) => {
                if (String(l.id) !== String(id)) return l;
                return {
                    ...l,
                    type: resolvedType,
                    timestamp: resolvedTimestamp
                };
            })
            .filter((l) => asString(l.userId || l.workerId) === targetUserId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const nextOnline = nextLogsForUser.length > 0 ? nextLogsForUser[0].type === 'IN' : false;
        setSalesmen((prev) => prev.map((staff) => {
            if (String(staff.id) !== targetUserId) return staff;
            return {
                ...staff,
                is_online: nextOnline,
                isOnline: nextOnline,
                online: nextOnline
            };
        }));
        if (role === 'salesman' && String(user?.id) === targetUserId) {
            setIsPunchedIn(nextOnline);
            setUser((prev) => prev ? { ...prev, is_online: nextOnline, isOnline: nextOnline, online: nextOnline } : prev);
        }
        await persistSalesmanOnlineStatus({
            userId: targetUserId,
            shopId: sid,
            isOnline: nextOnline
        });
    }, [activeShopId, attendanceLogs, role, user]);

    const deleteAttendanceLog = useCallback(async (id) => {
        const sid = asString(activeShopId);
        if (!sid) return;
        const existingLog = attendanceLogs.find((l) => String(l.id) === String(id));
        const targetUserId = asString(existingLog?.userId || existingLog?.workerId);

        setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(id)));
        const { error } = await supabase.from('attendance').delete().eq('id', id).eq('shop_id', sid);
        if (error) {
            throw new Error(error.message || 'Failed to delete attendance log.');
        }

        if (!targetUserId) return;
        const nextLogsForUser = attendanceLogs
            .filter((l) => String(l.id) !== String(id))
            .filter((l) => asString(l.userId || l.workerId) === targetUserId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const nextOnline = nextLogsForUser.length > 0 ? nextLogsForUser[0].type === 'IN' : false;
        setSalesmen((prev) => prev.map((staff) => {
            if (String(staff.id) !== targetUserId) return staff;
            return {
                ...staff,
                is_online: nextOnline,
                isOnline: nextOnline,
                online: nextOnline
            };
        }));
        if (role === 'salesman' && String(user?.id) === targetUserId) {
            setIsPunchedIn(nextOnline);
            setUser((prev) => prev ? { ...prev, is_online: nextOnline, isOnline: nextOnline, online: nextOnline } : prev);
        }
        await persistSalesmanOnlineStatus({
            userId: targetUserId,
            shopId: sid,
            isOnline: nextOnline
        });
    }, [activeShopId, attendanceLogs, role, user]);

    // ── Auth Logic ──
    const login = useCallback(async (userData) => {
        setAuthLoading(true);
        try {
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
                if (normalized.role === 'admin' && !asString(normalized.shop_id)) {
                    return { success: false, message: 'Shop admin is not linked to any shop.' };
                }

                setRole(normalized.role);
                setUser(normalized);
                if (normalized.shop_id) {
                    setActiveShopIdState(normalized.shop_id);
                } else if (!GLOBAL_ADMIN_ROLES.includes(normalized.role)) {
                    setActiveShopIdState('');
                }
                persistAuthSession(normalized.role, normalized);
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
                    setIsPunchedIn(asBoolean(normalized.is_online ?? normalized.isOnline ?? normalized.online));
                    persistAuthSession('salesman', normalized);
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
                    setIsPunchedIn(asBoolean(withMeta.is_online ?? withMeta.isOnline ?? withMeta.online));
                    persistAuthSession('salesman', withMeta);
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
        clearAuthSession();
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
        if (!trimmedName || !trimmedPin || !sid) return;

        const existingPins = await listSalesmenByPin(trimmedPin);
        if (existingPins.length > 0) {
            throw new Error('PIN already used in another shop. Please use a unique PIN.');
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

        if (insertError) {
            console.error('Failed to create salesman profile in DB:', insertError);
        }

        // Legacy fallback
        const newSalesman = {
            id: Date.now(),
            name: trimmedName,
            pin: trimmedPin,
            active: true,
            hourlyRate: 12.5,
            role: 'salesman',
            shop_id: sid,
            salesmanNumber: assignedNumber,
            ...permissionPatch
        };
        patchSalesmanMeta(sid, newSalesman.id, {
            salesmanNumber: assignedNumber,
            ...permissionPatch
        });
        setSalesmen(prev => {
            const next = [...prev, newSalesman];
            broadcastSetting('salesmen', next);
            return next;
        });
        return newSalesman;
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
        delete dbUpdates.salesmanNumber;
        delete dbUpdates.canEditTransactions;
        delete dbUpdates.canBulkEdit;
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
        handlePunch,
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
