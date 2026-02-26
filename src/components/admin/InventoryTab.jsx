import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { priceTag, CURRENCY_CONFIG } from '../../utils/currency';
import SmartCategoryForm from '../SmartCategoryForm';
import DateRangeFilter from './DateRangeFilter';
import {
    Package,
    AlertTriangle,
    TrendingUp,
    DollarSign,
    Search,
    Filter,
    Download,
    ExternalLink,
    Edit2,
    Trash2,
    Calendar,
    Printer,
    Tags,
    Percent,
    Scan,
    CheckCircle,
    XCircle
} from 'lucide-react';

const PURCHASE_LINKS_STORAGE_KEY = 'dailybooks_purchase_links_v1';

export default function InventoryTab() {
    const {
        products,
        transactions,
        deleteProduct,
        getLevel1Categories,
        getCategoryImage,
        bulkUpdateCategoryPricing,
        lookupBarcode,
        getProductDetails
    } = useInventory();
    const { slowMovingDays, activeShopId } = useAuth();

    // ── States ──
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterStatus, setFilterStatus] = useState('All');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isFormOpen, setIsFormOpen] = useState(false);

    // ── Date Range State ──
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 90)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);

    // ── New Feature States ──
    const [showBulkModal, setShowBulkModal] = useState(false);
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkPercentage, setBulkPercentage] = useState('');

    const [showAuditMode, setShowAuditMode] = useState(false);
    const [auditScans, setAuditScans] = useState(new Set());
    const [lastScanned, setLastScanned] = useState(null);
    const [importantLinks, setImportantLinks] = useState([]);
    const [linkName, setLinkName] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [editingLinkId, setEditingLinkId] = useState('');

    const getProductCategoryL1 = useCallback((product) => {
        if (!product) return '';
        if (typeof product.category === 'object' && product.category !== null) {
            return product.category.level1 || '';
        }
        if (typeof product.category === 'string') return product.category;
        return '';
    }, []);

    const formatAttrValue = useCallback((value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (Array.isArray(value)) return value.map(v => String(v)).join(', ');
        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    }, []);

    // ── Calculations ──
    const calculateMargin = (sell, buy) => {
        if (!sell || sell <= 0) return 0;
        return (((sell - buy) / sell) * 100).toFixed(1);
    };

    const isSlowMoving = (timestamp) => {
        if (!timestamp) return false;
        const addedDate = new Date(timestamp);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - slowMovingDays);
        return addedDate < cutoff;
    };

    const stats = useMemo(() => {
        const totalValue = products.reduce((sum, p) => sum + (p.purchasePrice * p.stock), 0);
        const uniqueItems = products.length;
        const lowStockCount = products.filter(p => p.stock < 3).length;
        return { totalValue, uniqueItems, lowStockCount };
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCategory = filterCategory === 'All' || getProductCategoryL1(p) === filterCategory;

            let matchesStatus = true;
            if (filterStatus === 'Red') matchesStatus = p.stock < 3;
            else if (filterStatus === 'Yellow') matchesStatus = p.stock >= 3 && p.stock < 6;
            else if (filterStatus === 'Green') matchesStatus = p.stock >= 6;

            return matchesSearch && matchesCategory && matchesStatus;
        });
    }, [products, searchTerm, filterCategory, filterStatus, getProductCategoryL1]);

    const categoryAnalysis = useMemo(() => {
        const analysis = {};
        products.forEach(p => {
            const cat = getProductCategoryL1(p) || 'Uncategorized';
            if (!analysis[cat]) analysis[cat] = { capital: 0, potentialProfit: 0 };
            analysis[cat].capital += p.purchasePrice * p.stock;
            const itemProfit = (p.sellingPrice - p.purchasePrice) * p.stock;
            analysis[cat].potentialProfit += itemProfit;
        });
        return Object.entries(analysis).map(([name, data]) => ({
            name,
            ...data
        }));
    }, [products, getProductCategoryL1]);

    const salesVelocityMap = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        const map = {};
        transactions.forEach(t => {
            if (t.type === 'income' && t.productId && t.timestamp) {
                const tDate = new Date(t.timestamp);
                if (tDate >= rangeStart && tDate <= rangeEnd) {
                    if (!map[t.productId]) map[t.productId] = 0;
                    map[t.productId] += (parseInt(t.quantity) || 1);
                }
            }
        });
        return map;
    }, [transactions, dateSelection]);

    const supplierInsights = useMemo(() => {
        const sources = {};
        products.forEach(p => {
            if (p.productUrl) {
                let sourceName = 'Unknown';
                try {
                    // Check if it's a URL
                    if (p.productUrl.startsWith('http')) {
                        sourceName = new URL(p.productUrl).hostname.replace('www.', '');
                    } else {
                        // Use raw text as source name (e.g. "Local Market")
                        sourceName = p.productUrl;
                    }

                    if (!sources[sourceName]) sources[sourceName] = { count: 0, totalBuy: 0 };
                    sources[sourceName].count += 1;
                    sources[sourceName].totalBuy += p.purchasePrice * p.stock;
                } catch (e) { /* ignore errors */ }
            }
        });
        return Object.entries(sources).sort((a, b) => b[1].totalBuy - a[1].totalBuy).slice(0, 5);
    }, [products]);


    // ── Handlers ──
    const handleDownloadCSV = () => {
        const headers = ['Barcode', 'Name', 'Category', 'Stock', 'Purchase Price', 'Selling Price', 'Margin %'];
        const rows = filteredProducts.map(p => [
            p.barcode || 'N/A',
            p.name,
            getProductCategoryL1(p) || 'N/A',
            p.stock,
            p.purchasePrice,
            p.sellingPrice,
            calculateMargin(p.sellingPrice, p.purchasePrice)
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `inventory_report_${new Date().toLocaleDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleEditProduct = async (product) => {
        try {
            const fullProduct = await getProductDetails(product.id, true);
            setSelectedProduct(fullProduct || product);
        } catch (error) {
            console.error('Failed to fetch full product details:', error);
            setSelectedProduct(product);
        } finally {
            setIsFormOpen(true);
        }
    };

    const handleBulkUpdate = () => {
        if (!bulkCategory || !bulkPercentage) return;
        if (window.confirm(`Update ALL products in ${bulkCategory} by ${bulkPercentage}%? This cannot be undone.`)) {
            bulkUpdateCategoryPricing(bulkCategory, parseFloat(bulkPercentage));
            setShowBulkModal(false);
            setBulkCategory('');
            setBulkPercentage('');
        }
    };

    const printLabel = (product) => {
        const printWindow = window.open('', '', 'width=600,height=400');

        // Extract Specs
        const specs = product.attributes || {};
        const ram = specs['RAM'] || specs['Ram'] || specs['ram'];
        const storage = specs['Storage'] || specs['storage'] || specs['Memory'] || specs['memory'];
        const showSpecs = ram || storage;

        printWindow.document.write(`
            <html>
                <head>
                    <style>
                        @media print {
                            body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
                            @page { size: auto; margin: 0; }
                        }
                        body { font-family: sans-serif; }
                        .label { 
                            width: 78mm; 
                            height: auto; 
                            border: 2px solid #000; 
                            padding: 10px; 
                            box-sizing: border-box; 
                            display: flex; 
                            flex-direction: column; 
                            align-items: center; 
                            text-align: center; 
                        }
                        .barcode-font { font-family: 'Libre Barcode 39', cursive; font-size: 34px; line-height: 1; margin: 5px 0 10px 0; white-space: nowrap; }
                        .price-tag { font-size: 28px; font-weight: 900; margin-top: auto; border-top: 2px solid #000; width: 100%; padding-top: 5px; }
                        .product-name { font-size: 26px; font-weight: bold; line-height: 1.1; max-height: 58px; overflow: hidden; margin-bottom: 2px; }
                        .specs { font-size: 14px; font-weight: bold; font-family: monospace; border: 1px solid #000; padding: 2px 8px; border-radius: 4px; margin-bottom: 5px; }
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
                </head>
                <body>
                    <div class="label">
                        <div class="barcode-font">*${product.barcode}*</div>
                        <div class="product-name">${product.name}</div>
                        ${showSpecs ? `<div class="specs">${ram ? ram : ''} ${ram && storage ? '|' : ''} ${storage ? storage : ''}</div>` : ''}
                        <div class="price-tag">${Math.round(product.sellingPrice)} €</div>
                    </div>
                    <script>
                        window.onload = function() { window.print(); window.close(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    // ── Audit Mode Logic ──
    useEffect(() => {
        if (!showAuditMode) return;

        const handleAuditScan = (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key === 'Enter') {
                // Assuming barcode is in buffer (simplified for demo, usually buffer logic needed)
                // Integrating simple prompt for now as a reliable fallback or assuming buffer exists
            }
        };
        // Re-using scanner buffer logic would be best, but for now let's rely on standard text input in audit mode or reuse the buffer from AdminDashboard if elevated?
        // Actually, let's make a dedicated hidden input for audit scanning to be robust.
    }, [showAuditMode]);

    // Simplified Audit Scanner: Just matches against searchTerm if in audit mode?
    // Let's allow manual entry in search bar to "Audit" items.
    useEffect(() => {
        if (showAuditMode && searchTerm) {
            const exactMatch = products.find(p => p.barcode === searchTerm.trim());
            if (exactMatch) {
                setAuditScans(prev => new Set(prev).add(exactMatch.id));
                setLastScanned(exactMatch);
                setSearchTerm(''); // Clear after scan
            }
        }
    }, [searchTerm, showAuditMode, products]);

    const linksStorageKey = `${PURCHASE_LINKS_STORAGE_KEY}:${String(activeShopId || '')}`;

    useEffect(() => {
        try {
            if (!activeShopId) {
                setImportantLinks([]);
                return;
            }
            const raw = localStorage.getItem(linksStorageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            setImportantLinks(Array.isArray(parsed) ? parsed : []);
        } catch {
            setImportantLinks([]);
        }
    }, [activeShopId, linksStorageKey]);

    useEffect(() => {
        if (!activeShopId) return;
        try {
            localStorage.setItem(linksStorageKey, JSON.stringify(importantLinks));
        } catch {
            // Ignore storage write errors.
        }
    }, [importantLinks, activeShopId, linksStorageKey]);

    const normalizeLinkUrl = useCallback((url) => {
        const raw = String(url || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        return `https://${raw}`;
    }, []);

    const handleSaveImportantLink = useCallback(() => {
        const name = String(linkName || '').trim();
        const url = normalizeLinkUrl(linkUrl);
        if (!name || !url) {
            alert('Please enter link title and URL.');
            return;
        }

        if (editingLinkId) {
            setImportantLinks((prev) => prev.map((row) => (
                String(row.id) === String(editingLinkId)
                    ? { ...row, name, url }
                    : row
            )));
        } else {
            setImportantLinks((prev) => ([
                { id: `link-${Date.now()}`, name, url, createdAt: new Date().toISOString() },
                ...prev
            ]));
        }
        setEditingLinkId('');
        setLinkName('');
        setLinkUrl('');
    }, [linkName, linkUrl, editingLinkId, normalizeLinkUrl]);

    const startEditImportantLink = useCallback((row) => {
        setEditingLinkId(String(row?.id || ''));
        setLinkName(String(row?.name || ''));
        setLinkUrl(String(row?.url || ''));
    }, []);

    const deleteImportantLink = useCallback((id) => {
        if (!window.confirm('Delete this purchase link?')) return;
        setImportantLinks((prev) => prev.filter((row) => String(row.id) !== String(id)));
        if (String(editingLinkId) === String(id)) {
            setEditingLinkId('');
            setLinkName('');
            setLinkUrl('');
        }
    }, [editingLinkId]);


    return (
        <div className="space-y-6">
            {/* ── Header with Date Filter ── */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Inventory Management</h1>
                    <p className="text-slate-500 text-sm font-medium">Product catalog, stock levels, and supplier analytics.</p>
                </div>
                <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Stock Value</p>
                        <p className="text-2xl font-black text-slate-800">{priceTag(stats.totalValue)}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Package size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique Items</p>
                        <p className="text-2xl font-black text-slate-800">{stats.uniqueItems}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 animate-pulse">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Low Stock Alerts</p>
                        <p className="text-2xl font-black text-slate-800">{stats.lowStockCount}</p>
                    </div>
                </div>

                {/* Audit Mode Toggle Card */}
                <div className={`p-6 rounded-3xl shadow-sm border cursor-pointer transition-all flex items-center gap-4 ${showAuditMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 hover:border-blue-200'}`}
                    onClick={() => setShowAuditMode(!showAuditMode)}
                >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${showAuditMode ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Scan size={24} />
                    </div>
                    <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${showAuditMode ? 'text-slate-400' : 'text-slate-400'}`}>Stock Audit Mode</p>
                        <p className="text-xl font-black">{showAuditMode ? 'ACTIVE' : 'Start Audit'}</p>
                    </div>
                </div>
            </div>

            {/* ── main Table & Analysis ── */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* ── Left: Main Table ── */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center justify-between">
                        <div className={`flex flex-1 min-w-[200px] items-center gap-3 px-4 py-2 rounded-2xl border transition-all ${showAuditMode ? 'bg-slate-50 border-emerald-400 ring-2 ring-emerald-100' : 'bg-slate-50 border-slate-100 focus-within:border-blue-300'}`}>
                            <Search size={18} className={showAuditMode ? "text-emerald-500" : "text-slate-400"} />
                            <input
                                type="text"
                                placeholder={showAuditMode ? "SCAN BARCODE TO VERIFY..." : "Search inventory..."}
                                className="bg-transparent border-none outline-none text-sm w-full font-medium"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                autoFocus={showAuditMode}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                            >
                                <option value="All">All Categories</option>
                                {getLevel1Categories().map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>

                            <button
                                onClick={() => setShowBulkModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all"
                            >
                                <Percent size={14} />
                                Bulk Update
                            </button>

                            <button
                                onClick={handleDownloadCSV}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-all shadow-md shadow-slate-200"
                            >
                                <Download size={14} />
                                Export
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[500px]">
                        <div className="md:hidden p-4 space-y-3">
                            {filteredProducts.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400 font-medium">
                                    No products found for selected filters.
                                </div>
                            ) : filteredProducts.map((product) => {
                                const slowMoving = isSlowMoving(product.timestamp);
                                const margin = calculateMargin(product.sellingPrice, product.purchasePrice);
                                const isAudited = auditScans.has(product.id);

                                return (
                                    <div
                                        key={`mobile-${product.id}`}
                                        className={`rounded-2xl border p-3 space-y-3 ${showAuditMode && isAudited
                                            ? 'border-emerald-200 bg-emerald-50/50'
                                            : slowMoving
                                                ? 'border-orange-200 bg-orange-50/30'
                                                : 'border-slate-100 bg-white'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="relative w-14 h-14 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center shrink-0">
                                                {product.image ? (
                                                    <img src={product.image} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <span className="text-xl">🛠️</span>
                                                )}
                                                {showAuditMode && (
                                                    <div className={`absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px] ${isAudited ? 'text-emerald-500' : 'text-slate-300'}`}>
                                                        {isAudited ? <CheckCircle size={22} className="drop-shadow-sm" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-bold text-slate-800 truncate">{product.name}</h4>
                                                    {slowMoving && (
                                                        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[9px] font-black uppercase tracking-tighter">Slow</span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{product.barcode || 'NO-BARCODE'}</p>
                                                <p className="text-[10px] font-bold text-blue-500 mt-0.5">{getProductCategoryL1(product) || 'Uncategorized'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-3">
                                            <div className={`inline-flex flex-col px-3 py-1 rounded-xl items-center ${product.stock < 3 ? 'bg-red-50 text-red-600 border border-red-100' :
                                                product.stock < 6 ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                    'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                }`}>
                                                <span className="text-lg font-black">{product.stock}</span>
                                                <span className="text-[8px] font-bold uppercase tracking-widest -mt-1 opacity-60">Units</span>
                                            </div>
                                            <div className="flex-1 text-xs space-y-1">
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold">Buy</span>
                                                    <span className="text-slate-700 font-black">{priceTag(product.purchasePrice)}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-slate-400 font-bold">Sell</span>
                                                    <span className="text-blue-600 font-black">{priceTag(product.sellingPrice)}</span>
                                                </div>
                                                <div className="flex justify-end">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${margin > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                                                        }`}>
                                                        {margin}% MARGIN
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(product.attributes || {})
                                                .filter(([key, val]) => !String(key).startsWith('__') && val !== null && val !== undefined && formatAttrValue(val) !== '')
                                                .slice(0, 5)
                                                .map(([key, val]) => (
                                                    <span key={`${product.id}-${key}`} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold">
                                                        {key.toUpperCase()}: {formatAttrValue(val)}
                                                    </span>
                                                ))}
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => printLabel(product)}
                                                className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center"
                                                title="Print QR Label"
                                            >
                                                <Tags size={14} />
                                            </button>
                                            {product.productUrl && (
                                                <a
                                                    href={product.productUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                    title="Supplier Link"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                            <button
                                                onClick={() => handleEditProduct(product)}
                                                className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                title="Edit Product"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => { if (window.confirm('Delete this product?')) deleteProduct(product.id); }}
                                                className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center"
                                                title="Delete Product"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Info</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Stock</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing & Margin</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredProducts.map(product => {
                                        const slowMoving = isSlowMoving(product.timestamp);
                                        const margin = calculateMargin(product.sellingPrice, product.purchasePrice);
                                        const isAudited = auditScans.has(product.id);

                                        return (
                                            <tr key={product.id} className={`group hover:bg-blue-50/30 transition-all 
                                                ${slowMoving ? 'bg-orange-50/30' : ''} 
                                                ${showAuditMode && isAudited ? 'bg-emerald-50/50' : ''}
                                            `}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="relative w-12 h-12 rounded-xl bg-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200">
                                                            {product.image ? (
                                                                <img src={product.image} className="w-full h-full object-cover" alt="" />
                                                            ) : (
                                                                <span className="text-xl">🛠️</span>
                                                            )}
                                                            {showAuditMode && (
                                                                <div className={`absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px] ${isAudited ? 'text-emerald-500' : 'text-slate-300'}`}>
                                                                    {isAudited ? <CheckCircle size={24} className="drop-shadow-sm" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-sm font-bold text-slate-800">{product.name}</h4>
                                                                {slowMoving && (
                                                                    <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[8px] font-black uppercase tracking-tighter shadow-sm">Slow Moving</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <p className="text-[10px] font-mono text-slate-400 font-bold">{product.barcode || 'NO-BARCODE'}</p>
                                                                <span className="text-slate-300">•</span>
                                                                <p className="text-[10px] font-bold text-blue-500">{getProductCategoryL1(product) || 'Uncategorized'}</p>
                                                            </div>
                                                            {/* Attribute Chips */}
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {Object.entries(product.attributes || {})
                                                                    .filter(([key, val]) => !String(key).startsWith('__') && val !== null && val !== undefined && formatAttrValue(val) !== '')
                                                                    .map(([key, val]) => (
                                                                        <span key={key} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold">
                                                                            {key.toUpperCase()}: {formatAttrValue(val)}
                                                                        </span>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className={`inline-flex flex-col px-3 py-1 rounded-2xl items-center ${product.stock < 3 ? 'bg-red-50 text-red-600 border border-red-100' :
                                                            product.stock < 6 ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                                'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                            }`}>
                                                            <span className="text-lg font-black">{product.stock}</span>
                                                            <span className="text-[8px] font-bold uppercase tracking-widest -mt-1 opacity-60">UNITS</span>
                                                        </div>
                                                        {(() => {
                                                            const unitsSold = salesVelocityMap[product.id] || 0;
                                                            const dailyVelocity = unitsSold / 30;
                                                            if (dailyVelocity > 0 && product.stock > 0) {
                                                                const daysRemaining = product.stock / dailyVelocity;
                                                                if (daysRemaining < 5) {
                                                                    return (
                                                                        <div className="px-2 py-0.5 rounded-lg bg-orange-100 border border-orange-200 text-orange-600 flex items-center gap-1 shadow-sm whitespace-nowrap animate-pulse mt-1" title={`${unitsSold} sold in 30 days`}>
                                                                            <span className="text-xs">🔮</span>
                                                                            <span className="text-[10px] font-black uppercase tracking-wider">{Math.ceil(daysRemaining)} Days Left!</span>
                                                                        </div>
                                                                    );
                                                                }
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-400 font-bold">Buy:</span>
                                                            <span className="text-slate-600 font-black">{priceTag(product.purchasePrice)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-400 font-bold">Sell:</span>
                                                            <span className="text-blue-600 font-black">{priceTag(product.sellingPrice)}</span>
                                                        </div>
                                                        <div className="pt-1 flex items-center justify-center">
                                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${margin > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                                                                }`}>
                                                                {margin}% MARGIN
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => printLabel(product)}
                                                            className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center"
                                                            title="Print QR Label"
                                                        >
                                                            <Tags size={14} />
                                                        </button>
                                                        {product.productUrl && (
                                                            <a href={product.productUrl} target="_blank" rel="noreferrer"
                                                                className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                                title="Supplier Link"
                                                            >
                                                                <ExternalLink size={14} />
                                                            </a>
                                                        )}
                                                        <button
                                                            onClick={() => handleEditProduct(product)}
                                                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => { if (window.confirm('Delete this product?')) deleteProduct(product.id); }}
                                                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ── Right: Analysis & Insights ── */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between gap-2 mb-4">
                            <div>
                                <h3 className="font-bold text-slate-800">Important Purchase Links</h3>
                                <p className="text-[11px] text-slate-400">Add supplier websites for quick stock purchases.</p>
                            </div>
                            <ExternalLink size={18} className="text-blue-500" />
                        </div>

                        <div className="space-y-2 mb-3">
                            <input
                                value={linkName}
                                onChange={(e) => setLinkName(e.target.value)}
                                placeholder="Link title"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                            />
                            <input
                                value={linkUrl}
                                onChange={(e) => setLinkUrl(e.target.value)}
                                placeholder="https://supplier.com"
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSaveImportantLink}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                                >
                                    {editingLinkId ? 'Update Link' : 'Add Link'}
                                </button>
                                {editingLinkId && (
                                    <button
                                        type="button"
                                        onClick={() => { setEditingLinkId(''); setLinkName(''); setLinkUrl(''); }}
                                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {importantLinks.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No links yet. Add your supplier URLs above.</p>
                            ) : importantLinks.map((row) => (
                                <div key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">{row.name}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{row.url}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => window.open(row.url, '_blank', 'noopener,noreferrer')}
                                                className="rounded-md border border-blue-200 bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100"
                                                title="Open link"
                                            >
                                                <ExternalLink size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => startEditImportantLink(row)}
                                                className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                                                title="Edit link"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteImportantLink(row.id)}
                                                className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                                                title="Delete link"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Supplier Insights */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-4">
                            <Package size={20} className="text-purple-500" />
                            <h3 className="font-bold text-slate-800">Top Suppliers</h3>
                        </div>
                        <div className="space-y-3">
                            {supplierInsights.map(([domain, data], idx) => (
                                <div key={domain} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-purple-50 transition-colors cursor-default group">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white text-[10px] font-bold text-slate-400 border border-slate-100 shadow-sm">{idx + 1}</span>
                                        <div>
                                            <p className="text-xs font-bold text-slate-700">{domain}</p>
                                            <p className="text-[10px] text-slate-400">{data.count} Products</p>
                                        </div>
                                    </div>
                                    <span className="text-xs font-black text-purple-600">{priceTag(data.totalBuy)}</span>
                                </div>
                            ))}
                            {supplierInsights.length === 0 && (
                                <p className="text-xs text-slate-400 italic text-center py-4">Add product URLs to see supplier insights.</p>
                            )}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-[2rem] shadow-xl text-white">
                        <div className="flex items-center gap-2 mb-6">
                            <TrendingUp size={20} className="text-blue-400" />
                            <h3 className="font-bold">Category Analysis</h3>
                        </div>

                        <div className="space-y-6">
                            {categoryAnalysis.map(cat => (
                                <div key={cat.name} className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{cat.name}</span>
                                        <span className="text-xs font-black text-blue-400">{priceTag(cat.capital)}</span>
                                    </div>
                                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-blue-500 h-full rounded-full"
                                            style={{ width: `${(cat.capital / stats.totalValue) * 100}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center pt-1">
                                        <span className="text-[10px] text-slate-500 font-bold italic">Exp. Profit</span>
                                        <span className="text-xs font-black text-emerald-400">+{priceTag(cat.potentialProfit)}</span>
                                    </div>
                                </div>
                            ))}

                            <div className="pt-6 border-t border-slate-700 mt-6">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Expected Return</p>
                                    <p className="text-2xl font-black text-emerald-400">
                                        {priceTag(categoryAnalysis.reduce((sum, c) => sum + c.potentialProfit, 0))}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-600 p-6 rounded-[2rem] shadow-lg shadow-blue-200 text-white relative overflow-hidden group">
                        <div className="relative z-10">
                            <h4 className="font-bold mb-2">Need to reorder?</h4>
                            <p className="text-xs text-blue-100 mb-4 opacity-80">Check out the 'Source' links in the table to buy directly from suppliers.</p>
                            <Calendar size={40} className="absolute -bottom-2 -right-2 opacity-20 group-hover:scale-110 transition-transform" />
                        </div>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    </div>
                </div>
            </div>

            {/* SmartCategoryForm Modal */}
            <SmartCategoryForm
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); setSelectedProduct(null); }}
                initialData={selectedProduct}
            />

            {/* Bulk Update Modal */}
            {
                showBulkModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-scale-in">
                            <h3 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2">
                                <Percent size={24} className="text-indigo-600" /> Bulk Pricing Update
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target Category</label>
                                    <select
                                        value={bulkCategory}
                                        onChange={e => setBulkCategory(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select Category...</option>
                                        {getLevel1Categories().map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Price Increase (%)</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 10 for +10%"
                                        value={bulkPercentage}
                                        onChange={e => setBulkPercentage(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-2 italic">Use negative values to decrease prices (e.g. -5 for 5% off).</p>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setShowBulkModal(false)}
                                        className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleBulkUpdate}
                                        disabled={!bulkCategory || !bulkPercentage}
                                        className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Apply Update
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
