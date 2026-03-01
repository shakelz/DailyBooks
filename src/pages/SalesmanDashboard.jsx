import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bell, Calculator, CalendarDays, CircleDollarSign, ClipboardList, Eye, Menu, PackagePlus, Receipt, Scale, Search, ShoppingCart, Smartphone, Sparkles, Tags, Wrench, CircleHelp, Wallet } from 'lucide-react';
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
        quantity: '1',
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
        expectedDeliveryDate: '',
        paymentStatus: 'Paid',
        notes: '',
    };
}

function extractCategoryName(category) {
    if (!category) return '';
    if (typeof category === 'string') return category;
    return category.level1 || '';
}

function buildTransactionDraft(txn = {}, defaultShowTax = true) {
    return {
        desc: String(txn.desc || ''),
        category: extractCategoryName(txn.category) || '',
        amount: String(parseFloat(txn.amount) || 0),
        quantity: String(Math.max(1, parseInt(txn.quantity || '1', 10) || 1)),
        paymentMethod: String(txn.paymentMethod || 'Cash'),
        notes: String(txn.notes || ''),
        includeTax: txn.includeTax === undefined ? Boolean(defaultShowTax) : Boolean(txn.includeTax),
    };
}

function resolveProductImage(product = {}) {
    const attrs = product.attributes && typeof product.attributes === 'object' ? product.attributes : {};
    const candidates = [
        product.image,
        product.imageUrl,
        product.image_url,
        product.photo,
        product.thumbnail,
        product.productImage,
        product.product_image,
        attrs.image,
        attrs.imageUrl,
        attrs.image_url,
        attrs.photo,
        attrs.thumbnail,
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return found ? found.trim() : '';
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
        image: resolveProductImage(product),
        raw: product,
    };
}

function isCashbookTransaction(txn = {}) {
    const source = String(txn?.source || '').toLowerCase();
    return source === 'admin'
        || source === 'admin-income'
        || source === 'admin-expense'
        || source === 'cashbook';
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

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#39;');
}

function getTimestampMs(value) {
    if (!value) return NaN;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? NaN : ms;
}

function getRangeOverlapMs(startMs, endMs, rangeStartMs, rangeEndMs) {
    const from = Math.max(startMs, rangeStartMs);
    const to = Math.min(endMs, rangeEndMs);
    return Math.max(0, to - from);
}

function resolveShopPhone(shop = {}) {
    const safeShop = shop && typeof shop === 'object' ? shop : {};
    const candidates = [
        safeShop.telephone,
        safeShop.phone,
        safeShop.shopPhone,
        safeShop.contactPhone,
        safeShop.contact_phone,
        safeShop.mobile,
        safeShop.tel
    ];
    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return found ? found.trim() : '';
}

function buildReceiptHtml({
    shopName,
    shopAddress,
    shopPhone,
    issuedAt,
    receiptNo,
    paymentMethod,
    items = [],
    showTax = true
}) {
    const rows = Array.isArray(items) ? items : [];
    const grossTotal = rows.reduce((sum, row) => sum + (Number(row?.total) || 0), 0);
    const netTotal = grossTotal / 1.19;
    const taxTotal = grossTotal - netTotal;
    const formatMoney = (value) => `${Number(value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
    const dt = issuedAt instanceof Date && !Number.isNaN(issuedAt.getTime()) ? issuedAt : new Date();
    const safeRows = rows.map((row) => {
        const qty = Math.max(1, parseInt(row?.quantity || '1', 10) || 1);
        const lineTotal = Number(row?.total) || 0;
        return `
            <div class="line-item">
                <div class="line-name">${qty}x ${escapeHtml(row?.name || 'Artikel')}</div>
                <div class="line-price">${formatMoney(lineTotal)}</div>
            </div>
        `;
    }).join('');

    return `
        <html>
            <head>
                <title>Beleg</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 10px; font-size: 12px; color: #111; }
                    .center { text-align: center; }
                    .shop { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
                    .line { border-top: 1px solid #111; margin: 8px 0; }
                    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin: 3px 0; }
                    .head { font-weight: 700; border-bottom: 1px solid #111; padding-bottom: 4px; margin-bottom: 4px; }
                    .line-item { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
                    .line-name { flex: 1; }
                    .line-price { text-align: right; min-width: 85px; }
                    .small { font-size: 10px; line-height: 1.35; }
                    .tax-table { width: 100%; margin-top: 6px; font-size: 11px; border-collapse: collapse; }
                    .tax-table td { padding: 1px 0; }
                    .tax-table td:last-child { text-align: right; }
                </style>
            </head>
            <body>
                <div class="center">
                    <div class="shop">${escapeHtml(shopName || 'Shop')}</div>
                    ${shopAddress ? `<div>${escapeHtml(shopAddress)}</div>` : ''}
                    ${shopPhone ? `<div>Tel: ${escapeHtml(shopPhone)}</div>` : ''}
                    <div>Deutschland</div>
                </div>

                <div class="line"></div>
                <div class="center" style="font-weight:700; margin-bottom:6px;">Beleg</div>
                <div class="row"><span>Datum:</span><span>${dt.toLocaleString('de-DE')}</span></div>
                <div class="row"><span>Belegnummer:</span><span>${escapeHtml(receiptNo || '-')}</span></div>

                <div class="line"></div>
                <div class="row head"><span>Artikel</span><span>Betrag</span></div>
                ${safeRows || '<div class="line-item"><div class="line-name">1x Artikel</div><div class="line-price">0,00 EUR</div></div>'}

                <div class="line"></div>
                <div class="row"><strong>Zwischensumme</strong><strong>${formatMoney(grossTotal)}</strong></div>
                <div class="row"><strong>Gesamtbetrag</strong><strong>${formatMoney(grossTotal)}</strong></div>

                ${showTax ? `
                    <table class="tax-table">
                        <tbody>
                            <tr><td>USt. %</td><td>Netto</td><td>USt.</td><td>Brutto</td></tr>
                            <tr>
                                <td>19%</td>
                                <td>${formatMoney(netTotal)}</td>
                                <td>${formatMoney(taxTotal)}</td>
                                <td>${formatMoney(grossTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                ` : ''}

                <div class="line"></div>
                <div class="row"><span>Zahlung:</span><span>${escapeHtml(paymentMethod || 'Cash')}</span></div>
                <div class="row"><span>Transaktion-ID:</span><span>${escapeHtml(receiptNo || '-')}</span></div>
                <div class="line"></div>
                <div class="small center">
                    Rückgabe/Umtausch innerhalb 14 Tagen nur in unbeschädigter Originalverpackung. Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur. Vielen Dank. ${escapeHtml(shopName || 'Shop')}
                </div>
            </body>
        </html>
    `;
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

export default function SalesmanDashboard({ adminView = false, adminDashboardDateSelection = null }) {
    const navigate = useNavigate();
    const { role, user, isPunchedIn, activeShop, billShowTax, attendanceLogs, salesmen } = useAuth();
    const {
        products,
        transactions,
        lookupBarcode,
        searchProducts,
        addTransaction,
        updateTransaction,
        adjustStock,
        getStockSeverity,
        getLevel1Categories,
        getLevel2Categories,
    } = useInventory();
    const { repairJobs, updateRepairStatus } = useRepairs();
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
    const [onlineOrderErrors, setOnlineOrderErrors] = useState({});
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
    const [mobileInventoryTab, setMobileInventoryTab] = useState('iphone');
    const [showOtherInventoryModal, setShowOtherInventoryModal] = useState(false);
    const [otherInventorySearch, setOtherInventorySearch] = useState('');
    const [selectedMobileInventoryItem, setSelectedMobileInventoryItem] = useState(null);
    const [showSalesProductSuggestions, setShowSalesProductSuggestions] = useState(false);
    const [showPurchaseProductSuggestions, setShowPurchaseProductSuggestions] = useState(false);
    const [showTransactionDetailModal, setShowTransactionDetailModal] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [transactionDraft, setTransactionDraft] = useState(null);
    const [transactionFormError, setTransactionFormError] = useState('');
    const [isSavingTransaction, setIsSavingTransaction] = useState(false);
    const salesDateInputRef = useRef(null);
    const purchaseDateInputRef = useRef(null);
    const canEditTransactions = adminView || Boolean(
        user?.canEditTransactions
        ?? user?.permissions?.canEditTransactions
        ?? false
    );
    const requiresPunch = !adminView;
    const receiptShopName = activeShop?.name || 'Shop';
    const receiptShopAddress = activeShop?.address || activeShop?.location || '';
    const receiptShopPhone = resolveShopPhone(activeShop);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        const normalizedRole = String(role || '').toLowerCase();
        const isAdminRole = normalizedRole === 'admin' || normalizedRole === 'superadmin';
        if (!adminView && normalizedRole !== 'salesman') {
            navigate('/');
            return;
        }
        if (adminView && !isAdminRole) {
            navigate('/');
        }
    }, [adminView, navigate, role, user]);


    const todayStart = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const todayEnd = useMemo(() => {
        const d = new Date(todayStart);
        d.setHours(23, 59, 59, 999);
        return d;
    }, [todayStart]);

    const formatRangeLabel = (start, end) => {
        const fmt = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
        return fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} - ${fmt(end)}`;
    };

    const dashboardRange = useMemo(() => {
        if (!adminView) {
            return { start: todayStart, end: todayEnd, label: 'Today' };
        }

        const selected = Array.isArray(adminDashboardDateSelection) ? adminDashboardDateSelection[0] : null;
        const selectedStart = selected?.startDate ? new Date(selected.startDate) : null;
        const selectedEnd = selected?.endDate ? new Date(selected.endDate) : null;

        if (selectedStart && selectedEnd && !Number.isNaN(selectedStart.getTime()) && !Number.isNaN(selectedEnd.getTime())) {
            const start = new Date(selectedStart);
            const end = new Date(selectedEnd);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            const normalizedStart = start.getTime() <= end.getTime() ? start : end;
            const normalizedEnd = start.getTime() <= end.getTime() ? end : start;
            return {
                start: normalizedStart,
                end: normalizedEnd,
                label: formatRangeLabel(normalizedStart, normalizedEnd),
            };
        }

        return { start: todayStart, end: todayEnd, label: 'Today' };
    }, [adminView, adminDashboardDateSelection, todayStart, todayEnd]);

    const todayTransactions = useMemo(
        () => transactions.filter((txn) => {
            const dt = txn?.timestamp ? new Date(txn.timestamp) : null;
            return dt && !Number.isNaN(dt.getTime()) && dt >= todayStart && dt <= todayEnd;
        }),
        [transactions, todayStart, todayEnd]
    );

    const rangeTransactions = useMemo(
        () => transactions.filter((txn) => {
            const dt = txn?.timestamp ? new Date(txn.timestamp) : null;
            return dt && !Number.isNaN(dt.getTime()) && dt >= dashboardRange.start && dt <= dashboardRange.end;
        }),
        [transactions, dashboardRange]
    );

    const revenueTransactions = useMemo(
        () => rangeTransactions.filter((txn) => {
            if (txn.type !== 'income') return false;
            return !isCashbookTransaction(txn);
        }),
        [rangeTransactions]
    );
    const purchaseTransactions = useMemo(
        () => rangeTransactions.filter((txn) => {
            if (txn.type !== 'expense') return false;
            if (isCashbookTransaction(txn)) return false;
            const source = String(txn.source || '').toLowerCase();
            const desc = String(txn.desc || '').toLowerCase();
            return source === 'purchase'
                || source === 'online-order'
                || source === 'repair-parts'
                || desc.includes('purchase')
                || desc.includes('online order')
                || desc.includes('online purchase');
        }),
        [rangeTransactions]
    );

    const revenueHistoryTransactions = useMemo(() => {
        const isMobileStockPurchase = (txn = {}) => {
            if (String(txn.type || '').toLowerCase() !== 'expense') return false;
            const source = String(txn.source || '').toLowerCase();
            if (source !== 'purchase') return false;

            const categoryText = extractCategoryName(txn.category).toLowerCase();
            const subCategoryText = String(txn.subCategory || '').toLowerCase();
            const descText = String(txn.desc || '').toLowerCase();
            const haystack = `${categoryText} ${subCategoryText} ${descText}`;

            return haystack.includes('mobile')
                || haystack.includes('phone')
                || haystack.includes('iphone')
                || haystack.includes('samsung');
        };

        const mobilePurchaseRows = purchaseTransactions.filter((txn) => isMobileStockPurchase(txn));
        const merged = [...revenueTransactions, ...mobilePurchaseRows];

        return merged
            .filter((txn, index, arr) => arr.findIndex((row) => String(row.id) === String(txn.id)) === index)
            .sort((a, b) => {
                const aMs = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
                const bMs = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
                return bMs - aMs;
            });
    }, [purchaseTransactions, revenueTransactions]);

    const productLookup = useMemo(() => {
        return (products || []).reduce((acc, product) => {
            const key = String(product?.id || '').trim();
            if (key) acc[key] = product;
            return acc;
        }, {});
    }, [products]);

    const isMobileTransaction = (txn = {}) => {
        const linkedProduct = txn?.productId !== undefined && txn?.productId !== null
            ? productLookup[String(txn.productId)]
            : null;
        const linkedSnapshot = linkedProduct ? resolveProductSnapshot(linkedProduct) : null;

        const categoryText = extractCategoryName(txn.category || txn.categorySnapshot || txn?.productSnapshot?.category);
        const subCategoryText = String(txn?.subCategory || txn?.productSnapshot?.subCategory || '').trim();
        const nameText = String(txn?.name || txn?.desc || txn?.productSnapshot?.name || '').trim();

        if (linkedSnapshot && isMobileLikeSnapshot(linkedSnapshot)) return true;

        const haystack = `${categoryText} ${subCategoryText} ${nameText}`.toLowerCase();
        return haystack.includes('mobile')
            || haystack.includes('phone')
            || haystack.includes('iphone')
            || haystack.includes('samsung');
    };

    const nonMobileRevenueTransactions = useMemo(
        () => revenueTransactions.filter((txn) => !isMobileTransaction(txn)),
        [revenueTransactions, productLookup]
    );

    const nonMobilePurchaseTransactions = useMemo(
        () => purchaseTransactions.filter((txn) => !isMobileTransaction(txn)),
        [purchaseTransactions, productLookup]
    );

    const fallbackStats = useMemo(() => {
        const totalRevenue = nonMobileRevenueTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        const totalExpenses = nonMobilePurchaseTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
        return {
            totals: {
                revenue: totalRevenue,
                expenses: totalExpenses,
                income: totalRevenue - totalExpenses,
            },
        };
    }, [nonMobilePurchaseTransactions, nonMobileRevenueTransactions]);

    const revenueBreakdown = useMemo(() => buildPaymentBreakdown(nonMobileRevenueTransactions), [nonMobileRevenueTransactions]);
    const purchaseBreakdown = useMemo(() => buildPaymentBreakdown(nonMobilePurchaseTransactions), [nonMobilePurchaseTransactions]);
    const incomeBreakdown = useMemo(() => {
        const keys = new Set([...Object.keys(revenueBreakdown), ...Object.keys(purchaseBreakdown)]);
        const combined = {};
        keys.forEach((key) => {
            combined[key] = (revenueBreakdown[key] || 0) - (purchaseBreakdown[key] || 0);
        });
        return combined;
    }, [purchaseBreakdown, revenueBreakdown]);

    const staffProductionRows = useMemo(() => {
        if (!adminView) return [];
        const startMs = dashboardRange.start.getTime();
        const endMs = Math.min(dashboardRange.end.getTime(), Date.now());
        const logsByStaff = new Map();

        (attendanceLogs || []).forEach((log) => {
            const uid = String(log?.userId || log?.workerId || '');
            if (!uid) return;
            const existing = logsByStaff.get(uid) || [];
            existing.push(log);
            logsByStaff.set(uid, existing);
        });

        const salaryByStaff = (transactions || []).reduce((acc, txn) => {
            if (!(txn?.type === 'expense' && txn?.category === 'Salary')) return acc;
            const sid = String(txn?.workerId || txn?.salesmanId || '');
            if (!sid) return acc;

            const txnMs = getTimestampMs(txn?.timestamp);
            if (Number.isFinite(txnMs)) {
                if (txnMs < startMs || txnMs > endMs) return acc;
            } else {
                const txnDate = new Date(`${txn?.date || ''}T00:00:00`);
                if (Number.isNaN(txnDate.getTime()) || txnDate.getTime() < startMs) return acc;
            }

            acc[sid] = (acc[sid] || 0) + (parseFloat(txn?.amount) || 0);
            return acc;
        }, {});

        return (salesmen || []).map((staff) => {
            const sid = String(staff?.id || '');
            const hourlyRate = parseFloat(staff?.hourlyRate) || 12.5;
            const staffLogs = (logsByStaff.get(sid) || [])
                .filter((log) => Number.isFinite(getTimestampMs(log?.timestamp)))
                .sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));

            let openInMs = null;
            let totalMs = 0;
            staffLogs.forEach((log) => {
                const ts = getTimestampMs(log?.timestamp);
                if (!Number.isFinite(ts)) return;
                if (log?.type === 'IN') {
                    openInMs = ts;
                    return;
                }
                if (log?.type === 'OUT' && openInMs !== null) {
                    totalMs += getRangeOverlapMs(openInMs, ts, startMs, endMs);
                    openInMs = null;
                }
            });
            if (openInMs !== null) {
                totalMs += getRangeOverlapMs(openInMs, endMs, startMs, endMs);
            }

            const totalHours = totalMs / 3600000;
            const earned = totalHours * hourlyRate;
            const paid = salaryByStaff[sid] || 0;
            const isOnlineFromLogs = openInMs !== null;
            const profileOnline = String(staff?.is_online ?? staff?.isOnline ?? staff?.online).toLowerCase() === 'true';

            return {
                id: sid,
                name: String(staff?.name || 'Staff'),
                totalHours,
                earned,
                paid,
                isOnline: profileOnline || isOnlineFromLogs,
            };
        }).sort((a, b) => b.earned - a.earned);
    }, [adminView, attendanceLogs, dashboardRange, salesmen, transactions]);

    const activityLogsToday = useMemo(() => {
        if (!adminView) return [];
        const startMs = dashboardRange.start.getTime();
        const nowMs = Math.min(dashboardRange.end.getTime(), Date.now());
        const staffNameById = new Map((salesmen || []).map((staff) => [String(staff?.id || ''), String(staff?.name || 'Staff')]));

        return (attendanceLogs || [])
            .filter((log) => {
                const ts = getTimestampMs(log?.timestamp);
                return Number.isFinite(ts) && ts >= startMs && ts <= nowMs;
            })
            .sort((a, b) => getTimestampMs(b?.timestamp) - getTimestampMs(a?.timestamp))
            .map((log) => {
                const uid = String(log?.userId || log?.workerId || '');
                const fallbackName = staffNameById.get(uid) || 'Staff';
                return {
                    id: String(log?.id || `${uid}-${log?.timestamp || ''}`),
                    userName: String(log?.userName || log?.workerName || fallbackName),
                    type: String(log?.type || '').toUpperCase(),
                    timeLabel: Number.isFinite(getTimestampMs(log?.timestamp))
                        ? new Date(log.timestamp).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                        : '--:--',
                };
            });
    }, [adminView, attendanceLogs, dashboardRange, salesmen]);

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

    const activeStats = fallbackStats;

    const salesL1OptionsRaw = getLevel1Categories('sales') || [];
    const salesL1Options = salesL1OptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
    const revenueL1OptionsRaw = getLevel1Categories('revenue') || [];
    const revenueL1Options = revenueL1OptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);

    const salesSubCategoryOptionsRaw = salesEntry.category ? (getLevel2Categories(salesEntry.category, 'sales') || []) : [];
    const salesSubCategoryOptions = salesSubCategoryOptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
    const purchaseSubCategoryOptionsRaw = purchaseEntry.category ? (getLevel2Categories(purchaseEntry.category, 'revenue') || []) : [];
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

    function isMobileLikeSnapshot(snapshot = {}) {
        const categoryText = `${snapshot.category || ''} ${snapshot.subCategory || ''}`.toLowerCase();
        const nameText = String(snapshot.name || '').toLowerCase();
        return categoryText.includes('mobile')
            || categoryText.includes('phone')
            || categoryText.includes('smart')
            || nameText.includes('mobile')
            || nameText.includes('iphone')
            || nameText.includes('samsung');
    }

    const mobileInventoryProducts = useMemo(() => {
        const query = String(mobileInventorySearch || '').trim().toLowerCase();

        return (products || [])
            .map((product) => {
                const snapshot = resolveProductSnapshot(product);
                return { raw: product, snapshot };
            })
            .filter(({ snapshot }) => isMobileLikeSnapshot(snapshot))
            .filter(({ snapshot }) => {
                if (!query) return true;
                const searchable = `${snapshot.name || ''} ${snapshot.category || ''} ${snapshot.subCategory || ''} ${snapshot.barcode || ''}`.toLowerCase();
                return searchable.includes(query);
            })
            .sort((a, b) => String(a.snapshot.name || '').localeCompare(String(b.snapshot.name || ''), undefined, { sensitivity: 'base' }));
    }, [mobileInventorySearch, products]);

    const otherInventoryProducts = useMemo(() => {
        const query = String(otherInventorySearch || '').trim().toLowerCase();
        return (products || [])
            .map((product) => {
                const snapshot = resolveProductSnapshot(product);
                return { raw: product, snapshot };
            })
            .filter(({ snapshot }) => !isMobileLikeSnapshot(snapshot))
            .filter(({ snapshot }) => {
                if (!query) return true;
                const searchable = `${snapshot.name || ''} ${snapshot.category || ''} ${snapshot.subCategory || ''} ${snapshot.barcode || ''}`.toLowerCase();
                return searchable.includes(query);
            })
            .sort((a, b) => String(a.snapshot.name || '').localeCompare(String(b.snapshot.name || ''), undefined, { sensitivity: 'base' }));
    }, [otherInventorySearch, products]);

    const filteredMobileInventoryProducts = useMemo(() => {
        const resolveBucket = (snapshot = {}) => {
            const subCategoryText = String(snapshot.subCategory || '').toLowerCase();
            const fallbackText = `${snapshot.name || ''} ${snapshot.category || ''}`.toLowerCase();
            const text = `${subCategoryText} ${fallbackText}`;
            if (text.includes('iphone')) return 'iphone';
            if (text.includes('samsung')) return 'samsung';
            return 'others';
        };
        if (mobileInventoryTab === 'all') return mobileInventoryProducts || [];
        return (mobileInventoryProducts || []).filter((item) => resolveBucket(item.snapshot) === mobileInventoryTab);
    }, [mobileInventoryProducts, mobileInventoryTab]);

    const handleSmartCategorySubmit = async (productData = {}) => {
        setShowInventoryForm(false);

        const qty = Math.max(0, parseInt(productData?.stock || '0', 10) || 0);
        const unitCost = parseFloat(productData?.purchasePrice || '0') || 0;
        if (qty > 0 && unitCost > 0) {
            const now = new Date();
            const entryCategory = extractCategoryName(productData?.category || '') || 'Purchase';
            await addTransaction({
                desc: `Purchase - ${String(productData?.name || 'Inventory Item').trim() || 'Inventory Item'}`,
                amount: qty * unitCost,
                quantity: qty,
                type: 'expense',
                category: entryCategory,
                paymentMethod: String(productData?.paymentMode || 'Cash'),
                notes: productData?.category?.level2 ? `SubCategory: ${productData.category.level2}` : '',
                source: 'purchase',
                salesmanName: user?.name,
                salesmanNumber: user?.salesmanNumber || 0,
                workerId: String(user?.id || ''),
                productId: productData?.id || undefined,
                timestamp: now.toISOString(),
                date: now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            });
        }

        setToast(formMode === 'purchase' ? 'Purchase entry saved' : 'Product added');
        setTimeout(() => setToast(''), 1800);
    };

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
        const quantityValue = parseInt(entry?.quantity || '1', 10);

        if (!entry?.date || Number.isNaN(parsedDate.getTime())) nextErrors.date = 'Select a valid date';
        if (!String(entry?.paymentMode || '').trim()) nextErrors.paymentMode = 'Select payment mode';
        if (!String(entry?.category || '').trim()) nextErrors.category = 'Select category';
        if (!Number.isFinite(quantityValue) || quantityValue < 1) nextErrors.qty = 'Qty must be at least 1';
        if (!Number.isFinite(amountValue) || amountValue <= 0) nextErrors.amount = 'Enter valid amount';

        return nextErrors;
    };

    const submitSimpleEntry = async (mode = 'sales') => {
        if (requiresPunch && !isPunchedIn) {
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
        const quantityValue = Math.max(1, parseInt(entry.quantity || '1', 10) || 1);
        const selectedDate = buildSelectedDate(entry.date);
        const type = mode === 'sales' ? 'income' : 'expense';
        const productLabel = String(entry.productName || '').trim();
        const descLabel = productLabel
            ? `${mode === 'sales' ? 'Sale' : 'Purchase'} - ${productLabel}`
            : `${mode === 'sales' ? 'Sale' : 'Purchase'} - ${entry.category}`;

        await addTransaction({
            desc: descLabel,
            amount: amountValue,
            quantity: quantityValue,
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
            await adjustStock(entry.productId, -quantityValue);
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

    const handleSalesFormEnterKey = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
        const tagName = String(event.target?.tagName || '').toLowerCase();
        if (tagName === 'textarea' || tagName === 'button' || tagName === 'select') return;
        if (showSalesProductSuggestions && salesProductSuggestions.length > 0) return;
        event.preventDefault();
        submitSimpleEntry('sales');
    };

    const printRecentTransaction = (txn) => {
        if (!txn) return;

        const amountValue = parseFloat(txn.amount) || 0;
        const txnDate = txn.timestamp ? new Date(txn.timestamp) : new Date();
        const popup = window.open('', 'recent-transaction-receipt', 'width=420,height=760');
        if (!popup) return;
        const qty = Math.max(1, parseInt(txn.quantity || '1', 10) || 1);
        const unitPrice = qty > 0 ? amountValue / qty : amountValue;

        popup.document.write(buildReceiptHtml({
            shopName: receiptShopName,
            shopAddress: receiptShopAddress,
            shopPhone: receiptShopPhone,
            issuedAt: txnDate,
            receiptNo: txn.transactionId || txn.id || '-',
            paymentMethod: txn.paymentMethod || 'Cash',
            showTax: txn.includeTax === undefined ? billShowTax : Boolean(txn.includeTax),
            items: [
                {
                    name: txn.desc || 'Transaktion',
                    quantity: qty,
                    unitPrice,
                    total: amountValue,
                },
            ],
        }));
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const printMobileLabel = (product) => {
        const snapshot = resolveProductSnapshot(product);
        const barcode = String(snapshot.barcode || '').trim() || '-';
        const productName = String(snapshot.name || 'Mobile').trim() || 'Mobile';
        const attrs = snapshot.raw?.attributes && typeof snapshot.raw.attributes === 'object'
            ? snapshot.raw.attributes
            : {};
        const ram = attrs.RAM || attrs.Ram || attrs.ram || '';
        const storage = attrs.Storage || attrs.storage || attrs.Memory || attrs.memory || '';
        const specs = [String(ram || '').trim(), String(storage || '').trim()].filter(Boolean).join(' | ');
        const priceValue = Math.round(Number(snapshot.sellingPrice) || 0);
        const escapeHtmlSafe = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');

        const printWindow = window.open('', 'mobile-label-print', 'width=600,height=400');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <style>
                        @media print {
                            body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                            @page { size: auto; margin: 0; }
                        }
                        body { font-family: sans-serif; }
                        .label {
                            width: 78mm;
                            border: 2px solid #000;
                            padding: 10px;
                            box-sizing: border-box;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            text-align: center;
                        }
                        .barcode-font {
                            font-family: 'Libre Barcode 39', cursive;
                            font-size: 34px;
                            line-height: 1;
                            margin: 5px 0 10px 0;
                            white-space: nowrap;
                        }
                        .product-name {
                            font-size: 22px;
                            font-weight: bold;
                            line-height: 1.1;
                            max-height: 58px;
                            overflow: hidden;
                            margin-bottom: 4px;
                        }
                        .specs {
                            font-size: 13px;
                            font-weight: bold;
                            font-family: monospace;
                            border: 1px solid #000;
                            padding: 2px 8px;
                            border-radius: 4px;
                            margin-bottom: 8px;
                        }
                        .price-tag {
                            font-size: 26px;
                            font-weight: 900;
                            margin-top: auto;
                            border-top: 2px solid #000;
                            width: 100%;
                            padding-top: 6px;
                        }
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
                </head>
                <body>
                    <div class="label">
                        <div class="barcode-font">*${escapeHtmlSafe(barcode)}*</div>
                        <div class="product-name">${escapeHtmlSafe(productName)}</div>
                        ${specs ? `<div class="specs">${escapeHtmlSafe(specs)}</div>` : ''}
                        <div class="price-tag">${priceValue} EUR</div>
                    </div>
                    <script>
                        window.onload = function () { window.print(); window.close(); };
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const openTransactionDetailModal = (txn) => {
        if (!txn) return;
        setSelectedTransaction(txn);
        setTransactionDraft(buildTransactionDraft(txn, billShowTax));
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
                includeTax: Boolean(transactionDraft.includeTax),
            };
            const updated = await updateTransaction(selectedTransaction.id, payload);
            const mergedTxn = { ...(selectedTransaction || {}), ...payload, ...(updated || {}) };
            setSelectedTransaction(mergedTxn);
            setTransactionDraft(buildTransactionDraft(mergedTxn, billShowTax));
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
            includeTax: Boolean(transactionDraft.includeTax),
        });
    };

    const formatDisplayDate = (value) => {
        if (!value) return '-';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return String(value);
        return dt.toLocaleString('de-DE');
    };

    const printPendingRepairBill = (job) => {
        if (!job) return;
        const popup = window.open('', 'pending-repair-bill', 'width=420,height=760');
        if (!popup) return;

        const toSafe = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');

        popup.document.write(`
            <html>
                <head>
                    <title>Reparaturbeleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                        .center { text-align: center; }
                        .doc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
                        .shop-title { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
                        .ticket-id { text-align: center; font-size: 30px; font-weight: 700; letter-spacing: 2px; margin: 10px 0; }
                        .issue-box { margin-top: 8px; border: 1px solid #000; padding: 6px; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="center">
                        <p class="doc-title">ABHOLSCHEIN</p>
                        <h2 class="shop-title">${toSafe(receiptShopName)}</h2>
                        ${receiptShopAddress ? `<p>${toSafe(receiptShopAddress)}</p>` : ''}
                        ${receiptShopPhone ? `<p>Tel: ${toSafe(receiptShopPhone)}</p>` : ''}
                    </div>
                    <div class="line"></div>
                    <p class="ticket-id">${toSafe(job.refId || job.id || '-')}</p>
                    <div class="line"></div>
                    <div class="row"><span>Name</span><span>${toSafe(job.customerName || '-')}</span></div>
                    <div class="row"><span>Telefon</span><span>${toSafe(job.phone || job.customerPhone || '-')}</span></div>
                    <div class="row"><span>Gerät</span><span>${toSafe(job.deviceModel || '-')}</span></div>
                    <div class="row"><span>IMEI</span><span>${toSafe(job.imei || '-')}</span></div>
                    <div class="issue-box"><strong>Fehler:</strong> ${toSafe(job.problem || job.issueType || '-')}</div>
                    <div class="row"><span>Status</span><span>Ausstehend</span></div>
                    <div class="line"></div>
                    <div class="row"><span>Kosten</span><span>EUR ${(parseFloat(job.estimatedCost) || 0).toFixed(2)}</span></div>
                    <div class="row"><span>Anzahlung</span><span>EUR ${(parseFloat(job.advanceAmount) || 0).toFixed(2)}</span></div>
                    <div class="row"><span>Abholung</span><span>${toSafe(job.deliveryDate || '-')}</span></div>
                    <div class="line"></div>
                    <p style="font-size:10px">Bitte diesen Kundenbeleg zur Abholung mitbringen.</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const printOnlineOrderBill = (order) => {
        if (!order) return;
        const qty = Math.max(1, parseInt(order.quantity || '1', 10) || 1);
        const unitPrice = parseFloat(order.amount || 0) || 0;
        const totalPrice = qty * unitPrice;
        const popup = window.open('', 'online-order-bill', 'width=420,height=760');
        if (!popup) return;

        const toSafe = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');

        popup.document.write(`
            <html>
                <head>
                    <title>Online-Bestellung</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                    </style>
                </head>
                <body>
                    <h2>${toSafe(receiptShopName)}</h2>
                    ${receiptShopAddress ? `<p>${toSafe(receiptShopAddress)}</p>` : ''}
                    ${receiptShopPhone ? `<p>Tel: ${toSafe(receiptShopPhone)}</p>` : ''}
                    <p>${new Date().toLocaleString('de-DE')}</p>
                    <div class="line"></div>
                    <div class="row"><span>Bestellung</span><span>${toSafe(order.orderId || order.id || '-')}</span></div>
                    <div class="row"><span>Plattform</span><span>${toSafe(order.platform || '-')}</span></div>
                    <div class="row"><span>Artikel</span><span>${toSafe(order.itemName || '-')}</span></div>
                    <div class="row"><span>Kategorie</span><span>${toSafe(order.category || '-')}</span></div>
                    <div class="row"><span>Farbe</span><span>${toSafe(order.color || '-')}</span></div>
                    <div class="row"><span>Qty</span><span>${qty}</span></div>
                    <div class="row"><span>Preis/Einheit</span><span>EUR ${unitPrice.toFixed(2)}</span></div>
                    <div class="row"><span>Status</span><span>${toSafe(order.status || 'ordered')}</span></div>
                    <div class="row"><span>Zahlung</span><span>${toSafe(order.paymentStatus || 'Paid')}</span></div>
                    <div class="row"><span>Bestelldatum</span><span>${toSafe(order.orderDate || '-')}</span></div>
                    <div class="row"><span>Lieferdatum</span><span>${toSafe(order.expectedDeliveryDate || '-')}</span></div>
                    <div class="line"></div>
                    <div class="row"><strong>Gesamt</strong><strong>EUR ${totalPrice.toFixed(2)}</strong></div>
                    <div class="line"></div>
                    <p style="font-size:10px">${toSafe(order.notes || '-')}</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const completePendingRepair = async (job) => {
        if (!job?.id) return;
        try {
            const finalAmount = Number(job.finalAmount || job.estimatedCost || 0) || 0;
            await updateRepairStatus(job.id, 'completed', {
                completedAt: new Date().toISOString(),
                finalAmount,
            });
            const marker = `RepairRef:${job.refId || job.id}`;
            const alreadyLogged = todayTransactions.some((txn) => (
                String(txn.source || '').toLowerCase() === 'repair'
                && String(txn.notes || '').includes(marker)
            ));
            if (!alreadyLogged && finalAmount > 0) {
                const now = new Date();
                await addTransaction({
                    desc: `Repair Service: ${job.deviceModel || 'Device'} (${job.refId || job.id})`,
                    amount: finalAmount,
                    quantity: 1,
                    type: 'income',
                    category: 'Repair Service',
                    paymentMethod: 'Cash',
                    notes: `${marker} | Customer: ${job.customerName || '-'} | Problem: ${job.problem || '-'}`,
                    source: 'repair',
                    salesmanName: user?.name,
                    salesmanNumber: user?.salesmanNumber || 0,
                    workerId: String(user?.id || ''),
                    timestamp: now.toISOString(),
                    date: now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                    time: now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                });
            }
            setToast(`Repair ${job.refId || ''} marked completed`);
            setTimeout(() => setToast(''), 1800);
        } catch (error) {
            alert(error?.message || 'Failed to update repair status');
        }
    };

    const sellMobileFromInventory = (product) => {
        setSelectedProduct(product);
        setShowTransactionModal(true);
        setShowMobileInventoryModal(false);
        setSelectedMobileInventoryItem(null);
    };

    const handleAddToBill = async (productWithQty) => {
        try {
            await addTransaction(productWithQty);
            const stockProductId = productWithQty.productId || productWithQty.id || '';
            if (stockProductId) {
                await adjustStock(stockProductId, -(parseInt(productWithQty.quantity || 1, 10) || 1));
            }
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
        setSelectedProduct(product);
        setShowTransactionModal(true);
        setShowQuickSaleModal(false);
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

        const popup = window.open('', 'quick-sale-receipt', 'width=420,height=760');
        if (!popup) return;

        popup.document.write(buildReceiptHtml({
            shopName: receiptShopName,
            shopAddress: receiptShopAddress,
            shopPhone: receiptShopPhone,
            issuedAt: new Date(),
            receiptNo: `QS-${Date.now()}`,
            paymentMethod: quickSaleForm.paymentMode || 'Cash',
            showTax: billShowTax,
            items: lines.map((line) => ({
                name: line.name,
                quantity: line.quantity,
                unitPrice: line.amount,
                total: line.total,
            })),
        }));
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const completeQuickSale = async () => {
        if (requiresPunch && !isPunchedIn) {
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

    useEffect(() => {
        if (!showCalc) return undefined;
        const handleCalcKeyboard = (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target;
            const tagName = target?.tagName || '';
            if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
            let mapped = '';
            const key = event.key;
            if (/^[0-9]$/.test(key)) mapped = key;
            else if (key === '+' || key === '-' || key === '*' || key === '/') mapped = key;
            else if (key === '.' || key === ',') mapped = '.';
            else if (key === 'Enter') mapped = '=';
            else if (key === 'Backspace') mapped = 'BACK';
            else if (key === 'Delete' || key === 'Escape') mapped = 'C';
            if (!mapped) return;
            event.preventDefault();
            handleCalcPress(mapped);
        };
        window.addEventListener('keydown', handleCalcKeyboard);
        return () => window.removeEventListener('keydown', handleCalcKeyboard);
    }, [showCalc, calcDisplay, calcPrev, calcOp]);

    const validateOnlineOrderForm = () => {
        const nextErrors = {};
        if (!String(onlineOrderForm.orderId || '').trim()) nextErrors.orderId = 'Order ID is required';
        if (!String(onlineOrderForm.platform || '').trim()) nextErrors.platform = 'Platform is required';
        if (!String(onlineOrderForm.itemName || '').trim()) nextErrors.itemName = 'Item name is required';
        if (!String(onlineOrderForm.category || '').trim()) nextErrors.category = 'Select category';
        if (!String(onlineOrderForm.color || '').trim()) nextErrors.color = 'Select color';
        if (onlineOrderForm.color === 'Custom' && !String(onlineOrderForm.customColor || '').trim()) {
            nextErrors.customColor = 'Enter custom color';
        }
        const qty = Math.max(1, parseInt(onlineOrderForm.quantity || '1', 10) || 1);
        const amount = parseFloat(onlineOrderForm.amount || '0') || 0;
        if (!qty || qty <= 0) nextErrors.quantity = 'Enter valid quantity';
        if (!amount || amount <= 0) nextErrors.amount = 'Enter valid amount';
        if (!String(onlineOrderForm.orderDate || '').trim()) nextErrors.orderDate = 'Select order date';
        setOnlineOrderErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const saveOnlineOrder = async (e) => {
        e.preventDefault();
        if (!validateOnlineOrderForm()) return;
        const resolvedColor = onlineOrderForm.color === 'Custom'
            ? String(onlineOrderForm.customColor || '').trim()
            : String(onlineOrderForm.color || '').trim();

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
            notes: `OrderId: ${row.orderId} | Platform: ${row.platform || '-'} | Ordered: ${row.orderDate || '-'} | Expected Delivery: ${row.expectedDeliveryDate || '-'} | Color: ${row.color || '-'} | Status: ${row.paymentStatus}`,
            source: 'online-order',
            salesmanName: user?.name,
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        });

        setOnlineOrderForm(newOnlineOrderForm());
        setOnlineOrderErrors({});
        setShowOnlineOrderForm(false);
        setPendingTab('online');
    };

    const markOnlineOrderReceived = (id) => {
        setOnlineOrders((prev) => prev.map((order) => order.id === id ? { ...order, status: 'received' } : order));
    };

    const salesByCategory = useMemo(() => categoryTotals(nonMobileRevenueTransactions), [nonMobileRevenueTransactions]);
    const expensesByCategory = useMemo(() => categoryTotals(nonMobilePurchaseTransactions), [nonMobilePurchaseTransactions]);
    return (
        <div className="min-h-screen bg-slate-100 text-slate-800">
            <header className="relative z-40 border-b border-blue-300/40 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 px-3 py-2 shadow-md">
                <div className="max-w-7xl mx-auto flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-xl bg-white/15 text-white flex items-center justify-center border border-white/20">
                            <BarChart3 size={18} />
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-base font-black text-white">{adminView ? 'Admin Dashboard' : 'Salesman Dashboard'}</h1>
                            <p className="text-[11px] text-blue-100">Hello, {user?.name || (adminView ? 'Admin' : 'Salesman')}</p>
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
                        <button onClick={() => { setFormMode('inventory'); setShowInventoryForm(true); }} title="Add Inventory" className="fab-animated" style={{ '--fab-i': '#22c55e', '--fab-j': '#16a34a' }}><span className="fab-icon"><PackagePlus size={14} /></span><span className="fab-title">Add Inventory</span></button>
                        <button onClick={() => setShowMobileInventoryModal(true)} title="Mobile Inventory" className="fab-animated" style={{ '--fab-i': '#38bdf8', '--fab-j': '#1d4ed8' }}><span className="fab-icon"><Smartphone size={14} /></span><span className="fab-title">Mobile Inventory</span></button>
                        <button onClick={() => setShowOtherInventoryModal(true)} title="Other Inventory" className="fab-animated" style={{ '--fab-i': '#64748b', '--fab-j': '#334155' }}><span className="fab-icon"><Scale size={14} /></span><span className="fab-title">Other Inventory</span></button>
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

                {adminView && <p className="text-[11px] text-slate-500">KPI Period: {dashboardRange.label}</p>}

                {adminView && (
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-violet-100 bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h3 className="text-sm font-black text-violet-700">Staff Production & Salary</h3>
                                <span className="text-[10px] text-slate-400">{dashboardRange.label}</span>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {staffProductionRows.length === 0 ? (
                                    <p className="text-xs text-slate-400">No staff activity available.</p>
                                ) : staffProductionRows.map((staff) => (
                                    <div key={`staff-prod-${staff.id}`} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-slate-700 truncate">{staff.name}</p>
                                            <span className={`text-[10px] font-semibold ${staff.isOnline ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {staff.isOnline ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                        <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
                                            <div>
                                                <p className="text-slate-400">Hours</p>
                                                <p className="font-bold text-slate-700">{staff.totalHours.toFixed(2)}h</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-400">Earned</p>
                                                <p className="font-bold text-violet-700">{priceTag(staff.earned)}</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-400">Paid</p>
                                                <p className="font-bold text-blue-700">{priceTag(staff.paid)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h3 className="text-sm font-black text-sky-700">Activity Logs</h3>
                                <span className="text-[10px] text-slate-400">{activityLogsToday.length} records</span>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {activityLogsToday.length === 0 ? (
                                    <p className="text-xs text-slate-400">No attendance logs for selected period.</p>
                                ) : activityLogsToday.map((log) => (
                                    <div key={`activity-log-${log.id}`} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">{log.userName}</p>
                                            <p className="text-[11px] text-slate-400">{log.timeLabel}</p>
                                        </div>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${log.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                            {log.type === 'IN' ? 'PUNCHED IN' : 'PUNCHED OUT'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <section className="grid grid-cols-2 gap-2 items-start">
                    <form
                        onSubmit={(e) => { e.preventDefault(); submitSimpleEntry('sales'); }}
                        onKeyDown={handleSalesFormEnterKey}
                        className="rounded-xl border border-emerald-200 bg-white/90 p-2.5 space-y-2.5 shadow-sm backdrop-blur-sm"
                    >
                        <div className="rounded-lg px-2.5 py-1.5 flex items-center justify-between bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <p className="text-xs font-semibold">New Sales Entry</p>
                            <p className="text-[11px] font-semibold">Simple</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 pr-8 text-xs text-slate-700 ${salesEntryErrors.date ? 'border-rose-300' : 'border-slate-200'}`}
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${salesEntryErrors.paymentMode ? 'border-rose-300' : 'border-slate-200'}`}
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${salesEntryErrors.amount ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(salesEntryErrors.amount)}
                                    required
                                />
                                {salesEntryErrors.amount && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.amount}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_88px] gap-1.5 items-end">
                                <div className="relative">
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Product Name / Barcode</label>
                                    <input
                                        value={salesEntry.productName}
                                        onFocus={() => setShowSalesProductSuggestions(true)}
                                        onBlur={() => setTimeout(() => setShowSalesProductSuggestions(false), 160)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && salesProductSuggestions.length > 0) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                applyEntryProduct('sales', salesProductSuggestions[0].raw);
                                            }
                                        }}
                                        onChange={(e) => handleEntryProductQueryChange('sales', e.target.value)}
                                        placeholder="Type product / scan barcode"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                                    />
                                    {showSalesProductSuggestions && salesProductSuggestions.length > 0 && (
                                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-36 overflow-y-auto">
                                            {salesProductSuggestions.map((row) => (
                                                <button
                                                    key={row.snapshot.id || `${row.snapshot.barcode}-${row.snapshot.name}`}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        applyEntryProduct('sales', row.raw);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 border-b border-slate-100 last:border-b-0"
                                                >
                                                    <p className="text-xs font-semibold text-slate-700">{row.snapshot.name || 'Unnamed product'}</p>
                                                    <p className="text-[10px] text-slate-500">{row.snapshot.barcode || 'No barcode'} | Stock {row.snapshot.stock} | {priceTag(row.snapshot.sellingPrice || 0)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Qty</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={salesEntry.quantity}
                                        onChange={(e) => {
                                            const nextQty = e.target.value.replace(/[^\d]/g, '');
                                            setSalesEntry((prev) => ({ ...prev, quantity: nextQty || '1' }));
                                            setSalesEntryErrors((prev) => ({ ...prev, qty: '' }));
                                        }}
                                        className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${salesEntryErrors.qty ? 'border-rose-300' : 'border-slate-200'}`}
                                        aria-invalid={Boolean(salesEntryErrors.qty)}
                                    />
                                    {salesEntryErrors.qty && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.qty}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                                {salesL1Options.length === 0 ? (
                                    <p className="text-xs text-slate-400">No categories available</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {salesL1Options.map((name) => (
                                            <button
                                                key={`sales-cat-chip-${name}`}
                                                type="button"
                                                onClick={() => {
                                                    setSalesEntry((prev) => ({ ...prev, category: name, subCategory: '' }));
                                                    setSalesEntryErrors((prev) => ({ ...prev, category: '' }));
                                                }}
                                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${salesEntry.category === name ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'}`}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {salesEntryErrors.category && <p className="mt-1 text-[10px] text-rose-600">{salesEntryErrors.category}</p>}
                            </div>
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
                                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${salesEntry.subCategory === name ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end">
                            <button type="submit" className="rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold">
                                Save Sales Entry
                            </button>
                        </div>
                    </form>

                    <form onSubmit={(e) => { e.preventDefault(); submitSimpleEntry('purchase'); }} className="rounded-xl border border-rose-200 bg-white/90 p-2.5 space-y-2.5 shadow-sm backdrop-blur-sm">
                        <div className="rounded-lg px-2.5 py-1.5 flex items-center justify-between bg-rose-50 text-rose-700 border border-rose-200">
                            <p className="text-xs font-semibold">New Purchase Entry</p>
                            <p className="text-[11px] font-semibold">Simple</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 pr-8 text-xs text-slate-700 ${purchaseEntryErrors.date ? 'border-rose-300' : 'border-slate-200'}`}
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${purchaseEntryErrors.paymentMode ? 'border-rose-300' : 'border-slate-200'}`}
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
                                    className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${purchaseEntryErrors.amount ? 'border-rose-300' : 'border-slate-200'}`}
                                    aria-invalid={Boolean(purchaseEntryErrors.amount)}
                                    required
                                />
                                {purchaseEntryErrors.amount && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.amount}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_88px] gap-1.5 items-end">
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
                                        placeholder="Type product / scan barcode"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                                    />
                                    {showPurchaseProductSuggestions && purchaseProductSuggestions.length > 0 && (
                                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-36 overflow-y-auto">
                                            {purchaseProductSuggestions.map((row) => (
                                                <button
                                                    key={row.snapshot.id || `${row.snapshot.barcode}-${row.snapshot.name}`}
                                                    type="button"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        applyEntryProduct('purchase', row.raw);
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-rose-50 border-b border-slate-100 last:border-b-0"
                                                >
                                                    <p className="text-xs font-semibold text-slate-700">{row.snapshot.name || 'Unnamed product'}</p>
                                                    <p className="text-[10px] text-slate-500">{row.snapshot.barcode || 'No barcode'} | Stock {row.snapshot.stock} | {priceTag(row.snapshot.purchasePrice || row.snapshot.sellingPrice || 0)}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Qty</label>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={purchaseEntry.quantity}
                                        onChange={(e) => {
                                            const nextQty = e.target.value.replace(/[^\d]/g, '');
                                            setPurchaseEntry((prev) => ({ ...prev, quantity: nextQty || '1' }));
                                            setPurchaseEntryErrors((prev) => ({ ...prev, qty: '' }));
                                        }}
                                        className={`w-full rounded-lg border bg-white px-2 py-1.5 text-xs text-slate-700 ${purchaseEntryErrors.qty ? 'border-rose-300' : 'border-slate-200'}`}
                                        aria-invalid={Boolean(purchaseEntryErrors.qty)}
                                    />
                                    {purchaseEntryErrors.qty && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.qty}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                                {revenueL1Options.length === 0 ? (
                                    <p className="text-xs text-slate-400">No categories available</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {revenueL1Options.map((name) => (
                                            <button
                                                key={`purchase-cat-chip-${name}`}
                                                type="button"
                                                onClick={() => {
                                                    setPurchaseEntry((prev) => ({ ...prev, category: name, subCategory: '' }));
                                                    setPurchaseEntryErrors((prev) => ({ ...prev, category: '' }));
                                                }}
                                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${purchaseEntry.category === name ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {purchaseEntryErrors.category && <p className="mt-1 text-[10px] text-rose-600">{purchaseEntryErrors.category}</p>}
                            </div>
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
                                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${purchaseEntry.subCategory === name ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                        >
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end">
                            <button type="submit" className="rounded-lg text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-semibold">
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
                            {revenueHistoryTransactions.length === 0 ? <p className="text-xs text-slate-400">No revenue entries for selected period</p> : revenueHistoryTransactions.map((txn) => (
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
                            {purchaseTransactions.length === 0 ? <p className="text-xs text-slate-400">No purchase transactions for selected period</p> : purchaseTransactions.map((txn) => (
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
                            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                                <div>
                                    <p className="text-[11px] font-semibold text-slate-700">Tax Inclusion in Bill</p>
                                    <p className="text-[10px] text-slate-500">Show or hide Netto/USt lines on receipt</p>
                                </div>
                                <button
                                    type="button"
                                    disabled={!canEditTransactions}
                                    onClick={() => setTransactionDraft((prev) => prev ? ({ ...prev, includeTax: !prev.includeTax }) : prev)}
                                    className={`relative h-6 w-11 overflow-hidden rounded-full transition-colors ${transactionDraft.includeTax ? 'bg-emerald-500' : 'bg-slate-300'} ${!canEditTransactions ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    title="Toggle tax lines in printed bill"
                                >
                                    <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${transactionDraft.includeTax ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
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
                onSubmit={handleSmartCategorySubmit}
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
                <div className="fixed inset-0 z-[86]" onClick={() => { setShowMobileInventoryModal(false); setSelectedMobileInventoryItem(null); }}>
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-14 mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Mobile Inventory</h3>
                                <p className="text-[11px] text-slate-500">Tap Sell to open sale flow</p>
                            </div>
                            <button onClick={() => { setShowMobileInventoryModal(false); setSelectedMobileInventoryItem(null); }} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>

                        <div className="p-4 space-y-3">
                            <input
                                value={mobileInventorySearch}
                                onChange={(e) => setMobileInventorySearch(e.target.value)}
                                placeholder="Search mobile by name/category/barcode..."
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                            />

                            <div className="flex items-center gap-1.5">
                                {[
                                    { id: 'iphone', label: 'iPhone' },
                                    { id: 'samsung', label: 'Samsung' },
                                    { id: 'others', label: 'Others' },
                                    { id: 'all', label: 'All' },
                                ].map((tab) => (
                                    <button
                                        key={`mobile-tab-${tab.id}`}
                                        type="button"
                                        onClick={() => setMobileInventoryTab(tab.id)}
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${mobileInventoryTab === tab.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-300'}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40">
                                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 backdrop-blur-sm">
                                    <div className="col-span-6">Product Info</div>
                                    <div className="col-span-2 text-center">Stock</div>
                                    <div className="col-span-2">Pricing &amp; Margin</div>
                                    <div className="col-span-2 text-right">Actions</div>
                                </div>

                                <div className="space-y-1.5 p-2">
                                {filteredMobileInventoryProducts.length === 0 ? (
                                    <p className="text-xs text-slate-400 p-2">No mobile products found in inventory.</p>
                                ) : filteredMobileInventoryProducts.map((item) => (
                                    <div
                                        key={item.snapshot.id || `${item.snapshot.barcode}-${item.snapshot.name}`}
                                        className={`rounded-lg border px-3 py-2.5 transition-colors hover:bg-blue-50/30 ${(() => {
                                            const stockValue = Number(item.snapshot.stock) || 0;
                                            const alertCfg = item.raw?.stockAlert && typeof item.raw.stockAlert === 'object' ? item.raw.stockAlert : {};
                                            const redThreshold = Number(alertCfg.red);
                                            const yellowThreshold = Number(alertCfg.yellow);
                                            const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
                                            const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;
                                            const severity = stockValue <= 0
                                                ? 'red'
                                                : hasRed && stockValue <= redThreshold
                                                    ? 'red'
                                                    : hasYellow && stockValue <= yellowThreshold
                                                        ? 'yellow'
                                                        : getStockSeverity(stockValue);
                                            return severity === 'red'
                                                ? 'border-red-200 bg-red-50/30'
                                                : severity === 'yellow'
                                                    ? 'border-amber-200 bg-amber-50/30'
                                                    : 'border-slate-200 bg-white';
                                        })()}`}
                                    >
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center w-full">
                                            <div className="md:col-span-6 min-w-0">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                        {item.snapshot.image ? (
                                                            <img src={item.snapshot.image} alt={item.snapshot.name || 'Mobile'} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-lg">🛠️</span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{item.snapshot.name || 'Mobile'}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className="text-[10px] font-mono text-slate-400 font-bold truncate">{item.snapshot.barcode || 'NO-BARCODE'}</p>
                                                            <span className="text-slate-300">•</span>
                                                            <p className="text-[10px] font-bold text-blue-500 truncate">{item.snapshot.subCategory || item.snapshot.category || 'Uncategorized'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {Object.entries(item.raw?.attributes && typeof item.raw.attributes === 'object' ? item.raw.attributes : {})
                                                        .filter(([key, value]) => !String(key).startsWith('__') && value !== null && value !== undefined && String(value).trim() !== '')
                                                        .slice(0, 8)
                                                        .map(([key, value]) => (
                                                            <span key={`${item.snapshot.id || item.snapshot.barcode || item.snapshot.name}-${key}`} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold">
                                                                {String(key).toUpperCase()}: {String(value)}
                                                            </span>
                                                        ))}
                                                </div>
                                            </div>

                                            <div className="md:col-span-2 md:text-center">
                                                <div className={`inline-flex flex-col items-center rounded-2xl border px-3 py-1 ${(() => {
                                                    const stockValue = Number(item.snapshot.stock) || 0;
                                                    const alertCfg = item.raw?.stockAlert && typeof item.raw.stockAlert === 'object' ? item.raw.stockAlert : {};
                                                    const redThreshold = Number(alertCfg.red);
                                                    const yellowThreshold = Number(alertCfg.yellow);
                                                    const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
                                                    const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;
                                                    const severity = stockValue <= 0
                                                        ? 'red'
                                                        : hasRed && stockValue <= redThreshold
                                                            ? 'red'
                                                            : hasYellow && stockValue <= yellowThreshold
                                                                ? 'yellow'
                                                                : getStockSeverity(stockValue);
                                                    return severity === 'red'
                                                        ? 'bg-red-50 text-red-600 border-red-100'
                                                        : severity === 'yellow'
                                                            ? 'bg-amber-50 text-amber-600 border-amber-100'
                                                            : 'bg-emerald-50 text-emerald-600 border-emerald-100';
                                                })()}`}>
                                                    <span className="text-2xl leading-none font-black">{item.snapshot.stock}</span>
                                                    <span className="text-[8px] -mt-0.5 font-bold uppercase tracking-widest opacity-70">Units</span>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <div className="space-y-1 text-xs">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-slate-400 font-bold">Buy:</span>
                                                        <span className="text-slate-600 font-black">{priceTag(item.snapshot.purchasePrice || 0)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-slate-400 font-bold">Sell:</span>
                                                        <span className="text-blue-600 font-black">{priceTag(item.snapshot.sellingPrice || 0)}</span>
                                                    </div>
                                                    <div className="pt-1 flex items-center md:justify-center">
                                                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${(() => {
                                                            const sell = Number(item.snapshot.sellingPrice) || 0;
                                                            const buy = Number(item.snapshot.purchasePrice) || 0;
                                                            const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0;
                                                            return margin > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600';
                                                        })()}`}>
                                                            {(() => {
                                                                const sell = Number(item.snapshot.sellingPrice) || 0;
                                                                const buy = Number(item.snapshot.purchasePrice) || 0;
                                                                const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0;
                                                                return `${margin.toFixed(1)}% MARGIN`;
                                                            })()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => printMobileLabel(item.raw)}
                                                        title="Print Label"
                                                        className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center"
                                                    >
                                                        <Tags size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedMobileInventoryItem(item)}
                                                        title="Details"
                                                        className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => sellMobileFromInventory(item.raw)}
                                                        title="Sell"
                                                        className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center"
                                                    >
                                                        <ShoppingCart size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showOtherInventoryModal && (
                <div className="fixed inset-0 z-[86]" onClick={() => setShowOtherInventoryModal(false)}>
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-14 mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black text-slate-800">Other Inventory</h3>
                                <p className="text-[11px] text-slate-500">All non-mobile inventory stocks</p>
                            </div>
                            <button onClick={() => setShowOtherInventoryModal(false)} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>

                        <div className="p-4 space-y-3">
                            <input
                                value={otherInventorySearch}
                                onChange={(e) => setOtherInventorySearch(e.target.value)}
                                placeholder="Search inventory by name/category/barcode..."
                                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                            />

                            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/40">
                                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 backdrop-blur-sm">
                                    <div className="col-span-6">Product Info</div>
                                    <div className="col-span-2 text-center">Stock</div>
                                    <div className="col-span-2">Pricing &amp; Margin</div>
                                    <div className="col-span-2 text-right">Actions</div>
                                </div>

                                <div className="space-y-1.5 p-2">
                                    {otherInventoryProducts.length === 0 ? (
                                        <p className="text-xs text-slate-400 p-2">No other inventory products found.</p>
                                    ) : otherInventoryProducts.map((item) => (
                                        <div
                                            key={`other-${item.snapshot.id || `${item.snapshot.barcode}-${item.snapshot.name}`}`}
                                            className={`rounded-lg border px-3 py-2.5 transition-colors hover:bg-blue-50/30 ${(() => {
                                                const stockValue = Number(item.snapshot.stock) || 0;
                                                const alertCfg = item.raw?.stockAlert && typeof item.raw.stockAlert === 'object' ? item.raw.stockAlert : {};
                                                const redThreshold = Number(alertCfg.red);
                                                const yellowThreshold = Number(alertCfg.yellow);
                                                const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
                                                const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;
                                                const severity = stockValue <= 0
                                                    ? 'red'
                                                    : hasRed && stockValue <= redThreshold
                                                        ? 'red'
                                                        : hasYellow && stockValue <= yellowThreshold
                                                            ? 'yellow'
                                                            : getStockSeverity(stockValue);
                                                return severity === 'red'
                                                    ? 'border-red-200 bg-red-50/30'
                                                    : severity === 'yellow'
                                                        ? 'border-amber-200 bg-amber-50/30'
                                                        : 'border-slate-200 bg-white';
                                            })()}`}
                                        >
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center w-full">
                                                <div className="md:col-span-6 min-w-0">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                            {item.snapshot.image ? (
                                                                <img src={item.snapshot.image} alt={item.snapshot.name || 'Inventory'} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-lg">🛠️</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{item.snapshot.name || 'Inventory Item'}</p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <p className="text-[10px] font-mono text-slate-400 font-bold truncate">{item.snapshot.barcode || 'NO-BARCODE'}</p>
                                                                <span className="text-slate-300">•</span>
                                                                <p className="text-[10px] font-bold text-blue-500 truncate">{item.snapshot.subCategory || item.snapshot.category || 'Uncategorized'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {Object.entries(item.raw?.attributes && typeof item.raw.attributes === 'object' ? item.raw.attributes : {})
                                                            .filter(([key, value]) => !String(key).startsWith('__') && value !== null && value !== undefined && String(value).trim() !== '')
                                                            .slice(0, 8)
                                                            .map(([key, value]) => (
                                                                <span key={`${item.snapshot.id || item.snapshot.barcode || item.snapshot.name}-${key}`} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-bold">
                                                                    {String(key).toUpperCase()}: {String(value)}
                                                                </span>
                                                            ))}
                                                    </div>
                                                </div>

                                                <div className="md:col-span-2 md:text-center">
                                                    <div className={`inline-flex flex-col items-center rounded-2xl border px-3 py-1 ${(() => {
                                                        const stockValue = Number(item.snapshot.stock) || 0;
                                                        const alertCfg = item.raw?.stockAlert && typeof item.raw.stockAlert === 'object' ? item.raw.stockAlert : {};
                                                        const redThreshold = Number(alertCfg.red);
                                                        const yellowThreshold = Number(alertCfg.yellow);
                                                        const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
                                                        const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;
                                                        const severity = stockValue <= 0
                                                            ? 'red'
                                                            : hasRed && stockValue <= redThreshold
                                                                ? 'red'
                                                                : hasYellow && stockValue <= yellowThreshold
                                                                    ? 'yellow'
                                                                    : getStockSeverity(stockValue);
                                                        return severity === 'red'
                                                            ? 'bg-red-50 text-red-600 border-red-100'
                                                            : severity === 'yellow'
                                                                ? 'bg-amber-50 text-amber-600 border-amber-100'
                                                                : 'bg-emerald-50 text-emerald-600 border-emerald-100';
                                                    })()}`}>
                                                        <span className="text-2xl leading-none font-black">{item.snapshot.stock}</span>
                                                        <span className="text-[8px] -mt-0.5 font-bold uppercase tracking-widest opacity-70">Units</span>
                                                    </div>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <div className="space-y-1 text-xs">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-slate-400 font-bold">Buy:</span>
                                                            <span className="text-slate-600 font-black">{priceTag(item.snapshot.purchasePrice || 0)}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-slate-400 font-bold">Sell:</span>
                                                            <span className="text-blue-600 font-black">{priceTag(item.snapshot.sellingPrice || 0)}</span>
                                                        </div>
                                                        <div className="pt-1 flex items-center md:justify-center">
                                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${(() => {
                                                                const sell = Number(item.snapshot.sellingPrice) || 0;
                                                                const buy = Number(item.snapshot.purchasePrice) || 0;
                                                                const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0;
                                                                return margin > 20 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600';
                                                            })()}`}>
                                                                {(() => {
                                                                    const sell = Number(item.snapshot.sellingPrice) || 0;
                                                                    const buy = Number(item.snapshot.purchasePrice) || 0;
                                                                    const margin = sell > 0 ? ((sell - buy) / sell) * 100 : 0;
                                                                    return `${margin.toFixed(1)}% MARGIN`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => printMobileLabel(item.raw)}
                                                            title="Print Label"
                                                            className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center"
                                                        >
                                                            <Tags size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openSalesFormWithProduct(item.raw)}
                                                            title="Details"
                                                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => sellMobileFromInventory(item.raw)}
                                                            title="Sell"
                                                            className="w-8 h-8 rounded-lg bg-slate-50 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center"
                                                        >
                                                            <ShoppingCart size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedMobileInventoryItem && (
                <div className="fixed inset-0 z-[90]" onClick={() => setSelectedMobileInventoryItem(null)}>
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                    <div className="absolute inset-x-3 top-16 mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-sm font-black text-slate-800">Mobile Details</h3>
                            <button onClick={() => setSelectedMobileInventoryItem(null)} className="text-slate-500 hover:text-slate-700">x</button>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                {selectedMobileInventoryItem.snapshot.image ? (
                                    <img src={selectedMobileInventoryItem.snapshot.image} alt={selectedMobileInventoryItem.snapshot.name || 'Mobile'} className="w-16 h-16 rounded-lg border border-slate-200 object-cover" />
                                ) : (
                                    <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 text-xs flex items-center justify-center">No Image</div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-slate-800 truncate">{selectedMobileInventoryItem.snapshot.name || 'Mobile'}</p>
                                    <p className="text-xs text-slate-500 truncate">{selectedMobileInventoryItem.snapshot.barcode || 'No barcode'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2"><p className="text-[11px] text-slate-400">Category</p><p className="font-bold text-slate-700">{selectedMobileInventoryItem.snapshot.category || '-'}</p></div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2"><p className="text-[11px] text-slate-400">Sub Category</p><p className="font-bold text-slate-700">{selectedMobileInventoryItem.snapshot.subCategory || '-'}</p></div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2"><p className="text-[11px] text-slate-400">Stock</p><p className={`font-black text-base ${(() => {
                                    const stockValue = Number(selectedMobileInventoryItem.snapshot.stock) || 0;
                                    const alertCfg = selectedMobileInventoryItem.raw?.stockAlert && typeof selectedMobileInventoryItem.raw.stockAlert === 'object'
                                        ? selectedMobileInventoryItem.raw.stockAlert
                                        : {};
                                    const redThreshold = Number(alertCfg.red);
                                    const yellowThreshold = Number(alertCfg.yellow);
                                    const hasRed = Number.isFinite(redThreshold) && redThreshold > 0;
                                    const hasYellow = Number.isFinite(yellowThreshold) && yellowThreshold > 0;
                                    const severity = stockValue <= 0
                                        ? 'red'
                                        : hasRed && stockValue <= redThreshold
                                            ? 'red'
                                            : hasYellow && stockValue <= yellowThreshold
                                                ? 'yellow'
                                                : getStockSeverity(stockValue);
                                    return severity === 'red'
                                        ? 'text-red-600'
                                        : severity === 'yellow'
                                            ? 'text-amber-600'
                                            : 'text-emerald-600';
                                        })()}`}>{selectedMobileInventoryItem.snapshot.stock}</p></div>
                                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2"><p className="text-[11px] text-slate-400">Selling Price</p><p className="font-black text-emerald-700 text-base">{priceTag(selectedMobileInventoryItem.snapshot.sellingPrice || 0)}</p></div>
                            </div>

                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => printMobileLabel(selectedMobileInventoryItem.raw)}
                                    className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                >
                                    Print Label
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedMobileInventoryItem(null)}
                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    onClick={() => sellMobileFromInventory(selectedMobileInventoryItem.raw)}
                                    className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
                                >
                                    Sell
                                </button>
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
                                        <div key={job.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-blue-600">{job.refId}</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">{job.customerName || 'Customer'}</p>
                                                </div>
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{job.status || 'pending'}</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-1 text-[11px]">
                                                <p className="text-slate-500"><span className="text-slate-400">Phone:</span> {job.phone || job.customerPhone || '-'}</p>
                                                <p className="text-slate-500"><span className="text-slate-400">IMEI:</span> {job.imei || '-'}</p>
                                                <p className="text-slate-500"><span className="text-slate-400">Device:</span> {job.deviceModel || '-'}</p>
                                                <p className="text-slate-500"><span className="text-slate-400">Delivery:</span> {job.deliveryDate || '-'}</p>
                                                <p className="text-slate-500"><span className="text-slate-400">Created:</span> {formatDisplayDate(job.createdAt || '')}</p>
                                                <p className="text-slate-500"><span className="text-slate-400">Completed:</span> {formatDisplayDate(job.completedAt || '')}</p>
                                            </div>

                                            <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                <span className="text-slate-400">Issue:</span> {job.problem || job.issueType || '-'}
                                            </p>
                                            {job.notes ? (
                                                <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                    <span className="text-slate-400">Notes:</span> {job.notes}
                                                </p>
                                            ) : null}

                                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                                                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-emerald-700 font-semibold">Est: {priceTag(job.estimatedCost || 0)}</span>
                                                <span className="rounded-md bg-sky-50 border border-sky-200 px-2 py-1 text-sky-700 font-semibold">Advance: {priceTag(job.advanceAmount || 0)}</span>
                                                <span className="rounded-md bg-violet-50 border border-violet-200 px-2 py-1 text-violet-700 font-semibold">Final: {priceTag(job.finalAmount || 0)}</span>
                                                <span className="rounded-md bg-orange-50 border border-orange-200 px-2 py-1 text-orange-700 font-semibold">Parts: {priceTag(job.partsCost || 0)}</span>
                                            </div>

                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => completePendingRepair(job)}
                                                    className="rounded-lg bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-700"
                                                >
                                                    Complete
                                                </button>
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
                                                    <div>
                                                        <input
                                                            value={onlineOrderForm.orderId}
                                                            onChange={(e) => {
                                                                setOnlineOrderForm((prev) => ({ ...prev, orderId: e.target.value }));
                                                                setOnlineOrderErrors((prev) => ({ ...prev, orderId: '' }));
                                                            }}
                                                            placeholder="Order ID"
                                                            className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.orderId ? 'border-rose-300' : 'border-slate-200'}`}
                                                        />
                                                        {onlineOrderErrors.orderId && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.orderId}</p>}
                                                    </div>
                                                    <button type="button" onClick={() => setOnlineOrderForm((prev) => ({ ...prev, orderId: randomOnlineOrderId() }))} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600">Random</button>
                                                </div>
                                                <div>
                                                    <input
                                                        value={onlineOrderForm.platform}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, platform: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, platform: '' }));
                                                        }}
                                                        placeholder="Platform"
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.platform ? 'border-rose-300' : 'border-slate-200'}`}
                                                    />
                                                    {onlineOrderErrors.platform && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.platform}</p>}
                                                </div>
                                                <div>
                                                    <input
                                                        value={onlineOrderForm.itemName}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, itemName: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, itemName: '' }));
                                                        }}
                                                        placeholder="Item Name"
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.itemName ? 'border-rose-300' : 'border-slate-200'}`}
                                                    />
                                                    {onlineOrderErrors.itemName && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.itemName}</p>}
                                                </div>
                                                <div>
                                                    <select
                                                        value={onlineOrderForm.category}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, category: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, category: '' }));
                                                        }}
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.category ? 'border-rose-300' : 'border-slate-200'}`}
                                                    >
                                                        <option value="">Select category</option>
                                                        {revenueL1Options.map((name) => <option key={`online-${name}`} value={name}>{name}</option>)}
                                                    </select>
                                                    {onlineOrderErrors.category && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.category}</p>}
                                                </div>
                                                <div>
                                                    <select
                                                        value={onlineOrderForm.color}
                                                        onChange={(e) => {
                                                            const nextColor = e.target.value;
                                                            setOnlineOrderForm((prev) => ({
                                                                ...prev,
                                                                color: nextColor,
                                                                customColor: nextColor === 'Custom' ? prev.customColor : ''
                                                            }));
                                                            setOnlineOrderErrors((prev) => ({
                                                                ...prev,
                                                                color: '',
                                                                customColor: ''
                                                            }));
                                                        }}
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.color ? 'border-rose-300' : 'border-slate-200'}`}
                                                    >
                                                        <option value="">Select color</option>
                                                        {ONLINE_ORDER_COLORS.map((name) => <option key={`online-color-${name}`} value={name}>{name}</option>)}
                                                    </select>
                                                    {onlineOrderErrors.color && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.color}</p>}
                                                </div>
                                                {onlineOrderForm.color === 'Custom' && (
                                                    <div>
                                                        <input
                                                            value={onlineOrderForm.customColor}
                                                            onChange={(e) => {
                                                                setOnlineOrderForm((prev) => ({ ...prev, customColor: e.target.value }));
                                                                setOnlineOrderErrors((prev) => ({ ...prev, customColor: '' }));
                                                            }}
                                                            placeholder="Custom color"
                                                            className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.customColor ? 'border-rose-300' : 'border-slate-200'}`}
                                                        />
                                                        {onlineOrderErrors.customColor && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.customColor}</p>}
                                                    </div>
                                                )}
                                                <div>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={onlineOrderForm.quantity}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, quantity: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, quantity: '' }));
                                                        }}
                                                        placeholder="Qty"
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.quantity ? 'border-rose-300' : 'border-slate-200'}`}
                                                    />
                                                    {onlineOrderErrors.quantity && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.quantity}</p>}
                                                </div>
                                                <div>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={onlineOrderForm.amount}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, amount: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, amount: '' }));
                                                        }}
                                                        placeholder="Amount"
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.amount ? 'border-rose-300' : 'border-slate-200'}`}
                                                    />
                                                    {onlineOrderErrors.amount && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.amount}</p>}
                                                </div>
                                                <div>
                                                    <input
                                                        type="date"
                                                        value={onlineOrderForm.orderDate}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, orderDate: e.target.value }));
                                                            setOnlineOrderErrors((prev) => ({ ...prev, orderDate: '' }));
                                                        }}
                                                        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs ${onlineOrderErrors.orderDate ? 'border-rose-300' : 'border-slate-200'}`}
                                                    />
                                                    {onlineOrderErrors.orderDate && <p className="mt-1 text-[10px] text-rose-600">{onlineOrderErrors.orderDate}</p>}
                                                </div>
                                                <div>
                                                    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Expected Delivery</label>
                                                    <input
                                                        type="date"
                                                        value={onlineOrderForm.expectedDeliveryDate}
                                                        onChange={(e) => {
                                                            setOnlineOrderForm((prev) => ({ ...prev, expectedDeliveryDate: e.target.value }));
                                                        }}
                                                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs"
                                                    />
                                                </div>
                                                <select value={onlineOrderForm.paymentStatus} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, paymentStatus: e.target.value }))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
                                                    <option value="Paid">Paid</option>
                                                    <option value="Partial">Partial</option>
                                                    <option value="Credit">Credit</option>
                                                </select>
                                                <textarea value={onlineOrderForm.notes} onChange={(e) => setOnlineOrderForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Order notes" rows={2} className="col-span-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs" />
                                                {Object.values(onlineOrderErrors).some(Boolean) && (
                                                    <p className="col-span-2 text-[10px] text-rose-600">
                                                        Please fill all required fields highlighted in red.
                                                    </p>
                                                )}
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
                                            <div key={order.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-xs font-black text-blue-600">{order.orderId}</p>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${order.status === 'received' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{order.status}</span>
                                                </div>
                                                <p className="text-sm font-bold text-slate-800">{order.itemName}</p>

                                                <div className="grid grid-cols-2 gap-1 text-[11px]">
                                                    <p className="text-slate-500"><span className="text-slate-400">Platform:</span> {order.platform || '-'}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Category:</span> {order.category || '-'}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Color:</span> {order.color || '-'}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Qty:</span> {order.quantity || 1}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Unit Price:</span> {priceTag(order.amount || 0)}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Total:</span> {priceTag((parseFloat(order.amount || 0) || 0) * (Math.max(1, parseInt(order.quantity || '1', 10) || 1)))}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Order Date:</span> {order.orderDate || '-'}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Expected Delivery:</span> {order.expectedDeliveryDate || '-'}</p>
                                                    <p className="text-slate-500"><span className="text-slate-400">Payment:</span> {order.paymentStatus || '-'}</p>
                                                    <p className="text-slate-500 col-span-2"><span className="text-slate-400">Created:</span> {formatDisplayDate(order.createdAt || '')}</p>
                                                </div>

                                                {order.notes ? (
                                                    <p className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg px-2 py-1">
                                                        <span className="text-slate-400">Notes:</span> {order.notes}
                                                    </p>
                                                ) : null}

                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => printOnlineOrderBill(order)}
                                                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                                                    >
                                                        Print
                                                    </button>
                                                    {order.status !== 'received' && (
                                                        <button onClick={() => markOnlineOrderReceived(order.id)} className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-xs font-semibold hover:bg-emerald-700 transition-colors">
                                                            Mark Received
                                                        </button>
                                                    )}
                                                </div>
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



