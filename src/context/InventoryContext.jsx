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
const CATEGORY_SCOPE_EXPENSE = 'expense';
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
    const isMissing = message.includes('does not exist')
        || message.includes('could not find the table')
        || message.includes('in the schema cache');
    if (!isMissing) return false;
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
    const txnId = cleanText(txn?.id || txn?.transaction_id || txn?.transactionId)
        || String(txn?.id ?? txn?.transaction_id ?? txn?.transactionId ?? '');
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

    const transactionId = cleanText(txn?.transactionId || txn?.transaction_id || txn?.id || txn?.order_id) || txnId;
    const normalizedDesc = cleanText(txn?.desc || txn?.description || txn?.name || '');
    const normalizedCategory = cleanText(txn?.category || txn?.category_name || '');
    const normalizedPaymentMethod = cleanText(txn?.paymentMethod || txn?.payment_method || txn?.payment || '');
    const normalizedInvoiceNumber = cleanText(txn?.invoice_number || txn?.invoiceNumber);

    const rawType = cleanText(txn?.tx_type || txn?.type || 'product_sale');
    const normalizedLegacyType = (() => {
        const lower = rawType.toLowerCase();
        if (!lower) return 'income';
        if (lower === 'income' || lower === 'product_sale' || lower === 'sale' || lower === 'repair_amount') return 'income';
        if (lower === 'expense' || lower === 'shop_expense' || lower === 'product_purchase' || lower === 'product_expense' || lower === 'purchase' || lower === 'adjustment_amount' || lower === 'adjustment') return 'expense';
        return lower.includes('expense') || lower.includes('purchase') ? 'expense' : 'income';
    })();

    return {
        ...txn,
        id: txnId || txn?.id,
        transactionId,
        desc: normalizedDesc,
        description: normalizedDesc,
        category: normalizedCategory || txn?.category || '',
        type: normalizedLegacyType,
        tx_type: rawType || 'product_sale',
        source: cleanText(txn?.source || txn?.tx_source || 'cash'),
        tx_source: cleanText(txn?.tx_source || txn?.source || 'cash'),
        occurred_at: resolvedTimestamp || cleanText(txn?.created_at),
        created_at: resolvedTimestamp || cleanText(txn?.created_at),
        updated_at: cleanText(txn?.updated_at) || resolvedTimestamp || cleanText(txn?.created_at),
        timestamp: resolvedTimestamp || cleanText(txn?.timestamp) || cleanText(txn?.created_at),
        date: toLegacyDateLabel(resolvedTimestamp, txn?.date),
        time: toLegacyTimeLabel(resolvedTimestamp, txn?.time),
        quantity,
        amount,
        discount_amount: parseFloat(txn?.discount_amount ?? txn?.discount ?? 0) || 0,
        discount: parseFloat(txn?.discount_amount ?? txn?.discount ?? 0) || 0,
        repair_id: cleanText(txn?.repair_id || txn?.repairId) || null,
        is_fixed_expense: Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false),
        isFixedExpense: Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false),
        unitPrice,
        paymentMethod: normalizedPaymentMethod || txn?.paymentMethod || '',
        productId: productId || null,
        workerId: workerId || null,
        invoice_number: normalizedInvoiceNumber,
        invoiceNumber: normalizedInvoiceNumber,
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
    const txId = cleanText(txn?.id || txn?.transactionId || txn?.transaction_id);
    if (!sid || !txId) return null;

    const quantity = Math.max(1, parseInt(txn?.quantity ?? 1, 10) || 1);
    const amount = parseFloat(txn?.amount) || 0;
    const unitPrice = parseFloat(txn?.unitPrice);
    const resolvedUnitPrice = Number.isFinite(unitPrice) ? unitPrice : (quantity > 0 ? amount / quantity : 0);
    const productIdRaw = cleanText(txn?.productId || txn?.product_id);
    const productId = isUuidLike(productIdRaw) ? productIdRaw : null;

    return {
        shop_id: sid,
        transaction_id: txId,
        transactionId: txId,
        product_id: productId,
        qty: quantity,
        unit_price: resolvedUnitPrice,
        line_total: amount,
    };
}

function buildTransactionItemPayloads(txn = {}, shopId = '') {
    const sid = cleanText(shopId);
    const txId = cleanText(txn?.id || txn?.transactionId || txn?.transaction_id);
    if (!sid || !txId) return [];

    const explicitItems = Array.isArray(txn?.transactionItems) ? txn.transactionItems : [];
    if (explicitItems.length > 0) {
        return explicitItems
            .map((item) => {
                const quantity = Math.max(1, parseInt(item?.qty ?? item?.quantity ?? 1, 10) || 1);
                const lineTotal = parseFloat(item?.line_total ?? item?.lineTotal ?? item?.amount ?? 0) || 0;
                const unitPriceRaw = parseFloat(item?.unit_price ?? item?.unitPrice);
                const unitPrice = Number.isFinite(unitPriceRaw) ? unitPriceRaw : (quantity > 0 ? lineTotal / quantity : 0);
                const productIdRaw = cleanText(item?.product_id || item?.productId);
                const productId = isUuidLike(productIdRaw) ? productIdRaw : '';
                if (!productId) return null;
                return {
                    shop_id: sid,
                    transaction_id: txId,
                    transactionId: txId,
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

function normalizeCategoryNameForMatch(value) {
    return cleanText(value).replace(/\s+/g, ' ').toLowerCase();
}

function isDataImageUri(value) {
    return /^data:image\//i.test(cleanText(value));
}

function normalizeCategoryScope(scope) {
    const raw = String(scope || '').trim().toLowerCase();
    if (raw === CATEGORY_SCOPE_EXPENSE || raw === 'revenue' || raw === 'purchase') return CATEGORY_SCOPE_EXPENSE;
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
    if (record.category_purpose) return normalizeCategoryScope(record.category_purpose);
    if (record.scope) return normalizeCategoryScope(record.scope);

    const hasParent = Boolean(cleanText(record.parent) || cleanText(record.parent_id || record.parent_category_id));
    const level = Number(record.level) || (hasParent ? 2 : 1);
    const key = categoryScopeKey(level, record.name || record.category_name, record.parent || '');
    if (scopeMap && scopeMap[key]) return normalizeCategoryScope(scopeMap[key]);

    return CATEGORY_SCOPE_SALES;
}

function withCategoryScope(record, scopeMap = null) {
    if (!record || typeof record !== 'object') return record;
    const scope = resolveCategoryScopeRecord(record, scopeMap);
    return { ...record, scope, category_purpose: scope };
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

function normalizeCategoryRecord(row = {}, categoryById = {}) {
    const id = cleanText(row?.category_id || row?.id);
    const name = cleanText(row?.category_name || row?.name);
    const parentId = cleanText(row?.parent_category_id || row?.parent_id);
    const parentName = parentId
        ? cleanText(categoryById?.[parentId]?.category_name || categoryById?.[parentId]?.name)
        : cleanText(row?.parent);
    const level = parentId || parentName ? 2 : 1;

    return {
        ...row,
        id,
        category_id: id,
        name,
        category_name: name,
        category_purpose: normalizeCategoryScope(row?.category_purpose || row?.scope),
        parent_id: parentId || null,
        parent_category_id: parentId || null,
        parent: parentName || '',
        level,
    };
}

function mapTxType(value, source = '') {
    const raw = cleanText(value).toLowerCase();
    const sourceRaw = cleanText(source).toLowerCase();
    if (!raw) {
        if (sourceRaw === 'purchase') return 'product_expense';
        if (sourceRaw === 'repair' || sourceRaw.startsWith('repair-') || sourceRaw.startsWith('repair_')) return 'repair_amount';
        if (sourceRaw === 'expense') return 'product_expense';
        return 'product_sale';
    }
    if (sourceRaw === 'purchase' && (raw === 'expense' || raw === 'purchase')) return 'product_expense';
    if ((sourceRaw === 'repair' || sourceRaw.startsWith('repair-') || sourceRaw.startsWith('repair_'))
        && (raw === 'income' || raw === 'repair' || raw === 'sale')) return 'repair_amount';
    if (raw === 'income' || raw === 'product_sale' || raw === 'sale') return 'product_sale';
    if (raw === 'shop_expense' || raw === 'expense') return 'product_expense';
    if (raw === 'product_expense' || raw === 'product_purchase' || raw === 'purchase') return 'product_expense';
    if (raw === 'repair_amount' || raw === 'repair') return 'repair_amount';
    if (raw === 'adjustment_amount' || raw === 'adjustment') return 'adjustment_amount';
    return 'product_sale';
}

function mapTxSource(value) {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return 'cash';
    if (raw === 'sum_up' || raw === 'sumup') return 'sum_up';
    return raw;
}

function generateInvoiceNumber(seedTimestamp = '', shopId = '') {
    const parsed = seedTimestamp ? new Date(seedTimestamp) : new Date();
    const dateObj = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    void shopId;
    const pad2 = (value) => String(value).padStart(2, '0');
    const y = String(dateObj.getFullYear()).slice(-2);
    const m = pad2(dateObj.getMonth() + 1);
    const d = pad2(dateObj.getDate());
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return `INV-${y}${m}${d}-${rand}`;
}

function extractTransactionReferenceKey(notes = '') {
    const normalized = cleanText(notes).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const referenceMatch = normalized.match(/(repairref|onlineorderref):\s*[^|]+/i);
    if (!referenceMatch || !referenceMatch[0]) return '';
    const referenceToken = referenceMatch[0].replace(/\s+/g, '');

    const stageMatch = normalized.match(/stage:\s*([a-z_]+)/i);
    const stageToken = stageMatch && stageMatch[1]
        ? `|stage:${String(stageMatch[1]).toLowerCase()}`
        : '';
    return `${referenceToken}${stageToken}`;
}

function isUuidLike(value) {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw);
}

function buildInventoryPayload(product, includeId = false, shopId = '', categoryNameToId = {}) {
    const categoryHierarchy = buildCategoryHierarchy(product?.category, product?.categoryPath, product?.attributes);
    const level1Category = extractLevel1CategoryName(categoryHierarchy.level1 || product?.category);
    const resolvedCategoryIdFromMap = level1Category && categoryNameToId && typeof categoryNameToId === 'object'
        ? cleanText(categoryNameToId[level1Category])
        : '';
    const resolvedCategoryIdRaw = cleanText(product?.category_id || product?.categoryId || resolvedCategoryIdFromMap);
    const resolvedCategoryId = isUuidLike(resolvedCategoryIdRaw) ? resolvedCategoryIdRaw : '';
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

    void includeId;

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

function clearTransactionSnapshotsCache() {
    inMemoryTransactionSnapshots = {};
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.removeItem(TRANSACTION_SNAPSHOT_STORAGE_KEY);
        } catch {
            // Ignore local cache clear failures.
        }
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
    const resolvedTimestamp = resolveTransactionTimestamp(txn)
        || parseTimestampCandidate(snapshot?.created_at)
        || parseTimestampCandidate(snapshot?.snapshotTimestamp)
        || '';

    return {
        ...txn,
        timestamp: resolvedTimestamp || cleanText(txn?.timestamp),
        occurred_at: resolvedTimestamp || cleanText(txn?.created_at),
        created_at: resolvedTimestamp || cleanText(txn?.created_at),
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
    void includeId;
    const occurredAt = resolveTransactionTimestamp(txn) || new Date().toISOString();
    const workerId = cleanText(txn?.workerId || txn?.worker_id);
    const quantity = parseInt(txn?.quantity || 1, 10) || 1;
    const amount = parseFloat(txn?.amount || 0) || 0;
    const discountAmount = parseFloat(txn?.discount_amount ?? txn?.discount ?? 0) || 0;
    const isFixedExpense = Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false);
    const repairIdRaw = cleanText(txn?.repair_id || txn?.repairId);
    const productIdRaw = cleanText(txn?.product_id || txn?.productId);
    const repairId = isUuidLike(repairIdRaw) ? repairIdRaw : null;
    const productId = isUuidLike(productIdRaw) ? productIdRaw : null;
    const mappedSource = mapTxSource(txn?.source || txn?.tx_source);
    const mappedType = mapTxType(txn?.tx_type || txn?.type, mappedSource);
    const invoiceNumber = cleanText(txn?.invoice_number || txn?.invoiceNumber);
    const description = cleanText(txn?.desc || txn?.description || txn?.name);
    const category = cleanText(txn?.category || txn?.category_name);
    const paymentMethod = cleanText(txn?.paymentMethod || txn?.payment_method || txn?.payment);

    const payload = withShopId({
        tx_type: mappedType,
        type: mappedType,
        description,
        desc: description,
        amount,
        notes: txn?.notes || '',
        source: mappedSource,
        tx_source: mappedSource,
        quantity,
        created_at: occurredAt,
        updated_at: occurredAt,
        is_fixed_expense: isFixedExpense,
        discount_amount: discountAmount,
        repair_id: repairId,
        product_id: productId,
        invoice_number: invoiceNumber || null,
        category: category || null,
        payment_method: paymentMethod || null,
        paymentMethod: paymentMethod || null,
        created_by: isUuidLike(workerId) ? workerId : null,
    }, shopId);

    return payload;
}

function isEnumError(error = null, fieldName = '') {
    const message = cleanText(error?.message || error || '').toLowerCase();
    if (!message.includes('invalid input value for enum')) return false;
    if (!fieldName) return true;
    return message.includes(String(fieldName).toLowerCase());
}

function isUuidSyntaxError(error = null, fieldName = '') {
    const message = cleanText(error?.message || error || '').toLowerCase();
    if (!message.includes('invalid input syntax for type uuid')) return false;
    if (!fieldName) return true;
    return message.includes(String(fieldName).toLowerCase()) || message.includes('uuid');
}

function isMissingColumnError(error = null) {
    const message = cleanText(error?.message || error || '').toLowerCase();
    if (!message.includes('column')) return false;
    return message.includes('does not exist')
        || message.includes('schema cache')
        || message.includes('could not find');
}

async function executeByColumnCandidates(operation, columns = []) {
    const candidateColumns = Array.isArray(columns)
        ? Array.from(new Set(columns.map((value) => cleanText(value)).filter(Boolean)))
        : [];
    let lastError = null;

    for (const column of candidateColumns) {
        const result = await operation(column);
        if (!result?.error) return { ...result, column };
        lastError = result.error;
        if (isUuidSyntaxError(result.error, column)) continue;
        if (isMissingColumnError(result.error)) continue;
        return { ...result, column };
    }

    return {
        data: null,
        error: lastError || { message: 'Unable to match transaction column.' },
        column: '',
    };
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
        created_at: occurredAt,
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
    const { activeShopId, salesmen, user } = useAuth();

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
    const transactionsRef = useRef(transactions);
    const pendingTransactionDedupeRef = useRef(new Set());
    const addTransactionRef = useRef(null);
    useEffect(() => {
        workerLookupRef.current = workerLookup;
    }, [workerLookup]);
    useEffect(() => {
        transactionsRef.current = Array.isArray(transactions) ? transactions : [];
    }, [transactions]);
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

    const resolveShopIdCandidates = useCallback(async (shopRef = '') => {
        const base = cleanText(shopRef);
        const seen = new Set();
        const candidates = [];
        const push = (value) => {
            const normalized = cleanText(value);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            candidates.push(normalized);
        };

        push(base);
        if (!base) return candidates;

        const attempts = [
            { column: 'shop_id', value: base },
            { column: 'id', value: base },
        ];

        for (const attempt of attempts) {
            const result = await supabase
                .from('shops')
                .select('*')
                .eq(attempt.column, attempt.value)
                .limit(1);

            if (result.error) {
                const message = cleanText(result.error?.message).toLowerCase();
                if (isUuidSyntaxError(result.error, attempt.column)) continue;
                if (message.includes('column') && (message.includes('does not exist') || message.includes('schema cache') || message.includes('could not find'))) {
                    continue;
                }
                continue;
            }

            const row = Array.isArray(result.data) ? result.data[0] : null;
            if (!row) continue;
            push(row?.shop_id);
            push(row?.id);
        }

        return candidates;
    }, []);

    const selectRowsByShopCandidates = useCallback(async (tableName, buildQuery, shopCandidates = []) => {
        const candidates = Array.isArray(shopCandidates)
            ? Array.from(new Set(shopCandidates.map((value) => cleanText(value)).filter(Boolean)))
            : [];

        if (!candidates.length) {
            return { data: [], error: { message: 'No shop filter candidate found.' } };
        }

        let firstEmptySuccess = null;
        let lastError = null;

        for (const candidate of candidates) {
            let query = supabase.from(tableName);
            query = typeof buildQuery === 'function' ? buildQuery(query) : query.select('*');
            const result = await query.eq('shop_id', candidate);

            if (!result.error) {
                if (Array.isArray(result.data) && result.data.length > 0) return result;
                if (!firstEmptySuccess) firstEmptySuccess = result;
                continue;
            }

            lastError = result.error;
            if (isUuidSyntaxError(result.error, 'shop_id')) continue;
            const message = cleanText(result.error?.message).toLowerCase();
            if (message.includes('invalid input syntax for type uuid')) continue;
            return result;
        }

        if (firstEmptySuccess) return firstEmptySuccess;
        if (lastError) return { data: null, error: lastError };
        return { data: [], error: null };
    }, []);

    const ensureActiveShopExists = useCallback(async (sid) => {
        const safeShopId = cleanText(sid);
        if (!safeShopId) {
            throw new Error('No active shop selected. Please select a shop first.');
        }

        const candidates = await resolveShopIdCandidates(safeShopId);
        let lastError = null;

        for (const candidate of candidates) {
            const checks = [
                { column: 'shop_id', value: candidate },
                { column: 'id', value: candidate },
            ];

            for (const check of checks) {
                const result = await supabase
                    .from('shops')
                    .select('*')
                    .eq(check.column, check.value)
                    .limit(1);

                if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
                    return safeShopId;
                }

                if (result.error) {
                    lastError = result.error;
                    const message = cleanText(result.error?.message).toLowerCase();
                    if (isUuidSyntaxError(result.error, check.column)) continue;
                    if (message.includes('column') && (message.includes('does not exist') || message.includes('schema cache') || message.includes('could not find'))) {
                        continue;
                    }
                }
            }
        }

        if (lastError) {
            throw new Error(lastError.message || 'Unable to verify selected shop.');
        }

        throw new Error('Selected shop is invalid or outdated. Please refresh and select a valid shop.');
    }, [resolveShopIdCandidates]);

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
            const shopCandidates = await resolveShopIdCandidates(sid);
            const filterCandidates = shopCandidates.length > 0 ? shopCandidates : [sid];
            const [invResult, txnResult, catResult, itemResult, profileResult] = await Promise.all([
                selectRowsByShopCandidates('inventory', (query) => query.select('*'), filterCandidates),
                selectRowsByShopCandidates('transactions', (query) => query.select('*'), filterCandidates),
                selectRowsByShopCandidates('categories', (query) => query.select('*').in('category_purpose', [CATEGORY_SCOPE_SALES, CATEGORY_SCOPE_EXPENSE]), filterCandidates),
                selectRowsByShopCandidates('transaction_items', (query) => query.select('*'), filterCandidates),
                selectRowsByShopCandidates('profiles', (query) => query.select('user_id,full_name'), filterCandidates),
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
                const normalizedCategories = categoryRows.map((row) => normalizeCategoryRecord(row, categoryLookups.byId));
                const l1 = normalizedCategories.filter(c => Number(c.level) === 1) || [];
                const l2 = normalizedCategories.filter(c => Number(c.level) === 2) || [];
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
                const newCat = withCategoryScope(normalizeCategoryRecord(payload.new, categoryLookupsRef.current.byId), readCategoryScopeMap(sid));
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
                const updated = withCategoryScope(normalizeCategoryRecord(payload.new, categoryLookupsRef.current.byId), readCategoryScopeMap(sid));
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
                const deleted = normalizeCategoryRecord(payload.old, categoryLookupsRef.current.byId);
                const deletedId = deleted.id;
                if (deleted?.level === 1) {
                    removeCategoryScopeBranch(sid, deleted?.name || '');
                } else if (deleted?.level === 2) {
                    removeCategoryScopeEntry(sid, 2, deleted?.name || '', deleted?.parent || '');
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

    const ensureExpenseCategoriesForInventoryProduct = useCallback(async (shopId, product = {}) => {
        const sid = cleanText(shopId);
        if (!sid) return { level1Name: '', level1Id: '', level2Name: '' };

        const categoryHierarchy = buildCategoryHierarchy(product?.category, product?.categoryPath, product?.attributes);
        const level1Name = cleanText(extractLevel1CategoryName(categoryHierarchy.level1 || product?.category)).replace(/\s+/g, ' ');
        const level2Name = cleanText(categoryHierarchy.level2).replace(/\s+/g, ' ');
        if (!level1Name) return { level1Name: '', level1Id: '', level2Name: '' };

        const normalizedScope = CATEGORY_SCOPE_EXPENSE;
        let level1Id = '';

        const parentSelect = await supabase
            .from('categories')
            .select('category_id,id,category_name')
            .eq('shop_id', sid)
            .ilike('category_name', level1Name)
            .eq('category_purpose', normalizedScope)
            .is('parent_category_id', null)
            .limit(20);

        if (!parentSelect.error && Array.isArray(parentSelect.data)) {
            const matchedParent = parentSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(level1Name));
            level1Id = cleanText(matchedParent?.category_id || matchedParent?.id);
        }

        if (!level1Id) {
            const insertParentResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('categories').insert([candidate]),
                {
                    category_name: level1Name,
                    parent_category_id: null,
                    category_purpose: normalizedScope,
                    shop_id: sid,
                }
            );

            if (insertParentResult.error) {
                const fallbackParent = await supabase
                    .from('categories')
                    .select('category_id,id,category_name')
                    .eq('shop_id', sid)
                    .ilike('category_name', level1Name)
                    .eq('category_purpose', normalizedScope)
                    .is('parent_category_id', null)
                    .limit(20);

                if (!fallbackParent.error && Array.isArray(fallbackParent.data)) {
                    const matchedParent = fallbackParent.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(level1Name));
                    level1Id = cleanText(matchedParent?.category_id || matchedParent?.id);
                } else {
                    throw new Error(insertParentResult.error.message || 'Failed to save expense category.');
                }
            } else {
                const refreshedParent = await supabase
                    .from('categories')
                    .select('category_id,id,category_name')
                    .eq('shop_id', sid)
                    .ilike('category_name', level1Name)
                    .eq('category_purpose', normalizedScope)
                    .is('parent_category_id', null)
                    .limit(20);
                if (!refreshedParent.error && Array.isArray(refreshedParent.data)) {
                    const matchedParent = refreshedParent.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(level1Name));
                    level1Id = cleanText(matchedParent?.category_id || matchedParent?.id);
                }
            }
        }

        setL1Categories((prev) => {
            const existingLocal = (prev || []).find((c) => normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) === normalizeCategoryNameForMatch(level1Name));
            if (existingLocal) {
                return prev.map((c) => {
                    if (normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) !== normalizeCategoryNameForMatch(level1Name)) return c;
                    if (typeof c === 'object') {
                        return {
                            ...c,
                            id: c.id || level1Id || undefined,
                            name: level1Name,
                            scope: normalizedScope,
                        };
                    }
                    return { id: level1Id || undefined, name: level1Name, scope: normalizedScope };
                });
            }
            return [...prev, { id: level1Id || undefined, name: level1Name, scope: normalizedScope }];
        });
        setCategoryScopeEntry(sid, 1, level1Name, '', normalizedScope);

        if (level1Id && level2Name) {
            const childSelect = await supabase
                .from('categories')
                .select('category_id,id,category_name')
                .eq('shop_id', sid)
                .ilike('category_name', level2Name)
                .eq('category_purpose', normalizedScope)
                .eq('parent_category_id', level1Id)
                .limit(20);

            const matchedChild = !childSelect.error && Array.isArray(childSelect.data)
                ? childSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(level2Name))
                : null;

            if (childSelect.error || !matchedChild) {
                const insertChildResult = await executeWithPrunedColumns(
                    (candidate) => supabase.from('categories').insert([candidate]),
                    {
                        category_name: level2Name,
                        parent_category_id: level1Id,
                        category_purpose: normalizedScope,
                        shop_id: sid,
                    }
                );
                if (insertChildResult.error) {
                    const fallbackChild = await supabase
                        .from('categories')
                        .select('category_id,id,category_name')
                        .eq('shop_id', sid)
                        .ilike('category_name', level2Name)
                        .eq('category_purpose', normalizedScope)
                        .eq('parent_category_id', level1Id)
                        .limit(20);
                    const matchedFallbackChild = !fallbackChild.error && Array.isArray(fallbackChild.data)
                        ? fallbackChild.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(level2Name))
                        : null;
                    if (fallbackChild.error || !matchedFallbackChild) {
                        throw new Error(insertChildResult.error.message || 'Failed to save expense sub-category.');
                    }
                }
            }

            setL2Map((prev) => {
                const currentList = prev[level1Name] || [];
                const existingLocal = currentList.find((c) => normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) === normalizeCategoryNameForMatch(level2Name));
                if (existingLocal) {
                    return {
                        ...prev,
                        [level1Name]: currentList.map((c) => {
                            if (normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) !== normalizeCategoryNameForMatch(level2Name)) return c;
                            if (typeof c === 'object') {
                                return {
                                    ...c,
                                    name: level2Name,
                                    parent: level1Name,
                                    parent_id: c.parent_id || level1Id || null,
                                    parent_category_id: c.parent_category_id || level1Id || null,
                                    scope: normalizedScope,
                                };
                            }
                            return { name: level2Name, parent: level1Name, parent_id: level1Id || null, scope: normalizedScope };
                        }),
                    };
                }

                return {
                    ...prev,
                    [level1Name]: [
                        ...currentList,
                        { name: level2Name, parent: level1Name, parent_id: level1Id || null, parent_category_id: level1Id || null, scope: normalizedScope }
                    ],
                };
            });
            setCategoryScopeEntry(sid, 2, level2Name, level1Name, normalizedScope);
        }

        return { level1Name, level1Id, level2Name };
    }, []);

    const addProduct = useCallback(async (product) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const createInput = product && typeof product === 'object' ? { ...product } : {};
        delete createInput.id;
        delete createInput.product_id;
        delete createInput.productId;

        const entry = buildProductJSON(createInput);
        const optimisticId = cleanText(entry.id) || `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        entry.id = optimisticId;
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

        let ensuredExpenseCategory = { level1Name: '', level1Id: '', level2Name: '' };
        try {
            ensuredExpenseCategory = await ensureExpenseCategoriesForInventoryProduct(sid, entry);
        } catch (categoryError) {
            console.error('Failed to auto-create expense category for inventory add:', categoryError);
        }

        // Optimistic UI Update
        setProducts(prev => {
            if (prev.find(p => String(p.id) === entry.id)) return prev;
            return [entry, ...prev];
        });

        const payloadCategoryMap = {
            ...(categoryNameToId || {}),
            ...(ensuredExpenseCategory.level1Name && ensuredExpenseCategory.level1Id
                ? { [ensuredExpenseCategory.level1Name]: ensuredExpenseCategory.level1Id }
                : {}),
        };
        const payload = buildInventoryPayload(entry, false, sid, payloadCategoryMap);
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
            insertResult.data
                ? { ...entry, ...insertResult.data, id: String(insertResult.data.product_id || insertResult.data.id || entry.id) }
                : entry
        );
        setProducts(prev => prev.map(p => String(p.id) === entry.id ? savedEntry : p));

        supabase.channel(`public:unified_sync:${sid}`).send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'INSERT', data: { ...savedEntry, shop_id: sid } }
        }).catch(e => console.error(e));

        const qty = Math.max(0, parseInt(savedEntry?.stock ?? entry?.stock ?? 0, 10) || 0);
        const unitCost = parseFloat(savedEntry?.purchasePrice ?? entry?.purchasePrice ?? entry?.costPrice ?? 0) || 0;
        if (qty > 0 && unitCost > 0 && typeof addTransactionRef.current === 'function') {
            const now = new Date();
            const resolvedCategory = extractLevel1CategoryName(savedEntry?.category || entry?.category) || 'Purchase';
            const resolvedSubCategory = cleanText(
                (savedEntry?.category && typeof savedEntry.category === 'object' ? savedEntry.category.level2 : '')
                || (entry?.category && typeof entry.category === 'object' ? entry.category.level2 : '')
            );
            const purchaseName = cleanText(savedEntry?.name || entry?.name || 'Inventory Item') || 'Inventory Item';

            try {
                await addTransactionRef.current({
                    desc: `Purchase - ${purchaseName}`,
                    amount: qty * unitCost,
                    quantity: qty,
                    type: 'expense',
                    category: resolvedCategory,
                    paymentMethod: cleanText(savedEntry?.paymentMode || entry?.paymentMode || 'Cash') || 'Cash',
                    notes: resolvedSubCategory ? `SubCategory: ${resolvedSubCategory}` : '',
                    source: 'purchase',
                    salesmanName: cleanText(user?.name),
                    salesmanNumber: Number(user?.salesmanNumber || 0) || 0,
                    workerId: cleanText(user?.id),
                    productId: savedEntry?.id || entry?.id || undefined,
                    purchasePriceAtTime: unitCost,
                    productSnapshot: {
                        id: savedEntry?.id || entry?.id || '',
                        name: purchaseName,
                        category: savedEntry?.category || entry?.category || null,
                        subCategory: resolvedSubCategory,
                        purchasePrice: unitCost,
                        sellingPrice: parseFloat(savedEntry?.sellingPrice ?? entry?.sellingPrice ?? 0) || 0,
                        purchaseFrom: cleanText(savedEntry?.purchaseFrom || entry?.purchaseFrom),
                        barcode: cleanText(savedEntry?.barcode || entry?.barcode),
                    },
                    timestamp: now.toISOString(),
                    date: now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                    time: now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                });
            } catch (txnError) {
                console.error('Failed to create purchase transaction for inventory add:', txnError);
            }
        }

        return savedEntry;
    }, [activeShopId, categoryNameToId, ensureExpenseCategoriesForInventoryProduct, user]);

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

        const txId = cleanText(txn?.id || txn?.transactionId || txn?.transaction_id);
        if (!txId) return;

        const payloads = buildTransactionItemPayloads(txn, sid);

        const deleteResult = await executeByColumnCandidates(
            (column) => supabase
                .from('transaction_items')
                .delete()
                .eq('shop_id', sid)
                .eq(column, txId),
            ['transaction_id', 'transactionId']
        );

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
        const resolvedTimestamp = resolveTransactionTimestamp(txn) || new Date().toISOString();
        const providedInvoiceNumber = cleanText(txn?.invoice_number || txn?.invoiceNumber);
        const ensuredInvoiceNumber = providedInvoiceNumber || generateInvoiceNumber(resolvedTimestamp, sid);
        const txnWithInvoice = {
            ...(txn || {}),
            timestamp: cleanText(txn?.timestamp) || resolvedTimestamp,
            invoice_number: ensuredInvoiceNumber,
            invoiceNumber: ensuredInvoiceNumber,
        };

        const incomingTxnId = cleanText(txnWithInvoice?.id || txnWithInvoice?.transactionId || txnWithInvoice?.transaction_id);
        const incomingReferenceKey = extractTransactionReferenceKey(txnWithInvoice?.notes);
        const activeRows = Array.isArray(transactionsRef.current) ? transactionsRef.current : [];
        const isDuplicateCandidate = (row = {}) => {
            if (incomingTxnId) {
                const rowIds = [
                    cleanText(row?.id),
                    cleanText(row?.transactionId),
                    cleanText(row?.transaction_id),
                ];
                if (rowIds.includes(incomingTxnId)) return true;
            }
            if (incomingReferenceKey) {
                return extractTransactionReferenceKey(row?.notes) === incomingReferenceKey;
            }
            return false;
        };
        const matchedExisting = activeRows.find((row) => isDuplicateCandidate(row));

        if (matchedExisting) {
            return matchedExisting;
        }

        const dedupeKeys = [];
        if (incomingTxnId) dedupeKeys.push(`id:${incomingTxnId}`);
        if (incomingReferenceKey) dedupeKeys.push(`ref:${incomingReferenceKey}`);

        const duplicateInFlight = dedupeKeys.some((key) => pendingTransactionDedupeRef.current.has(key));
        if (duplicateInFlight) {
            const inFlightMatch = (Array.isArray(transactionsRef.current) ? transactionsRef.current : []).find((row) => isDuplicateCandidate(row));
            if (inFlightMatch) return inFlightMatch;
            const syntheticId = incomingTxnId || `dup-${Date.now()}`;
            return normalizeTransactionRecord(
                { ...txnWithInvoice, id: syntheticId, transactionId: syntheticId, shop_id: sid },
                { workersById: workerLookup }
            );
        }
        dedupeKeys.forEach((key) => pendingTransactionDedupeRef.current.add(key));

        const optimisticTxnId = incomingTxnId || (
            typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `txn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        );
        try {
            const formattedTxn = buildTransactionDBPayload(txnWithInvoice, false, sid);
            const normalizedTxn = normalizeTransactionRecord(
                {
                    ...txnWithInvoice,
                    ...formattedTxn,
                    id: optimisticTxnId,
                    transactionId: optimisticTxnId,
                    invoice_number: ensuredInvoiceNumber || cleanText(formattedTxn?.invoice_number),
                },
                { workersById: workerLookup }
            );
            const snapshot = buildTransactionSnapshot({ ...txnWithInvoice, ...normalizedTxn });
            saveTransactionSnapshot(optimisticTxnId, snapshot);
            const hydratedTxn = mergeTransactionWithSnapshot(normalizedTxn, { [optimisticTxnId]: snapshot });

            setTransactions(prev => {
                if (prev.some(t => String(t.id) === String(hydratedTxn.id))) return prev;
                return [hydratedTxn, ...prev];
            });

            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('transactions').insert([candidate]).select('*').maybeSingle(),
                formattedTxn
            );

            let writePayload = formattedTxn;
            let finalWriteResult = insertResult;

            if (insertResult.error) {
                const normalizedSource = ['cash', 'sum_up'].includes(cleanText(formattedTxn?.source || formattedTxn?.tx_source || '').toLowerCase())
                    ? cleanText(formattedTxn?.source || formattedTxn?.tx_source || '').toLowerCase()
                    : 'cash';
                const fallbackType = mapTxType(
                    formattedTxn?.tx_type || formattedTxn?.type || txnWithInvoice?.tx_type || txnWithInvoice?.type,
                    txnWithInvoice?.source || txnWithInvoice?.tx_source || formattedTxn?.source || formattedTxn?.tx_source
                );
                const fallbackPayload = {
                    ...formattedTxn,
                    tx_type: fallbackType || 'product_sale',
                    type: fallbackType || 'product_sale',
                    source: normalizedSource,
                    tx_source: normalizedSource,
                };

                if (isUuidSyntaxError(insertResult.error, 'product_id')) fallbackPayload.product_id = null;
                if (isUuidSyntaxError(insertResult.error, 'repair_id')) fallbackPayload.repair_id = null;
                if (isUuidSyntaxError(insertResult.error, 'created_by')) fallbackPayload.created_by = null;
                if (isEnumError(insertResult.error, 'tx_type') || isEnumError(insertResult.error, 'type')) {
                    const fallbackLegacyType = String(txnWithInvoice?.type || '').toLowerCase();
                    const shouldBeExpense = fallbackLegacyType === 'expense'
                        || String(txnWithInvoice?.source || '').toLowerCase() === 'purchase';
                    fallbackPayload.tx_type = shouldBeExpense ? 'product_expense' : 'product_sale';
                    fallbackPayload.type = shouldBeExpense ? 'product_expense' : 'product_sale';
                }
                if (isEnumError(insertResult.error, 'source') || isEnumError(insertResult.error, 'tx_source')) {
                    fallbackPayload.source = 'cash';
                    fallbackPayload.tx_source = 'cash';
                }

                const retryResult = await executeWithPrunedColumns(
                    (candidate) => supabase.from('transactions').insert([candidate]).select('*').maybeSingle(),
                    fallbackPayload
                );

                if (retryResult.error) {
                    setTransactions(prev => prev.filter(t => String(t.id) !== String(optimisticTxnId)));
                    removeTransactionSnapshot(optimisticTxnId);
                    throw new Error(retryResult.error?.message || insertResult.error.message || 'Failed to save transaction.');
                }

                writePayload = fallbackPayload;
                finalWriteResult = retryResult;
            }

            const insertedRow = finalWriteResult?.data && typeof finalWriteResult.data === 'object'
                ? finalWriteResult.data
                : {};
            const persistedTxnId = cleanText(insertedRow?.id || insertedRow?.transaction_id || insertedRow?.transactionId) || optimisticTxnId;
            const persistedTxn = normalizeTransactionRecord(
                {
                    ...txnWithInvoice,
                    ...writePayload,
                    ...insertedRow,
                    id: persistedTxnId,
                    transactionId: persistedTxnId,
                    source: cleanText(insertedRow?.source || insertedRow?.tx_source || writePayload?.source || writePayload?.tx_source || txnWithInvoice?.source || 'cash'),
                    invoice_number: cleanText(insertedRow?.invoice_number || txnWithInvoice?.invoice_number || txnWithInvoice?.invoiceNumber || writePayload?.invoice_number || ensuredInvoiceNumber),
                },
                { workersById: workerLookup }
            );
            const persistedSnapshot = buildTransactionSnapshot({
                ...txnWithInvoice,
                ...persistedTxn,
                transactionItems: hydratedTxn?.transactionItems || txnWithInvoice?.transactionItems || [],
            });

            saveTransactionSnapshot(persistedTxnId, persistedSnapshot);
            if (persistedTxnId !== optimisticTxnId) {
                removeTransactionSnapshot(optimisticTxnId);
            }

            const hydratedPersistedTxn = mergeTransactionWithSnapshot(persistedTxn, { [persistedTxnId]: persistedSnapshot });
            setTransactions(prev => [
                hydratedPersistedTxn,
                ...prev.filter((t) => {
                    const rowId = String(t.id || '');
                    return rowId !== String(optimisticTxnId) && rowId !== String(persistedTxnId);
                }),
            ]);

            supabase.channel(`public:unified_sync:${sid}`).send({
                type: 'broadcast',
                event: 'transaction_sync',
                payload: { action: 'INSERT', data: { ...hydratedPersistedTxn, shop_id: sid } }
            }).catch(e => console.error(e));

            try {
                await syncTransactionItems(
                    {
                        ...txnWithInvoice,
                        ...hydratedPersistedTxn,
                        id: persistedTxnId,
                        transactionId: persistedTxnId,
                    },
                    sid
                );
            } catch (itemError) {
                console.error(itemError);
            }

            return hydratedPersistedTxn;
        } finally {
            dedupeKeys.forEach((key) => pendingTransactionDedupeRef.current.delete(key));
        }
    }, [activeShopId, workerLookup, syncTransactionItems]);

    addTransactionRef.current = addTransaction;

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
            (candidate) => executeByColumnCandidates(
                (column) => supabase.from('transactions').update(candidate).eq(column, strId).eq('shop_id', sid),
                ['id', 'transaction_id', 'transactionId']
            ),
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
        const itemDeleteResult = await executeByColumnCandidates(
            (column) => supabase
                .from('transaction_items')
                .delete()
                .eq('shop_id', sid)
                .eq(column, strId),
            ['transaction_id', 'transactionId']
        );
        if (itemDeleteResult.error && !isMissingRelationError(itemDeleteResult.error, 'transaction_items')) {
            throw new Error(itemDeleteResult.error.message || 'Failed to remove linked transaction items.');
        }

        const deleteResult = await executeByColumnCandidates(
            (column) => supabase.from('transactions').delete().eq(column, strId).eq('shop_id', sid),
            ['id', 'transaction_id', 'transactionId']
        );
        if (deleteResult.error) {
            throw new Error(deleteResult.error.message || 'Failed to delete transaction.');
        }
    }, [transactions, adjustStock, activeShopId]);

    const clearTransactions = useCallback(async () => {
        setTransactions([]);
        clearTransactionSnapshotsCache();
        pendingTransactionDedupeRef.current.clear();
        // For safety, let's not actually TRUNCATE the cloud DB on UI click unless explicitly defined
        // We will just clear local UI if they hit clear (maybe we shouldn't even support clearing all on cloud).
        console.warn("Clear transactions ignored on Cloud DB for safety.");
    }, []);

    const clearLocalInventoryCache = useCallback(() => {
        clearTransactionSnapshotsCache();
        pendingTransactionDedupeRef.current.clear();
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

        const trimmed = cleanText(name).replace(/\s+/g, ' ');
        if (!trimmed) return;
        const normalizedScope = normalizeCategoryScope(scope);

        // Sync to cloud
        let existing = null;
        let resolvedCategoryId = '';
        const scopedSelect = await supabase
            .from('categories')
            .select('category_id,category_name')
            .eq('shop_id', sid)
            .ilike('category_name', trimmed)
            .eq('category_purpose', normalizedScope)
            .is('parent_category_id', null)
            .limit(20);

        if (!scopedSelect.error) {
            existing = Array.isArray(scopedSelect.data)
                ? (scopedSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(trimmed)) || null)
                : null;
            resolvedCategoryId = cleanText(existing?.category_id || existing?.id);
        }

        if (existing) {
            resolvedCategoryId = cleanText(existing?.category_id || existing?.id);
        } else {
            const insertPayload = {
                category_name: trimmed,
                parent_category_id: null,
                category_purpose: normalizedScope,
                shop_id: sid,
            };
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('categories').insert([candidate]),
                insertPayload
            );
            const insertError = insertResult.error;
            if (insertError) {
                const fallbackSelect = await supabase
                    .from('categories')
                    .select('category_id,category_name')
                    .eq('shop_id', sid)
                    .ilike('category_name', trimmed)
                    .eq('category_purpose', normalizedScope)
                    .is('parent_category_id', null)
                    .limit(20);
                const fallbackExisting = Array.isArray(fallbackSelect.data)
                    ? (fallbackSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(trimmed)) || null)
                    : null;
                if (fallbackExisting) {
                    resolvedCategoryId = cleanText(fallbackExisting.category_id || fallbackExisting.id);
                } else {
                    throw new Error(insertError.message || 'Failed to save category.');
                }
            }
        }

        setL1Categories(prev => {
            const existingLocal = prev.find(c => normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) === normalizeCategoryNameForMatch(trimmed));
            if (existingLocal) {
                return prev.map((c) => {
                    if (normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) !== normalizeCategoryNameForMatch(trimmed)) return c;
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
        return { categoryId: resolvedCategoryId, name: trimmed, shopId: sid };
    }, [activeShopId, ensureActiveShopExists]);

    const addL2Category = useCallback(async (l1Name, name, image = null, scope = CATEGORY_SCOPE_SALES, parentCategoryIdOverride = '') => {
        const sid = await ensureActiveShopExists(activeShopId);

        const trimmed = cleanText(name).replace(/\s+/g, ' ');
        if (!trimmed || !l1Name) return;
        const normalizedScope = normalizeCategoryScope(scope);
        let parentCategoryId = cleanText(parentCategoryIdOverride) || cleanText(categoryNameToId[l1Name]);
        if (!parentCategoryId) {
            const parentLookup = await supabase
                .from('categories')
                .select('category_id,category_name')
                .eq('shop_id', sid)
                .ilike('category_name', l1Name)
                .eq('category_purpose', normalizedScope)
                .is('parent_category_id', null)
                .limit(20);
            if (!parentLookup.error && Array.isArray(parentLookup.data)) {
                const matchedParent = parentLookup.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(l1Name));
                if (matchedParent) {
                    parentCategoryId = cleanText(matchedParent.category_id || matchedParent.id);
                }
            }
        }
        if (!parentCategoryId) {
            throw new Error('Parent category not found. Please refresh categories and retry.');
        }

        // Sync to cloud
        let existing = null;
        const scopedSelect = await supabase
            .from('categories')
            .select('category_id,category_name')
            .eq('shop_id', sid)
            .ilike('category_name', trimmed)
            .eq('category_purpose', normalizedScope)
            .eq('parent_category_id', parentCategoryId)
            .limit(20);

        if (!scopedSelect.error) {
            existing = Array.isArray(scopedSelect.data)
                ? (scopedSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(trimmed)) || null)
                : null;
        }

        if (existing) {
            // already exists
        } else {
            const insertPayload = {
                category_name: trimmed,
                parent_category_id: parentCategoryId || null,
                category_purpose: normalizedScope,
                shop_id: sid,
            };
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('categories').insert([candidate]),
                insertPayload
            );
            const insertError = insertResult.error;
            if (insertError) {
                let fallbackSelect = await supabase
                    .from('categories')
                    .select('category_id,category_name')
                    .eq('shop_id', sid)
                    .ilike('category_name', trimmed)
                    .eq('category_purpose', normalizedScope)
                    .eq('parent_category_id', parentCategoryId)
                    .limit(20);
                let fallbackExisting = Array.isArray(fallbackSelect.data)
                    ? (fallbackSelect.data.find((row) => normalizeCategoryNameForMatch(row?.category_name) === normalizeCategoryNameForMatch(trimmed)) || null)
                    : null;
                if (fallbackExisting) {
                    // already persisted
                } else {
                    throw new Error(insertError.message || 'Failed to save sub-category.');
                }
            }
        }

        setL2Map(prev => {
            const currentList = prev[l1Name] || [];
            const existingLocal = currentList.find(c => normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) === normalizeCategoryNameForMatch(trimmed));
            if (existingLocal) {
                const updatedList = currentList.map((c) => {
                    if (normalizeCategoryNameForMatch(typeof c === 'object' ? c?.name : c) !== normalizeCategoryNameForMatch(trimmed)) return c;
                    if (typeof c === 'object') {
                        return {
                            ...c,
                            name: trimmed,
                            image: image || c.image || '',
                            parent_id: c.parent_id || parentCategoryId || null,
                            parent_category_id: c.parent_category_id || parentCategoryId || null,
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
        return { parentCategoryId, name: trimmed, shopId: sid };
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

    const deleteCategory = useCallback(async (level, name, parentName = null, scope = CATEGORY_SCOPE_SALES) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;
        const normalizedScope = normalizeCategoryScope(scope);

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
            const parentId = cleanText(categoryNameToId[trimmed]);
            if (parentId) {
                await supabase.from('categories').delete().eq('shop_id', sid).eq('category_id', parentId).eq('category_purpose', normalizedScope);
                await supabase.from('categories').delete().eq('shop_id', sid).eq('parent_category_id', parentId).eq('category_purpose', normalizedScope);
            } else {
                await supabase.from('categories').delete().eq('shop_id', sid).eq('category_name', trimmed).eq('category_purpose', normalizedScope).is('parent_category_id', null);
            }
            // Delete associated L2 categories in DB
            
        } else if (level === 2 && parentName) {
            setL2Map(prev => {
                const currentList = prev[parentName] || [];
                return { ...prev, [parentName]: currentList.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed) };
            });
            removeCategoryScopeEntry(sid, 2, trimmed, parentName);
            const parentId = cleanText(categoryNameToId[parentName]);
            if (!parentId) {
                throw new Error('Parent category not found for deletion.');
            }
            const deleteByParentName = await supabase
                .from('categories')
                .delete()
                .eq('shop_id', sid)
                .eq('category_name', trimmed)
                .eq('category_purpose', normalizedScope)
                .eq('parent_category_id', parentId);
            if (deleteByParentName.error) {
                throw new Error(deleteByParentName.error.message || 'Failed to delete sub-category.');
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
        clearLocalInventoryCache,
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
