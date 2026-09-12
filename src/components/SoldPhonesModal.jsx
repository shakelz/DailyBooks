import { useState, useMemo, useCallback } from 'react';
import {
    Smartphone,
    Search,
    Download,
    X,
    Copy,
    Check,
    Calendar,
    DollarSign,
    TrendingUp,
    Receipt,
    User,
    Phone,
    Shield,
    Tag,
    Layers,
    Clock,
    Hash,
    Info,
    ExternalLink,
    Filter,
    ChevronDown,
    SlidersHorizontal,
    Sparkles
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { priceTag, CURRENCY_CONFIG } from '../utils/currency';
import { getCleanTransactionInvoiceNumber } from '../utils/invoiceNumbers';

const NON_PHONE_KEYWORDS = [
    'battery', 'akku', 'display', 'screen', 'incell', 'oled', 'lcd',
    'cover', 'case', 'hülle', 'panzerglas', 'glass', 'glas', 'folie',
    'cable', 'kabel', 'charger', 'ladegerät', 'adapter', 'kopfhörer',
    'earphones', 'airpods', 'buds', 'watch', 'band', 'strap',
    'ersatzteil', 'spare part', 'flex', 'kamera', 'camera'
];

const PHONE_CATEGORY_KEYWORDS = ['phone', 'smartphone', 'handy', 'mobile', 'iphone', 'telefon'];

function cleanText(val) {
    return typeof val === 'string' ? val.trim() : (val ? String(val).trim() : '');
}

export default function SoldPhonesModal({ isOpen, onClose, onViewTransaction }) {
    const {
        transactions = [],
        products = [],
        getLevel1Categories,
        getLevel2Categories
    } = useInventory();
    const { activeShop } = useAuth();

    // ── Search & Filter State ──
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedSubCategory, setSelectedSubCategory] = useState('All');
    const [txTypeFilter, setTxTypeFilter] = useState('all'); // all, sale, purchase

    // Date Filters
    const [datePreset, setDatePreset] = useState('all'); // all, today, yesterday, 7days, 30days, thisMonth, custom
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Sort
    const [sortBy, setSortBy] = useState('newest'); // newest, oldest, price_desc, profit_desc

    // UI Feedback & Detail Modal
    const [copiedImei, setCopiedImei] = useState(null);
    const [selectedDetailPhone, setSelectedDetailPhone] = useState(null);

    // Product lookup map
    const productLookup = useMemo(() => {
        const map = {};
        for (const p of products) {
            if (p?.id) map[String(p.id)] = p;
        }
        return map;
    }, [products]);

    // ── Master Extraction of Sold / Purchased Phones from DB ──
    const allPhoneRecords = useMemo(() => {
        if (!Array.isArray(transactions) || transactions.length === 0) return [];

        const records = [];

        transactions.forEach((txn, index) => {
            if (!txn) return;

            const rawTxType = String(txn.tx_type || txn.type || '').toLowerCase().trim();
            const source = String(txn.source || txn.tx_source || '').toLowerCase().trim();

            // Distinguish sale vs inventory purchase
            const isPurchase = rawTxType === 'expense'
                || rawTxType === 'product_expense'
                || rawTxType === 'product_purchase'
                || source === 'purchase'
                || String(txn.desc || txn.name || '').toLowerCase().startsWith('purchase -');

            const isSale = !isPurchase && (
                rawTxType === 'product_sale'
                || rawTxType === 'income'
                || rawTxType === 'sale'
                || source === 'shop'
                || !rawTxType
            );

            // Exclude shop overhead/repairs unless repair sold a phone
            if (rawTxType === 'shop_expense' || rawTxType === 'fixed_expense') return;

            // Merged specs and attributes
            const mergedSpecs = {
                ...(txn.attributes || {}),
                ...(txn.verifiedAttributes || {}),
                ...(txn.productSnapshot?.attributes || {}),
                ...(txn.productSnapshot?.verifiedAttributes || {}),
            };

            const imei = cleanText(
                txn.imei
                || txn.IMEI
                || mergedSpecs.IMEI
                || mergedSpecs.imei
                || txn.productSnapshot?.imei
                || ''
            );

            const linkedProduct = txn.productId ? productLookup[String(txn.productId)] : null;

            // Extract Category and SubCategory DIRECTLY from Database
            let catL1 = cleanText(
                (typeof txn.category === 'object' ? txn.category?.level1 : txn.category)
                || txn.categorySnapshot?.level1
                || (typeof txn.productSnapshot?.category === 'object' ? txn.productSnapshot?.category?.level1 : txn.productSnapshot?.category)
                || (typeof linkedProduct?.category === 'object' ? linkedProduct?.category?.level1 : linkedProduct?.category)
                || txn.category_name
                || ''
            );

            let catL2 = cleanText(
                txn.subCategory
                || txn.sub_category
                || (typeof txn.category === 'object' ? txn.category?.level2 : '')
                || (typeof txn.productSnapshot?.category === 'object' ? txn.productSnapshot?.category?.level2 : '')
                || txn.productSnapshot?.subCategory
                || txn.brand
                || txn.productSnapshot?.brand
                || linkedProduct?.subCategory
                || (typeof linkedProduct?.category === 'object' ? linkedProduct?.category?.level2 : '')
                || linkedProduct?.brand
                || ''
            );

            // If subcategory was stored in notes string (e.g. "SubCategory: iPhone")
            if (!catL2 && txn.notes && txn.notes.includes('SubCategory:')) {
                const match = txn.notes.match(/SubCategory:\s*([^|]+)/i);
                if (match && match[1]) {
                    catL2 = cleanText(match[1]);
                }
            }

            const name = cleanText(txn.desc || txn.name || txn.productSnapshot?.name || 'Mobile Phone');
            const cleanDisplayName = name.replace(/^Purchase\s*-\s*/i, '');
            const lowerName = cleanDisplayName.toLowerCase();

            // Detect whether this is a phone
            const hasImei = Boolean(imei && imei.length >= 4);
            const isPhoneCat = PHONE_CATEGORY_KEYWORDS.some(kw => catL1.toLowerCase().includes(kw));
            const isProductPhone = linkedProduct && (
                PHONE_CATEGORY_KEYWORDS.some(kw =>
                    String(typeof linkedProduct.category === 'object' ? linkedProduct.category?.level1 : linkedProduct.category).toLowerCase().includes(kw)
                ) || Boolean(linkedProduct.attributes?.IMEI || linkedProduct.attributes?.imei || linkedProduct.imei)
            );
            const isPhoneByName = ['iphone', 'galaxy s', 'galaxy a', 'galaxy z', 'pixel', 'redmi', 'xiaomi'].some(kw => lowerName.includes(kw));

            // Filter out non-phone accessories/parts (batteries, displays, covers) unless it has a verified 15-digit IMEI
            const isNonPhonePart = NON_PHONE_KEYWORDS.some(kw => lowerName.includes(kw));
            if (isNonPhonePart && (!hasImei || imei.length < 10)) {
                return;
            }

            const isPhoneRecord = hasImei || isPhoneCat || isProductPhone || isPhoneByName;
            if (!isPhoneRecord) return;

            // Default fallback category name if empty
            if (!catL1) {
                catL1 = 'Smartphones';
            }
            if (!catL2) {
                // If brand/subCategory is empty, infer from model name
                if (lowerName.includes('iphone') || lowerName.includes('apple')) catL2 = 'Apple';
                else if (lowerName.includes('galaxy') || lowerName.includes('samsung')) catL2 = 'Samsung';
                else if (lowerName.includes('pixel') || lowerName.includes('google')) catL2 = 'Google';
                else if (lowerName.includes('xiaomi') || lowerName.includes('redmi')) catL2 = 'Xiaomi';
                else if (lowerName.includes('huawei')) catL2 = 'Huawei';
                else catL2 = 'Generic';
            }

            const model = cleanText(
                txn.model
                || txn.productSnapshot?.model
                || (typeof txn.category === 'object' ? txn.category?.level3 : '')
                || linkedProduct?.model
                || ''
            );

            const storage = cleanText(
                mergedSpecs.storage
                || mergedSpecs.Storage
                || mergedSpecs.ROM
                || mergedSpecs.internal_memory
                || ''
            );

            const color = cleanText(
                mergedSpecs.color
                || mergedSpecs.Color
                || ''
            );

            const ram = cleanText(
                mergedSpecs.ram
                || mergedSpecs.RAM
                || ''
            );

            const condition = cleanText(
                mergedSpecs.condition
                || mergedSpecs.Condition
                || mergedSpecs.zustand
                || ''
            );

            const quantity = parseInt(txn.quantity || 1, 10) || 1;
            const amount = parseFloat(txn.amount || txn.unitPrice || 0) || 0;
            const purchasePrice = parseFloat(
                txn.purchasePriceAtTime
                ?? txn.purchasePrice
                ?? txn.productSnapshot?.purchasePrice
                ?? (linkedProduct?.purchasePrice || 0)
            ) || 0;

            const sellingPrice = isPurchase ? (purchasePrice || amount) : amount;
            const profit = isPurchase ? 0 : (parseFloat(txn.profit ?? (sellingPrice - (purchasePrice * quantity))) || 0);
            const marginPercent = (!isPurchase && purchasePrice > 0)
                ? ((profit / (purchasePrice * quantity)) * 100)
                : 0;

            const invoiceNumber = getCleanTransactionInvoiceNumber(txn) || txn.invoiceNumber || txn.transactionId || '-';
            const barcode = cleanText(txn.barcode || txn.productSnapshot?.barcode || linkedProduct?.barcode || '');

            const date = txn.date || (txn.timestamp ? txn.timestamp.split('T')[0] : '');
            const time = txn.time || (txn.timestamp && txn.timestamp.includes('T') ? txn.timestamp.split('T')[1].slice(0, 5) : '');

            const customerName = txn.customerInfo?.name || 'Walk-in';
            const customerPhone = txn.customerInfo?.phone || '';
            const paymentMethod = txn.paymentMethod || txn.paymentMode || 'Cash';
            const soldBy = txn.soldBy || txn.salesmanName || txn.userName || 'Shop';

            records.push({
                id: txn.id || txn.transactionId || `phone-record-${index}`,
                rawTxn: txn,
                name: cleanDisplayName,
                category: catL1,
                subCategory: catL2,
                brand: catL2,
                model,
                imei,
                barcode,
                storage,
                color,
                ram,
                condition,
                quantity,
                sellingPrice,
                purchasePrice,
                profit,
                marginPercent,
                invoiceNumber,
                isPurchase,
                isSale: !isPurchase,
                date,
                time,
                timestamp: txn.timestamp || txn.created_at || '',
                customerName,
                customerPhone,
                customerInfo: txn.customerInfo || null,
                paymentMethod,
                soldBy,
                notes: txn.notes || '',
                allSpecs: mergedSpecs,
            });
        });

        return records;
    }, [transactions, productLookup]);

    // ── Database Category Hierarchy Options ──
    const dbCategoryOptions = useMemo(() => {
        const catSet = new Set();
        // 1. From database catalog
        const l1FromDb = typeof getLevel1Categories === 'function' ? (getLevel1Categories('sales') || []) : [];
        l1FromDb.forEach((c) => {
            const name = typeof c === 'object' ? c?.name : String(c || '');
            if (name) catSet.add(name);
        });
        // 2. From actual phone records
        allPhoneRecords.forEach((r) => {
            if (r.category) catSet.add(r.category);
        });
        return ['All', ...Array.from(catSet).sort()];
    }, [getLevel1Categories, allPhoneRecords]);

    // ── Database Subcategory (Brand) Hierarchy Options ──
    const dbSubCategoryOptions = useMemo(() => {
        const subSet = new Set();

        if (selectedCategory !== 'All') {
            // Get subcategories from DB catalog for this category
            const l2FromDb = typeof getLevel2Categories === 'function' ? (getLevel2Categories(selectedCategory, 'sales') || []) : [];
            l2FromDb.forEach((s) => {
                const name = typeof s === 'object' ? s?.name : String(s || '');
                if (name) subSet.add(name);
            });
            // And from records matching this category
            allPhoneRecords.forEach((r) => {
                if (r.category.toLowerCase() === selectedCategory.toLowerCase() && r.subCategory) {
                    subSet.add(r.subCategory);
                }
            });
        } else {
            // All subcategories across all phone records
            allPhoneRecords.forEach((r) => {
                if (r.subCategory) subSet.add(r.subCategory);
            });
        }

        return ['All', ...Array.from(subSet).sort()];
    }, [selectedCategory, getLevel2Categories, allPhoneRecords]);

    // ── Filter & Sort Processing ──
    const filteredPhones = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const now = new Date();

        return allPhoneRecords.filter((phone) => {
            // Transaction Type filter
            if (txTypeFilter === 'sale' && !phone.isSale) return false;
            if (txTypeFilter === 'purchase' && !phone.isPurchase) return false;

            // Search query filter
            if (query) {
                const searchStr = `${phone.name} ${phone.category} ${phone.subCategory} ${phone.model} ${phone.imei} ${phone.barcode} ${phone.customerName} ${phone.customerPhone} ${phone.invoiceNumber} ${phone.soldBy}`.toLowerCase();
                if (!searchStr.includes(query)) return false;
            }

            // Category Level 1 Filter
            if (selectedCategory !== 'All' && phone.category.toLowerCase() !== selectedCategory.toLowerCase()) {
                return false;
            }

            // Sub Category Level 2 (Brand) Filter
            if (selectedSubCategory !== 'All' && phone.subCategory.toLowerCase() !== selectedSubCategory.toLowerCase()) {
                return false;
            }

            // Date Filters (Presets + Custom Range)
            if (datePreset !== 'all' && phone.timestamp) {
                const pDate = new Date(phone.timestamp);

                if (datePreset === 'today') {
                    const todayStr = now.toISOString().split('T')[0];
                    if (phone.date !== todayStr && pDate.toDateString() !== now.toDateString()) return false;
                } else if (datePreset === 'yesterday') {
                    const yest = new Date(now);
                    yest.setDate(now.getDate() - 1);
                    if (pDate.toDateString() !== yest.toDateString()) return false;
                } else if (datePreset === '7days') {
                    const diff = (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
                    if (diff > 7 || diff < 0) return false;
                } else if (datePreset === '30days') {
                    const diff = (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
                    if (diff > 30 || diff < 0) return false;
                } else if (datePreset === 'thisMonth') {
                    if (pDate.getMonth() !== now.getMonth() || pDate.getFullYear() !== now.getFullYear()) return false;
                } else if (datePreset === 'custom') {
                    if (customStartDate) {
                        const start = new Date(customStartDate);
                        start.setHours(0, 0, 0, 0);
                        if (pDate < start) return false;
                    }
                    if (customEndDate) {
                        const end = new Date(customEndDate);
                        end.setHours(23, 59, 59, 999);
                        if (pDate > end) return false;
                    }
                }
            }

            return true;
        }).sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.timestamp || b.date || 0) - new Date(a.timestamp || a.date || 0);
            }
            if (sortBy === 'oldest') {
                return new Date(a.timestamp || a.date || 0) - new Date(b.timestamp || b.date || 0);
            }
            if (sortBy === 'price_desc') {
                return b.sellingPrice - a.sellingPrice;
            }
            if (sortBy === 'profit_desc') {
                return b.profit - a.profit;
            }
            return 0;
        });
    }, [allPhoneRecords, searchQuery, selectedCategory, selectedSubCategory, txTypeFilter, datePreset, customStartDate, customEndDate, sortBy]);

    // ── Summary KPIs ──
    const kpis = useMemo(() => {
        const totalCount = filteredPhones.length;
        const totalRevenue = filteredPhones.filter(p => p.isSale).reduce((sum, p) => sum + p.sellingPrice, 0);
        const totalProfit = filteredPhones.filter(p => p.isSale).reduce((sum, p) => sum + p.profit, 0);
        const imeiCount = filteredPhones.filter(p => Boolean(p.imei)).length;
        const totalCost = filteredPhones.filter(p => p.isSale).reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
        const overallMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

        return {
            totalCount,
            totalRevenue,
            totalProfit,
            imeiCount,
            overallMargin,
        };
    }, [filteredPhones]);

    // 1-Click Copy IMEI
    const handleCopyImei = useCallback((e, imei) => {
        e?.stopPropagation?.();
        if (!imei) return;
        navigator.clipboard.writeText(imei).then(() => {
            setCopiedImei(imei);
            setTimeout(() => setCopiedImei(null), 2000);
        }).catch(() => {
            setCopiedImei(imei);
            setTimeout(() => setCopiedImei(null), 2000);
        });
    }, []);

    // Export to CSV
    const handleExportCSV = useCallback(() => {
        if (filteredPhones.length === 0) return;

        const headers = [
            'Invoice No',
            'Type',
            'Date',
            'Time',
            'Device Name',
            'Category',
            'SubCategory / Brand',
            'Model',
            'IMEI',
            'Barcode',
            'Storage',
            'Color',
            'Condition',
            'Selling Price (EUR)',
            'Purchase Price (EUR)',
            'Profit (EUR)',
            'Margin (%)',
            'Payment Method',
            'Customer Name',
            'Customer Phone',
            'Sold By',
            'Notes'
        ];

        const rows = filteredPhones.map((p) => [
            `"${p.invoiceNumber || ''}"`,
            `"${p.isSale ? 'Sale' : 'Purchase'}"`,
            `"${p.date || ''}"`,
            `"${p.time || ''}"`,
            `"${(p.name || '').replace(/"/g, '""')}"`,
            `"${(p.category || '').replace(/"/g, '""')}"`,
            `"${(p.subCategory || '').replace(/"/g, '""')}"`,
            `"${(p.model || '').replace(/"/g, '""')}"`,
            `"${p.imei ? `\t${p.imei}` : ''}"`,
            `"${p.barcode ? `\t${p.barcode}` : ''}"`,
            `"${p.storage || ''}"`,
            `"${p.color || ''}"`,
            `"${p.condition || ''}"`,
            p.sellingPrice.toFixed(2),
            p.purchasePrice.toFixed(2),
            p.profit.toFixed(2),
            p.marginPercent.toFixed(1),
            `"${p.paymentMethod || ''}"`,
            `"${(p.customerName || '').replace(/"/g, '""')}"`,
            `"${p.customerPhone ? `\t${p.customerPhone}` : ''}"`,
            `"${(p.soldBy || '').replace(/"/g, '""')}"`,
            `"${(p.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `phone_history_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [filteredPhones]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[88] flex items-center justify-center p-2 sm:p-4 md:p-6"
            onClick={onClose}
        >
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

            <div
                className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Modal Header ── */}
                <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-sky-500/20 border border-sky-400/30 text-sky-400 rounded-xl shadow-inner">
                            <Smartphone size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h2 className="text-base font-black tracking-tight text-white">
                                    Sold Phones History &amp; Data
                                </h2>
                                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 font-mono">
                                    {allPhoneRecords.length} {allPhoneRecords.length === 1 ? 'Phone' : 'Phones'}
                                </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-300">
                                Database-backed record of devices, IMEIs, categories, specifications &amp; customer transactions.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            disabled={filteredPhones.length === 0}
                            title="Export to Excel / CSV"
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
                        >
                            <Download size={14} />
                            <span>Export CSV</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors font-bold"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ── KPI Summary Cards ── */}
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>Devices</span>
                            <Smartphone size={15} className="text-sky-500" />
                        </div>
                        <p className="text-xl font-black text-slate-800 font-mono">{kpis.totalCount}</p>
                        <p className="text-[10px] text-slate-500">Filtered phones</p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>Sales Revenue</span>
                            <DollarSign size={15} className="text-emerald-500" />
                        </div>
                        <p className="text-xl font-black text-emerald-700 font-mono">{priceTag(kpis.totalRevenue)}</p>
                        <p className="text-[10px] text-slate-500">Total sold volume</p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>Net Profit</span>
                            <TrendingUp size={15} className="text-indigo-500" />
                        </div>
                        <p className="text-xl font-black text-indigo-700 font-mono">{priceTag(kpis.totalProfit)}</p>
                        <p className="text-[10px] text-emerald-600 font-bold">
                            Margin: +{kpis.overallMargin.toFixed(1)}%
                        </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>IMEI Tracked</span>
                            <Shield size={15} className="text-blue-500" />
                        </div>
                        <p className="text-xl font-black text-blue-700 font-mono">
                            {kpis.imeiCount} / {kpis.totalCount}
                        </p>
                        <p className="text-[10px] text-slate-500">With verified serial/IMEI</p>
                    </div>
                </div>

                {/* ── Search & Filter Controls ── */}
                <div className="p-3.5 bg-white border-b border-slate-100 space-y-3 shrink-0">
                    {/* Row 1: Search + Date Presets + Sort */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        {/* Search Input */}
                        <div className="sm:col-span-6 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by IMEI, Device Name, Model, Customer, Invoice #..."
                                className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 transition-all outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Date Filter Dropdown */}
                        <div className="sm:col-span-3">
                            <select
                                value={datePreset}
                                onChange={(e) => setDatePreset(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:bg-white focus:border-sky-500 outline-none cursor-pointer"
                            >
                                <option value="all">📅 All Time</option>
                                <option value="today">📅 Today</option>
                                <option value="yesterday">📅 Yesterday</option>
                                <option value="7days">📅 Last 7 Days</option>
                                <option value="30days">📅 Last 30 Days</option>
                                <option value="thisMonth">📅 This Month</option>
                                <option value="custom">📅 Custom Date Range...</option>
                            </select>
                        </div>

                        {/* Sort Options */}
                        <div className="sm:col-span-3">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:bg-white focus:border-sky-500 outline-none cursor-pointer"
                            >
                                <option value="newest">🕒 Newest First</option>
                                <option value="oldest">🕒 Oldest First</option>
                                <option value="price_desc">💰 Price: High → Low</option>
                                <option value="profit_desc">📈 Profit: High → Low</option>
                            </select>
                        </div>
                    </div>

                    {/* Custom Date Range Picker (shown when custom is selected) */}
                    {datePreset === 'custom' && (
                        <div className="p-2.5 bg-sky-50/70 border border-sky-200 rounded-xl flex flex-wrap items-center gap-3 animate-in fade-in duration-150 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sky-800">From Date:</span>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="px-2.5 py-1 rounded-lg border border-sky-300 bg-white font-mono text-slate-700 outline-none focus:ring-2 focus:ring-sky-400"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sky-800">To Date:</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="px-2.5 py-1 rounded-lg border border-sky-300 bg-white font-mono text-slate-700 outline-none focus:ring-2 focus:ring-sky-400"
                                />
                            </div>
                            {(customStartDate || customEndDate) && (
                                <button
                                    type="button"
                                    onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                                >
                                    Clear Dates
                                </button>
                            )}
                        </div>
                    )}

                    {/* Row 2: Category (Level 1) then Sub Categories (Level 2 / Brand) from DATABASE */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                        {/* 1. Categories (Level 1) from DB */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                                <Layers size={11} />
                                Category:
                            </span>
                            {dbCategoryOptions.map((cat) => (
                                <button
                                    key={`cat-${cat}`}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCategory(cat);
                                        setSelectedSubCategory('All');
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                                        selectedCategory.toLowerCase() === cat.toLowerCase()
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* 2. Sub Categories (Level 2 / Brand) from DB */}
                        {dbSubCategoryOptions.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs bg-slate-50/80 px-2 py-1 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                                    <Tag size={11} />
                                    Subcategory / Brand:
                                </span>
                                {dbSubCategoryOptions.map((sub) => (
                                    <button
                                        key={`sub-${sub}`}
                                        type="button"
                                        onClick={() => setSelectedSubCategory(sub)}
                                        className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                                            selectedSubCategory.toLowerCase() === sub.toLowerCase()
                                                ? 'bg-indigo-600 text-white shadow-xs'
                                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                        }`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Table & Cards View ── */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-50/50">
                    {filteredPhones.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                            <Smartphone size={36} className="mx-auto text-slate-300 mb-2" />
                            <h3 className="text-sm font-bold text-slate-700">No phone records found</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                {searchQuery || selectedCategory !== 'All' || selectedSubCategory !== 'All' || datePreset !== 'all'
                                    ? 'Try changing your search keywords, category filters, or date range.'
                                    : 'When phone sales or purchases are processed, their complete records and IMEIs will appear here.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {filteredPhones.map((phone) => {
                                const hasImei = Boolean(phone.imei);
                                const isCopied = copiedImei === phone.imei;

                                return (
                                    <div
                                        key={phone.id}
                                        onClick={() => setSelectedDetailPhone(phone)}
                                        className="bg-white rounded-2xl border border-slate-200/80 p-3.5 hover:border-sky-400 hover:shadow-md transition-all space-y-3 cursor-pointer group"
                                    >
                                        {/* Top Line: Date, Invoice, Type Badge, Salesman */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[11px]">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-700 flex items-center gap-1">
                                                    <Calendar size={12} className="text-slate-400" />
                                                    {phone.date || 'Date N/A'} {phone.time && `• ${phone.time}`}
                                                </span>
                                                <span className="text-slate-300">|</span>
                                                <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                                                    Inv: {phone.invoiceNumber}
                                                </span>
                                                {phone.isPurchase && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                        Purchase (Ankauf)
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 font-medium">
                                                    By: <strong className="text-slate-700">{phone.soldBy}</strong>
                                                </span>
                                                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-600 font-semibold">
                                                    {phone.paymentMethod}
                                                </span>
                                                <span className="text-[10px] text-sky-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                    Click for details &rarr;
                                                </span>
                                            </div>
                                        </div>

                                        {/* Main Details: Device info, Categories from DB, IMEI, Financials */}
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                                            {/* Device & Database Categories */}
                                            <div className="md:col-span-5 flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-xs">
                                                    <Smartphone size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {/* Subcategory / Brand from Database */}
                                                        {phone.subCategory && (
                                                            <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                                                                {phone.subCategory}
                                                            </span>
                                                        )}
                                                        {/* Category from Database */}
                                                        {phone.category && (
                                                            <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-slate-100 text-slate-600">
                                                                {phone.category}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h4 className="text-xs font-black text-slate-800 mt-0.5 group-hover:text-sky-600 transition-colors truncate">
                                                        {phone.name}
                                                    </h4>

                                                    {/* Specs tags */}
                                                    <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px] font-medium text-slate-500">
                                                        {phone.storage && (
                                                            <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded font-mono">
                                                                {phone.storage}
                                                            </span>
                                                        )}
                                                        {phone.color && (
                                                            <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded">
                                                                {phone.color}
                                                            </span>
                                                        )}
                                                        {phone.condition && (
                                                            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.2 rounded font-semibold">
                                                                {phone.condition}
                                                            </span>
                                                        )}
                                                        {phone.ram && (
                                                            <span className="bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded">
                                                                {phone.ram} RAM
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* IMEI Display & 1-Click Copy */}
                                            <div className="md:col-span-4 bg-slate-50/80 rounded-xl border border-slate-200 p-2">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                                                    IMEI / Serial Number
                                                </p>
                                                {hasImei ? (
                                                    <div className="flex items-center justify-between gap-1.5">
                                                        <span className="font-mono text-xs font-black text-slate-800 tracking-wide select-all truncate">
                                                            {phone.imei}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleCopyImei(e, phone.imei)}
                                                            title="Copy IMEI to clipboard"
                                                            className={`p-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all shrink-0 ${
                                                                isCopied
                                                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                                                            }`}
                                                        >
                                                            {isCopied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                                            <span className="text-[10px]">{isCopied ? 'Copied' : 'Copy'}</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic">No IMEI registered</span>
                                                )}
                                            </div>

                                            {/* Financials & Receipt Action */}
                                            <div className="md:col-span-3 flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 border-slate-100 pt-2 md:pt-0">
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-emerald-700 font-mono">
                                                        {priceTag(phone.sellingPrice)}
                                                    </p>
                                                    <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-500 font-medium">
                                                        <span>Cost: {priceTag(phone.purchasePrice)}</span>
                                                        {phone.isSale && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <span className={`font-bold ${phone.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                    {phone.profit >= 0 ? `+${priceTag(phone.profit)}` : priceTag(phone.profit)}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {onViewTransaction && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onViewTransaction(phone.rawTxn);
                                                        }}
                                                        title="View receipt"
                                                        className="h-8 px-2.5 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white border border-sky-200 transition-all flex items-center gap-1 text-[11px] font-bold shrink-0"
                                                    >
                                                        <Receipt size={13} />
                                                        <span className="hidden sm:inline">Receipt</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Bottom Line: Customer details & Notes */}
                                        {(phone.customerName !== 'Walk-in' || phone.customerPhone || phone.notes) && (
                                            <div className="bg-slate-50/50 rounded-xl p-2 text-[11px] flex flex-wrap items-center justify-between gap-2 border border-slate-100 text-slate-600">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex items-center gap-1">
                                                        <User size={12} className="text-slate-400" />
                                                        <strong>Customer:</strong> {phone.customerName}
                                                    </span>
                                                    {phone.customerPhone && (
                                                        <span className="flex items-center gap-1 font-mono">
                                                            <Phone size={12} className="text-slate-400" />
                                                            {phone.customerPhone}
                                                        </span>
                                                    )}
                                                </div>
                                                {phone.notes && (
                                                    <p className="text-[10px] text-slate-500 italic max-w-md truncate">
                                                        Note: {phone.notes}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 shrink-0">
                    <p>
                        Showing <strong className="text-slate-800">{filteredPhones.length}</strong> of <strong className="text-slate-800">{allPhoneRecords.length}</strong> total phone records
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                ALL DETAILS MODAL: Opens when user clicks on any item row!
               ══════════════════════════════════════════════════════════════ */}
            {selectedDetailPhone && (
                <div
                    className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5"
                    onClick={() => setSelectedDetailPhone(null)}
                >
                    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />

                    <div
                        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 text-white flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/20 rounded-2xl">
                                    <Smartphone size={22} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-white">
                                        {selectedDetailPhone.name}
                                    </h3>
                                    <p className="text-xs text-sky-100 font-medium">
                                        {selectedDetailPhone.category} • {selectedDetailPhone.subCategory}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailPhone(null)}
                                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                            {/* Key Identifiers Banner */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                        IMEI / Serial Number
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-sm font-black text-slate-800 select-all">
                                            {selectedDetailPhone.imei || 'No IMEI registered'}
                                        </span>
                                        {selectedDetailPhone.imei && (
                                            <button
                                                type="button"
                                                onClick={(e) => handleCopyImei(e, selectedDetailPhone.imei)}
                                                className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-bold flex items-center gap-1"
                                            >
                                                {copiedImei === selectedDetailPhone.imei ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                                <span>{copiedImei === selectedDetailPhone.imei ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                        Invoice &amp; Transaction
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-sm font-black text-sky-700">
                                            {selectedDetailPhone.invoiceNumber}
                                        </span>
                                        {onViewTransaction && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const txn = selectedDetailPhone.rawTxn;
                                                    setSelectedDetailPhone(null);
                                                    onViewTransaction(txn);
                                                }}
                                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-bold flex items-center gap-1"
                                            >
                                                <Receipt size={12} />
                                                <span>View Receipt</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Database Category & Hierarchy */}
                            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2">
                                <h4 className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <Layers size={13} className="text-indigo-600" />
                                    Database Category Hierarchy
                                </h4>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Main Category</span>
                                        <span className="font-black text-slate-800 text-xs">{selectedDetailPhone.category || '-'}</span>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Subcategory / Brand</span>
                                        <span className="font-black text-indigo-700 text-xs">{selectedDetailPhone.subCategory || '-'}</span>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Model / Level 3</span>
                                        <span className="font-black text-slate-800 text-xs">{selectedDetailPhone.model || '-'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Hardware Specifications & Attributes */}
                            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles size={13} className="text-blue-500" />
                                    Specifications &amp; Stored Attributes
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Storage</span>
                                        <span className="font-bold text-slate-800 text-xs font-mono">{selectedDetailPhone.storage || 'N/A'}</span>
                                    </div>
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Color</span>
                                        <span className="font-bold text-slate-800 text-xs">{selectedDetailPhone.color || 'N/A'}</span>
                                    </div>
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">RAM</span>
                                        <span className="font-bold text-slate-800 text-xs font-mono">{selectedDetailPhone.ram || 'N/A'}</span>
                                    </div>
                                    <div className="bg-white p-2 rounded-xl border border-slate-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Condition</span>
                                        <span className="font-bold text-emerald-700 text-xs">{selectedDetailPhone.condition || 'Standard'}</span>
                                    </div>
                                </div>

                                {Object.keys(selectedDetailPhone.allSpecs).length > 0 && (
                                    <div className="pt-2 border-t border-slate-200/60 flex flex-wrap gap-1.5">
                                        {Object.entries(selectedDetailPhone.allSpecs).map(([key, val]) => {
                                            if (['imei', 'IMEI', 'storage', 'color', 'ram', 'condition'].includes(key)) return null;
                                            if (!val || typeof val === 'object') return null;
                                            return (
                                                <span key={key} className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-[10px] font-medium text-slate-700">
                                                    <strong>{key}:</strong> {String(val)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Financial Details */}
                            <div className="p-3.5 bg-emerald-50/40 border border-emerald-100 rounded-2xl space-y-2.5">
                                <h4 className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                                    <DollarSign size={13} className="text-emerald-600" />
                                    Financials &amp; Margins
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Selling Price</span>
                                        <span className="font-black text-emerald-700 text-sm font-mono">{priceTag(selectedDetailPhone.sellingPrice)}</span>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Cost / Purchase</span>
                                        <span className="font-black text-slate-700 text-sm font-mono">{priceTag(selectedDetailPhone.purchasePrice)}</span>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Net Profit</span>
                                        <span className={`font-black text-sm font-mono ${selectedDetailPhone.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {selectedDetailPhone.profit >= 0 ? `+${priceTag(selectedDetailPhone.profit)}` : priceTag(selectedDetailPhone.profit)}
                                        </span>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Profit Margin</span>
                                        <span className="font-black text-emerald-700 text-sm font-mono">
                                            {selectedDetailPhone.marginPercent.toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Transaction & Customer Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sale Metadata</p>
                                    <div className="space-y-1 text-slate-700">
                                        <p><strong>Date &amp; Time:</strong> {selectedDetailPhone.date} {selectedDetailPhone.time && `• ${selectedDetailPhone.time}`}</p>
                                        <p><strong>Payment Method:</strong> {selectedDetailPhone.paymentMethod}</p>
                                        <p><strong>Sold By:</strong> {selectedDetailPhone.soldBy}</p>
                                        {selectedDetailPhone.barcode && <p><strong>Barcode:</strong> {selectedDetailPhone.barcode}</p>}
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Details</p>
                                    <div className="space-y-1 text-slate-700">
                                        <p><strong>Name:</strong> {selectedDetailPhone.customerName}</p>
                                        <p><strong>Phone:</strong> {selectedDetailPhone.customerPhone || 'Not provided'}</p>
                                        {selectedDetailPhone.notes && <p className="italic text-slate-500"><strong>Note:</strong> {selectedDetailPhone.notes}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => {
                                    const summary = `Device: ${selectedDetailPhone.name}\nIMEI: ${selectedDetailPhone.imei}\nCategory: ${selectedDetailPhone.category} > ${selectedDetailPhone.subCategory}\nPrice: ${priceTag(selectedDetailPhone.sellingPrice)}\nInvoice: ${selectedDetailPhone.invoiceNumber}\nDate: ${selectedDetailPhone.date}`;
                                    navigator.clipboard.writeText(summary);
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                            >
                                <Copy size={13} />
                                <span>Copy Details</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setSelectedDetailPhone(null)}
                                className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
