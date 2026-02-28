import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { buildProductJSON, generateId, getStockSeverity, getLevel1Categories, getLevel2Categories } from '../data/inventoryStore';

const InventoryContext = createContext(null);
const TRANSACTION_SNAPSHOT_STORAGE_KEY = 'dailybooks_transaction_snapshots_v1';
const CATEGORY_HIERARCHY_KEY = '__categoryHierarchy';
const PURCHASE_FROM_KEY = '__purchaseFrom';
const PAYMENT_MODE_KEY = '__paymentMode';

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function withShopId(payload, shopId) {
    const sid = cleanText(shopId);
    if (!sid) return payload;
    return { ...payload, shop_id: sid };
}

function isCategoryHierarchyObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    return keys.includes('path') && (keys.includes('level1') || keys.includes('level2') || keys.includes('level3'));
}

function stringifyAttributeValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(v => String(v)).join(', ');
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

function buildCategoryHierarchy(category, categoryPath = null, rawAttributes = {}) {
    const attrs = rawAttributes && typeof rawAttributes === 'object' ? rawAttributes : {};
    const fromAttrs = attrs[CATEGORY_HIERARCHY_KEY] && typeof attrs[CATEGORY_HIERARCHY_KEY] === 'object'
        ? attrs[CATEGORY_HIERARCHY_KEY]
        : null;
    const fromCategoryObj = category && typeof category === 'object' ? category : null;
    const chosen = fromAttrs || fromCategoryObj || {};

    let level1 = cleanText(chosen.level1);
    let level2 = cleanText(chosen.level2);
    let level3 = cleanText(chosen.level3);

    if (!level1 && typeof category === 'string') {
        level1 = cleanText(category);
    }

    const attrPath = attrs.categoryPath || attrs.path || null;
    const finalPath = Array.isArray(categoryPath)
        ? categoryPath
        : (Array.isArray(attrPath) ? attrPath : null);

    if (Array.isArray(finalPath)) {
        if (!level1 && finalPath[0]) level1 = cleanText(String(finalPath[0]));
        if (!level2 && finalPath[1]) level2 = cleanText(String(finalPath[1]));
        if (!level3 && finalPath[2]) level3 = cleanText(String(finalPath[2]));
    }

    const path = [level1, level2, level3].filter(Boolean);
    return { level1, level2, level3, path };
}

function normalizeInventoryRecord(product) {
    const source = product || {};
    const rawAttrs = source.attributes && typeof source.attributes === 'object' ? source.attributes : {};
    const categoryHierarchy = buildCategoryHierarchy(source.category, source.categoryPath, rawAttrs);
    const attributePurchaseFrom = cleanText(rawAttrs[PURCHASE_FROM_KEY]);
    const attributePaymentMode = cleanText(rawAttrs[PAYMENT_MODE_KEY]);
    const attributeImage = cleanText(rawAttrs.image) || cleanText(rawAttrs.imageUrl) || cleanText(rawAttrs.image_url);

    const publicAttrs = { ...rawAttrs };
    delete publicAttrs[CATEGORY_HIERARCHY_KEY];
    delete publicAttrs[PURCHASE_FROM_KEY];
    delete publicAttrs[PAYMENT_MODE_KEY];
    delete publicAttrs.image;
    delete publicAttrs.imageUrl;
    delete publicAttrs.image_url;
    const normalizedAttrs = Object.entries(publicAttrs).reduce((acc, [key, value]) => {
        if (isCategoryHierarchyObject(value)) return acc;
        const normalizedValue = stringifyAttributeValue(value);
        if (normalizedValue === '') return acc;
        acc[key] = normalizedValue;
        return acc;
    }, {});

    const normalizedCategory = categoryHierarchy.level1
        ? { level1: categoryHierarchy.level1, level2: categoryHierarchy.level2, level3: categoryHierarchy.level3 }
        : (typeof source.category === 'string' ? cleanText(source.category) : (source.category || ''));

    const normalizedPath = categoryHierarchy.path.length
        ? categoryHierarchy.path
        : (Array.isArray(source.categoryPath) ? source.categoryPath.filter(Boolean) : source.categoryPath || null);

    const normalizedModel = cleanText(source.model) || categoryHierarchy.level3 || '';
    const normalizedBrand = cleanText(source.brand)
        || cleanText(publicAttrs.brand)
        || cleanText(publicAttrs.Brand)
        || '';
    const normalizedPurchaseFrom = cleanText(source.purchaseFrom) || attributePurchaseFrom;
    const normalizedPaymentMode = cleanText(source.paymentMode) || cleanText(source.paymentMethod) || attributePaymentMode;

    return {
        ...source,
        id: source.id ? String(source.id) : source.id,
        name: source.name || source.desc || normalizedModel || '',
        desc: source.desc || source.name || normalizedModel || '',
        model: normalizedModel,
        brand: normalizedBrand,
        barcode: cleanText(source.barcode),
        category: normalizedCategory,
        categoryPath: normalizedPath,
        purchaseFrom: normalizedPurchaseFrom,
        paymentMode: normalizedPaymentMode,
        image: cleanText(source.image) || cleanText(source.image_url) || attributeImage || '',
        attributes: normalizedAttrs,
    };
}

function buildInventoryPayload(product, includeId = false, shopId = '') {
    const categoryHierarchy = buildCategoryHierarchy(product?.category, product?.categoryPath, product?.attributes);
    const purchaseFrom = cleanText(product?.purchaseFrom);
    const paymentMode = cleanText(product?.paymentMode);
    const imageValue = cleanText(product?.image) || cleanText(product?.imageUrl) || cleanText(product?.image_url);
    const payloadAttributes = {
        ...(product?.attributes && typeof product.attributes === 'object' ? product.attributes : {})
    };

    if (categoryHierarchy.level1 || categoryHierarchy.level2 || categoryHierarchy.level3) {
        payloadAttributes[CATEGORY_HIERARCHY_KEY] = {
            level1: categoryHierarchy.level1,
            level2: categoryHierarchy.level2,
            level3: categoryHierarchy.level3,
            path: categoryHierarchy.path,
        };
    }

    if (purchaseFrom) {
        payloadAttributes[PURCHASE_FROM_KEY] = purchaseFrom;
    } else {
        delete payloadAttributes[PURCHASE_FROM_KEY];
    }

    if (paymentMode) {
        payloadAttributes[PAYMENT_MODE_KEY] = paymentMode;
    } else {
        delete payloadAttributes[PAYMENT_MODE_KEY];
    }

    if (imageValue) {
        payloadAttributes.image = imageValue;
    } else {
        delete payloadAttributes.image;
    }

    const payload = withShopId({
        name: product?.name || product?.desc || product?.model || '',
        purchasePrice: parseFloat(product?.purchasePrice ?? product?.costPrice ?? 0) || 0,
        sellingPrice: parseFloat(product?.sellingPrice ?? product?.price ?? product?.unitPrice ?? product?.amount ?? 0) || 0,
        stock: parseInt(product?.stock ?? product?.quantity ?? 0, 10) || 0,
        category: categoryHierarchy.level1 || '',
        barcode: product?.barcode ? String(product.barcode).trim() : '',
        productUrl: product?.productUrl || '',
        timestamp: product?.timestamp || new Date().toISOString(),
        attributes: payloadAttributes,
    }, shopId);

    if (includeId) payload.id = String(product?.id);

    return payload;
}

function readTransactionSnapshots() {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(TRANSACTION_SNAPSHOT_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeTransactionSnapshots(next) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(TRANSACTION_SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // If storage quota is full, we silently skip snapshot persistence.
    }
}

function saveTransactionSnapshot(txnId, snapshot) {
    const strId = String(txnId || '');
    if (!strId) return;

    const current = readTransactionSnapshots();
    const safeSnapshot = { ...(snapshot || {}) };
    delete safeSnapshot.image;

    if (safeSnapshot.productSnapshot && typeof safeSnapshot.productSnapshot === 'object') {
        safeSnapshot.productSnapshot = { ...safeSnapshot.productSnapshot };
        delete safeSnapshot.productSnapshot.image;
    }

    current[strId] = safeSnapshot;
    writeTransactionSnapshots(current);
}

function removeTransactionSnapshot(txnId) {
    const strId = String(txnId || '');
    if (!strId) return;
    const current = readTransactionSnapshots();
    if (!(strId in current)) return;
    delete current[strId];
    writeTransactionSnapshots(current);
}

function mergeTransactionWithSnapshot(txn, providedSnapshots = null) {
    if (!txn) return txn;
    const strId = String(txn.id || '');
    if (!strId) return txn;

    const snapshotMap = providedSnapshots || readTransactionSnapshots();
    const snapshot = snapshotMap[strId];
    if (!snapshot) return txn;

    const txnAttrs = txn.attributes && typeof txn.attributes === 'object' ? txn.attributes : {};
    const snapAttrs = snapshot.attributes && typeof snapshot.attributes === 'object' ? snapshot.attributes : {};
    const txnVerified = txn.verifiedAttributes && typeof txn.verifiedAttributes === 'object' ? txn.verifiedAttributes : {};
    const snapVerified = snapshot.verifiedAttributes && typeof snapshot.verifiedAttributes === 'object' ? snapshot.verifiedAttributes : {};

    return {
        ...txn,
        barcode: txn.barcode || snapshot.barcode || snapshot?.productSnapshot?.barcode || '',
        model: txn.model || snapshot.model || snapshot?.productSnapshot?.model || '',
        brand: txn.brand || snapshot.brand || snapshot?.productSnapshot?.brand || '',
        categorySnapshot: snapshot.categorySnapshot || snapshot?.productSnapshot?.category || null,
        categoryPath: txn.categoryPath || snapshot.categoryPath || snapshot?.productSnapshot?.categoryPath || null,
        attributes: Object.keys(txnAttrs).length ? txnAttrs : (Object.keys(snapAttrs).length ? snapAttrs : {}),
        verifiedAttributes: Object.keys(txnVerified).length ? txnVerified : (Object.keys(snapVerified).length ? snapVerified : {}),
        customerInfo: txn.customerInfo || snapshot.customerInfo || null,
        paymentMethod: txn.paymentMethod || snapshot.paymentMethod || '',
        stdPriceAtTime: txn.stdPriceAtTime ?? snapshot.stdPriceAtTime ?? null,
        unitPrice: txn.unitPrice ?? snapshot.unitPrice ?? null,
        purchasePriceAtTime: txn.purchasePriceAtTime ?? snapshot.purchasePriceAtTime ?? null,
        discount: txn.discount ?? snapshot.discount ?? 0,
        taxInfo: txn.taxInfo || snapshot.taxInfo || null,
        soldBy: txn.soldBy || snapshot.soldBy || '',
        purchaseFrom: txn.purchaseFrom || snapshot.purchaseFrom || snapshot?.productSnapshot?.purchaseFrom || '',
        salesmanName: txn.salesmanName || snapshot.salesmanName || txn.userName || '',
        salesmanNumber: Number(txn.salesmanNumber ?? snapshot.salesmanNumber ?? 0) || 0,
        transactionId: txn.transactionId || snapshot.transactionId || '',
        productSnapshot: txn.productSnapshot || snapshot.productSnapshot || null,
    };
}

function buildTransactionDBPayload(txn, includeId = false, shopId = '') {
    const payload = withShopId({
        desc: txn?.desc || txn?.name || '',
        amount: parseFloat(txn?.amount || 0) || 0,
        type: txn?.type || '',
        category: txn?.category?.level1 || txn?.category || '',
        notes: txn?.notes || '',
        source: txn?.source || 'shop',
        quantity: parseInt(txn?.quantity || 1, 10) || 1,
        date: txn?.date || new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: txn?.time || new Date().toLocaleTimeString('en-US', { hour12: false }),
        timestamp: txn?.timestamp || new Date().toISOString(),
        isFixedExpense: txn?.isFixedExpense || false,
        productId: txn?.productId ? String(txn.productId) : null,
        workerId: txn?.workerId || null,
        salesmanName: txn?.userName || txn?.salesmanName || txn?.soldBy || ''
    }, shopId);

    if (includeId) payload.id = String(txn?.id || Date.now());

    return payload;
}

function buildTransactionSnapshot(txn) {
    const categorySnapshot = txn?.categorySnapshot
        || txn?.productSnapshot?.category
        || (txn?.category && typeof txn.category === 'object' ? txn.category : null);

    const attributes = txn?.attributes && typeof txn.attributes === 'object'
        ? txn.attributes
        : (txn?.productSnapshot?.attributes && typeof txn.productSnapshot.attributes === 'object' ? txn.productSnapshot.attributes : {});

    const verifiedAttributes = txn?.verifiedAttributes && typeof txn.verifiedAttributes === 'object'
        ? txn.verifiedAttributes
        : (txn?.productSnapshot?.verifiedAttributes && typeof txn.productSnapshot.verifiedAttributes === 'object' ? txn.productSnapshot.verifiedAttributes : {});

    const snapshot = {
        transactionId: txn?.transactionId || '',
        barcode: txn?.barcode || txn?.productSnapshot?.barcode || '',
        model: txn?.model || txn?.productSnapshot?.model || '',
        brand: txn?.brand || txn?.productSnapshot?.brand || '',
        categorySnapshot: categorySnapshot || null,
        categoryPath: txn?.categoryPath || txn?.productSnapshot?.categoryPath || null,
        attributes,
        verifiedAttributes,
        customerInfo: txn?.customerInfo || null,
        paymentMethod: txn?.paymentMethod || '',
        stdPriceAtTime: txn?.stdPriceAtTime ?? null,
        unitPrice: txn?.unitPrice ?? null,
        purchasePriceAtTime: txn?.purchasePriceAtTime ?? null,
        discount: txn?.discount ?? 0,
        taxInfo: txn?.taxInfo || null,
        soldBy: txn?.soldBy || txn?.salesmanName || '',
        purchaseFrom: txn?.purchaseFrom || txn?.productSnapshot?.purchaseFrom || '',
        salesmanName: txn?.salesmanName || txn?.soldBy || '',
        salesmanNumber: Number(txn?.salesmanNumber || 0) || 0,
        productSnapshot: txn?.productSnapshot || {
            id: txn?.productId || null,
            name: txn?.name || txn?.desc || '',
            desc: txn?.desc || txn?.name || '',
            model: txn?.model || '',
            brand: txn?.brand || '',
            barcode: txn?.barcode || '',
            category: categorySnapshot || null,
            categoryPath: txn?.categoryPath || null,
            attributes,
            verifiedAttributes,
            purchaseFrom: txn?.purchaseFrom || '',
            purchasePrice: parseFloat(txn?.purchasePriceAtTime ?? txn?.purchasePrice ?? 0) || 0,
            sellingPrice: parseFloat(txn?.stdPriceAtTime ?? txn?.unitPrice ?? txn?.amount ?? 0) || 0,
        },
        snapshotTimestamp: new Date().toISOString(),
    };

    return snapshot;
}

export function InventoryProvider({ children }) {
    const { activeShopId } = useAuth();

    // ── Live Products (Local State mirroring Supabase) ──
    const [products, setProducts] = useState([]);
    const [transactions, setTransactions] = useState([]);

    // ── Categories (Supabase Synced) ──
    const [l1Categories, setL1Categories] = useState([]);
    const [l2Map, setL2Map] = useState({});

    // ── Preload Data from Supabase ──
    useEffect(() => {
        const sid = cleanText(activeShopId);
        if (!sid) {
            setProducts([]);
            setTransactions([]);
            setL1Categories([]);
            setL2Map({});
            return undefined;
        }

        let cancelled = false;

        const fetchInitialData = async () => {
            const [invResult, txnResult, catResult] = await Promise.all([
                supabase.from('inventory').select('*').eq('shop_id', sid),
                supabase.from('transactions').select('*').eq('shop_id', sid).order('timestamp', { ascending: false }),
                supabase.from('categories').select('*').eq('shop_id', sid),
            ]);

            if (cancelled) return;

            if (!invResult.error && Array.isArray(invResult.data)) {
                setProducts(invResult.data.map(normalizeInventoryRecord));
            } else {
                setProducts([]);
            }

            if (!txnResult.error && Array.isArray(txnResult.data)) {
                const snapshotMap = readTransactionSnapshots();
                const hydratedTransactions = txnResult.data.map(t => mergeTransactionWithSnapshot(t, snapshotMap));
                setTransactions(hydratedTransactions);
            } else {
                setTransactions([]);
            }

            if (!catResult.error && Array.isArray(catResult.data)) {
                const l1 = catResult.data.filter(c => c.level === 1) || [];
                const l2 = catResult.data.filter(c => c.level === 2) || [];

                setL1Categories(l1);

                const map2 = {};
                l2.forEach(c => {
                    if (!map2[c.parent]) map2[c.parent] = [];
                    map2[c.parent].push(c);
                });
                setL2Map(map2);
            } else {
                setL1Categories([]);
                setL2Map({});
            }
        };
        fetchInitialData();

        // Listen for custom stock deductions (e.g., from repair parts used)
        const handleStockUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail.partsUsed)) {
                e.detail.partsUsed.forEach(part => {
                    adjustStock(part.productId, -part.quantity);
                });
            }
        };
        window.addEventListener('update-inventory-stock', handleStockUpdate);

        const shopFilter = `shop_id=eq.${sid}`;

        // Listen for live updates via Supabase Realtime (Transactions, Inventory, Categories)
        const syncSubscription = supabase.channel(`public:unified_sync:${sid}`)
            // TRANSACTIONS
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                const mergedTxn = mergeTransactionWithSnapshot(payload.new);
                setTransactions(prev => {
                    if (prev.some(t => String(t.id) === String(payload.new.id))) return prev;
                    return [mergedTxn, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                const mergedTxn = mergeTransactionWithSnapshot(payload.new);
                setTransactions(prev => prev.map(t => String(t.id) === String(payload.new.id) ? { ...t, ...mergedTxn } : t));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                setTransactions(prev => prev.filter(t => String(t.id) !== String(payload.old.id)));
            })
            // INVENTORY (Products)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                const incoming = normalizeInventoryRecord(payload.new);
                setProducts(prev => {
                    if (prev.some(p => String(p.id) === String(payload.new.id))) return prev;
                    return [incoming, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                setProducts(prev => prev.map(p =>
                    String(p.id) === String(payload.new.id)
                        ? normalizeInventoryRecord({ ...p, ...payload.new })
                        : p
                ));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                setProducts(prev => prev.filter(p => String(p.id) !== String(payload.old.id)));
            })
            // CATEGORIES
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories', filter: shopFilter }, (payload) => {
                const newCat = payload.new;
                if (newCat.level === 1) {
                    setL1Categories(prev => {
                        if (prev.some(c => (typeof c === 'object' ? c.name : c) === newCat.name)) return prev;
                        return [...prev, newCat];
                    });
                } else if (newCat.level === 2) {
                    setL2Map(prev => {
                        const currentList = prev[newCat.parent] || [];
                        if (currentList.some(c => (typeof c === 'object' ? c.name : c) === newCat.name)) return prev;
                        return { ...prev, [newCat.parent]: [...currentList, newCat] };
                    });
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'categories', filter: shopFilter }, (payload) => {
                const updated = payload.new;
                if (updated.level === 1) {
                    setL1Categories(prev => prev.map(c => {
                        const cName = typeof c === 'object' ? c.name : c;
                        return (typeof c === 'object' && c.id === updated.id) ? updated : (cName === updated.name ? updated : c);
                    }));
                } else if (updated.level === 2) {
                    setL2Map(prev => {
                        const next = { ...prev };
                        if (next[updated.parent]) {
                            next[updated.parent] = next[updated.parent].map(c =>
                                ((typeof c === 'object' && c.id === updated.id) || (typeof c === 'object' ? c.name : c) === updated.name) ? updated : c
                            );
                        }
                        return next;
                    });
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories', filter: shopFilter }, (payload) => {
                const deletedId = payload.old.id;
                setL1Categories(prev => prev.filter(c => typeof c !== 'object' || c.id !== deletedId));
                setL2Map(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(key => {
                        next[key] = next[key].filter(c => typeof c !== 'object' || c.id !== deletedId);
                    });
                    return next;
                });
            })
            // Fallback Broadcasts
            .on('broadcast', { event: 'inventory_sync' }, (payload) => {
                const { action, data } = payload.payload || {};
                if (!data || cleanText(data.shop_id) !== sid) return;

                if (action === 'UPDATE') {
                    setProducts(prev => prev.map(p =>
                        String(p.id) === String(data.id)
                            ? normalizeInventoryRecord({ ...p, ...data })
                            : p
                    ));
                } else if (action === 'INSERT') {
                    const incoming = normalizeInventoryRecord(data);
                    setProducts(prev => {
                        if (prev.some(p => String(p.id) === String(data.id))) return prev;
                        return [incoming, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    });
                } else if (action === 'DELETE') {
                    setProducts(prev => prev.filter(p => String(p.id) !== String(data.id)));
                }
            })
            .on('broadcast', { event: 'transaction_sync' }, (payload) => {
                const { action, data } = payload.payload || {};
                if (!data || cleanText(data.shop_id) !== sid) return;

                if (action === 'INSERT') {
                    const mergedTxn = mergeTransactionWithSnapshot(data);
                    setTransactions(prev => {
                        if (prev.some(t => String(t.id) === String(data.id))) return prev;
                        return [mergedTxn, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    });
                } else if (action === 'UPDATE') {
                    const mergedTxn = mergeTransactionWithSnapshot(data);
                    setTransactions(prev => prev.map(t => String(t.id) === String(data.id) ? { ...t, ...mergedTxn } : t));
                } else if (action === 'DELETE') {
                    setTransactions(prev => prev.filter(t => String(t.id) !== String(data.id)));
                }
            })
            .subscribe();

        return () => {
            cancelled = true;
            window.removeEventListener('update-inventory-stock', handleStockUpdate);
            supabase.removeChannel(syncSubscription);
        };
    }, [activeShopId]);

    // ── Optimistic CRUD Async Helpers ──

    const addProduct = useCallback(async (product) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const entry = buildProductJSON(product);
        entry.id = String(entry.id); // Supabase ID is TEXT
        entry.shop_id = sid;
        entry.purchaseFrom = cleanText(product?.purchaseFrom);
        entry.paymentMode = cleanText(product?.paymentMode) || cleanText(product?.paymentMethod);

        // Preserve legacy/manual category path data when source flow provides it.
        if ((!entry.category || (typeof entry.category === 'object' && Object.keys(entry.category).length === 0))
            && Array.isArray(product?.categoryPath)
            && product.categoryPath.length > 0) {
            entry.category = {
                level1: cleanText(product.categoryPath[0]),
                level2: cleanText(product.categoryPath[1]),
                level3: cleanText(product.categoryPath[2]),
            };
            entry.categoryPath = product.categoryPath.filter(Boolean);
        }

        // Optimistic UI Update
        setProducts(prev => {
            if (prev.find(p => String(p.id) === entry.id)) return prev;
            return [entry, ...prev];
        });

        const payload = buildInventoryPayload(entry, true, sid);
        const { data, error } = await supabase.from('inventory').insert([payload]).select().single();

        if (error) {
            // Rollback optimistic insert when cloud save fails
            setProducts(prev => prev.filter(p => String(p.id) !== entry.id));
            throw new Error(error.message || 'Failed to save product.');
        }

        const savedEntry = normalizeInventoryRecord(data ? { ...entry, ...data, id: String(data.id || entry.id) } : entry);
        setProducts(prev => prev.map(p => String(p.id) === entry.id ? savedEntry : p));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'INSERT', data: { ...savedEntry, shop_id: sid } }
        }).catch(e => console.error(e));

        return savedEntry;
    }, [activeShopId]);

    const deleteProduct = useCallback(async (id) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = String(id);
        setProducts(prev => prev.filter(p => String(p.id) !== strId));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'DELETE', data: { id: strId, shop_id: sid } }
        }).catch(e => console.error(e));

        await supabase.from('inventory').delete().eq('id', strId).eq('shop_id', sid);
    }, [activeShopId]);

    const updateProduct = useCallback(async (id, updatedData) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const strId = String(id);
        const previousProduct = products.find(p => String(p.id) === strId);
        if (!previousProduct) return null;

        const mergedProduct = { ...previousProduct, ...updatedData, id: strId, shop_id: sid };
        setProducts(prev => prev.map(p => String(p.id) === strId ? mergedProduct : p));

        const payload = buildInventoryPayload(mergedProduct, false, sid);
        const { data, error } = await supabase.from('inventory').update(payload).eq('id', strId).eq('shop_id', sid).select().single();

        if (error) {
            // Rollback optimistic update when cloud save fails
            setProducts(prev => prev.map(p => String(p.id) === strId ? previousProduct : p));
            throw new Error(error.message || 'Failed to update product.');
        }

        const savedProduct = normalizeInventoryRecord(data ? { ...mergedProduct, ...data, id: strId } : mergedProduct);
        setProducts(prev => prev.map(p => String(p.id) === strId ? savedProduct : p));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'UPDATE', data: { ...savedProduct, shop_id: sid } }
        }).catch(e => console.error(e));

        return savedProduct;
    }, [products, activeShopId]);

    const updateStock = useCallback(async (productRef, newStock) => {
        const sid = cleanText(activeShopId);
        if (!sid) return null;

        const searchRef = String(productRef);
        const parsedStock = parseInt(newStock, 10);
        const nextStock = Number.isNaN(parsedStock) ? 0 : Math.max(0, parsedStock);
        const matchedProduct = products.find(
            p => cleanText(p.shop_id || sid) === sid && (String(p.id) === searchRef || String(p.barcode || '') === searchRef)
        );
        if (!matchedProduct) return null;

        const strId = String(matchedProduct.id);
        const previousStock = parseInt(matchedProduct.stock, 10) || 0;
        setProducts(prev => prev.map(p => String(p.id) === strId ? { ...p, stock: nextStock } : p));
        const { error } = await supabase.from('inventory').update({ stock: nextStock }).eq('id', strId).eq('shop_id', sid);

        if (error) {
            setProducts(prev => prev.map(p => String(p.id) === strId ? { ...p, stock: previousStock } : p));
            throw new Error(error.message || 'Failed to update stock.');
        }

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'UPDATE', data: { id: strId, stock: nextStock, shop_id: sid } }
        }).catch(e => console.error(e));

        return { ...matchedProduct, stock: nextStock };
    }, [products, activeShopId]);

    const adjustStock = useCallback(async (productId, delta) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = String(productId);

        setProducts(prev => {
            const product = prev.find(p => cleanText(p.shop_id || sid) === sid && String(p.id) === strId);
            if (!product) return prev;

            const updatedStockVal = Math.max(0, (parseInt(product.stock) || 0) + parseInt(delta));

            // Fire off Supabase and Broadcast asynchronously
            supabase.from('inventory').update({ stock: updatedStockVal }).eq('id', strId).eq('shop_id', sid).then();

            supabase.channel(`public:unified_sync:${sid}`).send({
                type: 'broadcast',
                event: 'inventory_sync',
                payload: { action: 'UPDATE', data: { id: strId, stock: updatedStockVal, shop_id: sid } }
            }).catch(e => console.error(e));

            return prev.map(p => String(p.id) === strId ? { ...p, stock: updatedStockVal } : p);
        });
    }, [activeShopId]);

    // ── Transactions ──

    const addTransaction = useCallback(async (txn) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const formattedTxn = buildTransactionDBPayload(txn, true, sid);
        const snapshot = buildTransactionSnapshot({ ...txn, ...formattedTxn });
        saveTransactionSnapshot(formattedTxn.id, snapshot);
        const hydratedTxn = mergeTransactionWithSnapshot(formattedTxn, { [formattedTxn.id]: snapshot });

        setTransactions(prev => {
            if (prev.some(t => String(t.id) === String(hydratedTxn.id))) return prev;
            return [hydratedTxn, ...prev];
        });

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'INSERT', data: { ...hydratedTxn, shop_id: sid } }
        }).catch(e => console.error(e));

        const { error } = await supabase.from('transactions').insert([formattedTxn]);
        if (error) {
            setTransactions(prev => prev.filter(t => String(t.id) !== String(formattedTxn.id)));
            removeTransactionSnapshot(formattedTxn.id);
            throw new Error(error.message || 'Failed to save transaction.');
        }

        return hydratedTxn;
    }, [activeShopId]);

    const updateTransaction = useCallback(async (id, updates) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const strId = String(id);
        const existingTxn = transactions.find(t => String(t.id) === strId);
        if (!existingTxn) return null;

        const nextTxn = { ...existingTxn, ...updates, id: strId, shop_id: sid };
        const previousSnapshotMap = readTransactionSnapshots();
        const previousSnapshot = previousSnapshotMap[strId];
        const nextSnapshot = buildTransactionSnapshot(nextTxn);
        saveTransactionSnapshot(strId, nextSnapshot);

        const hydratedTxn = mergeTransactionWithSnapshot(nextTxn, { [strId]: nextSnapshot });
        setTransactions(prev => prev.map(t => String(t.id) === strId ? hydratedTxn : t));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'UPDATE', data: { ...hydratedTxn, shop_id: sid } }
        }).catch(e => console.error(e));

        const dbUpdate = buildTransactionDBPayload(nextTxn, false, sid);
        const { error } = await supabase.from('transactions').update(dbUpdate).eq('id', strId).eq('shop_id', sid);
        if (error) {
            if (previousSnapshot) {
                saveTransactionSnapshot(strId, previousSnapshot);
            } else {
                removeTransactionSnapshot(strId);
            }
            setTransactions(prev => prev.map(t => String(t.id) === strId ? existingTxn : t));
            throw new Error(error.message || 'Failed to update transaction.');
        }

        return hydratedTxn;
    }, [transactions, activeShopId]);

    const deleteTransaction = useCallback(async (id) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = String(id);
        const txnToDelete = transactions.find(t => String(t.id) === strId);

        if (txnToDelete && txnToDelete.productId) {
            const delta = txnToDelete.type === 'income'
                ? (parseInt(txnToDelete.quantity) || 1) // Sale deleted -> add back to stock
                : -(parseInt(txnToDelete.quantity) || 1); // Purchase deleted -> remove from stock
            adjustStock(txnToDelete.productId, delta);
        }

        setTransactions(prev => prev.filter(t => String(t.id) !== strId));
        removeTransactionSnapshot(strId);
        await supabase.from('transactions').delete().eq('id', strId).eq('shop_id', sid);
    }, [transactions, adjustStock, activeShopId]);

    const clearTransactions = useCallback(async () => {
        setTransactions([]);
        // For safety, let's not actually TRUNCATE the cloud DB on UI click unless explicitly defined
        // We will just clear local UI if they hit clear (maybe we shouldn't even support clearing all on cloud).
        console.warn("Clear transactions ignored on Cloud DB for safety.");
    }, []);

    const bulkUpdateCategoryPricing = useCallback(async (categoryName, percentage) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        let itemsToUpdate = [];
        setProducts(prev => prev.map(p => {
            const pCat = p.category?.level1 || (typeof p.category === 'string' ? p.category : '');
            if (pCat === categoryName) {
                const currentPrice = parseFloat(p.sellingPrice) || 0;
                if (currentPrice > 0) {
                    const newPrice = parseFloat((currentPrice * (1 + (percentage / 100))).toFixed(2));
                    itemsToUpdate.push({ id: String(p.id), sellingPrice: newPrice });
                    return { ...p, sellingPrice: newPrice };
                }
            }
            return p;
        }));

        // Fire parallel updates to cloud
        itemsToUpdate.forEach(async (item) => {
            await supabase.from('inventory').update({ sellingPrice: item.sellingPrice }).eq('id', item.id).eq('shop_id', sid);
        });
    }, [activeShopId]);

    // ── Standard Synced Helpers ──

    const lookupBarcode = useCallback((barcode) => {
        if (!barcode) return null;
        const search = String(barcode).trim();
        return products.find(p => p && String(p.barcode || '').trim() === search) || null;
    }, [products]);

    const searchProducts = useCallback((query) => {
        if (!query) return [...products];
        const q = String(query).toLowerCase();
        return products.filter(p => {
            if (!p) return false;
            return (
                String(p.name || '').toLowerCase().includes(q) ||
                String(p.model || '').toLowerCase().includes(q) ||
                String(p.barcode || '').toLowerCase().includes(q) ||
                String(p.desc || '').toLowerCase().includes(q)
            );
        });
    }, [products]);

    const getProductDetails = useCallback(async (id, refresh = false) => {
        const sid = cleanText(activeShopId);
        const strId = String(id);
        const localProduct = products.find(p => String(p.id) === strId) || null;
        if (!refresh) return localProduct;

        if (!sid) return localProduct;

        const { data, error } = await supabase.from('inventory').select('*').eq('id', strId).eq('shop_id', sid).single();
        if (error) {
            if (localProduct) return localProduct;
            throw new Error(error.message || 'Failed to fetch product details.');
        }

        const normalized = normalizeInventoryRecord({ ...(localProduct || {}), ...data, id: strId });
        setProducts(prev => {
            if (prev.some(p => String(p.id) === strId)) {
                return prev.map(p => String(p.id) === strId ? normalized : p);
            }
            return [normalized, ...prev];
        });

        return normalized;
    }, [products, activeShopId]);

    // Stateful Category Helpers
    const getL1Categories = useCallback(() => l1Categories, [l1Categories]);

    const getL2Categories = useCallback((l1Name) => {
        if (!l1Name) return [];
        return l2Map[l1Name] || getLevel2Categories(l1Name);
    }, [l2Map]);

    const addL1Category = useCallback(async (name, image = null) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const trimmed = name.trim();
        if (!trimmed) return;
        setL1Categories(prev => {
            const existing = prev.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) return prev.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { ...c, name: trimmed, image } : c);
                return prev;
            }
            return [...prev, { name: trimmed, image }];
        });

        // Sync to cloud
        const { data: existing } = await supabase
            .from('categories')
            .select('id')
            .eq('shop_id', sid)
            .eq('name', trimmed)
            .eq('level', 1)
            .single();
        if (existing) {
            if (image) await supabase.from('categories').update({ image }).eq('id', existing.id).eq('shop_id', sid);
        } else {
            await supabase.from('categories').insert([{ name: trimmed, image: image || '', level: 1, parent: null, shop_id: sid }]);
        }
    }, [activeShopId]);

    const addL2Category = useCallback(async (l1Name, name, image = null) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const trimmed = name.trim();
        if (!trimmed || !l1Name) return;
        setL2Map(prev => {
            const currentList = prev[l1Name] || getLevel2Categories(l1Name);
            const existing = currentList.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) {
                    const updatedList = currentList.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { ...c, name: trimmed, image } : c);
                    return { ...prev, [l1Name]: updatedList };
                }
                return prev;
            }
            return { ...prev, [l1Name]: [...currentList, { name: trimmed, image }] };
        });

        // Sync to cloud
        const { data: existing } = await supabase
            .from('categories')
            .select('id')
            .eq('shop_id', sid)
            .eq('name', trimmed)
            .eq('parent', l1Name)
            .eq('level', 2)
            .single();
        if (existing) {
            if (image) await supabase.from('categories').update({ image }).eq('id', existing.id).eq('shop_id', sid);
        } else {
            await supabase.from('categories').insert([{ name: trimmed, parent: l1Name, image: image || '', level: 2, shop_id: sid }]);
        }
    }, [activeShopId]);

    const getCatImage = useCallback((l1, l2) => {
        if (l2 && l2Map[l1]) {
            const found = l2Map[l1].find(c => (typeof c === 'object' ? c?.name : c) === l2);
            if (found && typeof found === 'object' && found.image) return found.image;
        }
        const foundL1 = l1Categories.find(c => (typeof c === 'object' ? c?.name : c) === l1);
        if (foundL1 && typeof foundL1 === 'object' && foundL1.image) return foundL1.image;
        return null;
    }, [l1Categories, l2Map]);

    const deleteCategory = useCallback(async (level, name, parentName = null) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const trimmed = name.trim();
        if (!trimmed) return;

        if (level === 1) {
            setL1Categories(prev => prev.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed));
            setL2Map(prev => {
                const next = { ...prev };
                delete next[trimmed];
                return next;
            });
            await supabase.from('categories').delete().eq('shop_id', sid).eq('name', trimmed).eq('level', 1);
            // Delete associated L2 categories in DB
            await supabase.from('categories').delete().eq('shop_id', sid).eq('parent', trimmed).eq('level', 2);
        } else if (level === 2 && parentName) {
            setL2Map(prev => {
                const currentList = prev[parentName] || [];
                return { ...prev, [parentName]: currentList.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed) };
            });
            await supabase.from('categories').delete().eq('shop_id', sid).eq('name', trimmed).eq('parent', parentName).eq('level', 2);
        }
    }, [activeShopId]);

    const getLowStockProducts = useCallback(() => {
        return products.filter(p => {
            if (typeof p.stock === 'number') return p.stock < 3;
            if (p.stockAlert) {
                const total = (p.stockAlert.red || 0) + (p.stockAlert.yellow || 0) + (p.stockAlert.green || 0);
                return total < 3;
            }
            return false;
        });
    }, [products]);

    const sanitizeBarcode = useCallback((raw) => {
        return String(raw).replace(/[^0-9a-zA-Z]/g, '').trim();
    }, []);

    const value = {
        products,
        transactions,
        addProduct,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        clearTransactions,
        deleteProduct,
        lookupBarcode,
        getProducts: () => [...products],
        getAllProducts: () => [...products],
        getProductDetails,
        searchProducts,
        getLowStockProducts,
        updateStock,
        adjustStock,
        sanitizeBarcode,
        getStockSeverity,
        updateProduct,
        getLevel1Categories: getL1Categories,
        getLevel2Categories: getL2Categories,
        addLevel1Category: addL1Category,
        addLevel2Category: addL2Category,
        deleteCategory,
        getCategoryImage: getCatImage,
        buildProductJSON,
        generateId,
        bulkUpdateCategoryPricing,
    };

    return (
        <InventoryContext.Provider value={value}>
            {children}
        </InventoryContext.Provider>
    );
}

export function useInventory() {
    const ctx = useContext(InventoryContext);
    if (!ctx) throw new Error('useInventory must be used within <InventoryProvider>');
    return ctx;
}
