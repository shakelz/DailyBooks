import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bell, Calculator, CalendarDays, CircleDollarSign, ClipboardList, Menu, PackagePlus, Receipt, Scale, Search, ShoppingCart, Smartphone, Sparkles, Wrench, CircleHelp, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { priceTag } from '../utils/currency';
import SalesmanProfile from '../components/SalesmanProfile';
import CategoryManagerModal from '../components/CategoryManagerModal';
import RepairModal from '../components/RepairModal';
import SmartCategoryForm from '../components/SmartCategoryForm';
import TransactionModal from '../components/TransactionModal';
import { useRepairs } from '../context/RepairsContext';

const DEFAULT_PAYMENT_MODES = ['Cash', 'SumUp', 'Bank Transfer'];
const ONLINE_ORDER_COLORS = ['Black', 'White', 'Blue', 'Red', 'Green', 'Gold', 'Silver', 'Custom'];

const newQuickSaleItem = () => ({
    productId: '',
    barcode: '',
    name: '',
    category: '',
    quantity: '1',
    amount: '',
    paymentMode: 'Cash',
    notes: '',
});

function normalizePaymentKey(value) {
    const raw = String(value || 'cash').trim().toLowerCase();
    if (!raw) return 'cash';
    if (raw.includes('sumup')) return 'sumup';
    if (raw.includes('cash')) return 'cash';
    return raw;
}

function buildPaymentBreakdown(transactions = []) {
    return transactions.reduce((acc, txn) => {
        const key = normalizePaymentKey(txn.paymentMethod);
        const amount = parseFloat(txn.amount) || 0;
        acc[key] = (acc[key] || 0) + amount;
        return acc;
    }, {});
}

function toBreakdownRows(map = {}) {
    const rows = Object.entries(map)
        .map(([key, total]) => ({
            key,
            label: key === 'sumup' ? 'SumUp' : key.charAt(0).toUpperCase() + key.slice(1),
            total,
        }))
        .sort((a, b) => b.total - a.total);
    return rows.length ? rows : [{ key: 'cash', label: 'Cash', total: 0 }];
}

function onlineOrderStorageKey(user) {
    return `dailybooks_online_orders_v1:${String(user?.shop_id || '')}:${String(user?.id || '')}`;
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function newSimpleEntryForm() {
    return {
        date: todayIsoDate(),
        paymentMode: 'Cash',
        category: '',
        subCategory: '',
        productName: '',
        productId: '',
        amount: '',
    };
}

function randomOnlineOrderId() {
    return `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
}

function newOnlineOrderForm() {
    return {
        orderId: randomOnlineOrderId(),
        platform: '',
        itemName: '',
        category: '',
        color: '',
        customColor: '',
        quantity: '1',
        amount: '',
        orderDate: todayIsoDate(),
        paymentStatus: 'Paid',
        notes: '',
    };
}

function extractCategoryName(category) {
    if (!category) return '';
    if (typeof category === 'string') return category;
    return category.level1 || '';
}

function buildTransactionDraft(txn = {}) {
    return {
        desc: String(txn.desc || ''),
        category: extractCategoryName(txn.category) || '',
        amount: String(parseFloat(txn.amount) || 0),
        quantity: String(Math.max(1, parseInt(txn.quantity || '1', 10) || 1)),
        paymentMethod: String(txn.paymentMethod || 'Cash'),
        notes: String(txn.notes || ''),
    };
}

function resolveProductSnapshot(product = {}) {
    const categoryRaw = product.category || product.productCategory || product.cat || '';
    const sellingPrice = Number(
        product.sellingPrice ?? product.salePrice ?? product.price ?? product.selling_price ?? 0
    ) || 0;
    const purchasePrice = Number(
        product.purchasePrice ?? product.costPrice ?? product.buyPrice ?? product.purchase_price ?? 0
    ) || 0;

    return {
        id: String(product.id ?? product.productId ?? product.product_id ?? ''),
        name: String(product.name || product.productName || product.title || product.desc || '').trim(),
        barcode: String(product.barcode || product.barCode || product.sku || product.code || '').trim(),
        category: extractCategoryName(categoryRaw) || String(product.categoryName || 'General'),
        subCategory: typeof categoryRaw === 'object' ? String(categoryRaw.level2 || '') : '',
        stock: Number(product.stock ?? product.qty ?? product.quantity ?? 0) || 0,
        sellingPrice,
        purchasePrice,
        raw: product,
    };
}

function categoryTotals(transactions) {
    const map = new Map();
    transactions.forEach((txn) => {
        const cat = extractCategoryName(txn.category) || 'General';
        const current = map.get(cat) || { total: 0, count: 0 };
        current.total += (parseFloat(txn.amount) || 0);
        current.count += 1;
        map.set(cat, current);
    });

    return Array.from(map.entries())
        .map(([name, value]) => ({ name, total: Number(value.total.toFixed(2)), count: value.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
}

function MiniDonut({ items }) {
    const [hoveredSlice, setHoveredSlice] = useState(-1);
    const source = (items || []).slice(0, 5);
    const total = source.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    const activeIndex = hoveredSlice >= 0 ? hoveredSlice : 0;

    if (!source.length || total <= 0) {
        return <div className="h-40 w-40 rounded-full border border-white/15 bg-slate-900/60" />;
    }

    const radius = 60;
    const stroke = 18;
    const circumference = 2 * Math.PI * radius;
    const colors = ['#8EE9DF', '#47C6AA', '#609AF8', '#FF7A85', '#9CA3AF'];

    let offsetProgress = 0;
    const segments = source.map((row, index) => {
        const ratio = (Number(row.total) || 0) / total;
        const dash = ratio * circumference;
        const segment = {
            index,
            name: row.name,
            total: row.total,
            count: row.count,
            color: colors[index % colors.length],
            dash,
            offset: -offsetProgress,
        };
        offsetProgress += dash;
        return segment;
    });

    return (
        <div className="relative h-40 w-40">
            <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
                {segments.map((seg) => (
                    <circle
                        key={seg.index}
                        cx="80"
                        cy="80"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={hoveredSlice === seg.index ? stroke + 5 : stroke}
                        strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                        strokeDashoffset={seg.offset}
                        strokeLinecap="butt"
                        className="cursor-pointer transition-all duration-200"
                        style={{
                            opacity: hoveredSlice === -1 || hoveredSlice === seg.index ? 1 : 0.35,
                            filter: hoveredSlice === seg.index ? 'drop-shadow(0 0 6px rgba(14,165,233,0.45))' : 'none',
                        }}
                        onMouseEnter={() => setHoveredSlice(seg.index)}
                        onMouseLeave={() => setHoveredSlice(-1)}
                    />
                ))}
            </svg>

            <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-full pointer-events-none transition-transform duration-200 ${hoveredSlice >= 0 ? 'scale-[1.06]' : 'scale-100'}`}>
                <p className="text-[10px] font-semibold text-slate-500">{segments[activeIndex]?.name || 'Category'}</p>
                <p className="text-xs font-bold text-slate-700">{priceTag(segments[activeIndex]?.total || 0)}</p>
                <p className="text-[10px] text-slate-400">{segments[activeIndex]?.count || 0} items</p>
            </div>
        </div>
    );
}

function CompactTrendCard({ label, value, colorClass }) {
    const iconMap = {
        'Total Revenue': <CircleDollarSign size={16} />,
        'Total Expenses': <Receipt size={16} />,
        'Total Income': <Wallet size={16} />,
    };

    return (
        <div
            className={`kpi-animate-card relative rounded-2xl border px-3 py-3 bg-white shadow-sm ${colorClass}`}
        >
            <div className="flex items-center gap-2 text-slate-500">
                {iconMap[label] || <BarChart3 size={16} />}
                <p className="text-[11px] font-semibold">{label}</p>
            </div>
            <p className={`text-lg font-black mt-1 ${
                label === 'Total Revenue' ? 'text-emerald-700' :
                    label === 'Total Expenses' ? 'text-rose-700' :
                        'text-blue-800'
                }`}>{priceTag(value)}</p>

            <div className="absolute right-3 top-3 opacity-70">
                {label === 'Total Revenue' ? (
                    <svg width="84" height="28" viewBox="0 0 84 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 22C9 22 12 22 16 18C20 14 24 8 31 10C38 12 38 20 45 20C52 20 53 10 60 10C67 10 70 16 77 16C80 16 82 14 82 14" stroke="#B6F7EE" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                ) : label === 'Total Income' ? (
                    <Scale size={26} className="text-blue-200" />
                ) : (
                    <Receipt size={24} className="text-rose-400" />
                )}
            </div>

        </div>
    );
}

export default function SalesmanDashboard() {
    const navigate = useNavigate();
    const { role, user, isPunchedIn, activeShop, billShowTax } = useAuth();
    const {
        products,
        transactions,
        lookupBarcode,
        searchProducts,
        addTransaction,
        updateTransaction,
        adjustStock,
        getLevel1Categories,
        getLevel2Categories,
    } = useInventory();
    const { repairJobs } = useRepairs();
    const pendingOrders = useMemo(() => repairJobs.filter((job) => job.status === 'pending'), [repairJobs]);

    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showRepairModal, setShowRepairModal] = useState(false);
    const [toast, setToast] = useState('');
    const paymentModes = DEFAULT_PAYMENT_MODES;
    const [salesEntry, setSalesEntry] = useState(newSimpleEntryForm());
    const [purchaseEntry, setPurchaseEntry] = useState(newSimpleEntryForm());
    const [salesEntryErrors, setSalesEntryErrors] = useState({});
    const [purchaseEntryErrors, setPurchaseEntryErrors] = useState({});
    const [realtimeStats, setRealtimeStats] = useState(null);
    const [showPendingOrders, setShowPendingOrders] = useState(false);
    const [pendingTab, setPendingTab] = useState('orders');
    const [onlineOrders, setOnlineOrders] = useState([]);
    const [showOnlineOrderForm, setShowOnlineOrderForm] = useState(false);
    const [onlineOrderForm, setOnlineOrderForm] = useState(newOnlineOrderForm());
    const [topBarcodeQuery, setTopBarcodeQuery] = useState('');
    const [topBarcodeMatches, setTopBarcodeMatches] = useState([]);
    const [showTopBarcodeMatches, setShowTopBarcodeMatches] = useState(false);
    const [showCalc, setShowCalc] = useState(false);
    const [calcDisplay, setCalcDisplay] = useState('0');
    const [calcPrev, setCalcPrev] = useState(null);
    const [calcOp, setCalcOp] = useState(null);
    const [showQuickSaleModal, setShowQuickSaleModal] = useState(false);
    const [quickSaleForm, setQuickSaleForm] = useState(newQuickSaleItem());
    const [quickSaleCart, setQuickSaleCart] = useState([]);
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [formMode, setFormMode] = useState('inventory');
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showMobileInventoryModal, setShowMobileInventoryModal] = useState(false);
    const [mobileInventorySearch, setMobileInventorySearch] = useState('');
    const [showSalesProductSuggestions, setShowSalesProductSuggestions] = useState(false);
    const [showPurchaseProductSuggestions, setShowPurchaseProductSuggestions] = useState(false);
    const [showTransactionDetailModal, setShowTransactionDetailModal] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [transactionDraft, setTransactionDraft] = useState(null);
    const [transactionFormError, setTransactionFormError] = useState('');
    const [isSavingTransaction, setIsSavingTransaction] = useState(false);
    const salesDateInputRef = useRef(null);
    const purchaseDateInputRef = useRef(null);
    const canEditTransactions = Boolean(user?.canEditTransactions);

    useEffect(() => {
        if (!user || role !== 'salesman') navigate('/');
    }, [navigate, role, user]);


    const dayStart = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, [transactions]);

    const todayTransactions = useMemo(
        () => transactions.filter((txn) => {
            const dt = txn?.timestamp ? new Date(txn.timestamp) : null;
            return dt && !Number.isNaN(dt.getTime()) && dt >= dayStart;
        }),
        [transactions, dayStart]
    );

    const revenueTransactions = useMemo(
        () => todayTransactions.filter((txn) => txn.type === 'income'),
        [todayTransactions]
    );
    const purchaseTransactions = useMemo(
        () => todayTransactions.filter((txn) => txn.type === 'expense' && (txn.source === 'purchase' || String(txn.desc || '').toLowerCase().includes('purchase'))),
        [todayTransactions]
    );

    const fallbackStats = useMemo(() => {
        const totalRevenue = revenueTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        const totalExpenses = purchaseTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        return {
            totals: {
                revenue: totalRevenue,
                expenses: totalExpenses,
                income: totalRevenue - totalExpenses,
            },
        };
    }, [purchaseTransactions, revenueTransactions]);

    const revenueBreakdown = useMemo(() => buildPaymentBreakdown(revenueTransactions), [revenueTransactions]);
    const purchaseBreakdown = useMemo(() => buildPaymentBreakdown(purchaseTransactions), [purchaseTransactions]);
    const incomeBreakdown = useMemo(() => {
        const keys = new Set([...Object.keys(revenueBreakdown), ...Object.keys(purchaseBreakdown)]);
        const combined = {};
        keys.forEach((key) => {
            combined[key] = (revenueBreakdown[key] || 0) - (purchaseBreakdown[key] || 0);
        });
        return combined;
    }, [purchaseBreakdown, revenueBreakdown]);

    useEffect(() => {
        const endpoint = import.meta.env.VITE_CF_DO_STATS_URL;
        if (!endpoint) {
            setRealtimeStats(null);
            return undefined;
        }

        let cancelled = false;
        const pull = async () => {
            try {
                const res = await fetch(endpoint, { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled || !data || !data.totals || !data.trend) return;
                setRealtimeStats(data);
            } catch {
                setRealtimeStats(null);
            }
        };

        pull();
        const id = setInterval(pull, 15000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    const activeStats = realtimeStats || fallbackStats;

    const l1OptionsRaw = getLevel1Categories() || [];
    const l1Options = l1OptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
    const salesSubCategoryOptionsRaw = salesEntry.category ? (getLevel2Categories(salesEntry.category) || []) : [];
    const salesSubCategoryOptions = salesSubCategoryOptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
    const purchaseSubCategoryOptionsRaw = purchaseEntry.category ? (getLevel2Categories(purchaseEntry.category) || []) : [];
    const purchaseSubCategoryOptions = purchaseSubCategoryOptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);

    const resolveProductSuggestions = (query, level1, level2) => {
        const trimmed = String(query || '').trim();
        if (!trimmed) return [];
        return searchProducts(trimmed)
            .map((product) => ({ raw: product, snapshot: resolveProductSnapshot(product) }))
            .filter(({ snapshot }) => {
                const sameLevel1 = !level1 || String(snapshot.category || '').toLowerCase() === String(level1).toLowerCase();
                const sameLevel2 = !level2 || String(snapshot.subCategory || '').toLowerCase() === String(level2).toLowerCase();
                return sameLevel1 && sameLevel2;
            })
            .slice(0, 8);
    };

    const salesProductSuggestions = useMemo(
        () => resolveProductSuggestions(salesEntry.productName, salesEntry.category, salesEntry.subCategory),
        [salesEntry.productName, salesEntry.category, salesEntry.subCategory, searchProducts]
    );
    const purchaseProductSuggestions = useMemo(
        () => resolveProductSuggestions(purchaseEntry.productName, purchaseEntry.category, purchaseEntry.subCategory),
        [purchaseEntry.productName, purchaseEntry.category, purchaseEntry.subCategory, searchProducts]
    );

    const mobileInventoryProducts = useMemo(() => {
        const query = String(mobileInventorySearch || '').trim().toLowerCase();
        const isMobileLike = (snapshot) => {
            const categoryText = `${snapshot.category || ''} ${snapshot.subCategory || ''}`.toLowerCase();
            const nameText = String(snapshot.name || '').toLowerCase();
            return categoryText.includes('mobile')
                || categoryText.includes('phone')
                || categoryText.includes('smart')
                || nameText.includes('mobile')
                || nameText.includes('iphone')
                || nameText.includes('samsung');
        };

        return (products || [])
            .map((product) => {
                const snapshot = resolveProductSnapshot(product);
                return { raw: product, snapshot };
            })
            .filter(({ snapshot }) => isMobileLike(snapshot))
            .filter(({ snapshot }) => {
                if (!query) return true;
                const searchable = `${snapshot.name || ''} ${snapshot.category || ''} ${snapshot.subCategory || ''} ${snapshot.barcode || ''}`.toLowerCase();
                return searchable.includes(query);
            })
            .sort((a, b) => String(a.snapshot.name || '').localeCompare(String(b.snapshot.name || ''), undefined, { sensitivity: 'base' }));
    }, [mobileInventorySearch, products]);

    const buildSelectedDate = (dateValue) => {
        const selected = new Date(`${dateValue}T00:00:00`);
        if (Number.isNaN(selected.getTime())) return new Date();
        const now = new Date();
        selected.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        return selected;
    };

    const openDatePicker = (inputRef) => {
        const input = inputRef?.current;
        if (!input) return;
        if (typeof input.showPicker === 'function') {
            input.showPicker();
            return;
        }
        input.focus();
    };

    const applyEntryProduct = (mode, product) => {
        const resolved = resolveProductSnapshot(product);
        const nextAmount = mode === 'purchase'
            ? (resolved.purchasePrice || resolved.sellingPrice || 0)
            : (resolved.sellingPrice || 0);
        const patch = {
            productId: resolved.id || '',
            productName: resolved.name || '',
            category: resolved.category || '',
            subCategory: resolved.subCategory || '',
            amount: nextAmount > 0 ? String(nextAmount) : '',
        };
        if (mode === 'sales') {
            setSalesEntry((prev) => ({ ...prev, ...patch }));
            setSalesEntryErrors((prev) => ({ ...prev, category: '', amount: '' }));
            setShowSalesProductSuggestions(false);
        } else {
            setPurchaseEntry((prev) => ({ ...prev, ...patch }));
            setPurchaseEntryErrors((prev) => ({ ...prev, category: '', amount: '' }));
            setShowPurchaseProductSuggestions(false);
        }
    };

    const handleEntryProductQueryChange = (mode, value) => {
        const nextValue = String(value || '');
        if (mode === 'sales') {
            setSalesEntry((prev) => ({ ...prev, productName: nextValue, productId: '' }));
            setShowSalesProductSuggestions(true);
        } else {
            setPurchaseEntry((prev) => ({ ...prev, productName: nextValue, productId: '' }));
            setShowPurchaseProductSuggestions(true);
        }

        const trimmed = nextValue.trim();
        if (!trimmed) {
            if (mode === 'sales') setShowSalesProductSuggestions(false);
            else setShowPurchaseProductSuggestions(false);
            return;
        }
        const exact = lookupBarcode(trimmed);
        if (!exact) return;
        const exactResolved = resolveProductSnapshot(exact);
        if (String(exactResolved.barcode || '').toLowerCase() === trimmed.toLowerCase()) {
            applyEntryProduct(mode, exact);
        }
    };

    const validateSimpleEntry = (entry) => {
        const nextErrors = {};
        const parsedDate = new Date(`${entry?.date || ''}T00:00:00`);
        const amountValue = Number(entry?.amount);

        if (!entry?.date || Number.isNaN(parsedDate.getTime())) nextErrors.date = 'Select a valid date';
        if (!String(entry?.paymentMode || '').trim()) nextErrors.paymentMode = 'Select payment mode';
        if (!String(entry?.category || '').trim()) nextErrors.category = 'Select category';
        if (!Number.isFinite(amountValue) || amountValue <= 0) nextErrors.amount = 'Enter valid amount';

        return nextErrors;
    };

    const submitSimpleEntry = async (mode = 'sales') => {
        if (!isPunchedIn) {
            alert('Please punch in first');
            setShowProfileModal(true);
            return;
        }

        const entry = mode === 'sales' ? salesEntry : purchaseEntry;
        const nextErrors = validateSimpleEntry(entry);
        if (Object.keys(nextErrors).length > 0) {
            if (mode === 'sales') setSalesEntryErrors(nextErrors);
            else setPurchaseEntryErrors(nextErrors);
            alert('Please fix form errors');
            return;
        }
        if (mode === 'sales') setSalesEntryErrors({});
        else setPurchaseEntryErrors({});

        const amountValue = parseFloat(entry.amount) || 0;
        const selectedDate = buildSelectedDate(entry.date);
        const type = mode === 'sales' ? 'income' : 'expense';
        const productLabel = String(entry.productName || '').trim();
        const descLabel = productLabel
            ? `${mode === 'sales' ? 'Sale' : 'Purchase'} - ${productLabel}`
            : `${mode === 'sales' ? 'Sale' : 'Purchase'} - ${entry.category}`;

        await addTransaction({
            desc: descLabel,
            amount: amountValue,
            quantity: 1,
            type,
            category: entry.category,
            paymentMethod: entry.paymentMode || 'Cash',
            notes: entry.subCategory ? `SubCategory: ${entry.subCategory}` : '',
            source: type === 'expense' ? 'purchase' : 'shop',
            salesmanName: user?.name,
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
            productId: entry.productId || undefined,
            timestamp: selectedDate.toISOString(),
            date: selectedDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: selectedDate.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        });

        if (type === 'income' && entry.productId) {
            await adjustStock(entry.productId, -1);
        }

        setToast(`${mode === 'sales' ? 'Sales' : 'Purchase'} saved`);
        setTimeout(() => setToast(''), 1800);
        if (mode === 'sales') {
            setSalesEntry(newSimpleEntryForm());
            setSalesEntryErrors({});
        } else {
            setPurchaseEntry(newSimpleEntryForm());
            setPurchaseEntryErrors({});
        }
    };

    const printRecentTransaction = (txn) => {
        if (!txn) return;

        const amountValue = parseFloat(txn.amount) || 0;
        const isSale = txn.type === 'income';
        const netTotal = amountValue / 1.19;
        const taxTotal = amountValue - netTotal;
        const shopName = activeShop?.name || 'Shop';
        const shopAddress = activeShop?.address || activeShop?.location || '';
        const txnDate = txn.timestamp ? new Date(txn.timestamp) : new Date();
        const popup = window.open('', 'recent-transaction-receipt', 'width=420,height=760');
        if (!popup) return;

        const escapeHtml = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');

        popup.document.write(`
            <html>
                <head>
                    <title>Beleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                    </style>
                </head>
                <body>
                    <h2>${escapeHtml(shopName)}</h2>
                    ${shopAddress ? `<p>${escapeHtml(shopAddress)}</p>` : ''}
                    <p>${txnDate.toLocaleString('de-DE')}</p>
                    <div class="line"></div>
                    <div class="row"><span>Typ</span><span>${isSale ? 'Verkauf' : 'Einkauf'}</span></div>
                    <div class="row"><span>Position</span><span>${escapeHtml(txn.desc || 'Transaktion')}</span></div>
                    <div class="row"><span>Kategorie</span><span>${escapeHtml(extractCategoryName(txn.category) || '-')}</span></div>
                    <div class="row"><span>Zahlung</span><span>${escapeHtml(txn.paymentMethod || 'Cash')}</span></div>
                    <div class="line"></div>
                    <div class="row"><strong>Zwischensumme</strong><strong>EUR ${amountValue.toFixed(2)}</strong></div>
                    ${billShowTax ? `<div class="row"><span>Netto (19%)</span><span>EUR ${netTotal.toFixed(2)}</span></div>
                    <div class="row"><span>USt (19%)</span><span>EUR ${taxTotal.toFixed(2)}</span></div>` : ''}
                    <div class="row"><strong>GESAMTBETRAG</strong><strong>EUR ${amountValue.toFixed(2)}</strong></div>
                    <div class="line"></div>
                    <p style="font-size:10px">Rueckgabe/Umtausch innerhalb von 14 Tagen nur bei Schaden mit Beleg.</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const openTransactionDetailModal = (txn) => {
        if (!txn) return;
        setSelectedTransaction(txn);
        setTransactionDraft(buildTransactionDraft(txn));
        setTransactionFormError('');
        setShowTransactionDetailModal(true);
    };

    const closeTransactionDetailModal = () => {
        setShowTransactionDetailModal(false);
        setSelectedTransaction(null);
        setTransactionDraft(null);
        setTransactionFormError('');
        setIsSavingTransaction(false);
    };

    const saveTransactionChanges = async () => {
        if (!canEditTransactions || !selectedTransaction || !transactionDraft) return;

        const nextDesc = String(transactionDraft.desc || '').trim();
        const nextCategory = String(transactionDraft.category || '').trim();
        const nextPayment = String(transactionDraft.paymentMethod || '').trim();
        const nextAmount = parseFloat(transactionDraft.amount);
        const nextQty = Math.max(1, parseInt(transactionDraft.quantity || '1', 10) || 1);
        if (!nextDesc || !nextCategory || !nextPayment || !Number.isFinite(nextAmount) || nextAmount <= 0) {
            setTransactionFormError('Description, category, payment mode and a valid amount are required.');
            return;
        }

        setIsSavingTransaction(true);
        setTransactionFormError('');
        try {
            const payload = {
                desc: nextDesc,
                category: nextCategory,
                paymentMethod: nextPayment,
                amount: nextAmount,
                quantity: nextQty,
                notes: String(transactionDraft.notes || ''),
            };
            const updated = await updateTransaction(selectedTransaction.id, payload);
            const mergedTxn = { ...(selectedTransaction || {}), ...payload, ...(updated || {}) };
            setSelectedTransaction(mergedTxn);
            setTransactionDraft(buildTransactionDraft(mergedTxn));
            setToast('Transaction updated');
            setTimeout(() => setToast(''), 1800);
        } catch (error) {
            setTransactionFormError(error?.message || 'Failed to update transaction');
        } finally {
            setIsSavingTransaction(false);
        }
    };

    const printTransactionDraft = () => {
        if (!selectedTransaction || !transactionDraft) return;
        printRecentTransaction({
            ...selectedTransaction,
            desc: transactionDraft.desc,
            category: transactionDraft.category,
            paymentMethod: transactionDraft.paymentMethod,
            amount: parseFloat(transactionDraft.amount) || 0,
            quantity: Math.max(1, parseInt(transactionDraft.quantity || '1', 10) || 1),
            notes: transactionDraft.notes,
        });
    };

    const printPendingRepairBill = (job) => {
        if (!job) return;
        const shopName = activeShop?.name || 'Shop';
        const shopAddress = activeShop?.address || activeShop?.location || '';
        const popup = window.open('', 'pending-repair-bill', 'width=420,height=760');
        if (!popup) return;

        const toSafe = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');

        const createdAt = job.createdAt ? new Date(job.createdAt) : new Date();
        popup.document.write(`
            <html>
                <head>
                    <title>Reparaturbeleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                    </style>
                </head>
                <body>
                    <h2>${toSafe(shopName)}</h2>
                    ${shopAddress ? `<p>${toSafe(shopAddress)}</p>` : ''}
                    <p>${createdAt.toLocaleString('de-DE')}</p>
                    <div class="line"></div>
                    <div class="row"><span>Auftrag</span><span>${toSafe(job.refId || job.id || '-')}</span></div>
                    <div class="row"><span>Kunde</span><span>${toSafe(job.customerName || '-')}</span></div>
                    <div class="row"><span>Telefon</span><span>${toSafe(job.customerPhone || '-')}</span></div>
                    <div class="row"><span>Geraet</span><span>${toSafe(job.deviceModel || '-')}</span></div>
                    <div class="row"><span>Problem</span><span>${toSafe(job.problem || job.issueType || '-')}</span></div>
                    <div class="row"><span>Status</span><span>Ausstehend</span></div>
                    <div class="line"></div>
                    <div class="row"><span>Kostenvoranschlag</span><span>EUR ${(parseFloat(job.estimatedCost) || 0).toFixed(2)}</span></div>
                    <div class="row"><span>Anzahlung</span><span>EUR ${(parseFloat(job.advanceAmount) || 0).toFixed(2)}</span></div>
                    <div class="row"><span>Lieferdatum</span><span>${toSafe(job.deliveryDate || '-')}</span></div>
                    <div class="line"></div>
                    <p style="font-size:10px">Bitte Beleg zur Abholung mitbringen.</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const sellMobileFromInventory = (product) => {
        setSelectedProduct(product);
        setShowTransactionModal(true);
        setShowMobileInventoryModal(false);
    };

    const handleAddToBill = async (productWithQty) => {
        try {
            await addTransaction(productWithQty);
            await adjustStock(productWithQty.productId || productWithQty.id, -(parseInt(productWithQty.quantity || 1, 10) || 1));
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 1800);
            setShowTransactionModal(false);
            setSelectedProduct(null);
        } catch (error) {
            alert(error?.message || 'Failed to complete sale');
        }
    };

    const openSalesFormWithProduct = (product) => {
        if (!product) return;
        const resolved = resolveProductSnapshot(product);
        setSalesEntry((prev) => ({
            ...prev,
            productId: resolved.id || '',
            productName: resolved.name || '',
            category: resolved.category || prev.category,
            subCategory: resolved.subCategory || '',
            amount: String(resolved.sellingPrice || prev.amount || ''),
        }));
        setQuickSaleForm({
            productId: resolved.id,
            barcode: resolved.barcode,
            name: resolved.name,
            category: resolved.category || 'General',
            quantity: '1',
            amount: String(resolved.sellingPrice || ''),
            paymentMode: 'Cash',
            notes: resolved.stock ? `Stock: ${resolved.stock}` : '',
        });
        setQuickSaleCart([]);
        setShowQuickSaleModal(true);
        setShowTopBarcodeMatches(false);
    };

    const addQuickSaleToCart = () => {
        const qty = Math.max(1, parseInt(quickSaleForm.quantity || '1', 10) || 1);
        const unit = parseFloat(quickSaleForm.amount || '0') || 0;
        if (!quickSaleForm.name.trim() || unit <= 0) {
            alert('Product name and amount are required');
            return;
        }

        const line = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
            productId: quickSaleForm.productId,
            barcode: quickSaleForm.barcode,
            name: quickSaleForm.name.trim(),
            category: quickSaleForm.category || 'General',
            quantity: qty,
            amount: unit,
            total: qty * unit,
            paymentMode: quickSaleForm.paymentMode || 'Cash',
            notes: quickSaleForm.notes || '',
        };

        setQuickSaleCart((prev) => [line, ...prev]);
        setQuickSaleForm((prev) => ({ ...prev, quantity: '1', notes: '' }));
    };

    const printQuickSaleSlip = () => {
        const lines = quickSaleCart.length
            ? quickSaleCart
            : (() => {
                const qty = Math.max(1, parseInt(quickSaleForm.quantity || '1', 10) || 1);
                const unit = parseFloat(quickSaleForm.amount || '0') || 0;
                if (!quickSaleForm.name.trim() || unit <= 0) return [];
                return [{ name: quickSaleForm.name.trim(), quantity: qty, amount: unit, total: qty * unit }];
            })();

        if (!lines.length) {
            alert('No sale item to print');
            return;
        }

        const grandTotal = lines.reduce((sum, line) => sum + (line.total || 0), 0);
        const netTotal = grandTotal / 1.19;
        const taxTotal = grandTotal - netTotal;
        const shopName = activeShop?.name || 'Shop';
        const shopAddress = activeShop?.address || activeShop?.location || '';
        const popup = window.open('', 'quick-sale-receipt', 'width=420,height=760');
        if (!popup) return;

        popup.document.write(`
            <html>
                <head>
                    <title>Kassenbeleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                    </style>
                </head>
                <body>
                    <h2>${shopName}</h2>
                    ${shopAddress ? `<p>${shopAddress}</p>` : ''}
                    <p>${new Date().toLocaleString('de-DE')}</p>
                    <div class="line"></div>
                    ${lines.map((line) => `<div class="row"><span>${line.name}</span><span>${line.quantity} x ${line.amount.toFixed(2)}</span><strong>EUR ${line.total.toFixed(2)}</strong></div>`).join('')}
                    <div class="line"></div>
                    <div class="row"><strong>Zwischensumme</strong><strong>EUR ${grandTotal.toFixed(2)}</strong></div>
                    ${billShowTax ? `<div class="row"><span>Netto (19%)</span><span>EUR ${netTotal.toFixed(2)}</span></div>
                    <div class="row"><span>USt (19%)</span><span>EUR ${taxTotal.toFixed(2)}</span></div>` : ''}
                    <div class="row"><strong>GESAMTBETRAG</strong><strong>EUR ${grandTotal.toFixed(2)}</strong></div>
                    <div class="line"></div>
                    <p style="font-size:10px">Rueckgabe/Umtausch innerhalb von 14 Tagen nur bei Schaden mit Beleg.</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const completeQuickSale = async () => {
        if (!isPunchedIn) {
            alert('Please punch in first');
            setShowProfileModal(true);
            return;
        }

        const fallbackLine = (() => {
            const qty = Math.max(1, parseInt(quickSaleForm.quantity || '1', 10) || 1);
            const unit = parseFloat(quickSaleForm.amount || '0') || 0;
            if (!quickSaleForm.name.trim() || unit <= 0) return null;
            return {
                id: 'direct',
                productId: quickSaleForm.productId,
                barcode: quickSaleForm.barcode,
                name: quickSaleForm.name.trim(),
                category: quickSaleForm.category || 'General',
                quantity: qty,
                amount: unit,
                total: qty * unit,
                paymentMode: quickSaleForm.paymentMode || 'Cash',
                notes: quickSaleForm.notes || '',
            };
        })();

        const lines = quickSaleCart.length ? quickSaleCart : (fallbackLine ? [fallbackLine] : []);
        if (!lines.length) {
            alert('Add at least one item to complete sale');
            return;
        }

        for (const line of lines) {
            await addTransaction({
                desc: line.name,
                amount: line.total,
                quantity: line.quantity,
                type: 'income',
                category: line.category || 'General',
                paymentMethod: line.paymentMode || 'Cash',
                notes: line.notes || '',
                source: 'shop',
                salesmanName: user?.name,
                salesmanNumber: user?.salesmanNumber || 0,
                workerId: String(user?.id || ''),
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            });

            if (line.productId) {
                await adjustStock(line.productId, -line.quantity);
            }
        }

        setToast('Sale completed');
        setTimeout(() => setToast(''), 1800);
        setQuickSaleCart([]);
        setQuickSaleForm(newQuickSaleItem());
        setShowQuickSaleModal(false);
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(onlineOrderStorageKey(user));
            const parsed = raw ? JSON.parse(raw) : [];
            setOnlineOrders(Array.isArray(parsed) ? parsed : []);
        } catch {
            setOnlineOrders([]);
        }
    }, [user]);

    useEffect(() => {
        try {
            localStorage.setItem(onlineOrderStorageKey(user), JSON.stringify(onlineOrders));
        } catch {
            // Ignore localStorage quota errors for non-critical UI state.
        }
    }, [onlineOrders, user]);

    useEffect(() => {
        const query = topBarcodeQuery.trim();
        if (!query) {
            setTopBarcodeMatches([]);
            return;
        }

        const timer = setTimeout(() => {
            const exact = lookupBarcode(query);
            if (exact) {
                const exactResolved = resolveProductSnapshot(exact);
                if (String(exactResolved.barcode || '').toLowerCase() === query.toLowerCase()) {
                    openSalesFormWithProduct(exact);
                    setTopBarcodeQuery('');
                    return;
                }
                setTopBarcodeMatches([exact]);
                return;
            }
            setTopBarcodeMatches(searchProducts(query).slice(0, 8));
        }, 140);

        return () => clearTimeout(timer);
    }, [topBarcodeQuery, lookupBarcode, searchProducts]);

    const handleTopBarcodeSubmit = (e) => {
        e.preventDefault();
        const query = topBarcodeQuery.trim();
        if (!query) return;

        const exact = lookupBarcode(query);
        if (exact) {
            openSalesFormWithProduct(exact);
            setTopBarcodeQuery('');
            return;
        }

        const first = searchProducts(query)[0];
        if (first) {
            openSalesFormWithProduct(first);
            setTopBarcodeQuery('');
        }
    };

    const handleCalcPress = (key) => {
        if (key === 'C') { setCalcDisplay('0'); setCalcPrev(null); setCalcOp(null); return; }
        if (key === 'BACK') { setCalcDisplay((d) => d.length > 1 ? d.slice(0, -1) : '0'); return; }
        if (['+', '-', '*', '/'].includes(key)) {
            setCalcPrev(parseFloat(calcDisplay));
            setCalcOp(key);
            setCalcDisplay('0');
            return;
        }
        if (key === '=') {
            if (calcPrev !== null && calcOp) {
                const curr = parseFloat(calcDisplay);
                let result = 0;
                if (calcOp === '+') result = calcPrev + curr;
                if (calcOp === '-') result = calcPrev - curr;
                if (calcOp === '*') result = calcPrev * curr;
                if (calcOp === '/') result = curr !== 0 ? calcPrev / curr : 0;
                setCalcDisplay(String(Number(result.toFixed(6))));
                setCalcPrev(null);
                setCalcOp(null);
            }
            return;
        }
        if (key === '.' && calcDisplay.includes('.')) return;
        setCalcDisplay((d) => d === '0' && key !== '.' ? key : d + key);
    };

    const saveOnlineOrder = async (e) => {
        e.preventDefault();
        if (!onlineOrderForm.orderId.trim() || !onlineOrderForm.itemName.trim()) {
            alert('Order ID and item name are required');
            return;
        }
        const resolvedColor = onlineOrderForm.color === 'Custom'
            ? String(onlineOrderForm.customColor || '').trim()
            : String(onlineOrderForm.color || '').trim();
        if (onlineOrderForm.color === 'Custom' && !resolvedColor) {
            alert('Please enter a custom color');
            return;
        }

        const row = {
            id: String(Date.now()),
            ...onlineOrderForm,
            color: resolvedColor,
            quantity: Math.max(1, parseInt(onlineOrderForm.quantity || '1', 10) || 1),
            amount: parseFloat(onlineOrderForm.amount || '0') || 0,
            status: 'ordered',
            createdAt: new Date().toISOString(),
        };
        setOnlineOrders((prev) => [row, ...prev]);

        await addTransaction({
            desc: `Online Purchase: ${row.itemName}`,
            amount: row.amount * row.quantity,
            quantity: row.quantity,
            type: 'expense',
            category: row.category || 'Online Purchase',
            paymentMethod: row.paymentStatus === 'Credit' ? 'Credit' : 'Online',
            notes: `OrderId: ${row.orderId} | Platform: ${row.platform || '-'} | Ordered: ${row.orderDate || '-'} | Color: ${row.color || '-'} | Status: ${row.paymentStatus}`,
            source: 'purchase',
            salesmanName: user?.name,
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        });

        setOnlineOrderForm(newOnlineOrderForm());
        setShowOnlineOrderForm(false);
        setPendingTab('online');
    };

    const markOnlineOrderReceived = (id) => {
        setOnlineOrders((prev) => prev.map((order) => order.id === id ? { ...order, status: 'received' } : order));
    };

    const salesByCategory = useMemo(() => categoryTotals(revenueTransactions), [revenueTransactions]);
    const expensesByCategory = useMemo(() => categoryTotals(purchaseTransactions), [purchaseTransactions]);
    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            <header className="relative z-40 border-b border-blue-300/40 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 px-3 py-2 shadow-md">
                <div className="max-w-7xl mx-auto flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-white/15 text-white flex items-center justify-center border border-white/20">
                            <BarChart3 size={18} />
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-base font-black text-white">Salesman Dashboard</h1>
                            <p className="text-[11px] text-blue-100">Hello, {user?.name || 'Salesman'}</p>
                            <p className={`text-[10px] ${canEditTransactions ? 'text-emerald-200' : 'text-amber-200'}`}>
                                Transaction Edit: {canEditTransactions ? 'Enabled' : 'Disabled'}
                            </p>
                        </div>
                    </div>

                    <div className="relative z-[80] flex-1 max-w-3xl ml-2">
                        <form onSubmit={handleTopBarcodeSubmit}>
                            <input
                                value={topBarcodeQuery}
                                onFocus={() => setShowTopBarcodeMatches(true)}
                                onBlur={() => setTimeout(() => setShowTopBarcodeMatches(false), 160)}
                                onChange={(e) => setTopBarcodeQuery(e.target.value)}
                                placeholder="Scan with bullet scanner or search product..."
                                className="w-full rounded-xl border border-white/30 bg-slate-900/25 px-3 py-2 text-sm text-white placeholder:text-blue-100/70 focus:bg-slate-900/35 focus:outline-none focus:ring-2 focus:ring-blue-200/60"
                            />
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-100/90 pointer-events-none" />
                        </form>

                        {showTopBarcodeMatches && topBarcodeMatches.length > 0 && (
                            <div className="absolute z-[120] mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
                                {topBarcodeMatches.map((product) => {
                                    const resolved = resolveProductSnapshot(product);
                                    return (
                                    <button
                                        type="button"
                                        key={resolved.id || `${resolved.barcode}-${resolved.name}`}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            openSalesFormWithProduct(product);
                                            setTopBarcodeQuery('');
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
                                    >
                                        <p className="text-xs font-bold text-slate-700">{resolved.name || 'Unnamed product'}</p>
                                        <p className="text-[10px] text-slate-400">{resolved.barcode || 'No barcode'} | Stock {resolved.stock} | {priceTag(resolved.sellingPrice || 0)}</p>
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-300">
                        <button onClick={() => { setFormMode('inventory'); setShowInventoryForm(true); }} title="Add Mobile" className="fab-animated" style={{ '--fab-i': '#22c55e', '--fab-j': '#16a34a' }}><span className="fab-icon"><PackagePlus size={14} /></span><span className="fab-title">Add Mobile</span></button>
                        <button onClick={() => setShowMobileInventoryModal(true)} title="Mobile Inventory" className="fab-animated" style={{ '--fab-i': '#38bdf8', '--fab-j': '#1d4ed8' }}><span className="fab-icon"><Smartphone size={14} /></span><span className="fab-title">Mobiles</span></button>
                        <button onClick={() => setShowPendingOrders(true)} title="Pending Jobs" className="fab-animated" style={{ '--fab-i': '#06b6d4', '--fab-j': '#2563eb' }}><span className="fab-icon"><ClipboardList size={14} /></span><span className="fab-title">Pending Jobs</span></button>
                        <button onClick={() => setShowCalc((prev) => !prev)} title="Calculator" className="fab-animated" style={{ '--fab-i': '#8b5cf6', '--fab-j': '#2563eb' }}><span className="fab-icon"><Calculator size={14} /></span><span className="fab-title">Calc</span></button>
                        <button onClick={() => setShowCategoryModal(true)} title="Add Category" className="fab-animated" style={{ '--fab-i': '#22c55e', '--fab-j': '#06b6d4' }}><span className="fab-icon"><Menu size={14} /></span><span className="fab-title">Add Category</span></button>
                        <button onClick={() => setShowRepairModal(true)} title="Repair Job" className="fab-animated" style={{ '--fab-i': '#f59e0b', '--fab-j': '#ef4444' }}><span className="fab-icon"><Wrench size={14} /></span><span className="fab-title">Repair Job</span></button>
                        <button onClick={() => setShowProfileModal(true)} className="h-8 w-8 rounded-lg border border-white/25 bg-white/20 text-white overflow-hidden flex items-center justify-center" title={user?.name || 'Profile'}>
                            {user?.photo ? (
                                <img src={user.photo} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm font-semibold">{String(user?.name || 'U').charAt(0).toUpperCase()}</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-3 pt-4 pb-6 space-y-3">

                <section className="grid grid-cols-1 md:grid-cols-[0.72fr_1fr_1fr] gap-2">
                    <CompactTrendCard
                        label="Total Income"
                        value={activeStats.totals.income}
                        colorClass="border-blue-200 bg-gradient-to-br from-blue-100 to-indigo-50"
                    />
                    <CompactTrendCard
                        label="Total Revenue"
                        value={activeStats.totals.revenue}
                        colorClass="border-emerald-200 bg-gradient-to-br from-emerald-100 to-cyan-50"
                    />
                    <CompactTrendCard
                        label="Total Expenses"
                        value={activeStats.totals.expenses}
                        colorClass="border-rose-200 bg-gradient-to-br from-rose-100 to-pink-50"
                    />
                </section>

                <section className="grid grid-cols-2 gap-3">
                    <form onSubmit={(e) => { e.preventDefault(); submitSimpleEntry('sales'); }} className="rounded-2xl border border-emerald-200 bg-white/90 p-3 space-y-3 shadow-sm backdrop-blur-sm">
                        <div className="rounded-xl px-3 py-2 flex items-center justify-between bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <p className="text-xs font-semibold">New Sales Entry</p>
                            <p className="text-xs font-semibold">Simple form</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="relative">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                                <input
                                    ref={salesDateInputRef}
                                    type="date"
                                    value={salesEntry.date}
                                    onChange={(e) => {
                                        setSalesEntry((prev) => ({ ...prev, date: e.target.value }));
                                        setSalesEntryErrors((prev) => ({ ...prev, date: '' }));
                                    }}
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 pr-8 text-xs text-slate-700 ${salesEntryErrors.date ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(salesEntryErrors.date)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => openDatePicker(salesDateInputRef)}
                                    className="absolute right-2 top-[27px] text-slate-500 hover:text-emerald-700"
                                    aria-label="Select sales date"
                                >
                                    <CalendarDays size={14} />
                                </button>
                                {salesEntryErrors.date && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.date}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Mode</label>
                                <select
                                    value={salesEntry.paymentMode}
                                    onChange={(e) => {
                                        setSalesEntry((prev) => ({ ...prev, paymentMode: e.target.value }));
                                        setSalesEntryErrors((prev) => ({ ...prev, paymentMode: '' }));
                                    }}
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 ${salesEntryErrors.paymentMode ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(salesEntryErrors.paymentMode)}
                                >
                                    {paymentModes.map((mode) => <option key={`sales-pay-${mode}`} value={mode}>{mode}</option>)}
                                </select>
                                {salesEntryErrors.paymentMode && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.paymentMode}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={salesEntry.amount}
                                    onChange={(e) => {
                                        setSalesEntry((prev) => ({ ...prev, amount: e.target.value }));
                                        setSalesEntryErrors((prev) => ({ ...prev, amount: '' }));
                                    }}
                                    placeholder="Amount"
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 ${salesEntryErrors.amount ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(salesEntryErrors.amount)}
                                    required
                                />
                                {salesEntryErrors.amount && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.amount}</p>}
                            </div>
                        </div>

                        <div className="relative">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product Name / Barcode</label>
                            <input
                                value={salesEntry.productName}
                                onFocus={() => setShowSalesProductSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSalesProductSuggestions(false), 160)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && salesProductSuggestions.length > 0) {
                                        e.preventDefault();
                                        applyEntryProduct('sales', salesProductSuggestions[0].raw);
                                    }
                                }}
                                onChange={(e) => handleEntryProductQueryChange('sales', e.target.value)}
                                placeholder="Type product name or scan bullet barcode"
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                            />
                            {showSalesProductSuggestions && salesProductSuggestions.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-44 overflow-y-auto">
                                    {salesProductSuggestions.map((row) => (
                                        <button
                                            key={row.snapshot.id || `${row.snapshot.barcode}-${row.snapshot.name}`}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                applyEntryProduct('sales', row.raw);
                                            }}
                                            className="w-full text-left px-2.5 py-2 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
                                        >
                                            <p className="text-xs font-semibold text-slate-700">{row.snapshot.name || 'Unnamed product'}</p>
                                            <p className="text-[10px] text-slate-500">{row.snapshot.barcode || 'No barcode'} | Stock {row.snapshot.stock} | {priceTag(row.snapshot.sellingPrice || 0)}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold text-slate-600 mb-1">Category</p>
                            {l1Options.length === 0 ? (
                                <p className="text-xs text-slate-400">No categories available</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {l1Options.map((name) => (
                                        <button
                                            key={`sales-chip-${name}`}
                                            type="button"
                                            onClick={() => {
                                                setSalesEntry((prev) => ({ ...prev, category: name, subCategory: '' }));
                                                setSalesEntryErrors((prev) => ({ ...prev, category: '' }));
                                            }}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${salesEntry.category === name ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {salesEntryErrors.category && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.category}</p>}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold text-slate-600 mb-1">Sub Category</p>
                            {!salesEntry.category ? (
                                <p className="text-xs text-slate-400">Select category first</p>
                            ) : salesSubCategoryOptions.length === 0 ? (
                                <p className="text-xs text-slate-400">No sub category available for this category</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {salesSubCategoryOptions.map((name) => (
                                        <button
                                            key={`sales-sub-chip-${name}`}
                                            type="button"
                                            onClick={() => setSalesEntry((prev) => ({ ...prev, subCategory: name }))}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${salesEntry.subCategory === name ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end">
                            <button type="submit" className="rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold">
                                Save Sales Entry
                            </button>
                        </div>
                    </form>

                    <form onSubmit={(e) => { e.preventDefault(); submitSimpleEntry('purchase'); }} className="rounded-2xl border border-rose-200 bg-white/90 p-3 space-y-3 shadow-sm backdrop-blur-sm">
                        <div className="rounded-xl px-3 py-2 flex items-center justify-between bg-rose-50 text-rose-700 border border-rose-200">
                            <p className="text-xs font-semibold">New Purchase Entry</p>
                            <p className="text-xs font-semibold">Simple form</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="relative">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                                <input
                                    ref={purchaseDateInputRef}
                                    type="date"
                                    value={purchaseEntry.date}
                                    onChange={(e) => {
                                        setPurchaseEntry((prev) => ({ ...prev, date: e.target.value }));
                                        setPurchaseEntryErrors((prev) => ({ ...prev, date: '' }));
                                    }}
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 pr-8 text-xs text-slate-700 ${purchaseEntryErrors.date ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(purchaseEntryErrors.date)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => openDatePicker(purchaseDateInputRef)}
                                    className="absolute right-2 top-[27px] text-slate-500 hover:text-rose-700"
                                    aria-label="Select purchase date"
                                >
                                    <CalendarDays size={14} />
                                </button>
                                {purchaseEntryErrors.date && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.date}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Mode</label>
                                <select
                                    value={purchaseEntry.paymentMode}
                                    onChange={(e) => {
                                        setPurchaseEntry((prev) => ({ ...prev, paymentMode: e.target.value }));
                                        setPurchaseEntryErrors((prev) => ({ ...prev, paymentMode: '' }));
                                    }}
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 ${purchaseEntryErrors.paymentMode ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(purchaseEntryErrors.paymentMode)}
                                >
                                    {paymentModes.map((mode) => <option key={`purchase-pay-${mode}`} value={mode}>{mode}</option>)}
                                </select>
                                {purchaseEntryErrors.paymentMode && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.paymentMode}</p>}
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={purchaseEntry.amount}
                                    onChange={(e) => {
                                        setPurchaseEntry((prev) => ({ ...prev, amount: e.target.value }));
                                        setPurchaseEntryErrors((prev) => ({ ...prev, amount: '' }));
                                    }}
                                    placeholder="Amount"
                                    className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-slate-700 ${purchaseEntryErrors.amount ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(purchaseEntryErrors.amount)}
                                    required
                                />
                                {purchaseEntryErrors.amount && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.amount}</p>}
                            </div>
                        </div>

                        <div className="relative">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product Name / Barcode</label>
                            <input
                                value={purchaseEntry.productName}
                                onFocus={() => setShowPurchaseProductSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowPurchaseProductSuggestions(false), 160)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && purchaseProductSuggestions.length > 0) {
                                        e.preventDefault();
                                        applyEntryProduct('purchase', purchaseProductSuggestions[0].raw);
                                    }
                                }}
                                onChange={(e) => handleEntryProductQueryChange('purchase', e.target.value)}
                                placeholder="Type product name or scan bullet barcode"
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                            />
                            {showPurchaseProductSuggestions && purchaseProductSuggestions.length > 0 && (
                                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-44 overflow-y-auto">
                                    {purchaseProductSuggestions.map((row) => (
                                        <button
                                            key={row.snapshot.id || `${row.snapshot.barcode}-${row.snapshot.name}`}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                applyEntryProduct('purchase', row.raw);
                                            }}
                                            className="w-full text-left px-2.5 py-2 hover:bg-rose-50 border-b border-slate-100 last:border-b-0"
                                        >
                                            <p className="text-xs font-semibold text-slate-700">{row.snapshot.name || 'Unnamed product'}</p>
                                            <p className="text-[10px] text-slate-500">{row.snapshot.barcode || 'No barcode'} | Stock {row.snapshot.stock} | {priceTag(row.snapshot.purchasePrice || row.snapshot.sellingPrice || 0)}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold text-slate-600 mb-1">Category</p>
                            {l1Options.length === 0 ? (
                                <p className="text-xs text-slate-400">No categories available</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {l1Options.map((name) => (
                                        <button
                                            key={`purchase-chip-${name}`}
                                            type="button"
                                            onClick={() => {
                                                setPurchaseEntry((prev) => ({ ...prev, category: name, subCategory: '' }));
                                                setPurchaseEntryErrors((prev) => ({ ...prev, category: '' }));
                                            }}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${purchaseEntry.category === name ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {purchaseEntryErrors.category && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.category}</p>}
                        </div>

                        <div>
                            <p className="text-[11px] font-semibold text-slate-600 mb-1">Sub Category</p>
                            {!purchaseEntry.category ? (
                                <p className="text-xs text-slate-400">Select category first</p>
                            ) : purchaseSubCategoryOptions.length === 0 ? (
                                <p className="text-xs text-slate-400">No sub category available for this category</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {purchaseSubCategoryOptions.map((name) => (
                                        <button
                                            key={`purchase-sub-chip-${name}`}
                                            type="button"
                                            onClick={() => setPurchaseEntry((prev) => ({ ...prev, subCategory: name }))}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${purchaseEntry.subCategory === name ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end">
                            <button type="submit" className="rounded-xl text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold">
                                Save Purchase Entry
                            </button>
                        </div>
                    </form>
                </section>
                <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-emerald-700 mb-1">Revenue Transactions</h3>
                        <p className="text-[10px] text-slate-400 mb-2">Tap a row to view details{canEditTransactions ? ' and edit' : ''}</p>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {revenueTransactions.length === 0 ? <p className="text-xs text-slate-400">No revenue entries today</p> : revenueTransactions.map((txn) => (
                                <button
                                    type="button"
                                    key={txn.id}
                                    onClick={() => openTransactionDetailModal(txn)}
                                    className="w-full text-left rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 grid grid-cols-[1fr_auto_auto] items-center gap-2 hover:bg-emerald-50/60 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{txn.desc || 'Revenue'}</p>
                                        <p className="text-[11px] text-slate-400">{txn.time || '--:--'} | Tap to view</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 border-l border-slate-200 pl-3">{txn.paymentMethod || 'Cash'}</p>
                                    <p className="text-sm font-black text-emerald-600 border-l border-slate-200 pl-3">{priceTag(txn.amount || 0)}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-rose-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-rose-700 mb-1">Purchase Transactions History</h3>
                        <p className="text-[10px] text-slate-400 mb-2">Tap a row to view details{canEditTransactions ? ' and edit' : ''}</p>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {purchaseTransactions.length === 0 ? <p className="text-xs text-slate-400">No purchase transactions yet</p> : purchaseTransactions.map((txn) => (
                                <button
                                    type="button"
                                    key={txn.id}
                                    onClick={() => openTransactionDetailModal(txn)}
                                    className="w-full text-left rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 grid grid-cols-[1fr_auto_auto] items-center gap-2 hover:bg-rose-50/60 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{txn.desc || 'Purchase'}</p>
                                        <p className="text-[11px] text-slate-400">{txn.time || '--:--'} | Tap to view</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 border-l border-slate-200 pl-3">{txn.paymentMethod || 'Cash'}</p>
                                    <p className="text-sm font-black text-rose-600 border-l border-slate-200 pl-3">{priceTag(txn.amount || 0)}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-emerald-700 mb-2">Sales by Category</h3>
                        <div className="min-h-44 flex items-center justify-center">
                            {salesByCategory.length === 0 ? (
                                <p className="text-xs text-slate-400">No sales yet</p>
                            ) : (
                                <MiniDonut items={salesByCategory} />
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-rose-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-rose-700 mb-2">Purchase by Category</h3>
                        <div className="min-h-44 flex items-center justify-center">
                            {expensesByCategory.length === 0 ? (
                                <p className="text-xs text-slate-400">No purchases yet</p>
                            ) : (
                                <MiniDonut items={expensesByCategory} />
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {toast && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 text-white px-3 py-2 text-xs font-semibold z-50">
                    {toast}
                </div>
            )}

            {showSuccess && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 rounded-xl bg-emerald-600 text-white px-4 py-2 text-xs font-semibold z-[90]">
                    Sale completed
                </div>
            )}

            {showTransactionDetailModal && selectedTransaction && transactionDraft && (
                <div className="fixed inset-0 z-[86]" onClick={closeTransactionDetailModal}>
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-12 mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Transaction Details</h3>
                                <p className="text-[11px] text-slate-500">{selectedTransaction.transactionId || selectedTransaction.id || 'N/A'}</p>
                            </div>
                            <button onClick={closeTransactionDetailModal} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Type</p><p className="font-semibold text-slate-700">{selectedTransaction.type === 'income' ? 'Revenue' : 'Purchase'}</p></div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Date</p><p className="font-semibold text-slate-700">{selectedTransaction.date || '-'}</p></div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Time</p><p className="font-semibold text-slate-700">{selectedTransaction.time || '-'}</p></div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5"><p className="text-slate-400">Salesman No</p><p className="font-semibold text-slate-700">{selectedTransaction.salesmanNumber || '-'}</p></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
                                    <input
                                        value={transactionDraft.desc}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, desc: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                                    <input
                                        value={transactionDraft.category}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, category: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={transactionDraft.amount}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Quantity</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={transactionDraft.quantity}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Mode</label>
                                    <input
                                        value={transactionDraft.paymentMethod}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notes</label>
                                    <textarea
                                        rows={2}
                                        value={transactionDraft.notes}
                                        onChange={(e) => setTransactionDraft((prev) => ({ ...prev, notes: e.target.value }))}
                                        readOnly={!canEditTransactions}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
                                        disabled={!canEditTransactions}
                                    />
                                </div>
                            </div>

                            {!canEditTransactions && (
                                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                                    Edit access is disabled for your account. Ask admin to enable transaction editing.
                                </p>
                            )}
                            {transactionFormError && <p className="text-[11px] text-rose-600">{transactionFormError}</p>}

                            <div className="flex items-center justify-between gap-2">
                                <button type="button" onClick={printTransactionDraft} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    Print
                                </button>
                                <button
                                    type="button"
                                    onClick={saveTransactionChanges}
                                    disabled={!canEditTransactions || isSavingTransaction}
                                    className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-60"
                                >
                                    {isSavingTransaction ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SmartCategoryForm
                isOpen={showInventoryForm}
                onClose={() => setShowInventoryForm(false)}
                onSubmit={() => {
                    setShowInventoryForm(false);
                    setToast(formMode === 'purchase' ? 'Purchase entry saved' : 'Product added');
                    setTimeout(() => setToast(''), 1800);
                }}
            />

            <TransactionModal
                isOpen={showTransactionModal}
                onClose={() => {
                    setShowTransactionModal(false);
                    setSelectedProduct(null);
                }}
                onAddToBill={handleAddToBill}
                initialProduct={selectedProduct}
            />

            {showMobileInventoryModal && (
                <div className="fixed inset-0 z-[86]" onClick={() => setShowMobileInventoryModal(false)}>
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-14 mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Mobile Inventory</h3>
                                <p className="text-[11px] text-slate-500">Tap Sell to open sale flow</p>
                            </div>
                            <button onClick={() => setShowMobileInventoryModal(false)} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>

                        <div className="p-4 space-y-3">
                            <input
                                value={mobileInventorySearch}
                                onChange={(e) => setMobileInventorySearch(e.target.value)}
                                placeholder="Search mobile by name/category/barcode..."
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                            />

                            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40 p-2 space-y-1.5">
                                {mobileInventoryProducts.length === 0 ? (
                                    <p className="text-xs text-slate-400 p-2">No mobile products found in inventory.</p>
                                ) : mobileInventoryProducts.map((item) => (
                                    <div key={item.snapshot.id || `${item.snapshot.barcode}-${item.snapshot.name}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">{item.snapshot.name || 'Mobile'}</p>
                                            <p className="text-[10px] text-slate-500 truncate">{item.snapshot.barcode || 'No barcode'} | Stock {item.snapshot.stock} | {priceTag(item.snapshot.sellingPrice || 0)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => sellMobileFromInventory(item.raw)}
                                            className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-emerald-700"
                                        >
                                            Sell
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showQuickSaleModal && (
                <div className="fixed inset-0 z-[85]" onClick={() => setShowQuickSaleModal(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-16 mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Quick Sales Transaction</h3>
                                <p className="text-[11px] text-slate-500">From barcode suggestion</p>
                            </div>
                            <button onClick={() => setShowQuickSaleModal(false)} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5">
                                <input value={quickSaleForm.barcode} readOnly placeholder="Barcode" className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 md:col-span-2" />
                                <input value={quickSaleForm.name} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Product" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 md:col-span-2" />
                                <input type="number" min="1" value={quickSaleForm.quantity} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="Qty" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700" />
                                <input type="number" step="0.01" value={quickSaleForm.amount} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700" />
                                <input value={quickSaleForm.category} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 md:col-span-2" />
                                <select value={quickSaleForm.paymentMode} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, paymentMode: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 md:col-span-2">
                                    {paymentModes.map((mode) => <option key={`quick-${mode}`} value={mode}>{mode}</option>)}
                                </select>
                                <input value={quickSaleForm.notes} onChange={(e) => setQuickSaleForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 md:col-span-2" />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-600">Cart Items: {quickSaleCart.length}</p>
                                <p className="text-xs font-black text-slate-700">Total: {priceTag(quickSaleCart.reduce((sum, row) => sum + (row.total || 0), 0))}</p>
                            </div>

                            {quickSaleCart.length > 0 && (
                                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
                                    {quickSaleCart.map((item) => (
                                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                                                <p className="text-[10px] text-slate-500">{item.quantity} x {priceTag(item.amount)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-xs font-black text-slate-800">{priceTag(item.total)}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setQuickSaleCart((prev) => prev.filter((row) => row.id !== item.id))}
                                                    className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-600"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <button type="button" onClick={addQuickSaleToCart} className="rounded-xl bg-amber-500 text-white py-2 text-sm font-semibold hover:bg-amber-600 transition-colors">Add to Cart</button>
                                <button type="button" onClick={completeQuickSale} className="rounded-xl bg-emerald-600 text-white py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors">Complete Sale</button>
                                <button type="button" onClick={printQuickSaleSlip} className="rounded-xl border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Print</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showCalc && (
                <div className="fixed top-16 right-3 z-50 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                    <div className="px-3 py-2 bg-slate-800 text-white flex items-center justify-between">
                        <p className="text-xs font-semibold">Calculator</p>
                        <button onClick={() => setShowCalc(false)} className="text-xs text-slate-300 hover:text-white">x</button>
                    </div>
                    <div className="p-3 bg-slate-900 text-right">
                        {calcOp && <p className="text-slate-500 text-[10px] font-mono">{calcPrev} {calcOp}</p>}
                        <p className="text-white text-2xl font-bold font-mono">{calcDisplay}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
                        {['C', 'BACK', '/', '*', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'].map((key) => (
                            <button
                                key={key}
                                onClick={() => handleCalcPress(key)}
                                className={`h-11 text-sm font-bold ${key === '=' ? 'bg-blue-600 text-white row-span-2 hover:bg-blue-700' : key === '0' ? 'col-span-2 bg-white hover:bg-slate-50' : ['+', '-', '*', '/'].includes(key) ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : ['C', 'BACK'].includes(key) ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {showPendingOrders && (
                <div className="fixed inset-0 z-[80]" onClick={() => setShowPendingOrders(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-gradient-to-r from-rose-500 to-orange-500 p-5 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-white">Pending Center</h2>
                                <p className="text-xs text-rose-100">Orders + online tracking</p>
                            </div>
                            <button onClick={() => setShowPendingOrders(false)} className="text-white text-lg">x</button>
                        </div>

                        <div className="px-4 pt-3">
                            <div className="rounded-xl bg-slate-100 p-1 grid grid-cols-2 gap-1">
                                <button
                                    onClick={() => setPendingTab('orders')}
                                    className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${pendingTab === 'orders' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Pending Orders
                                </button>
                                <button
                                    onClick={() => setPendingTab('online')}
                                    className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${pendingTab === 'online' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Online Orders
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {pendingTab === 'orders' && (
                                <>
                                    <button
                                        onClick={() => {
                                            setShowPendingOrders(false);
                                            setShowRepairModal(true);
                                        }}
                                        className="w-full rounded-xl bg-amber-600 text-white py-2 text-sm font-semibold hover:bg-amber-700 transition-colors"
                                    >
                                        + Add Repair Job
                                    </button>
                                    {pendingOrders.length === 0 ? (
                                        <div className="text-center py-12">
                                            <p className="text-4xl">OK</p>
                                            <p className="text-sm text-slate-500 mt-2">No pending orders</p>
                                        </div>
                                    ) : pendingOrders.map((job) => (
                                        <div key={job.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                            <p className="text-xs font-black text-blue-600">{job.refId}</p>
                                            <p className="text-sm font-bold text-slate-800">{job.customerName}</p>
                                            <p className="text-xs text-slate-500">{job.deviceModel}</p>
                                            <p className="text-xs mt-1 text-slate-400">{job.problem}</p>
                                            <div className="mt-2 flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => printPendingRepairBill(job)}
                                                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                                >
                                                    Print
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {pendingTab === 'online' && (
                                <>
                                    <button
                                        onClick={() => setShowOnlineOrderForm((prev) => !prev)}
                                        className="w-full rounded-xl bg-blue-600 text-white py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
                                    >
                                        {showOnlineOrderForm ? 'Hide Online Order Form' : '+ Add Online Order'}
                                    </button>

                                    {showOnlineOrderForm && (
                                        <form onSubmit={saveOnlineOrder} className="rounded-xl border border-blue-200 bg-blue-50/40 p-3 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                            <div className="grid grid-cols-2 gap-1.5">
                                                <div className="col-span-2 grid grid-cols-[1fr_auto] gap-1.5">
                                                    <input value={onlineOrderForm.orderId} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, orderId: e.target.value }))} placeholder="Order ID" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                    <button type="button" onClick={() => setOnlineOrderForm((prev) => ({ ...prev, orderId: randomOnlineOrderId() }))} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">Random</button>
                                                </div>
                                                <input value={onlineOrderForm.platform} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, platform: e.target.value }))} placeholder="Platform" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <input value={onlineOrderForm.itemName} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, itemName: e.target.value }))} placeholder="Item Name" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <select value={onlineOrderForm.category} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, category: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                                    <option value="">Select category</option>
                                                    {l1Options.map((name) => <option key={`online-${name}`} value={name}>{name}</option>)}
                                                </select>
                                                <select
                                                    value={onlineOrderForm.color}
                                                    onChange={(e) => setOnlineOrderForm((prev) => ({
                                                        ...prev,
                                                        color: e.target.value,
                                                        customColor: e.target.value === 'Custom' ? prev.customColor : ''
                                                    }))}
                                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                                >
                                                    <option value="">Select color</option>
                                                    {ONLINE_ORDER_COLORS.map((name) => <option key={`online-color-${name}`} value={name}>{name}</option>)}
                                                </select>
                                                {onlineOrderForm.color === 'Custom' && (
                                                    <input
                                                        value={onlineOrderForm.customColor}
                                                        onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, customColor: e.target.value }))}
                                                        placeholder="Custom color"
                                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                                    />
                                                )}
                                                <input type="number" min="1" value={onlineOrderForm.quantity} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, quantity: e.target.value }))} placeholder="Qty" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <input type="number" step="0.01" value={onlineOrderForm.amount} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <input type="date" value={onlineOrderForm.orderDate} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, orderDate: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <select value={onlineOrderForm.paymentStatus} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, paymentStatus: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                                    <option value="Paid">Paid</option>
                                                    <option value="Partial">Partial</option>
                                                    <option value="Credit">Credit</option>
                                                </select>
                                                <textarea value={onlineOrderForm.notes} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Order notes" rows={2} className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                <button type="submit" className="col-span-2 rounded-lg bg-emerald-600 text-white py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors">Save Online Order</button>
                                            </div>
                                        </form>
                                    )}

                                    {onlineOrders.length === 0 ? (
                                        <div className="text-center py-10">
                                            <p className="text-sm font-semibold text-slate-500">No records</p>
                                            <p className="text-sm text-slate-500 mt-2">No online orders yet</p>
                                        </div>
                                    ) : (
                                        onlineOrders.map((order) => (
                                            <div key={order.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-xs font-black text-blue-600">{order.orderId}</p>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${order.status === 'received' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{order.status}</span>
                                                </div>
                                                <p className="text-sm font-bold text-slate-800 mt-1">{order.itemName}</p>
                                                <p className="text-xs text-slate-500">{order.platform || 'Online'} | Qty {order.quantity} | {priceTag(order.amount || 0)} | Color {order.color || '-'}</p>
                                                <p className="text-xs text-slate-400">Ordered: {order.orderDate || 'N/A'}</p>
                                                {order.notes ? <p className="text-xs text-slate-400 mt-1">{order.notes}</p> : null}
                                                {order.status !== 'received' && (
                                                    <button onClick={() => markOnlineOrderReceived(order.id)} className="mt-2 rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700 transition-colors">
                                                        Mark Received
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <SalesmanProfile isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
            <CategoryManagerModal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
            <RepairModal isOpen={showRepairModal} onClose={() => setShowRepairModal(false)} />
        </div>
    );
}



