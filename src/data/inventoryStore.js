// ══════════════════════════════════════════════════════════
// DailyBooks — Universal Dynamic Inventory Store
// No dummy data. Clean slate for real products.
// ══════════════════════════════════════════════════════════

// ── Live Products (in-memory, starts empty) ──
let products = [];

import { DEFAULT_CATEGORY_ICONS } from './categoryIcons';

// ── Level 1 Preset Categories (editable) ──
let level1Categories = [
    { name: 'Mobile', image: DEFAULT_CATEGORY_ICONS['Mobile'] },
    { name: 'Accessories', image: DEFAULT_CATEGORY_ICONS['Accessories'] },
    { name: 'Repairs', image: DEFAULT_CATEGORY_ICONS['Repairs'] },
    { name: 'Recharge', image: DEFAULT_CATEGORY_ICONS['Recharge'] },
    { name: 'SIM Cards', image: DEFAULT_CATEGORY_ICONS['SIM Cards'] },
    { name: 'Tablets', image: DEFAULT_CATEGORY_ICONS['Tablets'] },
    { name: 'Laptops', image: DEFAULT_CATEGORY_ICONS['Laptops'] },
    { name: 'Smart Watches', image: DEFAULT_CATEGORY_ICONS['Smart Watches'] },
    { name: 'Shop Expenses', image: DEFAULT_CATEGORY_ICONS['Shop Expenses'] },
];

let level2Map = {
    'Mobile': [
        { name: 'Samsung', image: null }, { name: 'iPhone', image: null },
        { name: 'Xiaomi', image: null }, { name: 'Oppo', image: null },
        { name: 'Vivo', image: null }, { name: 'Realme', image: null },
        { name: 'Infinix', image: null }, { name: 'Tecno', image: null },
        { name: 'Nokia', image: null }, { name: 'Huawei', image: null }
    ],
    'Accessories': [
        { name: 'Chargers', image: null }, { name: 'Cases', image: null },
        { name: 'Screen Guards', image: null }, { name: 'Cables', image: null },
        { name: 'Earphones', image: null }, { name: 'Power Banks', image: null },
        { name: 'Holders', image: null }
    ],
    'Repairs': [
        { name: 'Screen Repair', image: null }, { name: 'Battery Replacement', image: null },
        { name: 'Software Fix', image: null }, { name: 'Charging Port', image: null },
        { name: 'Speaker/Mic', image: null }
    ],
    'Recharge': [
        { name: 'Jazz', image: null }, { name: 'Ufone', image: null },
        { name: 'Telenor', image: null }, { name: 'Zong', image: null },
        { name: 'PTCL', image: null }, { name: 'StormFiber', image: null }
    ],
    'SIM Cards': [{ name: 'New SIM', image: null }, { name: 'Replacement SIM', image: null }],
    'Tablets': [{ name: 'iPad', image: null }, { name: 'Samsung Tab', image: null }, { name: 'Huawei Tab', image: null }, { name: 'Lenovo Tab', image: null }],
    'Laptops': [{ name: 'Dell', image: null }, { name: 'HP', image: null }, { name: 'Lenovo', image: null }, { name: 'Acer', image: null }, { name: 'MacBook', image: null }],
    'Smart Watches': [{ name: 'Apple Watch', image: null }, { name: 'Samsung Watch', image: null }, { name: 'Amazfit', image: null }, { name: 'Noise', image: null }],
    'Shop Expenses': [{ name: 'Rent', image: null }, { name: 'Electricity', image: null }, { name: 'Salary', image: null }, { name: 'Transport', image: null }, { name: 'Misc', image: null }],
};

// ── ID Generator (Universal) ──
export function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
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

export function getLowStockProducts() {
    return products.filter(p => {
        if (typeof p.stock === 'number') return p.stock < 3;
        if (p.stockAlert) {
            const total = (p.stockAlert.red || 0) + (p.stockAlert.yellow || 0) + (p.stockAlert.green || 0);
            return total < 3;
        }
        return false;
    });
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
export function getStockSeverity(stockCounts) {
    if (typeof stockCounts === 'number') {
        if (stockCounts <= 2) return 'red';
        if (stockCounts <= 5) return 'yellow';
        return 'green';
    }
    if (stockCounts && typeof stockCounts === 'object') {
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
        id: entry.id || generateId('PRD'),
        model: entry.model || '',
        name: entry.name || entry.desc || entry.model || '',
        desc: entry.desc || entry.name || entry.model || '',
        barcode: entry.barcode || null,
        category: entry.category || {},
        purchasePrice: parseFloat(entry.purchasePrice || entry.costPrice) || 0,
        sellingPrice: parseFloat(entry.sellingPrice || entry.unitPrice || entry.amount) || 0,
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
