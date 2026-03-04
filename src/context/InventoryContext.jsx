import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { buildProductJSON, generateId, getStockSeverity } from '../data/inventoryStore';

const InventoryContext = createContext(null);
const TRANSACTION_SNAPSHOT_STORAGE_KEY = 'dailybooks_transaction_snapshots_v1';
const CATEGORY_SCOPE_STORAGE_KEY = 'dailybooks_category_scopes_v1';
const CATEGORY_HIERARCHY_KEY = '__categoryHierarchy';
const PURCHASE_FROM_KEY = '__purchaseFrom';
const PAYMENT_MODE_KEY = '__paymentMode';
const CATEGORY_SCOPE_SALES = 'sales';
const CATEGORY_SCOPE_REVENUE = 'revenue';
const inMemoryCategoryScopeByShop = new Map();
let inMemoryTransactionSnapshots = {};

function extractMissingColumnName(error) {
    const message = String(error?.message || '');
    if (!message) return '';
    const patterns = [
        /column ["']?([a-zA-Z0-9_]+)["']? of relation/i,
        /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
        /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
        /record ["']?([a-zA-Z0-9_]+)["']? has no field/i
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) return String(match[1]);
    }
    return '';
}

function isMissingRelationError(error, relationName = '') {
    const message = String(error?.message || '').toLowerCase();
    if (!message.includes('does not exist')) return false;
    if (!relationName) return message.includes('relation') || message.includes('table');
    const target = String(relationName || '').toLowerCase();
    return message.includes(target);
}

function parseTimestampCandidate(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function composeLegacyTimestamp(dateValue, timeValue = '') {
    const dateText = cleanText(dateValue);
    if (!dateText) return '';
    const timeText = cleanText(timeValue) || '00:00';
    return parseTimestampCandidate(`${dateText} ${timeText}`)
        || parseTimestampCandidate(`${dateText}T${timeText}`)
        || '';
}

function resolveTransactionTimestamp(txn = {}) {
    const directCandidates = [
        txn?.timestamp,
        txn?.occurred_at,
        txn?.created_at,
        txn?.updated_at,
        txn?.updatedAt,
    ];
    for (const candidate of directCandidates) {
        const parsed = parseTimestampCandidate(candidate);
        if (parsed) return parsed;
    }
    return composeLegacyTimestamp(txn?.date, txn?.time);
}

function toLegacyDateLabel(timestamp, fallback = '') {
    const parsed = timestamp ? new Date(timestamp) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return cleanText(fallback);
}

function toLegacyTimeLabel(timestamp, fallback = '') {
    const parsed = timestamp ? new Date(timestamp) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
    }
    return cleanText(fallback);
}

async function executeWithPrunedColumns(operation, payload, maxAttempts = 12) {
    let candidate = payload && typeof payload === 'object' ? { ...payload } : {};

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await operation(candidate);
        if (!result?.error) {
            return { ...result, payload: candidate };
        }
        const missingColumn = extractMissingColumnName(result.error);
        if (!missingColumn || !Object.prototype.hasOwnProperty.call(candidate, missingColumn)) {
            return { ...result, payload: candidate };
        }
        delete candidate[missingColumn];
    }

    return {
        data: null,
        error: { message: 'Too many missing-column retries for this write.' },
        payload: candidate
    };
}

function buildWorkersLookup(salesmen = [], profileRows = []) {
    const lookup = {};
    const pushWorker = (worker = {}) => {
        const id = cleanText(worker?.id || worker?.user_id);
        if (!id) return;
        const salesmanNumber = Number(worker?.salesmanNumber ?? worker?.salesman_number ?? 0) || 0;
        lookup[id] = {
            id,
            name: cleanText(worker?.name || worker?.full_name),
            salesmanNumber
        };
    };
    (Array.isArray(salesmen) ? salesmen : []).forEach(pushWorker);
    (Array.isArray(profileRows) ? profileRows : []).forEach(pushWorker);
    return lookup;
}

function buildCategoryLookups(rows = []) {
    const byId = {};
    const byName = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const id = cleanText(row?.category_id || row?.id);
        const name = cleanText(row?.category_name || row?.name);
        if (id) byId[id] = row;
        if (name && !byName[name]) byName[name] = row;
    });
    return { byId, byName };
}

function resolveCategoryParentName(record, categoryById = {}) {
    const fromParent = cleanText(record?.parent);
    if (fromParent) return fromParent;
    const parentId = cleanText(record?.parent_category_id || record?.parent_id);
    if (parentId && categoryById[parentId]) {
        return cleanText(categoryById[parentId]?.name);
    }
    return '';
}

function normalizeTransactionRecord(txn = {}, options = {}) {
    const workersById = options?.workersById && typeof options.workersById === 'object'
        ? options.workersById
        : {};
    const itemsByTransactionId = options?.itemsByTransactionId && typeof options.itemsByTransactionId === 'object'
        ? options.itemsByTransactionId
        : {};
    const txnId = cleanText(txn?.transaction_id || txn?.id) || String(txn?.transaction_id ?? txn?.id ?? '');
    const linkedItems = txnId ? (itemsByTransactionId[txnId] || []) : [];
    const primaryItem = linkedItems[0] || null;
    const resolvedTimestamp = resolveTransactionTimestamp(txn);
    const workerId = cleanText(txn?.created_by || txn?.workerId || txn?.worker_id || txn?.user_id);
    const worker = workerId ? workersById[workerId] : null;

    const parsedQty = parseInt(
        txn?.quantity
        ?? txn?.qty
        ?? primaryItem?.qty
        ?? primaryItem?.quantity
        ?? 1,
        10
    );
    const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;

    const directAmount = parseFloat(txn?.amount);
    const fallbackAmount = primaryItem
        ? parseFloat(primaryItem?.line_total ?? primaryItem?.lineTotal ?? 0)
        : NaN;
    const amount = Number.isFinite(directAmount)
        ? directAmount
        : (Number.isFinite(fallbackAmount) ? fallbackAmount : 0);

    const unitPriceValue = parseFloat(
        txn?.unitPrice
        ?? txn?.unit_price
        ?? primaryItem?.unit_price
        ?? primaryItem?.unitPrice
        ?? (quantity > 0 ? amount / quantity : 0)
    );
    const unitPrice = Number.isFinite(unitPriceValue) ? unitPriceValue : 0;

    const productId = cleanText(
        txn?.productId
        ?? txn?.product_id
        ?? primaryItem?.product_id
        ?? primaryItem?.productId
    );

    const transactionId = cleanText(txn?.transactionId || txn?.transaction_id || txn?.order_id) || txnId;

    return {
        ...txn,
        id: txnId || txn?.id,
        transactionId,
        type: cleanText(txn?.tx_type || txn?.type),
        source: cleanText(txn?.source || 'cash'),
        occurred_at: resolvedTimestamp || cleanText(txn?.occurred_at),
        timestamp: resolvedTimestamp || cleanText(txn?.timestamp) || cleanText(txn?.created_at),
        date: toLegacyDateLabel(resolvedTimestamp, txn?.date),
        time: toLegacyTimeLabel(resolvedTimestamp, txn?.time),
        quantity,
        amount,
        unitPrice,
        productId: productId || null,
        workerId: workerId || null,
        salesmanName: cleanText(txn?.salesmanName || txn?.salesman_name || txn?.userName || worker?.name || ''),
        salesmanNumber: Number(txn?.salesmanNumber ?? txn?.salesman_number ?? worker?.salesmanNumber ?? 0) || 0,
        transactionItems: linkedItems,
    };
}

function buildTransactionItemsMap(rows = []) {
    return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        const txId = cleanText(row?.transaction_id || row?.transactionId);
        if (!txId) return acc;
        if (!acc[txId]) acc[txId] = [];
        acc[txId].push({
            ...row,
            qty: parseInt(row?.qty ?? row?.quantity ?? 1, 10) || 1,
            unit_price: parseFloat(row?.unit_price ?? row?.unitPrice ?? 0) || 0,
            line_total: parseFloat(row?.line_total ?? row?.lineTotal ?? 0) || 0,
            product_id: cleanText(row?.product_id || row?.productId) || null
        });
        return acc;
    }, {});
}

function extractLevel1CategoryName(category) {
    if (!category) return '';
    if (typeof category === 'string') return cleanText(category);
    if (typeof category === 'object') return cleanText(category.level1 || category.name || '');
    return '';
}

function buildTransactionItemPayload(txn = {}, shopId = '') {
    const sid = cleanText(shopId);
    const txId = cleanText(txn?.id);
    if (!sid || !txId) return null;

    const quantity = Math.max(1, parseInt(txn?.quantity ?? 1, 10) || 1);
    const amount = parseFloat(txn?.amount) || 0;
    const unitPrice = parseFloat(txn?.unitPrice);
    const resolvedUnitPrice = Number.isFinite(unitPrice) ? unitPrice : (quantity > 0 ? amount / quantity : 0);

    return {
        id: `ti-${txId}`,
        shop_id: sid,
        transaction_id: txId,
        product_id: cleanText(txn?.productId) || null,
        qty: quantity,
        unit_price: resolvedUnitPrice,
        line_total: amount,
    };
}

function buildTransactionItemPayloads(txn = {}, shopId = '') {
    const sid = cleanText(shopId);
    const txId = cleanText(txn?.id);
    if (!sid || !txId) return [];

    const explicitItems = Array.isArray(txn?.transactionItems) ? txn.transactionItems : [];
    if (explicitItems.length > 0) {
        return explicitItems
            .map((item, index) => {
                const quantity = Math.max(1, parseInt(item?.qty ?? item?.quantity ?? 1, 10) || 1);
                const lineTotal = parseFloat(item?.line_total ?? item?.lineTotal ?? item?.amount ?? 0) || 0;
                const unitPriceRaw = parseFloat(item?.unit_price ?? item?.unitPrice);
                const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : (quantity > 0 ? lineTotal / quantity : 0);
                const productId = cleanText(item?.product_id || item?.productId);
                if (!productId) return null;
                return {
                    id: cleanText(item?.id) || `ti-${txId}-${index + 1}`,
                    shop_id: sid,
                    transaction_id: txId,
                    product_id: productId,
                    qty: quantity,
                    unit_price: unitPrice,
                    line_total: lineTotal,
                };
            })
            .filter(Boolean);
    }

    const single = buildTransactionItemPayload(txn, sid);
    if (!single || !single.product_id) return [];
    return [single];
}

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isDataImageUri(value) {
    return /^data:image\//i.test(cleanText(value));
}

function normalizeCategoryScope(scope) {
    const raw = String(scope || '').trim().toLowerCase();
    if (raw === CATEGORY_SCOPE_REVENUE || raw === 'purchase') return CATEGORY_SCOPE_REVENUE;
    return CATEGORY_SCOPE_SALES;
}

function categoryScopeKey(level, name, parent = '') {
    return `${String(level || '')}|${cleanText(parent)}|${cleanText(name)}`;
}

function readCategoryScopeMap(shopId) {
    const sid = cleanText(shopId);
    if (!sid) return {};
    const current = inMemoryCategoryScopeByShop.get(sid);
    return current && typeof current === 'object' ? { ...current } : {};
}

function writeCategoryScopeMap(shopId, map) {
    const sid = cleanText(shopId);
    if (!sid) return;
    inMemoryCategoryScopeByShop.set(sid, map && typeof map === 'object' ? { ...map } : {});
}

function resolveCategoryScopeRecord(record, scopeMap = null) {
    if (!record || typeof record !== 'object') return CATEGORY_SCOPE_SALES;
    if (record.scope) return normalizeCategoryScope(record.scope);

    const level = Number(record.level) || (record.parent ? 2 : 1);
    const key = categoryScopeKey(level, record.name, record.parent || '');
    if (scopeMap && scopeMap[key]) return normalizeCategoryScope(scopeMap[key]);

    return CATEGORY_SCOPE_SALES;
}

function withCategoryScope(record, scopeMap = null) {
    if (!record || typeof record !== 'object') return record;
    return { ...record, scope: resolveCategoryScopeRecord(record, scopeMap) };
}

function applyScopeToCategoryList(list, scopeMap) {
    if (!Array.isArray(list)) return [];
    return list.map((item) => withCategoryScope(item, scopeMap));
}

function setCategoryScopeEntry(shopId, level, name, parentName, scope) {
    const sid = cleanText(shopId);
    if (!sid) return;
    const key = categoryScopeKey(level, name, parentName || '');
    if (!key) return;
    const current = readCategoryScopeMap(sid);
    current[key] = normalizeCategoryScope(scope);
    writeCategoryScopeMap(sid, current);
}

function removeCategoryScopeEntry(shopId, level, name, parentName) {
    const sid = cleanText(shopId);
    if (!sid) return;
    const key = categoryScopeKey(level, name, parentName || '');
    const current = readCategoryScopeMap(sid);
    if (!(key in current)) return;
    delete current[key];
    writeCategoryScopeMap(sid, current);
}

function removeCategoryScopeBranch(shopId, l1Name) {
    const sid = cleanText(shopId);
    if (!sid) return;
    const target = cleanText(l1Name);
    if (!target) return;

    const current = readCategoryScopeMap(sid);
    const next = { ...current };
    delete next[categoryScopeKey(1, target, '')];

    Object.keys(next).forEach((key) => {
        const [level, parent] = key.split('|');
        if (level === '2' && cleanText(parent) === target) {
            delete next[key];
        }
    });

    writeCategoryScopeMap(sid, next);
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

function makeCategoryId() {
    return `c${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
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

function normalizeInventoryRecord(product, categoryLookups = null) {
    const source = product || {};
    const categoryLookupById = categoryLookups && typeof categoryLookups === 'object'
        ? (categoryLookups.byId || {})
        : {};
    const mappedCategoryFromId = cleanText(categoryLookupById[cleanText(source.category_id || source.categoryId)]?.category_name || categoryLookupById[cleanText(source.category_id || source.categoryId)]?.name);
    const sourceCategory = source.category || mappedCategoryFromId || '';
    const rawAttrs = source.attributes && typeof source.attributes === 'object' ? source.attributes : {};
    const categoryHierarchy = buildCategoryHierarchy(sourceCategory, source.categoryPath, rawAttrs);
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
        id: source.product_id ? String(source.product_id) : (source.id ? String(source.id) : source.id),
        name: source.product_name || source.name || source.desc || normalizedModel || '',
        desc: source.product_name || source.desc || source.name || normalizedModel || '',
        model: normalizedModel,
        brand: normalizedBrand,
        barcode: cleanText(source.barcode),
        category: normalizedCategory,
        categoryPath: normalizedPath,
        purchaseFrom: normalizedPurchaseFrom,
        paymentMode: normalizedPaymentMode,
        image: cleanText(source.image) || cleanText(source.image_url) || attributeImage || '',
        timestamp: cleanText(source.timestamp) || cleanText(source.created_at) || '',
        category_id: cleanText(source.category_id || source.categoryId) || null,
        purchasePrice: parseFloat(source.purchase_price ?? source.purchasePrice ?? source.costPrice ?? 0) || 0,
        sellingPrice: parseFloat(source.selling_price ?? source.sellingPrice ?? source.price ?? 0) || 0,
        stock: parseInt(source.stock ?? 0, 10) || 0,
        attributes: normalizedAttrs,
    };
}

function mapTxType(value) {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return 'product_sale';
    if (raw === 'income' || raw === 'product_sale' || raw === 'sale') return 'product_sale';
    if (raw === 'shop_expense' || raw === 'expense') return 'shop_expense';
    if (raw === 'product_purchase' || raw === 'purchase') return 'product_purchase';
    if (raw === 'repair_amount' || raw === 'repair') return 'repair_amount';
    if (raw === 'adjustment_amount' || raw === 'adjustment') return 'adjustment_amount';
    return 'product_sale';
}

function buildInventoryPayload(product, includeId = false, shopId = '', categoryNameToId = {}) {
    const categoryHierarchy = buildCategoryHierarchy(product?.category, product?.categoryPath, product?.attributes);
    const level1Category = extractLevel1CategoryName(categoryHierarchy.level1 || product?.category);
    const resolvedCategoryIdFromMap = level1Category && categoryNameToId && typeof categoryNameToId === 'object'
        ? cleanText(categoryNameToId[level1Category])
        : '';
    const resolvedCategoryId = cleanText(product?.category_id || product?.categoryId || resolvedCategoryIdFromMap);
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

    if (imageValue && !isDataImageUri(imageValue)) {
        payloadAttributes.image = imageValue;
    } else {
        delete payloadAttributes.image;
    }

    const payload = withShopId({
        product_name: product?.name || product?.desc || product?.model || '',
        purchase_price: parseFloat(product?.purchasePrice ?? product?.costPrice ?? 0) || 0,
        selling_price: parseFloat(product?.sellingPrice ?? product?.price ?? product?.unitPrice ?? product?.amount ?? 0) || 0,
        stock: parseInt(product?.stock ?? product?.quantity ?? 0, 10) || 0,
        category_id: resolvedCategoryId || null,
        barcode: product?.barcode ? String(product.barcode).trim() : '',
        purchase_source: cleanText(product?.purchaseSource || product?.purchase_source || 'cash') || 'cash',
        product_url: product?.productUrl || product?.product_url || '',
        attributes: payloadAttributes,
    }, shopId);

    if (includeId) payload.product_id = String(product?.id);

    return payload;
}

function readTransactionSnapshots() {
    return inMemoryTransactionSnapshots && typeof inMemoryTransactionSnapshots === 'object'
        ? { ...inMemoryTransactionSnapshots }
        : {};
}

function writeTransactionSnapshots(next) {
    inMemoryTransactionSnapshots = next && typeof next === 'object' ? { ...next } : {};
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
    const resolvedTimestamp = resolveTransactionTimestamp(txn)
        || parseTimestampCandidate(snapshot?.occurred_at)
        || parseTimestampCandidate(snapshot?.snapshotTimestamp)
        || '';

    return {
        ...txn,
        timestamp: resolvedTimestamp || cleanText(txn?.timestamp),
        occurred_at: resolvedTimestamp || cleanText(txn?.occurred_at),
        date: toLegacyDateLabel(resolvedTimestamp, txn?.date),
        time: toLegacyTimeLabel(resolvedTimestamp, txn?.time),
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
        transactionItems: Array.isArray(txn.transactionItems) && txn.transactionItems.length > 0
            ? txn.transactionItems
            : (Array.isArray(snapshot.transactionItems) ? snapshot.transactionItems : []),
    };
}

function buildTransactionDBPayload(txn, includeId = false, shopId = '') {
    const occurredAt = resolveTransactionTimestamp(txn) || new Date().toISOString();
    const normalizedDate = toLegacyDateLabel(occurredAt, txn?.date);
    const normalizedTime = toLegacyTimeLabel(occurredAt, txn?.time);
    const workerId = cleanText(txn?.workerId || txn?.worker_id);
    const quantity = parseInt(txn?.quantity || 1, 10) || 1;
    const amount = parseFloat(txn?.amount || 0) || 0;

    const payload = withShopId({
        tx_type: mapTxType(txn?.tx_type || txn?.type),
        description: txn?.desc || txn?.name || '',
        amount,
        notes: txn?.notes || '',
        source: cleanText(txn?.source || 'cash') || 'cash',
        quantity,
        occurred_at: occurredAt,
        isFixedExpense: txn?.isFixedExpense || false,
        product_id: txn?.productId ? String(txn.productId) : null,
        created_by: workerId || null,
    }, shopId);

    if (includeId) payload.transaction_id = String(txn?.id || Date.now());

    return payload;
}

function buildTransactionSnapshot(txn) {
    const occurredAt = resolveTransactionTimestamp(txn) || new Date().toISOString();
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
        occurred_at: occurredAt,
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
        workerId: cleanText(txn?.workerId || txn?.worker_id) || null,
        transactionItems: Array.isArray(txn?.transactionItems)
            ? txn.transactionItems
            : (txn?.productId ? [buildTransactionItemPayload(txn, cleanText(txn?.shop_id))].filter(Boolean) : []),
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
    const { activeShopId, salesmen } = useAuth();

    // ── Live Products (Local State mirroring Supabase) ──
    const [products, setProducts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [workerDirectory, setWorkerDirectory] = useState({});

    // ── Categories (Supabase Synced) ──
    const [l1Categories, setL1Categories] = useState([]);
    const [l2Map, setL2Map] = useState({});
    const workerLookup = useMemo(
        () => buildWorkersLookup(salesmen, Object.values(workerDirectory || {})),
        [salesmen, workerDirectory]
    );
    const workerLookupRef = useRef(workerLookup);
    useEffect(() => {
        workerLookupRef.current = workerLookup;
    }, [workerLookup]);
    const categoryNameToId = useMemo(() => {
        return (Array.isArray(l1Categories) ? l1Categories : []).reduce((acc, category) => {
            const catObject = category && typeof category === 'object' ? category : null;
            const name = cleanText(catObject?.name || category);
            const id = cleanText(catObject?.id);
            if (name && id) acc[name] = id;
            return acc;
        }, {});
    }, [l1Categories]);
    const categoryLookups = useMemo(() => {
        const byId = {};
        const byName = {};
        (Array.isArray(l1Categories) ? l1Categories : []).forEach((category) => {
            const catObject = category && typeof category === 'object' ? category : null;
            const id = cleanText(catObject?.id);
            const name = cleanText(catObject?.name || category);
            if (id) byId[id] = catObject || { id, name };
            if (name && !byName[name]) byName[name] = catObject || { id, name };
        });
        return { byId, byName };
    }, [l1Categories]);
    const categoryLookupsRef = useRef(categoryLookups);
    useEffect(() => {
        categoryLookupsRef.current = categoryLookups;
    }, [categoryLookups]);

    const ensureActiveShopExists = useCallback(async (sid) => {
        const safeShopId = cleanText(sid);
        if (!safeShopId) {
            throw new Error('No active shop selected. Please select a shop first.');
        }

        const { data, error } = await supabase
            .from('shops')
            .select('id')
            .eq('shop_id', safeShopId)
            .limit(1);

        if (error) {
            throw new Error(error.message || 'Unable to verify selected shop.');
        }

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Selected shop is invalid or outdated. Please refresh and select a valid shop.');
        }

        return safeShopId;
    }, []);

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
            const [invResult, txnResult, catResult, itemResult, profileResult] = await Promise.all([
                supabase.from('inventory').select('*').eq('shop_id', sid),
                supabase.from('transactions').select('*').eq('shop_id', sid),
                supabase.from('categories').select('*').eq('shop_id', sid),
                supabase.from('transaction_items').select('*').eq('shop_id', sid),
                supabase.from('profiles').select('user_id,full_name,salesman_number').eq('shop_id', sid),
            ]);

            if (cancelled) return;

            const categoryRows = !catResult.error && Array.isArray(catResult.data) ? catResult.data : [];
            const categoryLookups = buildCategoryLookups(categoryRows);
            const scopeMap = readCategoryScopeMap(sid);

            const profileRows = !profileResult.error && Array.isArray(profileResult.data)
                ? profileResult.data
                : [];
            const workersById = buildWorkersLookup(salesmen, profileRows);
            setWorkerDirectory(workersById);

            if (!invResult.error && Array.isArray(invResult.data)) {
                setProducts(invResult.data.map((row) => normalizeInventoryRecord(row, categoryLookups)));
            } else {
                setProducts([]);
            }

            if (!txnResult.error && Array.isArray(txnResult.data)) {
                const itemsByTransactionId = (!itemResult.error && Array.isArray(itemResult.data))
                    ? buildTransactionItemsMap(itemResult.data)
                    : {};
                const snapshotMap = readTransactionSnapshots();
                const normalizedTransactions = txnResult.data.map((row) => normalizeTransactionRecord(row, {
                    workersById,
                    itemsByTransactionId
                }));
                const hydratedTransactions = normalizedTransactions.map((row) => mergeTransactionWithSnapshot(row, snapshotMap));
                hydratedTransactions.sort((a, b) => new Date(cleanText(b?.timestamp) || cleanText(b?.created_at) || 0) - new Date(cleanText(a?.timestamp) || cleanText(a?.created_at) || 0));
                setTransactions(hydratedTransactions);
            } else if (itemResult.error && !isMissingRelationError(itemResult.error, 'transaction_items')) {
                setTransactions([]);
            } else {
                setTransactions([]);
            }

            if (categoryRows.length > 0) {
                const l1 = categoryRows.filter(c => Number(c.level) === 1) || [];
                const l2 = categoryRows.filter(c => Number(c.level) === 2) || [];
                setL1Categories(applyScopeToCategoryList(l1, scopeMap));

                const map2 = {};
                l2.forEach(c => {
                    const parentName = resolveCategoryParentName(c, categoryLookups.byId);
                    if (!parentName) return;
                    if (!map2[parentName]) map2[parentName] = [];
                    map2[parentName].push(withCategoryScope({ ...c, parent: parentName }, scopeMap));
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
                    const partProductId = cleanText(part?.productId || part?.product_id);
                    const partQty = parseFloat(part?.quantity ?? part?.qty ?? 0) || 0;
                    if (partProductId && partQty > 0) {
                        adjustStock(partProductId, -partQty);
                    }
                });
            }
        };
        window.addEventListener('update-inventory-stock', handleStockUpdate);

        const shopFilter = `shop_id=eq.${sid}`;

        // Listen for live updates via Supabase Realtime (Transactions, Inventory, Categories)
        const syncSubscription = supabase.channel(`public:unified_sync:${sid}`)
            // TRANSACTIONS
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                const mergedTxn = mergeTransactionWithSnapshot(normalizeTransactionRecord(payload.new, { workersById: workerLookupRef.current }));
                setTransactions(prev => {
                    if (prev.some(t => String(t.id) === String(payload.new.id))) return prev;
                    return [mergedTxn, ...prev].sort((a, b) => new Date(cleanText(b?.timestamp) || cleanText(b?.created_at) || 0) - new Date(cleanText(a?.timestamp) || cleanText(a?.created_at) || 0));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                const mergedTxn = mergeTransactionWithSnapshot(normalizeTransactionRecord(payload.new, { workersById: workerLookupRef.current }));
                setTransactions(prev => prev.map(t => String(t.id) === String(payload.new.id) ? { ...t, ...mergedTxn } : t));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transactions', filter: shopFilter }, (payload) => {
                setTransactions(prev => prev.filter(t => String(t.id) !== String(payload.old.id)));
            })
            // INVENTORY (Products)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                const incoming = normalizeInventoryRecord(payload.new, categoryLookupsRef.current);
                setProducts(prev => {
                    if (prev.some(p => String(p.id) === String(payload.new.id))) return prev;
                    return [incoming, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                setProducts(prev => prev.map(p =>
                    String(p.id) === String(payload.new.id)
                        ? normalizeInventoryRecord({ ...p, ...payload.new }, categoryLookupsRef.current)
                        : p
                ));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventory', filter: shopFilter }, (payload) => {
                setProducts(prev => prev.filter(p => String(p.id) !== String(payload.old.id)));
            })
            // CATEGORIES
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories', filter: shopFilter }, (payload) => {
                const newCat = withCategoryScope(payload.new, readCategoryScopeMap(sid));
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
                const updated = withCategoryScope(payload.new, readCategoryScopeMap(sid));
                if (updated.level === 1) {
                    setL1Categories(prev => prev.map(c => {
                        const cName = typeof c === 'object' ? c.name : c;
                        if ((typeof c === 'object' && c.id === updated.id) || cName === updated.name) {
                            const currentScope = typeof c === 'object' ? c.scope : undefined;
                            return { ...updated, scope: updated.scope || currentScope || CATEGORY_SCOPE_SALES };
                        }
                        return c;
                    }));
                } else if (updated.level === 2) {
                    setL2Map(prev => {
                        const next = { ...prev };
                        if (next[updated.parent]) {
                            next[updated.parent] = next[updated.parent].map(c =>
                                ((typeof c === 'object' && c.id === updated.id) || (typeof c === 'object' ? c.name : c) === updated.name)
                                    ? { ...updated, scope: updated.scope || (typeof c === 'object' ? c.scope : undefined) || CATEGORY_SCOPE_SALES }
                                    : c
                            );
                        }
                        return next;
                    });
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories', filter: shopFilter }, (payload) => {
                const deletedId = payload.old.id;
                if (payload.old?.level === 1) {
                    removeCategoryScopeBranch(sid, payload.old?.name || '');
                } else if (payload.old?.level === 2) {
                    removeCategoryScopeEntry(sid, 2, payload.old?.name || '', payload.old?.parent || '');
                }
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
                            ? normalizeInventoryRecord({ ...p, ...data }, categoryLookupsRef.current)
                            : p
                    ));
                } else if (action === 'INSERT') {
                    const incoming = normalizeInventoryRecord(data, categoryLookupsRef.current);
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
                    const mergedTxn = mergeTransactionWithSnapshot(normalizeTransactionRecord(data, { workersById: workerLookupRef.current }));
                    setTransactions(prev => {
                        if (prev.some(t => String(t.id) === String(data.id))) return prev;
                        return [mergedTxn, ...prev].sort((a, b) => new Date(cleanText(b?.timestamp) || cleanText(b?.created_at) || 0) - new Date(cleanText(a?.timestamp) || cleanText(a?.created_at) || 0));
                    });
                } else if (action === 'UPDATE') {
                    const mergedTxn = mergeTransactionWithSnapshot(normalizeTransactionRecord(data, { workersById: workerLookupRef.current }));
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

        const payload = buildInventoryPayload(entry, true, sid, categoryNameToId);
        const insertResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('inventory').insert([candidate]).select().single(),
            payload
        );

        if (insertResult.error) {
            // Rollback optimistic insert when cloud save fails
            setProducts(prev => prev.filter(p => String(p.id) !== entry.id));
            throw new Error(insertResult.error.message || 'Failed to save product.');
        }

        const savedEntry = normalizeInventoryRecord(
            insertResult.data ? { ...entry, ...insertResult.data, id: String(insertResult.data.id || entry.id) } : entry
        );
        setProducts(prev => prev.map(p => String(p.id) === entry.id ? savedEntry : p));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'INSERT', data: { ...savedEntry, shop_id: sid } }
        }).catch(e => console.error(e));

        return savedEntry;
    }, [activeShopId, categoryNameToId]);

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

        await supabase.from('inventory').delete().eq('product_id', strId).eq('shop_id', sid);
    }, [activeShopId]);

    const updateProduct = useCallback(async (id, updatedData) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const strId = String(id);
        const previousProduct = products.find(p => String(p.id) === strId);
        if (!previousProduct) return null;

        const mergedProduct = { ...previousProduct, ...updatedData, id: strId, shop_id: sid };
        setProducts(prev => prev.map(p => String(p.id) === strId ? mergedProduct : p));

        const payload = buildInventoryPayload(mergedProduct, false, sid, categoryNameToId);
        const updateResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('inventory').update(candidate).eq('product_id', strId).eq('shop_id', sid).select().single(),
            payload
        );

        if (updateResult.error) {
            // Rollback optimistic update when cloud save fails
            setProducts(prev => prev.map(p => String(p.id) === strId ? previousProduct : p));
            throw new Error(updateResult.error.message || 'Failed to update product.');
        }

        const savedProduct = normalizeInventoryRecord(
            updateResult.data ? { ...mergedProduct, ...updateResult.data, id: strId } : mergedProduct
        );
        setProducts(prev => prev.map(p => String(p.id) === strId ? savedProduct : p));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'UPDATE', data: { ...savedProduct, shop_id: sid } }
        }).catch(e => console.error(e));

        return savedProduct;
    }, [products, activeShopId, categoryNameToId]);

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
        const { error } = await supabase.from('inventory').update({ stock: nextStock }).eq('product_id', strId).eq('shop_id', sid);

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

            const updatedStockVal = Math.max(0, (parseFloat(product.stock) || 0) + (parseFloat(delta) || 0));

            // Fire off Supabase and Broadcast asynchronously
            supabase.from('inventory').update({ stock: updatedStockVal }).eq('product_id', strId).eq('shop_id', sid).then();

            supabase.channel(`public:unified_sync:${sid}`).send({
                type: 'broadcast',
                event: 'inventory_sync',
                payload: { action: 'UPDATE', data: { id: strId, stock: updatedStockVal, shop_id: sid } }
            }).catch(e => console.error(e));

            return prev.map(p => String(p.id) === strId ? { ...p, stock: updatedStockVal } : p);
        });
    }, [activeShopId]);

    // ── Transactions ──

    const syncTransactionItems = useCallback(async (txn, shopIdOverride = '') => {
        const sid = cleanText(shopIdOverride || activeShopId);
        if (!sid) return;

        const txId = cleanText(txn?.id);
        if (!txId) return;

        const payloads = buildTransactionItemPayloads(txn, sid);

        const deleteResult = await supabase
            .from('transaction_items')
            .delete()
            .eq('shop_id', sid)
            .eq('transaction_id', txId);

        if (deleteResult.error && !isMissingRelationError(deleteResult.error, 'transaction_items')) {
            throw new Error(deleteResult.error.message || 'Failed to clear transaction item rows.');
        }

        if (!payloads.length) return;

        for (const payload of payloads) {
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('transaction_items').insert([candidate]),
                payload
            );
            if (insertResult.error && !isMissingRelationError(insertResult.error, 'transaction_items')) {
                throw new Error(insertResult.error.message || 'Failed to save transaction items.');
            }
        }
    }, [activeShopId, salesmen]);

    const addTransaction = useCallback(async (txn) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const formattedTxn = buildTransactionDBPayload(txn, true, sid);
        const normalizedTxn = normalizeTransactionRecord(formattedTxn, { workersById: workerLookup });
        const snapshot = buildTransactionSnapshot({ ...txn, ...formattedTxn, ...normalizedTxn });
        saveTransactionSnapshot(formattedTxn.id, snapshot);
        const hydratedTxn = mergeTransactionWithSnapshot(normalizedTxn, { [formattedTxn.id]: snapshot });

        setTransactions(prev => {
            if (prev.some(t => String(t.id) === String(hydratedTxn.id))) return prev;
            return [hydratedTxn, ...prev];
        });

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'INSERT', data: { ...hydratedTxn, shop_id: sid } }
        }).catch(e => console.error(e));

        const insertResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('transactions').insert([candidate]),
            formattedTxn
        );
        if (insertResult.error) {
            setTransactions(prev => prev.filter(t => String(t.id) !== String(formattedTxn.id)));
            removeTransactionSnapshot(formattedTxn.id);
            throw new Error(insertResult.error.message || 'Failed to save transaction.');
        }

        try {
            await syncTransactionItems({ ...txn, ...hydratedTxn, ...formattedTxn }, sid);
        } catch (itemError) {
            console.error(itemError);
        }

        return hydratedTxn;
    }, [activeShopId, workerLookup, syncTransactionItems]);

    const updateTransaction = useCallback(async (id, updates) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const strId = String(id);
        const existingTxn = transactions.find(t => String(t.id) === strId);
        if (!existingTxn) return null;

        const nextTxn = { ...existingTxn, ...updates, id: strId, shop_id: sid };
        const previousSnapshotMap = readTransactionSnapshots();
        const previousSnapshot = previousSnapshotMap[strId];
        const normalizedNextTxn = normalizeTransactionRecord(nextTxn, { workersById: workerLookup });
        const nextSnapshot = buildTransactionSnapshot(normalizedNextTxn);
        saveTransactionSnapshot(strId, nextSnapshot);

        const hydratedTxn = mergeTransactionWithSnapshot(normalizedNextTxn, { [strId]: nextSnapshot });
        setTransactions(prev => prev.map(t => String(t.id) === strId ? hydratedTxn : t));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'UPDATE', data: { ...hydratedTxn, shop_id: sid } }
        }).catch(e => console.error(e));

        const dbUpdate = buildTransactionDBPayload(nextTxn, false, sid);
        const updateResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('transactions').update(candidate).eq('transaction_id', strId).eq('shop_id', sid),
            dbUpdate
        );
        if (updateResult.error) {
            if (previousSnapshot) {
                saveTransactionSnapshot(strId, previousSnapshot);
            } else {
                removeTransactionSnapshot(strId);
            }
            setTransactions(prev => prev.map(t => String(t.id) === strId ? existingTxn : t));
            throw new Error(updateResult.error.message || 'Failed to update transaction.');
        }

        try {
            await syncTransactionItems({ ...nextTxn, ...hydratedTxn }, sid);
        } catch (itemError) {
            console.error(itemError);
        }

        return hydratedTxn;
    }, [transactions, activeShopId, workerLookup, syncTransactionItems]);

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
        const itemDeleteResult = await supabase
            .from('transaction_items')
            .delete()
            .eq('shop_id', sid)
            .eq('transaction_id', strId);
        if (itemDeleteResult.error && !isMissingRelationError(itemDeleteResult.error, 'transaction_items')) {
            throw new Error(itemDeleteResult.error.message || 'Failed to remove linked transaction items.');
        }

        await supabase.from('transactions').delete().eq('transaction_id', strId).eq('shop_id', sid);
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
            await supabase.from('inventory').update({ selling_price: item.sellingPrice }).eq('product_id', item.id).eq('shop_id', sid);
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

        const { data, error } = await supabase.from('inventory').select('*').eq('product_id', strId).eq('shop_id', sid).single();
        if (error) {
            if (localProduct) return localProduct;
            throw new Error(error.message || 'Failed to fetch product details.');
        }

        const normalized = normalizeInventoryRecord({ ...(localProduct || {}), ...data, id: strId }, categoryLookupsRef.current);
        setProducts(prev => {
            if (prev.some(p => String(p.id) === strId)) {
                return prev.map(p => String(p.id) === strId ? normalized : p);
            }
            return [normalized, ...prev];
        });

        return normalized;
    }, [products, activeShopId]);

    // Stateful Category Helpers
    const getL1Categories = useCallback((scope = 'all') => {
        if (!scope || String(scope).toLowerCase() === 'all') return l1Categories;
        const normalizedScope = normalizeCategoryScope(scope);
        return l1Categories.filter((c) => {
            if (!c || typeof c !== 'object') return normalizedScope === CATEGORY_SCOPE_SALES;
            return normalizeCategoryScope(c.scope) === normalizedScope;
        });
    }, [l1Categories]);

    const getL2Categories = useCallback((l1Name, scope = 'all') => {
        if (!l1Name) return [];
        const categories = l2Map[l1Name] || [];
        if (!scope || String(scope).toLowerCase() === 'all') return categories;
        const normalizedScope = normalizeCategoryScope(scope);
        return (categories || []).filter((c) => {
            if (!c || typeof c !== 'object') return normalizedScope === CATEGORY_SCOPE_SALES;
            return normalizeCategoryScope(c.scope) === normalizedScope;
        });
    }, [l2Map]);

    const addL1Category = useCallback(async (name, image = null, scope = CATEGORY_SCOPE_SALES) => {
        const sid = await ensureActiveShopExists(activeShopId);

        const trimmed = name.trim();
        if (!trimmed) return;
        const normalizedScope = normalizeCategoryScope(scope);

        // Sync to cloud
        let existing = null;
        let hasScopeColumn = true;
        let resolvedCategoryId = '';
        const scopedSelect = await supabase
            .from('categories')
            .select('id')
            .eq('shop_id', sid)
            .eq('name', trimmed)
            .eq('level', 1)
            .eq('scope', normalizedScope)
            .limit(1);

        if (!scopedSelect.error) {
            existing = Array.isArray(scopedSelect.data) ? (scopedSelect.data[0] || null) : null;
            resolvedCategoryId = cleanText(existing?.id);
        } else {
            const scopedErrMsg = String(scopedSelect.error?.message || '').toLowerCase();
            hasScopeColumn = !(scopedErrMsg.includes('column') && scopedErrMsg.includes('scope'));
            if (!hasScopeColumn) {
                const fallbackSelect = await supabase
                    .from('categories')
                    .select('id')
                    .eq('shop_id', sid)
                    .eq('name', trimmed)
                    .eq('level', 1)
                    .limit(1);
                existing = Array.isArray(fallbackSelect.data) ? (fallbackSelect.data[0] || null) : null;
                resolvedCategoryId = cleanText(existing?.id);
            }
        }

        if (existing) {
            const updatePayload = {
                ...(hasScopeColumn ? { scope: normalizedScope } : {})
            };
            if (Object.keys(updatePayload).length > 0) {
                const { error: updateError } = await supabase.from('categories').update(updatePayload).eq('category_id', existing.id).eq('shop_id', sid);
                if (updateError) {
                    throw new Error(updateError.message || 'Failed to update category.');
                }
            }
        } else {
            const newCategoryId = makeCategoryId();
            resolvedCategoryId = newCategoryId;
            const insertPayload = {
                id: newCategoryId,
                name: trimmed,
                level: 1,
                parent: null,
                shop_id: sid,
                ...(hasScopeColumn ? { scope: normalizedScope } : {})
            };
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('categories').insert([candidate]),
                insertPayload
            );
            const insertError = insertResult.error;
            if (insertError) {
                const fallbackSelect = await supabase
                    .from('categories')
                    .select('id')
                    .eq('shop_id', sid)
                    .eq('name', trimmed)
                    .eq('level', 1)
                    .limit(1);
                const fallbackExisting = Array.isArray(fallbackSelect.data) ? (fallbackSelect.data[0] || null) : null;
                if (fallbackExisting) {
                    resolvedCategoryId = cleanText(fallbackExisting.id);
                    const updatePayload = {
                        ...(hasScopeColumn ? { scope: normalizedScope } : {})
                    };
                    if (Object.keys(updatePayload).length > 0) {
                        const { error: updateError } = await supabase.from('categories').update(updatePayload).eq('category_id', fallbackExisting.id).eq('shop_id', sid);
                        if (updateError) {
                            throw new Error(updateError.message || 'Failed to persist category scope.');
                        }
                    }
                } else {
                    throw new Error(insertError.message || 'Failed to save category.');
                }
            }
        }

        setL1Categories(prev => {
            const existingLocal = prev.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existingLocal) {
                return prev.map((c) => {
                    if ((typeof c === 'object' ? c?.name : c) !== trimmed) return c;
                    if (typeof c === 'object') {
                        return {
                            ...c,
                            id: c.id || resolvedCategoryId || undefined,
                            name: trimmed,
                            image: image || c.image || '',
                            scope: normalizedScope,
                        };
                    }
                    return { id: resolvedCategoryId || undefined, name: trimmed, image: image || '', scope: normalizedScope };
                });
            }
            return [...prev, { id: resolvedCategoryId || undefined, name: trimmed, image, scope: normalizedScope }];
        });
        setCategoryScopeEntry(sid, 1, trimmed, '', normalizedScope);
    }, [activeShopId, ensureActiveShopExists]);

    const addL2Category = useCallback(async (l1Name, name, image = null, scope = CATEGORY_SCOPE_SALES) => {
        const sid = await ensureActiveShopExists(activeShopId);

        const trimmed = name.trim();
        if (!trimmed || !l1Name) return;
        const normalizedScope = normalizeCategoryScope(scope);
        const parentCategoryId = cleanText(categoryNameToId[l1Name]);

        // Sync to cloud
        let existing = null;
        let hasScopeColumn = true;
        let hasParentColumn = true;
        const scopedSelect = await supabase
            .from('categories')
            .select('id')
            .eq('shop_id', sid)
            .eq('name', trimmed)
            .eq('parent', l1Name)
            .eq('level', 2)
            .eq('scope', normalizedScope)
            .limit(1);

        if (!scopedSelect.error) {
            existing = Array.isArray(scopedSelect.data) ? (scopedSelect.data[0] || null) : null;
        } else {
            const scopedErrMsg = String(scopedSelect.error?.message || '').toLowerCase();
            hasScopeColumn = !(scopedErrMsg.includes('column') && scopedErrMsg.includes('scope'));
            hasParentColumn = !(scopedErrMsg.includes('column') && scopedErrMsg.includes('parent'));
            if (!hasScopeColumn || !hasParentColumn) {
                let fallbackSelect = supabase
                    .from('categories')
                    .select('id')
                    .eq('shop_id', sid)
                    .eq('name', trimmed)
                    .eq('level', 2);
                if (hasParentColumn) {
                    fallbackSelect = fallbackSelect.eq('parent', l1Name);
                } else if (parentCategoryId) {
                    fallbackSelect = fallbackSelect.eq('parent_id', parentCategoryId);
                }
                const fallbackResult = await fallbackSelect.limit(1);
                existing = Array.isArray(fallbackResult.data) ? (fallbackResult.data[0] || null) : null;
            }
        }

        if (existing) {
            const updatePayload = {
                ...(hasScopeColumn ? { scope: normalizedScope } : {})
            };
            if (Object.keys(updatePayload).length > 0) {
                const { error: updateError } = await supabase.from('categories').update(updatePayload).eq('category_id', existing.id).eq('shop_id', sid);
                if (updateError) {
                    throw new Error(updateError.message || 'Failed to update sub-category.');
                }
            }
        } else {
            const insertPayload = {
                id: makeCategoryId(),
                name: trimmed,
                parent: l1Name,
                parent_id: parentCategoryId || null,
                level: 2,
                shop_id: sid,
                ...(hasScopeColumn ? { scope: normalizedScope } : {})
            };
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('categories').insert([candidate]),
                insertPayload
            );
            const insertError = insertResult.error;
            if (insertError) {
                let fallbackSelect = await supabase
                    .from('categories')
                    .select('id')
                    .eq('shop_id', sid)
                    .eq('name', trimmed)
                    .eq('parent', l1Name)
                    .eq('level', 2)
                    .limit(1);
                let fallbackExisting = Array.isArray(fallbackSelect.data) ? (fallbackSelect.data[0] || null) : null;
                if (!fallbackExisting && parentCategoryId) {
                    fallbackSelect = await supabase
                        .from('categories')
                        .select('id')
                        .eq('shop_id', sid)
                        .eq('name', trimmed)
                        .eq('parent_id', parentCategoryId)
                        .eq('level', 2)
                        .limit(1);
                    fallbackExisting = Array.isArray(fallbackSelect.data) ? (fallbackSelect.data[0] || null) : null;
                }
                if (fallbackExisting) {
                    const updatePayload = {
                        ...(hasScopeColumn ? { scope: normalizedScope } : {})
                    };
                    if (Object.keys(updatePayload).length > 0) {
                        const { error: updateError } = await supabase.from('categories').update(updatePayload).eq('category_id', fallbackExisting.id).eq('shop_id', sid);
                        if (updateError) {
                            throw new Error(updateError.message || 'Failed to persist sub-category scope.');
                        }
                    }
                } else {
                    throw new Error(insertError.message || 'Failed to save sub-category.');
                }
            }
        }

        setL2Map(prev => {
            const currentList = prev[l1Name] || [];
            const existingLocal = currentList.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existingLocal) {
                const updatedList = currentList.map((c) => {
                    if ((typeof c === 'object' ? c?.name : c) !== trimmed) return c;
                    if (typeof c === 'object') {
                        return {
                            ...c,
                            name: trimmed,
                            image: image || c.image || '',
                            parent_id: c.parent_id || parentCategoryId || null,
                            scope: normalizedScope,
                        };
                    }
                    return { name: trimmed, image: image || '', parent: l1Name, parent_id: parentCategoryId || null, scope: normalizedScope };
                });
                return { ...prev, [l1Name]: updatedList };
            }
            return {
                ...prev,
                [l1Name]: [...currentList, { name: trimmed, image, parent: l1Name, parent_id: parentCategoryId || null, scope: normalizedScope }]
            };
        });
        setCategoryScopeEntry(sid, 2, trimmed, l1Name, normalizedScope);
    }, [activeShopId, ensureActiveShopExists, categoryNameToId]);

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
            removeCategoryScopeBranch(sid, trimmed);
            await supabase.from('categories').delete().eq('shop_id', sid).eq('name', trimmed).eq('level', 1);
            // Delete associated L2 categories in DB
            const l2DeleteByParent = await supabase.from('categories').delete().eq('shop_id', sid).eq('parent', trimmed).eq('level', 2);
            if (l2DeleteByParent.error && extractMissingColumnName(l2DeleteByParent.error) === 'parent') {
                const parentId = cleanText(categoryNameToId[trimmed]);
                if (parentId) {
                    await supabase.from('categories').delete().eq('shop_id', sid).eq('parent_id', parentId).eq('level', 2);
                }
            }
        } else if (level === 2 && parentName) {
            setL2Map(prev => {
                const currentList = prev[parentName] || [];
                return { ...prev, [parentName]: currentList.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed) };
            });
            removeCategoryScopeEntry(sid, 2, trimmed, parentName);
            const deleteByParentName = await supabase
                .from('categories')
                .delete()
                .eq('shop_id', sid)
                .eq('name', trimmed)
                .eq('parent', parentName)
                .eq('level', 2);
            if (deleteByParentName.error && extractMissingColumnName(deleteByParentName.error) === 'parent') {
                const parentId = cleanText(categoryNameToId[parentName]);
                if (parentId) {
                    await supabase
                        .from('categories')
                        .delete()
                        .eq('shop_id', sid)
                        .eq('name', trimmed)
                        .eq('parent_id', parentId)
                        .eq('level', 2);
                }
            }
        }
    }, [activeShopId, categoryNameToId]);

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
