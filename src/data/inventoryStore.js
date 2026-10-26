// ══════════════════════════════════════════════════════════
// DailyBooks — Universal Dynamic Inventory Store
// No dummy data. Clean slate for real products.
// ══════════════════════════════════════════════════════════

// ── Live Products (in-memory, starts empty) ──
let products = [];

// ── Categories (DB-first, starts empty) ──
let level1Categories = [];

let level2Map = {};

// ── ID Generator (Universal) ──
export function generateId(prefix = '') {
    const compact = `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 6)}`;
    return prefix ? `${prefix}-${compact}` : compact;
}

// ── CRUD ──
export function addProduct(product) {
    products = [product, ...products];
    return product;
}

export function getProducts() {
    return [...products];
}

export function deleteProduct(id) {
    products = products.filter(p => p.id !== id);
}

export function lookupBarcode(barcode) {
    return products.find(p => p.barcode === barcode) || null;
}

// ── Compatibility Helpers (InventoryManager) ──
export function getAllProducts() {
    return [...products];
}

export function sanitizeBarcode(raw) {
    return String(raw).replace(/[^0-9a-zA-Z]/g, '').trim();
}

export function updateStock(barcode, newStock) {
    const p = products.find(p => p.barcode === barcode);
    if (p) { p.stock = newStock; return p; }
    return null;
}

export function searchProducts(query) {
    if (!query) return getAllProducts();
    const q = query.toLowerCase();
    return products.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.model || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.desc || '').toLowerCase().includes(q)
    );
}

export function getProductStockAlert(product) {
    if (!product) return null;
    const directAlert = (product.stockAlert && typeof product.stockAlert === 'object' ? product.stockAlert : null)
        || (product.stock_alert && typeof product.stock_alert === 'object' ? product.stock_alert : null);
    if (directAlert) return directAlert;

    const raw = product.raw;
    if (raw) {
        const rawAlert = (raw.stockAlert && typeof raw.stockAlert === 'object' ? raw.stockAlert : null)
            || (raw.stock_alert && typeof raw.stock_alert === 'object' ? raw.stock_alert : null);
        if (rawAlert) return rawAlert;
        if (raw.attributes?.stockAlert && typeof raw.attributes.stockAlert === 'object') {
            return raw.attributes.stockAlert;
        }
        if (raw.attributes?.stock_alert && typeof raw.attributes.stock_alert === 'object') {
            return raw.attributes.stock_alert;
        }
    }

    if (product.attributes?.stockAlert && typeof product.attributes.stockAlert === 'object') {
        return product.attributes.stockAlert;
    }
    if (product.attributes?.stock_alert && typeof product.attributes.stock_alert === 'object') {
        return product.attributes.stock_alert;
    }
    return null;
}

export function getProductRedThreshold(product) {
    if (!product) return 2;
    const alertCfg = getProductStockAlert(product);
    const rawVal = alertCfg?.red
        ?? product.stockRed
        ?? product.red
        ?? product.raw?.stockRed
        ?? product.raw?.red
        ?? product.attributes?.stockRed
        ?? product.attributes?.red
        ?? product.raw?.attributes?.stockRed
        ?? product.raw?.attributes?.red;

    const parsed = Number(rawVal);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
    }
    return 2; // Default red threshold (< 3, i.e., <= 2)
}

export function hasProductCustomRed(product) {
    if (!product) return false;
    const alertCfg = getProductStockAlert(product);
    const rawVal = alertCfg?.red
        ?? product.stockRed
        ?? product.red
        ?? product.raw?.stockRed
        ?? product.raw?.red
        ?? product.attributes?.stockRed
        ?? product.attributes?.red
        ?? product.raw?.attributes?.stockRed
        ?? product.raw?.attributes?.red;
    const parsed = Number(rawVal);
    return Number.isFinite(parsed) && parsed > 0;
}

export function isProductInRed(product) {
    if (!product) return false;
    const stockVal = parseFloat(product.stock ?? product.qty ?? product.quantity ?? 0) || 0;
    if (stockVal <= 0) return true;
    const redThreshold = getProductRedThreshold(product);
    return stockVal <= redThreshold;
}

export function getLowStockProducts() {
    return products.filter(p => isProductInRed(p));
}

// ── Category Getters ──
export function getLevel1Categories() {
    // Return objects { name, image }
    return [...level1Categories];
}

export function getLevel2Categories(level1Name) {
    if (!level1Name) return [];
    return level2Map[level1Name] ? [...level2Map[level1Name]] : [];
}

export function addLevel1Category(name, image = null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = level1Categories.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
    if (existing && typeof existing === 'object') {
        if (image) existing.image = image;
        return;
    }
    level1Categories = [...level1Categories, { name: trimmed, image }];
}

export function addLevel2Category(level1Name, name, image = null) {
    const trimmed = name.trim();
    if (!trimmed || !level1Name) return;
    if (!level2Map[level1Name]) level2Map[level1Name] = [];

    const existing = level2Map[level1Name].find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
    if (existing && typeof existing === 'object') {
        if (image) existing.image = image;
        return;
    }

    level2Map[level1Name] = [...level2Map[level1Name], { name: trimmed, image }];
}

export function getCategoryImage(level1Name, level2Name) {
    // Try to get L2 image first, fallback to L1
    if (level2Name && level2Map[level1Name]) {
        const l2 = level2Map[level1Name].find(c => (typeof c === 'object' ? c?.name : c) === level2Name);
        if (l2 && typeof l2 === 'object' && l2.image) return l2.image;
    }
    if (level1Name) {
        const l1 = level1Categories.find(c => (typeof c === 'object' ? c?.name : c) === level1Name);
        if (l1 && typeof l1 === 'object' && l1.image) return l1.image;
    }
    return null;
}

// ── Stock Severity ──
export function getProductStockSeverity(product) {
    if (!product) return 'green';
    const stockVal = parseFloat(product.stock ?? product.qty ?? product.quantity ?? 0) || 0;
    if (stockVal <= 0) return 'red';

    const alertCfg = getProductStockAlert(product);
    const rawRed = alertCfg?.red
        ?? product.stockRed
        ?? product.red
        ?? product.raw?.stockRed
        ?? product.raw?.red
        ?? product.attributes?.stockRed
        ?? product.attributes?.red
        ?? product.raw?.attributes?.stockRed
        ?? product.raw?.attributes?.red;
    const rawYellow = alertCfg?.yellow
        ?? product.stockYellow
        ?? product.yellow
        ?? product.raw?.stockYellow
        ?? product.raw?.yellow
        ?? product.attributes?.stockYellow
        ?? product.attributes?.yellow
        ?? product.raw?.attributes?.stockYellow
        ?? product.raw?.attributes?.yellow;

    const redThreshold = Number(rawRed);
    const yellowThreshold = Number(rawYellow);
    const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
    const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;

    if (hasRed && stockVal <= redThreshold) return 'red';
    if (hasYellow && stockVal <= yellowThreshold) return 'yellow';
    return getStockSeverity(stockVal);
}

export function getStockSeverity(stockCounts) {
    if (typeof stockCounts === 'number') {
        if (stockCounts <= 2) return 'red';
        if (stockCounts <= 5) return 'yellow';
        return 'green';
    }
    if (stockCounts && typeof stockCounts === 'object') {
        if (stockCounts.stock !== undefined || stockCounts.qty !== undefined || stockCounts.quantity !== undefined || stockCounts.raw) {
            return getProductStockSeverity(stockCounts);
        }
        const total = (stockCounts.red || 0) + (stockCounts.yellow || 0) + (stockCounts.green || 0);
        if (total <= 2) return 'red';
        if (total <= 5) return 'yellow';
        return 'green';
    }
    return 'green';
}

// ── Build Product JSON (for analytics) ──
export function buildProductJSON(entry) {
    return {
        ...(entry.id ? { id: entry.id } : {}),
        model: entry.model || '',
        name: entry.name || entry.desc || entry.model || '',
        desc: entry.desc || entry.name || entry.model || '',
        barcode: entry.barcode || null,
        category: entry.category || {},
        purchasePrice: parseFloat(entry.purchasePrice || entry.costPrice) || 0,
        sellingPrice: parseFloat(entry.sellingPrice || entry.unitPrice || entry.amount) || 0,
        purchaseFrom: entry.purchaseFrom || entry.soldBy || '',
        paymentMode: entry.paymentMode || entry.paymentMethod || '',
        profit: (parseFloat(entry.sellingPrice || entry.unitPrice || entry.amount) || 0) - (parseFloat(entry.purchasePrice || entry.costPrice) || 0),
        stock: parseInt(entry.stock !== undefined ? entry.stock : (entry.quantity || 0)) || 0,
        stockAlert: entry.stockAlert || { red: 0, yellow: 0, green: 0 },
        attributes: entry.attributes || {},
        productUrl: entry.productUrl || null,
        notes: entry.notes || '',
        image: entry.image || null,
        // transaction compat fields
        amount: parseFloat(entry.sellingPrice || entry.unitPrice || entry.amount) || 0,
        unitPrice: parseFloat(entry.sellingPrice || entry.unitPrice || entry.amount) || 0,
        costPrice: parseFloat(entry.purchasePrice || entry.costPrice) || 0,
        quantity: parseInt(entry.stock !== undefined ? entry.stock : (entry.quantity || 1)) || 1,
        type: entry.type || 'income',
        source: entry.source || 'shop',
        time: entry.time || new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        date: entry.date || new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
        timestamp: new Date().toISOString(),
    };
}
