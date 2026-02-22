import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

const DEFAULT_SALESMEN = [
    { id: 1, name: 'Ali', pin: '1234', active: true, hourlyRate: 12.5, role: 'salesman' }
];

const ADMIN_ROLES = ['superadmin', 'admin'];
const AUTH_SESSION_KEY = 'dailybooks_auth_session_v1';
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSessionStorage() {
    try {
        if (typeof window === 'undefined') return null;
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function readAuthSession() {
    const storage = getSessionStorage();
    if (!storage) return null;
    const raw = storage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = safeParseJSON(raw, null);
    return parsed && typeof parsed === 'object' ? parsed : null;
}

function isAuthSessionValid() {
    const session = readAuthSession();
    if (!session) return false;
    const expiresAt = Number(session.expiresAt || 0);
    if (!expiresAt || Date.now() > expiresAt) {
        const storage = getSessionStorage();
        if (storage) storage.removeItem(AUTH_SESSION_KEY);
        return false;
    }
    return true;
}

function persistAuthSession(role, user) {
    const storage = getSessionStorage();
    if (!storage) return;
    const payload = {
        role: asString(role),
        userId: asString(user?.id),
        expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
    };
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(payload));
}

function clearAuthSession() {
    const storage = getSessionStorage();
    if (!storage) return;
    storage.removeItem(AUTH_SESSION_KEY);
}

function clearPersistedAuthState() {
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    localStorage.removeItem('activeShopId');
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
    };
}

function normalizeShop(shop) {
    if (!shop || typeof shop !== 'object') return null;
    return {
        ...shop,
        id: asString(shop.id || shop.shop_id),
        name: asString(shop.name || shop.shop_name || 'Shop'),
        location: asString(shop.location || shop.address || ''),
        owner_email: asString(shop.owner_email || shop.ownerEmail || ''),
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

function buildShopInsertPayloads({ name, location, ownerEmail }) {
    const safeName = asString(name);
    const safeLocation = asString(location);
    const safeOwnerEmail = asString(ownerEmail).toLowerCase();

    const nameVariants = safeName ? [{ name: safeName }, { shop_name: safeName }] : [];
    const locationVariants = safeLocation ? [{ location: safeLocation }, { address: safeLocation }, {}] : [{}];
    const ownerVariants = safeOwnerEmail ? [{ owner_email: safeOwnerEmail }, { ownerEmail: safeOwnerEmail }, {}] : [{}];

    const payloads = [];
    nameVariants.forEach((namePayload) => {
        locationVariants.forEach((locationPayload) => {
            ownerVariants.forEach((ownerPayload) => {
                payloads.push(cleanPayload({ ...namePayload, ...locationPayload, ...ownerPayload }));
            });
        });
    });

    return dedupePayloads(payloads.filter((payload) => Object.keys(payload).length > 0));
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

function buildShopUpdatePayloads({ name, location, ownerEmail }) {
    const email = ownerEmail === undefined ? undefined : asString(ownerEmail).toLowerCase();
    const safeName = name === undefined ? undefined : asString(name);
    const safeLocation = location === undefined ? undefined : asString(location);

    const nameVariants = safeName === undefined ? [{}] : [{ name: safeName }, { shop_name: safeName }];
    const locationVariants = safeLocation === undefined ? [{}] : [{ location: safeLocation }, { address: safeLocation }, {}];
    const ownerVariants = email === undefined ? [{}] : [{ owner_email: email }, { ownerEmail: email }, {}];

    const candidates = [];
    nameVariants.forEach((namePayload) => {
        locationVariants.forEach((locationPayload) => {
            ownerVariants.forEach((ownerPayload) => {
                candidates.push(cleanPayload({ ...namePayload, ...locationPayload, ...ownerPayload }));
            });
        });
    });

    const unique = dedupePayloads(candidates.filter((payload) => Object.keys(payload).length > 0));
    return unique.filter((payload) => {
        const hasName = Object.prototype.hasOwnProperty.call(payload, 'name') || Object.prototype.hasOwnProperty.call(payload, 'shop_name');
        const hasLocation = Object.prototype.hasOwnProperty.call(payload, 'location') || Object.prototype.hasOwnProperty.call(payload, 'address');
        const hasOwner = Object.prototype.hasOwnProperty.call(payload, 'owner_email') || Object.prototype.hasOwnProperty.call(payload, 'ownerEmail');
        return hasName || hasLocation || hasOwner;
    });
}

function buildShopOwnerProfileUpdatePayloads({ ownerEmail, ownerPassword }) {
    const email = ownerEmail === undefined ? undefined : asString(ownerEmail).toLowerCase();
    const password = ownerPassword === undefined ? undefined : asString(ownerPassword);

    const emailVariants = email === undefined ? [{}] : [{ email }];
    const passwordVariants = password === undefined
        ? [{}]
        : [{ password }, { adminPassword: password }, { passcode: password }, { pass_code: password }];

    const candidates = [];
    emailVariants.forEach((emailPayload) => {
        passwordVariants.forEach((passwordPayload) => {
            candidates.push(cleanPayload({ ...emailPayload, ...passwordPayload }));
        });
    });

    return dedupePayloads(candidates.filter((payload) => Object.keys(payload).length > 0));
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
    const loginIdentity = asString(email) || safeName;
    const safePin = asString(pin);
    const safePassword = asString(password);
    const profileId = makeRowId();

    const nameKeyVariants = [
        { name: safeName },
        { full_name: safeName },
        { workerName: safeName },
        // Avoid relying on optional username column in tenant schemas.
        { name: loginIdentity },
    ];
    const shopKeyVariants = [
        { shop_id: shopId },
    ];
    const pinFieldVariants = (!includePin || !safePin)
        ? [{}]
        : [{ pin: safePin }, { passcode: safePin }, { pin_code: safePin }, { pass_code: safePin }, {}];
    const passwordFieldVariants = (!includePassword || !safePassword)
        ? [{}]
        : [{ password: safePassword }, { adminPassword: safePassword }, { passcode: safePassword }, { pass_code: safePassword }, {}];

    const basePayloads = [];
    shopKeyVariants.forEach((shopKeys) => {
        nameKeyVariants.forEach((nameKeys) => {
            const core = {
                id: profileId,
                ...shopKeys,
                ...nameKeys,
                role
            };
            const emailVariants = email ? [{ ...core, email }, core] : [core];

            emailVariants.forEach((emailVariant) => {
                pinFieldVariants.forEach((pinVariant) => {
                    passwordFieldVariants.forEach((passwordVariant) => {
                        basePayloads.push({ ...emailVariant, ...pinVariant, ...passwordVariant });
                    });
                });
            });
        });
    });

    const variants = [];
    basePayloads.forEach((base) => {
        variants.push({ ...base, active: true, hourly_rate: hourlyRate });
        variants.push({ ...base, active: true, hourlyRate: hourlyRate });
        variants.push({ ...base, is_active: true, hourly_rate: hourlyRate });
        variants.push({ ...base, is_active: true, hourlyRate: hourlyRate });
        variants.push({ ...base, hourly_rate: hourlyRate });
        variants.push({ ...base, hourlyRate: hourlyRate });
        variants.push({ ...base, active: true });
        variants.push({ ...base, is_active: true });
        variants.push({ ...base });
    });

    return dedupePayloads(variants);
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
    const staticFields = {};
    const fieldVariants = [];

    Object.entries(updates).forEach(([key, rawValue]) => {
        if (rawValue === undefined) return;

        if (key === 'hourlyRate') {
            fieldVariants.push([{ hourlyRate: rawValue }, { hourly_rate: rawValue }]);
            return;
        }
        if (key === 'active') {
            fieldVariants.push([{ active: rawValue }, { is_active: rawValue }]);
            return;
        }
        if (key === 'photo') {
            fieldVariants.push([{ photo: rawValue }, { avatar_url: rawValue }]);
            return;
        }
        if (key === 'pin') {
            const safePin = asString(rawValue);
            fieldVariants.push([
                { pin: safePin },
                { passcode: safePin },
                { pin_code: safePin },
                { pass_code: safePin }
            ]);
            return;
        }
        if (key === 'name') {
            const safeName = asString(rawValue);
            fieldVariants.push([
                { name: safeName },
                { full_name: safeName },
                { workerName: safeName }
            ]);
            return;
        }

        staticFields[key] = rawValue;
    });

    const variants = [{ ...updates }];
    const composeVariants = (index, acc) => {
        if (index >= fieldVariants.length) {
            variants.push({ ...staticFields, ...acc });
            return;
        }
        fieldVariants[index].forEach((candidate) => {
            composeVariants(index + 1, { ...acc, ...candidate });
        });
    };
    composeVariants(0, {});

    const cleaned = variants.map((payload) => {
        const next = { ...payload };
        Object.keys(next).forEach((key) => {
            if (next[key] === undefined) delete next[key];
        });
        return next;
    });

    return dedupePayloads(cleaned);
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

export function AuthProvider({ children }) {
    const [role, setRole] = useState(() => {
        if (!isAuthSessionValid()) {
            clearPersistedAuthState();
            return null;
        }
        return localStorage.getItem('role');
    }); // superadmin | admin | salesman | null
    const [user, setUser] = useState(() => {
        if (!isAuthSessionValid()) return null;
        const saved = safeParseJSON(localStorage.getItem('user'), null);
        return saved && typeof saved === 'object' ? saved : null;
    });
    const [activeShopId, setActiveShopIdState] = useState(() => {
        if (!isAuthSessionValid()) return '';
        return localStorage.getItem('activeShopId') || '';
    });
    const [shops, setShops] = useState([]);
    const [authLoading, setAuthLoading] = useState(false);

    const [lowStockAlerts, setLowStockAlerts] = useState([]);

    // ── Persistent Config Data ──
    const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('adminPassword') || 'admin123');
    const [slowMovingDays, setSlowMovingDays] = useState(() => parseInt(localStorage.getItem('slowMovingDays'), 10) || 30);
    const [autoLockEnabled, setAutoLockEnabled] = useState(() => {
        const saved = localStorage.getItem('autoLockEnabled');
        return saved !== null ? saved === 'true' : true;
    });
    const [autoLockTimeout, setAutoLockTimeout] = useState(() => parseInt(localStorage.getItem('autoLockTimeout'), 10) || 120);

    const [salesmen, setSalesmen] = useState(() => {
        const saved = safeParseJSON(localStorage.getItem('salesmen'), null);
        return Array.isArray(saved) ? saved : DEFAULT_SALESMEN;
    });

    const isSuperAdmin = role === 'superadmin';
    const isAdminLike = role === 'superadmin' || role === 'admin';

    useEffect(() => {
        if (isAuthSessionValid()) return;
        clearPersistedAuthState();
        setRole(null);
        setUser(null);
        setActiveShopIdState('');
    }, []);

    // ── Persistence Effects ──
    useEffect(() => {
        if (role && user) {
            persistAuthSession(role, user);
            return;
        }
        clearAuthSession();
    }, [role, user]);

    useEffect(() => {
        if (role) localStorage.setItem('role', role);
        else localStorage.removeItem('role');
    }, [role]);

    useEffect(() => {
        if (user) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
    }, [user]);

    useEffect(() => {
        if (activeShopId) localStorage.setItem('activeShopId', activeShopId);
        else localStorage.removeItem('activeShopId');
    }, [activeShopId]);

    useEffect(() => { localStorage.setItem('adminPassword', adminPassword); }, [adminPassword]);
    useEffect(() => { localStorage.setItem('slowMovingDays', String(slowMovingDays)); }, [slowMovingDays]);
    useEffect(() => { localStorage.setItem('autoLockEnabled', String(autoLockEnabled)); }, [autoLockEnabled]);
    useEffect(() => { localStorage.setItem('autoLockTimeout', String(autoLockTimeout)); }, [autoLockTimeout]);
    useEffect(() => { localStorage.setItem('salesmen', JSON.stringify(salesmen)); }, [salesmen]);

    // ── Storage Event Listener for Cross-Tab Sync ──
    useEffect(() => {
        const handleStorageChange = (e) => {
            const isAuthKey = e.key === 'role' || e.key === 'user' || e.key === 'activeShopId';
            if (isAuthKey && !isAuthSessionValid()) {
                setRole(null);
                setUser(null);
                setActiveShopIdState('');
                return;
            }
            if (e.key === 'role') setRole(e.newValue || null);
            if (e.key === 'user') setUser(safeParseJSON(e.newValue, null));
            if (e.key === 'activeShopId') setActiveShopIdState(e.newValue || '');
            if (e.key === 'salesmen' && e.newValue) {
                const parsed = safeParseJSON(e.newValue, []);
                if (Array.isArray(parsed)) setSalesmen(parsed);
            }
            if (e.key === 'adminPassword' && e.newValue) setAdminPassword(e.newValue);
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

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
                else if (key === 'adminPassword') setAdminPassword(value);
                else if (key === 'slowMovingDays') setSlowMovingDays(value);
                else if (key === 'autoLockEnabled') setAutoLockEnabled(value);
                else if (key === 'autoLockTimeout') setAutoLockTimeout(value);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const refreshShops = useCallback(async (preferredShopId = '') => {
        if (!role || !user) {
            setShops([]);
            return [];
        }

        if (role === 'superadmin') {
            const { data, error } = await supabase.from('shops').select('*').order('name', { ascending: true });
            if (error || !Array.isArray(data)) {
                setShops([]);
                return [];
            }

            const normalized = data.map(normalizeShop).filter(Boolean);
            const enriched = await attachShopOwnerCredentials(normalized);
            setShops(enriched);

            const preferred = asString(preferredShopId || activeShopId || user.shop_id);
            const preferredExists = preferred && enriched.some(s => s.id === preferred);
            if (preferredExists) {
                setActiveShopIdState(preferred);
            } else if (enriched.length > 0) {
                setActiveShopIdState(enriched[0].id);
            } else {
                setActiveShopIdState('');
            }
            return enriched;
        }

        const sid = asString(preferredShopId || user.shop_id || activeShopId);
        if (!sid) {
            setShops([]);
            return [];
        }

        const { data, error } = await supabase.from('shops').select('*').eq('id', sid).maybeSingle();
        if (error || !data) {
            const fallback = [{ id: sid, name: user.shopName || 'My Shop', location: '', owner_email: '' }];
            setShops(fallback);
            setActiveShopIdState(sid);
            return fallback;
        }

        const normalized = normalizeShop(data);
        const enriched = normalized ? await attachShopOwnerCredentials([normalized]) : [];
        setShops(enriched);
        setActiveShopIdState(sid);
        return enriched;
    }, [role, user, activeShopId]);

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

        const mapped = data.map(normalizeSalesman).filter(Boolean);
        setSalesmen(mapped);
        return mapped;
    }, [activeShopId]);

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

    const createShop = useCallback(async ({ shopName, location, ownerEmail }) => {
        if (role !== 'superadmin') {
            throw new Error('Only superadmin can create shops.');
        }

        const name = asString(shopName);
        const shopLocation = asString(location);
        const email = asString(ownerEmail).toLowerCase();

        if (!name) throw new Error('Shop name is required.');
        if (!email) throw new Error('Owner email is required.');

        let createdShop = null;
        let shopError = null;
        const shopPayloads = buildShopInsertPayloads({ name, location: shopLocation, ownerEmail: email });

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

        setShops(prev => {
            const merged = [...prev, createdShopWithCredentials]
                .filter((s, idx, arr) => s && arr.findIndex(x => x.id === s.id) === idx)
                .sort((a, b) => a.name.localeCompare(b.name));
            return merged;
        });

        if (role !== 'salesman' && !activeShopId) {
            setActiveShopIdState(shopId);
        }

        return {
            shop: createdShopWithCredentials,
            admin: createdProfile,
            credentials: {
                email,
                pin: '',
                password: getProfilePassword(createdProfile) || tempPassword
            }
        };
    }, [role, activeShopId]);

    const updateShop = useCallback(async (shopId, updates = {}) => {
        if (role !== 'superadmin') {
            throw new Error('Only superadmin can update shops.');
        }

        const sid = asString(shopId);
        if (!sid) throw new Error('Invalid shop id.');
        const currentShop = (Array.isArray(shops) ? shops : []).find((shop) => shop.id === sid) || null;

        const hasName = Object.prototype.hasOwnProperty.call(updates, 'name');
        const hasLocation = Object.prototype.hasOwnProperty.call(updates, 'location')
            || Object.prototype.hasOwnProperty.call(updates, 'address');
        const hasOwner = Object.prototype.hasOwnProperty.call(updates, 'ownerEmail')
            || Object.prototype.hasOwnProperty.call(updates, 'owner_email');
        const hasOwnerPassword = Object.prototype.hasOwnProperty.call(updates, 'ownerPassword')
            || Object.prototype.hasOwnProperty.call(updates, 'owner_password');

        const nextName = hasName ? asString(updates.name) : undefined;
        const nextLocation = hasLocation ? asString(updates.location ?? updates.address) : undefined;
        const nextOwnerEmail = hasOwner ? asString(updates.ownerEmail ?? updates.owner_email) : undefined;
        const nextOwnerPassword = hasOwnerPassword
            ? asString(updates.ownerPassword ?? updates.owner_password)
            : undefined;
        const shouldUpdateOwnerPassword = hasOwnerPassword && !!nextOwnerPassword;
        const shouldUpdateShopTable = hasName || hasLocation || hasOwner;
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
                ownerEmail: nextOwnerEmail
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
        };

        setShops((prev) => prev.map((shop) => (
            shop.id === sid
                ? { ...shop, ...mergedShop }
                : shop
        )));

        if (user && asString(user.shop_id) === sid) {
            setUser((prev) => prev ? {
                ...prev,
                shopName: mergedShop.name || prev.shopName,
                shop_id: mergedShop.id || prev.shop_id,
                email: asString(updatedOwnerProfile?.email || prev.email)
            } : prev);
        }

        return mergedShop;
    }, [role, user, shops]);

    const deleteShop = useCallback(async (shopId) => {
        if (role !== 'superadmin') {
            throw new Error('Only superadmin can delete shops.');
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
                userId: parseInt(dbLog.workerId, 10) || dbLog.workerId,
                userName: dbLog.workerName,
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
            supabase.removeChannel(attendanceSubscription);
        };
    }, [activeShopId]);

    useEffect(() => {
        if (user && role === 'salesman') {
            const todayStr = new Date().toLocaleDateString('en-PK');
            const myLogsToday = attendanceLogs.filter(l => l.date === todayStr && String(l.userId) === String(user.id));
            if (myLogsToday.length > 0) {
                const latest = [...myLogsToday].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                setIsPunchedIn(latest.type === 'IN');
            } else {
                setIsPunchedIn(false);
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

        setAttendanceLogs(prev => prev.map(l => {
            if (String(l.id) !== String(id)) return l;
            const newLog = { ...l, ...updates };
            if (updates.time) {
                try {
                    const timeMatch = newLog.time.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
                    if (timeMatch) {
                        let [, hours, minutes, ampm] = timeMatch;
                        hours = parseInt(hours, 10);
                        minutes = parseInt(minutes, 10);
                        if (ampm) {
                            if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                            if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
                        }
                        const dateObj = new Date(newLog.timestamp);
                        dateObj.setHours(hours, minutes, 0, 0);
                        newLog.timestamp = dateObj.toISOString();
                    }
                } catch (e) {
                    console.error('Reconstruct timestamp failed:', e);
                }
            }
            return newLog;
        }));

        await supabase
            .from('attendance')
            .update({
                type: updates.type,
                note: updates.note,
                timestamp: updates.timestamp
            })
            .eq('id', id)
            .eq('shop_id', sid);
    }, [activeShopId]);

    const deleteAttendanceLog = useCallback(async (id) => {
        const sid = asString(activeShopId);
        if (!sid) return;

        setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(id)));
        await supabase.from('attendance').delete().eq('id', id).eq('shop_id', sid);
    }, [activeShopId]);

    // ── Auth Logic ──
    const login = useCallback(async (userData) => {
        setAuthLoading(true);
        try {
            if (userData.role === 'admin') {
                const identifier = asString(userData.username || userData.email || userData.name);
                const password = asString(userData.password);
                let profile = null;

                // Try multiple profile fields to stay compatible with older schemas.
                profile = await trySelectProfileByField('email', identifier.toLowerCase(), ADMIN_ROLES)
                    || await trySelectProfileByField('name', identifier, ADMIN_ROLES)
                    || await trySelectProfileByField('full_name', identifier, ADMIN_ROLES)
                    || await trySelectProfileByField('workerName', identifier, ADMIN_ROLES);

                if (profile) {
                    const normalized = normalizeUserFromProfile(profile);
                    const storedPass = asString(profile.password || profile.adminPassword || profile.passcode);
                    if (storedPass && storedPass !== password) {
                        return { success: false, message: 'Invalid credentials' };
                    }
                    if (!storedPass && password !== adminPassword) {
                        return { success: false, message: 'Invalid credentials' };
                    }
                    if (normalized.role === 'admin' && !asString(normalized.shop_id)) {
                        return { success: false, message: 'Shop admin is not linked to any shop.' };
                    }

                    setRole(normalized.role);
                    setUser(normalized);
                    if (normalized.shop_id) {
                        setActiveShopIdState(normalized.shop_id);
                    } else if (normalized.role !== 'superadmin') {
                        setActiveShopIdState('');
                    }
                    persistAuthSession(normalized.role, normalized);
                    return { success: true, role: normalized.role };
                }

                // Legacy fallback
                if (password === adminPassword) {
                    setRole('superadmin');
                    const fallbackSuperAdmin = { id: 'local-superadmin', name: 'Admin', role: 'superadmin', shop_id: '' };
                    setUser(fallbackSuperAdmin);
                    persistAuthSession('superadmin', fallbackSuperAdmin);
                    return { success: true, role: 'superadmin' };
                }

                return { success: false, message: 'Invalid Admin credentials' };
            }

            if (userData.role === 'salesman') {
                const pin = asString(userData.pin);
                if (!pin) return { success: false, message: 'PIN required' };

                const profile = await trySelectSalesmanByPin(pin);
                if (profile) {
                    const normalized = normalizeUserFromProfile(profile);
                    if (normalized.active === false) {
                        return { success: false, message: 'User disabled' };
                    }
                    setRole('salesman');
                    setUser(normalized);
                    setActiveShopIdState(normalized.shop_id);
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
                    setRole('salesman');
                    setUser(salesman);
                    if (salesman.shop_id) setActiveShopIdState(asString(salesman.shop_id));
                    persistAuthSession('salesman', salesman);
                    return { success: true, role: 'salesman' };
                }

                return { success: false, message: 'Invalid PIN' };
            }

            return { success: false, message: 'Unknown Role' };
        } finally {
            setAuthLoading(false);
        }
    }, [adminPassword, salesmen, activeShopId]);

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
    };

    // ── Management Functions ──
    const updateAdminPassword = (newPass) => {
        setAdminPassword(newPass);
        broadcastSetting('adminPassword', newPass);
    };

    const addSalesman = async (name, pin) => {
        const trimmedName = asString(name);
        const trimmedPin = asString(pin);
        if (!trimmedName || !trimmedPin || !activeShopId) return;

        const existingPins = await listSalesmenByPin(trimmedPin);
        if (existingPins.length > 0) {
            throw new Error('PIN already used in another shop. Please use a unique PIN.');
        }

        let createdProfile = null;
        let insertError = null;
        const payloadVariants = buildSalesmanInsertPayloads({
            name: trimmedName,
            pin: trimmedPin,
            shopId: activeShopId,
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
            setSalesmen(prev => [...prev, createdProfile]);
            return createdProfile;
        }

        if (insertError) {
            console.error('Failed to create salesman profile in DB:', insertError);
        }

        // Legacy fallback
        const newSalesman = { id: Date.now(), name: trimmedName, pin: trimmedPin, active: true, hourlyRate: 12.5, role: 'salesman', shop_id: activeShopId };
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

        if (nextPin) {
            const conflicts = await listSalesmenByPin(nextPin);
            const hasConflict = conflicts.some((row) => asString(row.id) !== normalizedId);
            if (hasConflict) {
                throw new Error('PIN already used in another shop. Please choose a different PIN.');
            }
        }

        if (sid) {
            let updatedOnDB = false;
            const candidates = buildProfileUpdatePayloads(updates);

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

        setSalesmen(prev => {
            const next = prev.map(s => String(s.id) === String(id) ? { ...s, ...updates } : s);
            broadcastSetting('salesmen', next);
            return next;
        });
        if (user && String(user.id) === String(id)) {
            setUser(prev => ({ ...prev, ...updates }));
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

    // ── Alert Logic ──
    const addLowStockAlert = (product) => {
        setLowStockAlerts((prev) => {
            if (prev.some((a) => a.barcode === product.barcode)) return prev;
            return [{ ...product, alertTime: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...prev];
        });
    };
    const clearAlert = (barcode) => setLowStockAlerts((prev) => prev.filter((a) => a.barcode !== barcode));
    const clearAllAlerts = () => setLowStockAlerts([]);

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
        refreshShops,
        createShop,
        updateShop,
        deleteShop,

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
