import { useState, useMemo, useCallback } from 'react';
import {
    Smartphone,
    Search,
    Download,
    X,
    Copy,
    Check,
    ArrowUpDown,
    Calendar,
    DollarSign,
    TrendingUp,
    Receipt,
    User,
    Phone,
    Shield
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { priceTag, CURRENCY_CONFIG } from '../utils/currency';
import { getCleanTransactionInvoiceNumber } from '../utils/invoiceNumbers';

const PHONE_CATEGORY_KEYWORDS = ['phone', 'smartphone', 'handy', 'mobile', 'iphone', 'telefon'];
const BRAND_KEYWORDS = ['apple', 'samsung', 'xiaomi', 'google', 'oneplus', 'huawei', 'motorola', 'oppo', 'vivo', 'sony', 'nokia', 'honor', 'realme'];

function detectBrand(name = '', category = '') {
    const combined = `${name} ${category}`.toLowerCase();
    for (const brand of BRAND_KEYWORDS) {
        if (combined.includes(brand)) {
            return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
    }
    return 'Other';
}

export default function SoldPhonesModal({ isOpen, onClose, onViewTransaction }) {
    const { transactions = [], products = [] } = useInventory();
    const { activeShop } = useAuth();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('All');
    const [dateFilter, setDateFilter] = useState('all'); // all, today, 7days, 30days
    const [sortBy, setSortBy] = useState('newest'); // newest, oldest, price_desc, profit_desc
    const [copiedImei, setCopiedImei] = useState(null);

    // Product lookup map
    const productLookup = useMemo(() => {
        const map = {};
        for (const p of products) {
            if (p?.id) map[String(p.id)] = p;
        }
        return map;
    }, [products]);

    // Extract all sold phones from transactions
    const soldPhones = useMemo(() => {
        if (!Array.isArray(transactions) || transactions.length === 0) return [];

        const records = [];

        transactions.forEach((txn, index) => {
            if (!txn) return;
            const txType = String(txn.tx_type || txn.type || '').toLowerCase();
            if (txType === 'expense' || txType === 'shop_expense' || txType === 'repair') return;

            // Merged attributes to inspect
            const mergedSpecs = {
                ...(txn.attributes || {}),
                ...(txn.verifiedAttributes || {}),
                ...(txn.productSnapshot?.attributes || {}),
                ...(txn.productSnapshot?.verifiedAttributes || {}),
            };

            const imei = String(
                txn.imei
                || txn.IMEI
                || mergedSpecs.IMEI
                || mergedSpecs.imei
                || txn.productSnapshot?.imei
                || ''
            ).trim();

            const categoryName = String(
                (typeof txn.category === 'object' ? txn.category?.level1 : txn.category)
                || txn.categorySnapshot?.level1
                || (typeof txn.productSnapshot?.category === 'object' ? txn.productSnapshot?.category?.level1 : txn.productSnapshot?.category)
                || txn.subCategory
                || ''
            ).toLowerCase();

            const name = String(txn.desc || txn.name || txn.productSnapshot?.name || '').trim();
            const lowerName = name.toLowerCase();

            // Match phone by IMEI, Category, Product reference, or Device Name
            const hasImei = Boolean(imei && imei.length >= 4);
            const isPhoneCategory = PHONE_CATEGORY_KEYWORDS.some((kw) => categoryName.includes(kw));
            const linkedProduct = txn.productId ? productLookup[String(txn.productId)] : null;
            const isProductPhone = linkedProduct && (
                PHONE_CATEGORY_KEYWORDS.some((kw) =>
                    String(typeof linkedProduct.category === 'object' ? linkedProduct.category?.level1 : linkedProduct.category).toLowerCase().includes(kw)
                ) || Boolean(linkedProduct.attributes?.IMEI || linkedProduct.attributes?.imei || linkedProduct.imei)
            );
            const hasPhoneName = ['iphone', 'galaxy', 'pixel', 'redmi', 'xiaomi'].some((kw) => lowerName.includes(kw));

            const isPhoneSale = hasImei || isPhoneCategory || isProductPhone || hasPhoneName;
            if (!isPhoneSale) return;

            // Extract detailed fields
            const brand = txn.brand
                || txn.productSnapshot?.brand
                || (typeof txn.category === 'object' ? txn.category?.level2 : null)
                || detectBrand(name, categoryName);

            const model = txn.model
                || txn.productSnapshot?.model
                || (typeof txn.category === 'object' ? txn.category?.level3 : '')
                || '';

            const storage = mergedSpecs.storage
                || mergedSpecs.Storage
                || mergedSpecs.ROM
                || mergedSpecs.internal_memory
                || '';

            const color = mergedSpecs.color
                || mergedSpecs.Color
                || '';

            const ram = mergedSpecs.ram
                || mergedSpecs.RAM
                || '';

            const condition = mergedSpecs.condition
                || mergedSpecs.Condition
                || mergedSpecs.zustand
                || '';

            const quantity = parseInt(txn.quantity || 1, 10) || 1;
            const sellingPrice = parseFloat(txn.amount || txn.unitPrice || 0) || 0;
            const purchasePrice = parseFloat(
                txn.purchasePriceAtTime
                ?? txn.purchasePrice
                ?? txn.productSnapshot?.purchasePrice
                ?? (linkedProduct?.purchasePrice || 0)
            ) || 0;

            const profit = parseFloat(txn.profit ?? (sellingPrice - (purchasePrice * quantity))) || 0;
            const marginPercent = purchasePrice > 0
                ? ((profit / (purchasePrice * quantity)) * 100)
                : 100;

            const invoiceNumber = getCleanTransactionInvoiceNumber(txn) || txn.invoiceNumber || txn.transactionId || '-';
            const date = txn.date || (txn.timestamp ? txn.timestamp.split('T')[0] : '');
            const time = txn.time || (txn.timestamp && txn.timestamp.includes('T') ? txn.timestamp.split('T')[1].slice(0, 5) : '');

            const customerName = txn.customerInfo?.name || 'Walk-in';
            const customerPhone = txn.customerInfo?.phone || '';
            const paymentMethod = txn.paymentMethod || txn.paymentMode || 'Cash';
            const soldBy = txn.soldBy || txn.salesmanName || txn.userName || 'Shop';

            records.push({
                id: txn.id || txn.transactionId || `phone-sale-${index}`,
                rawTxn: txn,
                name: name || 'Mobile Phone',
                brand,
                model,
                imei,
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
                date,
                time,
                timestamp: txn.timestamp || txn.created_at || '',
                customerName,
                customerPhone,
                paymentMethod,
                soldBy,
                notes: txn.notes || '',
                allSpecs: mergedSpecs,
            });
        });

        return records;
    }, [transactions, productLookup]);

    // Distinct brands for filter tabs
    const brandList = useMemo(() => {
        const counts = {};
        soldPhones.forEach((p) => {
            const b = p.brand || 'Other';
            counts[b] = (counts[b] || 0) + 1;
        });
        const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
        return ['All', ...sorted];
    }, [soldPhones]);

    // Filter & Sort
    const filteredPhones = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const now = new Date();

        return soldPhones.filter((phone) => {
            // Search query filter
            if (query) {
                const searchStr = `${phone.name} ${phone.brand} ${phone.model} ${phone.imei} ${phone.customerName} ${phone.customerPhone} ${phone.invoiceNumber} ${phone.soldBy}`.toLowerCase();
                if (!searchStr.includes(query)) return false;
            }

            // Brand filter
            if (selectedBrand !== 'All' && phone.brand.toLowerCase() !== selectedBrand.toLowerCase()) {
                return false;
            }

            // Date filter
            if (dateFilter !== 'all' && phone.timestamp) {
                const pDate = new Date(phone.timestamp);
                if (dateFilter === 'today') {
                    const todayStr = now.toISOString().split('T')[0];
                    if (phone.date !== todayStr && pDate.toDateString() !== now.toDateString()) return false;
                } else if (dateFilter === '7days') {
                    const diff = (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
                    if (diff > 7) return false;
                } else if (dateFilter === '30days') {
                    const diff = (now.getTime() - pDate.getTime()) / (1000 * 3600 * 24);
                    if (diff > 30) return false;
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
    }, [soldPhones, searchQuery, selectedBrand, dateFilter, sortBy]);

    // Summary KPIs
    const kpis = useMemo(() => {
        const totalSold = filteredPhones.length;
        const totalRevenue = filteredPhones.reduce((sum, p) => sum + p.sellingPrice, 0);
        const totalCost = filteredPhones.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
        const totalProfit = filteredPhones.reduce((sum, p) => sum + p.profit, 0);
        const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0;
        const overallMargin = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

        return {
            totalSold,
            totalRevenue,
            totalProfit,
            avgPrice,
            overallMargin,
        };
    }, [filteredPhones]);

    // 1-Click Copy IMEI
    const handleCopyImei = useCallback((imei) => {
        if (!imei) return;
        navigator.clipboard.writeText(imei).then(() => {
            setCopiedImei(imei);
            setTimeout(() => setCopiedImei(null), 2000);
        }).catch(() => {
            // fallback
            setCopiedImei(imei);
            setTimeout(() => setCopiedImei(null), 2000);
        });
    }, []);

    // Export to CSV
    const handleExportCSV = useCallback(() => {
        if (filteredPhones.length === 0) return;

        const headers = [
            'Invoice No',
            'Date',
            'Time',
            'Device Name',
            'Brand',
            'Model',
            'IMEI',
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
            `"${p.date || ''}"`,
            `"${p.time || ''}"`,
            `"${(p.name || '').replace(/"/g, '""')}"`,
            `"${(p.brand || '').replace(/"/g, '""')}"`,
            `"${(p.model || '').replace(/"/g, '""')}"`,
            `"${p.imei ? `\t${p.imei}` : ''}"`,
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
        link.setAttribute('download', `sold_phones_history_${new Date().toISOString().slice(0, 10)}.csv`);
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
                                    {soldPhones.length} {soldPhones.length === 1 ? 'Phone' : 'Phones'}
                                </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-300">
                                Complete records of all sold mobile devices, IMEIs, specifications, prices, profits &amp; customer receipts.
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
                <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>Sold Phones</span>
                            <Smartphone size={15} className="text-sky-500" />
                        </div>
                        <p className="text-xl font-black text-slate-800 font-mono">{kpis.totalSold}</p>
                        <p className="text-[10px] text-slate-500">Filtered devices</p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                        <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">
                            <span>Total Revenue</span>
                            <DollarSign size={15} className="text-emerald-500" />
                        </div>
                        <p className="text-xl font-black text-emerald-700 font-mono">{priceTag(kpis.totalRevenue)}</p>
                        <p className="text-[10px] text-slate-500">Avg. {priceTag(kpis.avgPrice)} / device</p>
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
                            {filteredPhones.filter(p => Boolean(p.imei)).length} / {filteredPhones.length}
                        </p>
                        <p className="text-[10px] text-slate-500">With verified serial/IMEI</p>
                    </div>
                </div>

                {/* ── Search & Filter Controls ── */}
                <div className="p-3.5 bg-white border-b border-slate-100 space-y-2.5 shrink-0">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        {/* Search Input */}
                        <div className="sm:col-span-6 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by IMEI, Device Name, Customer, Invoice #..."
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

                        {/* Date Filter */}
                        <div className="sm:col-span-3">
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:bg-white focus:border-sky-500 outline-none cursor-pointer"
                            >
                                <option value="all">📅 All Time</option>
                                <option value="today">📅 Today</option>
                                <option value="7days">📅 Last 7 Days</option>
                                <option value="30days">📅 Last 30 Days</option>
                            </select>
                        </div>

                        {/* Sort Options */}
                        <div className="sm:col-span-3">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:bg-white focus:border-sky-500 outline-none cursor-pointer"
                            >
                                <option value="newest">🕒 Newest Sale First</option>
                                <option value="oldest">🕒 Oldest Sale First</option>
                                <option value="price_desc">💰 Price: High → Low</option>
                                <option value="profit_desc">📈 Profit: High → Low</option>
                            </select>
                        </div>
                    </div>

                    {/* Brand Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Brand:</span>
                        {brandList.map((brand) => (
                            <button
                                key={brand}
                                type="button"
                                onClick={() => setSelectedBrand(brand)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                                    selectedBrand.toLowerCase() === brand.toLowerCase()
                                        ? 'bg-sky-600 text-white shadow-xs'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {brand}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Table & Cards View ── */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-50/50">
                    {filteredPhones.length === 0 ? (
                        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
                            <Smartphone size={36} className="mx-auto text-slate-300 mb-2" />
                            <h3 className="text-sm font-bold text-slate-700">No sold phones found</h3>
                            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                                {searchQuery || selectedBrand !== 'All' || dateFilter !== 'all'
                                    ? 'Try changing your search keywords or filter criteria.'
                                    : 'When phones are sold through the POS or checkout, their full records and IMEIs will appear here.'}
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
                                        className="bg-white rounded-2xl border border-slate-200/80 p-3.5 hover:border-sky-300 hover:shadow-md transition-all space-y-3"
                                    >
                                        {/* Top Line: Date, Invoice, Status */}
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
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 font-medium">
                                                    By: <strong className="text-slate-700">{phone.soldBy}</strong>
                                                </span>
                                                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md text-slate-600 font-semibold">
                                                    {phone.paymentMethod}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Main Details: Device info, IMEI, Financials */}
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                                            {/* Device & Brand */}
                                            <div className="md:col-span-5 flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-xs">
                                                    <Smartphone size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-slate-100 text-slate-600 uppercase">
                                                            {phone.brand}
                                                        </span>
                                                        <h4 className="text-xs font-black text-slate-800 truncate">
                                                            {phone.name}
                                                        </h4>
                                                    </div>

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
                                                            onClick={() => handleCopyImei(phone.imei)}
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
                                                        <span className="text-slate-300">•</span>
                                                        <span className={`font-bold ${phone.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            {phone.profit >= 0 ? `+${priceTag(phone.profit)}` : priceTag(phone.profit)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {onViewTransaction && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onViewTransaction(phone.rawTxn)}
                                                        title="View full transaction / receipt"
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
                        Showing <strong className="text-slate-800">{filteredPhones.length}</strong> of <strong className="text-slate-800">{soldPhones.length}</strong> total sold phones
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
        </div>
    );
}
