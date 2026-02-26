import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Bell, Calculator, CircleDollarSign, ClipboardList, Menu, Receipt, Scale, Search, ShoppingCart, Sparkles, Wrench, CircleHelp, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { priceTag } from '../utils/currency';
import { resolveRelatedFields } from '../data/transactionFieldConfig';
import SalesmanProfile from '../components/SalesmanProfile';
import CategoryManagerModal from '../components/CategoryManagerModal';
import RepairModal from '../components/RepairModal';
import { useRepairs } from '../context/RepairsContext';

const ADD_NEW = '__add_new__';
const DEFAULT_PAYMENT_MODES = ['Cash', 'SumUp', 'Bank Transfer'];
const ONLINE_ORDER_COLORS = ['Black', 'White', 'Blue', 'Red', 'Green', 'Gold', 'Silver', 'Custom'];

const newCompactForm = () => ({
    barcode: '',
    name: '',
    amount: '',
    quantity: '1',
    category: '',
    subcategory: '',
    paymentMode: 'Cash',
    notes: '',
    productId: '',
    relatedFields: {},
});

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


function compactFieldSummary(fields) {
    return Object.entries(fields || {})
        .filter(([, value]) => String(value || '').trim() !== '')
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
}

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
        transactions,
        lookupBarcode,
        searchProducts,
        addTransaction,
        adjustStock,
        getCategoryImage,
        getLevel1Categories,
        getLevel2Categories,
        addLevel1Category,
        addLevel2Category,
    } = useInventory();
    const { repairJobs } = useRepairs();
    const pendingOrders = useMemo(() => repairJobs.filter((job) => job.status === 'pending'), [repairJobs]);

    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showRepairModal, setShowRepairModal] = useState(false);
    const [activeForm, setActiveForm] = useState('');
    const [toast, setToast] = useState('');
    const [paymentModes, setPaymentModes] = useState(DEFAULT_PAYMENT_MODES);
    const [form, setForm] = useState(newCompactForm());
    const [realtimeStats, setRealtimeStats] = useState(null);
    const [showPendingOrders, setShowPendingOrders] = useState(false);
    const [pendingTab, setPendingTab] = useState('orders');
    const [onlineOrders, setOnlineOrders] = useState([]);
    const [showOnlineOrderForm, setShowOnlineOrderForm] = useState(false);
    const [onlineOrderForm, setOnlineOrderForm] = useState(newOnlineOrderForm());
    const [barcodeMatches, setBarcodeMatches] = useState([]);
    const [showBarcodeMatches, setShowBarcodeMatches] = useState(false);
    const [selectedProductPreview, setSelectedProductPreview] = useState(null);
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
    const l2OptionsRaw = form.category ? (getLevel2Categories(form.category) || []) : [];
    const l2Options = l2OptionsRaw.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean);
    const relatedFieldSchema = useMemo(
        () => form.subcategory ? resolveRelatedFields(activeForm, form.category, form.subcategory) : [],
        [activeForm, form.category, form.subcategory]
    );

    const applySelectedProduct = (product, mode = activeForm) => {
        if (!product) return;
        const resolved = resolveProductSnapshot(product);
        const mainCategory = resolved.category;
        const subCategory = resolved.subCategory;
        const autoDetails = {
            dbName: resolved.name || '',
            dbBarcode: resolved.barcode || '',
            dbStock: String(resolved.stock ?? ''),
            dbSellingPrice: String(resolved.sellingPrice ?? ''),
            dbPurchasePrice: String(resolved.purchasePrice ?? ''),
            dbCategory: mainCategory || '',
            dbSubCategory: subCategory || '',
        };

        setSelectedProductPreview(resolved.raw || product);
        setForm((prev) => ({
            ...prev,
            productId: resolved.id || prev.productId,
            barcode: resolved.barcode || prev.barcode,
            name: resolved.name || prev.name,
            amount: String(mode === 'purchase'
                ? (resolved.purchasePrice || prev.amount || '')
                : (resolved.sellingPrice || prev.amount || '')),
            category: mainCategory || prev.category,
            subcategory: subCategory || prev.subcategory,
            relatedFields: {
                ...(prev.relatedFields || {}),
                ...autoDetails,
            },
        }));
    };

    const openSalesFormWithProduct = (product) => {
        if (!product) return;
        const resolved = resolveProductSnapshot(product);
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
        setActiveForm('');
        setShowTopBarcodeMatches(false);
        setShowBarcodeMatches(false);
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
        if (!activeForm) return;
        const barcode = form.barcode.trim();
        if (!barcode) {
            setForm((prev) => ({ ...prev, productId: '' }));
            setSelectedProductPreview(null);
            setBarcodeMatches([]);
            return;
        }

        const timer = setTimeout(() => {
            const found = lookupBarcode(barcode);
            if (found) {
                applySelectedProduct(found);
                setBarcodeMatches([found]);
                return;
            }

            const matches = searchProducts(barcode).slice(0, 6);
            setBarcodeMatches(matches);
            if (!matches.length) {
                setForm((prev) => ({ ...prev, productId: '' }));
                setSelectedProductPreview(null);
            }
        }, 220);

        return () => clearTimeout(timer);
    }, [activeForm, form.barcode, lookupBarcode, searchProducts]);

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

    const applyAddNewCategory = async (value) => {
        if (value !== ADD_NEW) {
            setForm((prev) => ({ ...prev, category: value, subcategory: '', relatedFields: {} }));
            return;
        }

        const next = window.prompt('Enter new category');
        if (!next || !next.trim()) return;
        await addLevel1Category(next.trim());
        setForm((prev) => ({ ...prev, category: next.trim(), subcategory: '', relatedFields: {} }));
    };

    const applyAddNewSubCategory = async (value) => {
        if (value !== ADD_NEW) {
            setForm((prev) => ({ ...prev, subcategory: value, relatedFields: {} }));
            return;
        }

        if (!form.category) {
            alert('Select category first');
            return;
        }
        const next = window.prompt('Enter new sub-category');
        if (!next || !next.trim()) return;
        await addLevel2Category(form.category, next.trim());
        setForm((prev) => ({ ...prev, subcategory: next.trim(), relatedFields: {} }));
    };

    const setRelatedFieldValue = (fieldKey, value) => {
        setForm((prev) => ({
            ...prev,
            relatedFields: {
                ...(prev.relatedFields || {}),
                [fieldKey]: value,
            },
        }));
    };

    const applyPaymentMode = (value) => {
        if (value !== ADD_NEW) {
            setForm((prev) => ({ ...prev, paymentMode: value }));
            return;
        }
        const next = window.prompt('Enter new payment mode');
        if (!next || !next.trim()) return;
        if (!paymentModes.includes(next.trim())) {
            setPaymentModes((prev) => [...prev, next.trim()]);
        }
        setForm((prev) => ({ ...prev, paymentMode: next.trim() }));
    };

    const printSlip = () => {
        const qty = Math.max(1, parseInt(form.quantity || '1', 10) || 1);
        const unit = parseFloat(form.amount) || 0;
        const total = qty * unit;
        const netTotal = total / 1.19;
        const taxTotal = total - netTotal;
        const shopName = activeShop?.name || 'Shop';
        const shopAddress = activeShop?.address || activeShop?.location || '';
        const popup = window.open('', 'receipt', 'width=420,height=700');
        if (!popup) return;
        popup.document.write(`
            <html>
                <head>
                    <title>Beleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; }
                        .line { border-top:1px dashed #000; margin:8px 0; }
                    </style>
                </head>
                <body>
                    <h2>${shopName}</h2>
                    ${shopAddress ? `<p>${shopAddress}</p>` : ''}
                    <p>${new Date().toLocaleString('de-DE')}</p>
                    <div class="line"></div>
                    <div class="row"><span>Typ</span><span>${activeForm === 'sales' ? 'Verkauf' : 'Einkauf'}</span></div>
                    <div class="row"><span>Artikel</span><span>${form.name || '-'}</span></div>
                    <div class="row"><span>Menge x Preis</span><span>${qty} x ${unit.toFixed(2)}</span></div>
                    <div class="row"><span>Zahlung</span><span>${form.paymentMode}</span></div>
                    <div class="line"></div>
                    <div class="row"><strong>Zwischensumme</strong><strong>EUR ${total.toFixed(2)}</strong></div>
                    ${billShowTax ? `<div class="row"><span>Netto (19%)</span><span>EUR ${netTotal.toFixed(2)}</span></div>
                    <div class="row"><span>USt (19%)</span><span>EUR ${taxTotal.toFixed(2)}</span></div>` : ''}
                    <div class="row"><strong>GESAMTBETRAG</strong><strong>EUR ${total.toFixed(2)}</strong></div>
                    <div class="line"></div>
                    <p style="font-size:10px">Rueckgabe/Umtausch innerhalb von 14 Tagen nur bei Schaden mit Beleg.</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const submitCompactForm = async (e) => {
        e.preventDefault();
        if (!isPunchedIn) {
            alert('Please punch in first');
            setShowProfileModal(true);
            return;
        }

        const unitAmount = parseFloat(form.amount) || 0;
        if (!form.category || unitAmount <= 0) {
            alert('Category and amount are required');
            return;
        }

        const type = activeForm === 'purchase' ? 'expense' : 'income';

        await addTransaction({
            desc: `${activeForm === 'purchase' ? 'Purchase' : 'Sale'} - ${form.category}`,
            amount: unitAmount,
            quantity: 1,
            type,
            category: form.category || 'General',
            paymentMethod: form.paymentMode || 'Cash',
            notes: '',
            source: type === 'expense' ? 'purchase' : 'shop',
            salesmanName: user?.name,
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
        });

        if (type === 'income' && form.productId) {
            await adjustStock(form.productId, -1);
        }

        setToast(`${type === 'income' ? 'Sales' : 'Purchase'} saved`);
        setTimeout(() => setToast(''), 1800);
        setForm(newCompactForm());
    };

    const handleCalcPress = (key) => {
        if (key === 'C') { setCalcDisplay('0'); setCalcPrev(null); setCalcOp(null); return; }
        if (key === 'âŒ«') { setCalcDisplay((d) => d.length > 1 ? d.slice(0, -1) : '0'); return; }
        if (['+', '-', 'Ã—', 'Ã·'].includes(key)) {
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
                if (calcOp === 'Ã—') result = calcPrev * curr;
                if (calcOp === 'Ã·') result = curr !== 0 ? calcPrev / curr : 0;
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
                                        <p className="text-[10px] text-slate-400">{resolved.barcode || 'No barcode'} â€¢ Stock {resolved.stock} â€¢ {priceTag(resolved.sellingPrice || 0)}</p>
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2.5 text-slate-300">
                        <button onClick={() => setShowPendingOrders(true)} title="Pending Jobs" className="fab-animated" style={{ '--fab-i': '#06b6d4', '--fab-j': '#2563eb' }}><span className="fab-icon"><ClipboardList size={14} /></span><span className="fab-title">Pending Jobs</span></button>
                        <button onClick={() => setShowCalc((prev) => !prev)} title="Calculator" className="fab-animated" style={{ '--fab-i': '#8b5cf6', '--fab-j': '#2563eb' }}><span className="fab-icon"><Calculator size={14} /></span><span className="fab-title">Calc</span></button>
                        <button onClick={() => setShowCategoryModal(true)} title="Add Category" className="fab-animated" style={{ '--fab-i': '#22c55e', '--fab-j': '#06b6d4' }}><span className="fab-icon"><Menu size={14} /></span><span className="fab-title">Add Category</span></button>
                        <button onClick={() => setShowRepairModal(true)} title="Repair Job" className="fab-animated" style={{ '--fab-i': '#f59e0b', '--fab-j': '#ef4444' }}><span className="fab-icon"><Wrench size={14} /></span><span className="fab-title">Repair Job</span></button>
                        <button onClick={() => setShowProfileModal(true)} className="h-8 w-8 rounded-lg border border-white/25 bg-white/20 text-white overflow-hidden flex items-center justify-center" title={user?.name || 'Profile'}>
                            {user?.photo ? (
                                <img src={user.photo} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm">ðŸ‘¤</span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-3 pt-4 pb-6 space-y-3">

                <section className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
                    <CompactTrendCard
                        label="Total Income"
                        value={activeStats.totals.income}
                        colorClass="border-blue-200 bg-gradient-to-br from-blue-100 to-indigo-50"
                    />
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <button
                        onClick={() => setActiveForm((prev) => {
                            const next = prev === 'sales' ? '' : 'sales';
                            if (next) setForm(newCompactForm());
                            return next;
                        })}
                        className="erp-big-button"
                    >
                        New Sales Entry
                    </button>
                    <button
                        onClick={() => setActiveForm((prev) => {
                            const next = prev === 'purchase' ? '' : 'purchase';
                            if (next) setForm(newCompactForm());
                            return next;
                        })}
                        className="erp-big-button erp-big-button--purchase"
                    >
                        New Purchase Entry
                    </button>
                </section>

                {activeForm && (
                    <form onSubmit={submitCompactForm} className={`rounded-2xl border bg-white/80 p-3 space-y-3 animate-in slide-in-from-top duration-200 shadow-sm backdrop-blur-sm ${activeForm === 'sales' ? 'border-emerald-200' : 'border-rose-200'}`}>
                        <div className={`rounded-xl px-3 py-2 flex items-center justify-between ${activeForm === 'sales' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            <p className="text-xs font-semibold">{activeForm === 'sales' ? 'New Sales Entry' : 'New Purchase Entry'}</p>
                            <p className="text-xs font-semibold">Simple form</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                                <input
                                    type="text"
                                    readOnly
                                    value={new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Mode</label>
                                <select
                                    value={form.paymentMode}
                                    onChange={(e) => setForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                                >
                                    {paymentModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                                <select
                                    value={form.category}
                                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                                    required
                                >
                                    <option value="">Select category</option>
                                    {l1Options.map((name) => <option key={name} value={name}>{name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.amount}
                                    onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                                    placeholder="Amount"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end">
                            <button type="submit" className={`rounded-xl text-white px-4 py-2 text-sm font-semibold ${activeForm === 'sales' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                                Save Entry
                            </button>
                        </div>
                    </form>
                )}

                <section className="grid grid-cols-1 md:grid-cols-2 gap-3"> 
                    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-emerald-100/30 border-b border-emerald-100 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Sales by Category Overview</h3>
                                <p className="text-[10px] text-emerald-500">{revenueTransactions.length} transactions today</p>
                            </div>
                        </div>
                        <div className="p-3">
                            {salesByCategory.length === 0 ? (
                                <div className="text-center py-6 text-slate-300">
                                    <p className="text-2xl mb-1">ðŸ“Š</p>
                                    <p className="text-[10px]">No sales yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-[1.2fr_.9fr] gap-2 items-center">
                                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                        {salesByCategory.slice(0, 10).map((item) => (
                                            <div key={item.name} className="min-w-[220px] flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100/50 hover:bg-emerald-50 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-white border border-emerald-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                        {getCategoryImage(item.name) ? (
                                                            <img src={getCategoryImage(item.name)} alt={item.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-xs">ðŸ“Š</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-700">{item.name}</p>
                                                        <p className="text-[9px] text-slate-400">{item.count} item{item.count === 1 ? '' : 's'}</p>
                                                    </div>
                                                </div>
                                                <p className="text-sm font-bold text-emerald-600">{priceTag(item.total)}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-center">
                                        <MiniDonut items={salesByCategory} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-red-100/30 border-b border-red-100 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Sales by Purchase Type</h3>
                                <p className="text-[10px] text-red-500">{purchaseTransactions.length} transactions today</p>
                            </div>
                        </div>
                        <div className="p-3">
                            {expensesByCategory.length === 0 ? (
                                <div className="text-center py-6 text-slate-300">
                                    <p className="text-2xl mb-1">ðŸ“Š</p>
                                    <p className="text-[10px]">No purchases yet</p>
                                </div>
                            ) : (
                                <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                                    {expensesByCategory.slice(0, 10).map((item) => (
                                        <div key={item.name} className="min-w-[220px] flex items-center justify-between p-2.5 rounded-xl bg-red-50/50 border border-red-100/50 hover:bg-red-50 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-red-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {getCategoryImage(item.name) ? (
                                                        <img src={getCategoryImage(item.name)} alt={item.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs">ðŸ“‰</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700">{item.name}</p>
                                                    <p className="text-[9px] text-slate-400">{item.count} item{item.count === 1 ? '' : 's'}</p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-red-600">{priceTag(item.total)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-emerald-700 mb-2">Revenue Transactions</h3>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {revenueTransactions.length === 0 ? <p className="text-xs text-slate-400">No revenue entries today</p> : revenueTransactions.map((txn) => (
                                <div key={txn.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{txn.desc || 'Revenue'}</p>
                                        <p className="text-[11px] text-slate-400">{txn.time || '--:--'}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 border-l border-slate-200 pl-3">{txn.time || '--:--'}</p>
                                    <p className="text-sm font-black text-emerald-600 border-l border-slate-200 pl-3">{priceTag(txn.amount || 0)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-rose-100 bg-white p-3 shadow-sm">
                        <h3 className="text-sm font-black text-rose-700 mb-2">Purchase Transactions History</h3>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {purchaseTransactions.length === 0 ? <p className="text-xs text-slate-400">No purchase transactions yet</p> : purchaseTransactions.map((txn) => (
                                <div key={txn.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2 grid grid-cols-[1fr_auto_auto] items-center gap-2">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{txn.desc || 'Purchase'}</p>
                                        <p className="text-[11px] text-slate-400">{txn.time || '--:--'}</p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 border-l border-slate-200 pl-3">{txn.time || '--:--'}</p>
                                    <p className="text-sm font-black text-rose-600 border-l border-slate-200 pl-3">{priceTag(txn.amount || 0)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>

            {toast && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900 text-white px-3 py-2 text-xs font-semibold z-50">
                    {toast}
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
                            <button onClick={() => setShowQuickSaleModal(false)} className="text-slate-500 hover:text-slate-700">âœ•</button>
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
                        <button onClick={() => setShowCalc(false)} className="text-xs text-slate-300 hover:text-white">âœ•</button>
                    </div>
                    <div className="p-3 bg-slate-900 text-right">
                        {calcOp && <p className="text-slate-500 text-[10px] font-mono">{calcPrev} {calcOp}</p>}
                        <p className="text-white text-2xl font-bold font-mono">{calcDisplay}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
                        {['C', 'âŒ«', 'Ã·', 'Ã—', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'].map((key) => (
                            <button
                                key={key}
                                onClick={() => handleCalcPress(key)}
                                className={`h-11 text-sm font-bold ${key === '=' ? 'bg-blue-600 text-white row-span-2 hover:bg-blue-700' : key === '0' ? 'col-span-2 bg-white hover:bg-slate-50' : ['+', '-', 'Ã—', 'Ã·'].includes(key) ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : ['C', 'âŒ«'].includes(key) ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white text-slate-800 hover:bg-slate-50'}`}
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
                            <button onClick={() => setShowPendingOrders(false)} className="text-white text-lg">âœ•</button>
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
                                    {pendingOrders.length === 0 ? (
                                        <div className="text-center py-12">
                                            <p className="text-4xl">âœ…</p>
                                            <p className="text-sm text-slate-500 mt-2">No pending orders</p>
                                        </div>
                                    ) : pendingOrders.map((job) => (
                                        <div key={job.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                            <p className="text-xs font-black text-blue-600">{job.refId}</p>
                                            <p className="text-sm font-bold text-slate-800">{job.customerName}</p>
                                            <p className="text-xs text-slate-500">{job.deviceModel}</p>
                                            <p className="text-xs mt-1 text-slate-400">{job.problem}</p>
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
                                            <p className="text-3xl">ðŸ›’</p>
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
                                                <p className="text-xs text-slate-500">{order.platform || 'Online'} • Qty {order.quantity} • {priceTag(order.amount || 0)} • Color {order.color || '-'}</p>
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



