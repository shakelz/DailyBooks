import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Draggable from 'react-draggable';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { useCart } from '../context/CartContext';
import TotalBar from '../components/TotalBar';
import TransactionList from '../components/TransactionList';
import TransactionModal from '../components/TransactionModal';
import CartSidebar from '../components/CartSidebar';
import SalesmanProfile from '../components/SalesmanProfile';
import SmartCategoryForm from '../components/SmartCategoryForm';
import CategoryManagerModal from '../components/CategoryManagerModal';
import { generateId } from '../data/inventoryStore';
import { priceTag } from '../utils/currency';
import RepairModal from '../components/RepairModal';
import CompleteRepairModal from '../components/admin/CompleteRepairModal';
import { useRepairs } from '../context/RepairsContext';

// ══════════════════════════════════════════════════════════
// DailyBooks — Salesman Dashboard
// Category Containers + Transaction History + FABs
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════

export default function SalesmanDashboard() {
    const navigate = useNavigate();
    const {
        products, transactions, addTransaction, lookupBarcode,
        searchProducts, getLowStockProducts, addProduct,
        adjustStock, getCategoryImage
    } = useInventory();
    const { role, user, logout: authLogout, lowStockAlerts, clearAlert, clearAllAlerts, attendanceLogs, isPunchedIn, autoLockEnabled, autoLockTimeout } = useAuth();

    // ── Auth Check ──
    useEffect(() => {
        if (!user || role !== 'salesman') {
            navigate('/');
        }
    }, [user, role, navigate]);


    // ── Attendance Log Logic ──
    // const isPunchedIn = ... // logic moved to AuthContext


    // ── Profile Modal ──
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showRepairModal, setShowRepairModal] = useState(false);
    const [showPendingDrawer, setShowPendingDrawer] = useState(false);
    const [searchTerm, setSearchTerm] = useState(''); // Lifted search state

    // Modal State for Complete Repair
    const [completingJob, setCompletingJob] = useState(null);

    // ── Repairs ──
    const { repairJobs, updateRepairStatus } = useRepairs();
    const { cart, addToCart, setEditingCartItem } = useCart();
    const pendingRepairs = repairJobs.filter(j => j.status === 'pending');

    // Cart edit state
    const [editingCartItemData, setEditingCartItemData] = useState(null);
    const [showCartToast, setShowCartToast] = useState(false);

    const handleCompleteRepair = (job) => {
        setCompletingJob(job);
        // We close the pending drawer so modal is prominent
        setShowPendingDrawer(false);
    };

    const handleConfirmComplete = (completionData) => {
        const { finalAmount, partsUsed, totalPartsCost } = completionData;
        const job = completingJob;

        // 1. Dispatch custom event for cross-context stock deduction
        window.dispatchEvent(new CustomEvent('update-inventory-stock', { detail: { partsUsed } }));

        // 2. Update Repair Job
        updateRepairStatus(job.id, 'completed', {
            finalAmount,
            partsUsed,
            partsCost: totalPartsCost
        });

        // 3. Add Transaction
        addTransaction({
            id: Date.now(),
            desc: `Repair Service: ${job.deviceModel} (${job.refId})`,
            amount: finalAmount,
            type: 'income',
            category: 'Repair Service',
            notes: `Customer: ${job.customerName} | ${job.problem} | Parts Cost: €${totalPartsCost.toFixed(2)}`,
            source: 'repair',
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString(),
        });

        setCompletingJob(null);
    };

    // ── Access Control ──
    const checkAccess = () => {
        if (!isPunchedIn) {
            alert("⚠️ Usage Restricted\n\nPlease 'Punch In' to perform transactions or access inventory.");
            setShowProfileModal(true); // Open profile to let them punch in
            return false;
        }
        return true;
    };

    // ── Search + Product Modal ──
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    // ── Inventory Form Mode ──
    const [formMode, setFormMode] = useState('inventory'); // 'inventory' | 'purchase'

    // ── Inventory Form & Calc ──
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [showCalc, setShowCalc] = useState(false);
    const [calcDisplay, setCalcDisplay] = useState('0');
    const [showSuccess, setShowSuccess] = useState(false);
    const [calcPrev, setCalcPrev] = useState(null);
    const [calcOp, setCalcOp] = useState(null);
    const calcNodeRef = useRef(null);
    const searchInputRef = useRef(null); // ADDED FOR AUTO-FOCUS

    // ── Scanner Buffer ──
    const scanBufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const scanTimeoutRef = useRef(null);
    const SCAN_SPEED_THRESHOLD = 80;

    // ═══════════════════ AUTO-LOCK (INACTIVITY TIMER) STATES ═══════════════════

    const [isLocked, setIsLocked] = useState(false);
    const [unlockPin, setUnlockPin] = useState('');
    const [unlockError, setUnlockError] = useState(false);
    const lockTimerRef = useRef(null);
    const debounceRef = useRef(null);

    // ═══════════════════ COMPUTED ═══════════════════

    const todayDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const currentTime = new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

    // Filter out salary transactions — salesmen shouldn't see their own salary info
    const visibleTransactions = transactions.filter(t => t.category !== 'Salary');

    const todayTransactions = visibleTransactions.filter(t => t.date === todayDate);
    const incomeTransactions = todayTransactions.filter(t => t.type === 'income');
    const expenseTransactions = todayTransactions.filter(t => t.type === 'expense');
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalExpense = expenseTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const netAmount = totalIncome - totalExpense;

    // ── Category Aggregation ──
    const aggregateByCategory = (txns) => {
        const map = {};
        txns.forEach(t => {
            const cat = typeof t.category === 'object' ? (t.category?.level1 || 'General') : (t.category || 'General');
            if (!map[cat]) map[cat] = { total: 0, count: 0 };
            map[cat].total += parseFloat(t.amount) || 0;
            map[cat].count += 1;
        });
        return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
    };
    const incomeByCategory = aggregateByCategory(incomeTransactions);
    const expenseByCategory = aggregateByCategory(expenseTransactions);

    // ═══════════════════ SEARCH ═══════════════════

    const handleSearchChange = (val) => {
        setSearchQuery(val);
        if (!val.trim()) { setSuggestions([]); return; }
        setSuggestions(searchProducts(val.trim()).slice(0, 6));
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        // Try barcode first
        const barcodeResult = lookupBarcode(searchQuery.trim());
        if (barcodeResult) {
            handleSmartScan(barcodeResult);
            setSearchQuery('');
            setSuggestions([]);
            return;
        }

        // Then text search
        const results = searchProducts(searchQuery.trim());
        if (results.length > 0) {
            handleSmartScan(results[0]);
            setSearchQuery('');
            setSuggestions([]);
        }
    };

    const selectSuggestion = (product) => {
        handleSmartScan(product);
        setSearchQuery('');
        setSuggestions([]);
    };

    // ═══════════════════ ADD TO BILL (from TransactionModal) ═══════════════════

    const handleAddToBill = (productWithQty) => {
        addTransaction(productWithQty);

        // Decrease Stock
        adjustStock(productWithQty.productId || productWithQty.id, -productWithQty.quantity);

        // Show Success Popup
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);

        setShowTransactionModal(false);
        setSelectedProduct(null);
        setEditingCartItemData(null);
    };

    // ── Cart Edit Handler (called from CartSidebar pencil icon) ──
    const handleEditCartItem = (item) => {
        setEditingCartItemData(item);
        setEditingCartItem(item.cartItemId);
        setShowTransactionModal(true);
    };

    // ── Smart Scan: auto-add accessories to cart ──
    const handleSmartScan = (product) => {
        if (!checkAccess()) return;
        const cat = typeof product.category === 'object' ? product.category?.level1 : product.category;
        const isAccessory = cat && ['Accessories', 'Cable', 'Charger', 'Case', 'Screen Protector'].some(
            a => cat.toLowerCase().includes(a.toLowerCase())
        );

        if (isAccessory) {
            // Auto-add to cart with defaults
            addToCart({
                ...product,
                productId: product.id,
                name: product.name,
                transactionId: generateId('TXN'),
                quantity: 1,
                unitPrice: parseFloat(product.sellingPrice) || 0,
                stdPriceAtTime: parseFloat(product.sellingPrice) || 0,
                purchasePriceAtTime: parseFloat(product.purchasePrice) || 0,
                profit: (parseFloat(product.sellingPrice) || 0) - (parseFloat(product.purchasePrice) || 0),
                amount: parseFloat(product.sellingPrice) || 0,
                discount: 0,
                taxInfo: {
                    net: (parseFloat(product.sellingPrice) || 0) / 1.19,
                    tax: (parseFloat(product.sellingPrice) || 0) - (parseFloat(product.sellingPrice) || 0) / 1.19,
                    rate: 0.19
                },
                verifiedAttributes: {},
                customerInfo: { name: 'Walk-in', phone: '', type: 'New' },
                paymentMethod: 'Cash',
                notes: '',
            });
            setShowCartToast(true);
            setTimeout(() => setShowCartToast(false), 1500);
        } else {
            // Open modal for phones/electronics
            setSelectedProduct(product);
            setShowTransactionModal(true);
        }
    };

    // ═══════════════════ CALCULATOR ═══════════════════

    const handleCalcPress = useCallback((key) => {
        if (key === 'C') { setCalcDisplay('0'); setCalcPrev(null); setCalcOp(null); return; }
        if (key === '⌫') { setCalcDisplay(d => d.length > 1 ? d.slice(0, -1) : '0'); return; }
        if (['+', '-', '×', '÷'].includes(key)) {
            setCalcPrev(parseFloat(calcDisplay));
            setCalcOp(key);
            setCalcDisplay('0');
            return;
        }
        if (key === '=') {
            if (calcPrev !== null && calcOp) {
                const curr = parseFloat(calcDisplay);
                let result;
                if (calcOp === '+') result = calcPrev + curr;
                else if (calcOp === '-') result = calcPrev - curr;
                else if (calcOp === '×') result = calcPrev * curr;
                else if (calcOp === '÷') result = curr !== 0 ? calcPrev / curr : 0;
                setCalcDisplay(String(parseFloat(result.toFixed(6))));
                setCalcPrev(null); setCalcOp(null);
            }
            return;
        }
        if (key === '.' && calcDisplay.includes('.')) return;
        setCalcDisplay(d => d === '0' && key !== '.' ? key : d + key);
    }, [calcDisplay, calcPrev, calcOp]);

    // ═══════════════════ KEYBOARD SCANNER & AUTO-FOCUS ═══════════════════

    // Auto-Focus Logic
    useEffect(() => {
        const focusInput = () => {
            if (!showInventoryForm && !showCalc && !showTransactionModal && !showRepairModal && !showPendingDrawer && !showProfileModal && !showCategoryManager && !completingJob && !isLocked) {
                if (searchInputRef.current) {
                    // Don't steal focus if user is intentionally inside another input/textarea
                    const activeTag = document.activeElement?.tagName;
                    if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA' && activeTag !== 'SELECT') {
                        searchInputRef.current.focus();
                    }
                }
            }
        };

        focusInput();
        const handleWindowClick = () => setTimeout(focusInput, 50);
        window.addEventListener('click', handleWindowClick);
        return () => window.removeEventListener('click', handleWindowClick);
    }, [showInventoryForm, showCalc, showTransactionModal, showRepairModal, showPendingDrawer, showProfileModal, showCategoryManager, completingJob, isLocked]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (showInventoryForm || showCalc || showTransactionModal) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            const now = Date.now();
            const timeDiff = now - lastKeyTimeRef.current;
            lastKeyTimeRef.current = now;

            if (e.key === 'Enter') {
                e.preventDefault();
                if (scanBufferRef.current.length >= 3) {
                    if (!checkAccess()) return; // Access Check
                    const code = scanBufferRef.current;
                    const product = lookupBarcode(code);
                    if (product) {
                        handleSmartScan(product);
                    }
                }
                scanBufferRef.current = '';
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (timeDiff > 500) scanBufferRef.current = '';
                if (timeDiff < SCAN_SPEED_THRESHOLD || scanBufferRef.current.length === 0) {
                    scanBufferRef.current += e.key;
                }
                clearTimeout(scanTimeoutRef.current);
                scanTimeoutRef.current = setTimeout(() => {
                    if (scanBufferRef.current.length >= 8) {
                        if (!checkAccess()) return; // Access Check
                        const product = lookupBarcode(scanBufferRef.current);
                        if (product) {
                            handleSmartScan(product);
                        }
                    }
                    scanBufferRef.current = '';
                }, 200);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    // ═══════════════════ AUTO-LOCK (INACTIVITY TIMER) ═══════════════════

    useEffect(() => {
        if (!autoLockEnabled) return;

        const resetTimer = () => {
            clearTimeout(lockTimerRef.current);
            lockTimerRef.current = setTimeout(() => {
                setIsLocked(true);
            }, autoLockTimeout * 1000);
        };

        const handleActivity = () => {
            if (isLocked) return; // don't reset when locked
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(resetTimer, 300); // 300ms debounce
        };

        const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
        events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
        resetTimer(); // start initial timer

        return () => {
            events.forEach(e => window.removeEventListener(e, handleActivity));
            clearTimeout(lockTimerRef.current);
            clearTimeout(debounceRef.current);
        };
    }, [autoLockEnabled, autoLockTimeout, isLocked]);

    const handleUnlock = (e) => {
        e?.preventDefault();
        if (unlockPin === user?.pin) {
            setIsLocked(false);
            setUnlockPin('');
            setUnlockError(false);
        } else {
            setUnlockError(true);
            setUnlockPin('');
            setTimeout(() => setUnlockError(false), 1500);
        }
    };

    // ═══════════════════ RENDER ═══════════════════

    return (
        <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">

            {/* ═══ HEADER ═══ */}
            <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                        <span className="text-white text-sm font-bold">C</span>
                    </div>
                    <div>
                        <h1 className="text-base font-black text-slate-800 tracking-tight">DailyBooks</h1>
                        <p className="text-[10px] text-slate-400 font-medium">Hello, {user?.name || 'Salesman'}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowProfileModal(true)}
                    className="flex items-center gap-3 hover:bg-slate-50 p-2 rounded-xl transition-all cursor-pointer group"
                >
                    <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden relative">
                        {user?.photo ? (
                            <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex items-center justify-center w-full h-full text-slate-400">👤</div>
                        )}
                        {/* Status Dot */}
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${isPunchedIn ? 'bg-green-500' : 'bg-red-500'}`} />
                    </div>
                    <div className="text-left hidden sm:block">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{user?.name || 'Salesman'}</p>
                        <p className={`text-[10px] font-bold ${isPunchedIn ? 'text-green-600' : 'text-red-500'}`}>
                            {isPunchedIn ? 'Online' : 'Offline'}
                        </p>
                    </div>
                </button>
            </header>

            {/* ═══ TOTAL BAR ═══ */}
            <TotalBar
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                netAmount={netAmount}
                todayCount={todayTransactions.length}
            />

            {/* ═══ MAIN CONTENT ═══ */}
            <div className="flex-1 overflow-y-auto p-4 sm:px-6 space-y-4">

                {/* Search Bar */}
                <div className="relative">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="🔍 Scan barcode or search product..."
                            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-300 shadow-sm transition-all"
                        />
                    </form>

                    {/* Search Suggestions */}
                    {suggestions.length > 0 && searchQuery.trim() && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                            <div className="max-h-60 overflow-y-auto">
                                {suggestions.map((p, index) => (
                                    <div key={`${p.id}-${index}`} onClick={() => selectSuggestion(p)}
                                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-none flex items-center justify-between transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 text-sm">📦</div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{p.name}</p>
                                                <p className="text-[10px] text-slate-400">{p.barcode || 'No barcode'} • Stock: {p.stock}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-bold text-emerald-600">{priceTag(p.sellingPrice || 0)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Category Containers (Side by Side) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Sales by Category */}
                    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 to-emerald-100/30 border-b border-emerald-100 flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-800">Sales by Category</h3>
                                <p className="text-[10px] text-emerald-500">{incomeTransactions.length} transactions today</p>
                            </div>
                        </div>
                        <div className="p-3">
                            {incomeByCategory.length === 0 ? (
                                <div className="text-center py-6 text-slate-300">
                                    <p className="text-2xl mb-1">📊</p>
                                    <p className="text-[10px]">No sales yet</p>
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1 custom-scrollbar">
                                    {incomeByCategory.map(([cat, data]) => (
                                        <div key={cat} className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100/50 hover:bg-emerald-50 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-emerald-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {getCategoryImage(cat) ? (
                                                        <img src={getCategoryImage(cat)} alt={cat} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs">📊</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700">{cat}</p>
                                                    <p className="text-[9px] text-slate-400">{data.count} items</p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-emerald-600">{priceTag(data.total)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Purchases by Category */}
                    <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
                        <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-red-100/30 border-b border-red-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-800">Purchases by Category</h3>
                                    <p className="text-[10px] text-red-500">{expenseTransactions.length} transactions today</p>
                                </div>
                            </div>
                            <button onClick={() => {
                                if (checkAccess()) {
                                    setFormMode('purchase'); setShowInventoryForm(true);
                                }
                            }}
                                className="w-8 h-8 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all shadow-sm shadow-red-500/20 cursor-pointer"
                                title="Add Purchase (In-Stock)">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-3">
                            {expenseByCategory.length === 0 ? (
                                <div className="text-center py-6 text-slate-300">
                                    <p className="text-2xl mb-1">📊</p>
                                    <p className="text-[10px]">No purchases yet</p>
                                </div>
                            ) : (
                                <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1 custom-scrollbar">
                                    {expenseByCategory.map(([cat, data]) => (
                                        <div key={cat} className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/50 border border-red-100/50 hover:bg-red-50 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-white border border-red-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                                    {getCategoryImage(cat) ? (
                                                        <img src={getCategoryImage(cat)} alt={cat} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-xs">📉</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-700">{cat}</p>
                                                    <p className="text-[9px] text-slate-400">{data.count} items</p>
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-red-600">{priceTag(data.total)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Transaction History ── */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-base">📋</span>
                            <h3 className="text-sm font-bold text-slate-800">Recent Transactions</h3>
                        </div>

                        {/* Inline Search Bar */}
                        <div className="flex-1 max-w-sm relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Search by Product, ID, Customer..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all text-xs font-medium shadow-sm"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold whitespace-nowrap">{todayTransactions.length} today</span>
                    </div>
                    <div className="p-3">
                        <TransactionList transactions={todayTransactions} searchTerm={searchTerm} />
                    </div>
                </div>
            </div>

            {/* ═══ SUCCESS POPUP ═══ */}
            {showSuccess && (
                <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[70] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce">
                    <span className="text-xl">✅</span>
                    <span className="font-bold">Transaction Successful!</span>
                </div>
            )}

            {/* ═══ MODALS ═══ */}
            <SalesmanProfile
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
            />

            <SmartCategoryForm
                isOpen={showInventoryForm}
                onClose={() => setShowInventoryForm(false)}
                onSubmit={(entry) => {
                    // SmartCategoryForm already calls addProduct internally.
                    // We only handle transaction logic here if purchase mode.

                    // 2. If purchase mode, also record expense and ADD stock
                    if (formMode === 'purchase') {
                        const cost = (parseFloat(entry.purchasePrice) || 0) * (parseInt(entry.stock) || 1);
                        addTransaction({
                            id: generateId('PUR'),
                            desc: `Stock Purchase: ${entry.name}`,
                            amount: cost,
                            category: entry.category?.level1 || 'Inventory',
                            notes: `Added ${entry.stock} units via Purchase Entry. ${entry.notes || ''}`,
                            type: 'expense',
                            source: 'shop',
                            quantity: parseInt(entry.stock) || 1,
                            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                            salesmanName: user?.name,
                            workerId: String(user?.id)
                        });
                    }
                    setShowInventoryForm(false);
                }}
            />

            <CategoryManagerModal
                isOpen={showCategoryManager}
                onClose={() => setShowCategoryManager(false)}
            />

            <TransactionModal
                isOpen={showTransactionModal}
                onClose={() => { setShowTransactionModal(false); setSelectedProduct(null); setEditingCartItemData(null); setEditingCartItem(null); }}
                onAddToBill={handleAddToBill}
                initialProduct={selectedProduct}
                editingItem={editingCartItemData}
            />

            {/* Cart Sidebar */}
            <CartSidebar
                onEditItem={handleEditCartItem}
                onFinalized={() => { setShowSuccess(true); setTimeout(() => setShowSuccess(false), 2500); }}
            />

            {/* Cart Auto-Add Toast */}
            {showCartToast && (
                <div className="fixed top-4 right-24 bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg z-[70] text-sm font-bold animate-in slide-in-from-right duration-200">
                    🛒 Added to cart!
                </div>
            )}

            <RepairModal
                isOpen={showRepairModal}
                onClose={() => setShowRepairModal(false)}
            />

            <CompleteRepairModal
                isOpen={!!completingJob}
                onClose={() => setCompletingJob(null)}
                job={completingJob}
                onComplete={handleConfirmComplete}
            />

            {/* ═══ CALCULATOR FAB ═══ */}
            {showCalc && (
                <Draggable nodeRef={calcNodeRef} handle=".calc-handle" bounds="parent">
                    <div ref={calcNodeRef} className="fixed bottom-32 right-6 w-64 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-[60]">
                        <div className="calc-handle bg-slate-800 px-4 py-2 flex items-center justify-between cursor-grab active:cursor-grabbing">
                            <span className="text-white font-bold text-xs">🧮 Calculator</span>
                            <button onClick={() => setShowCalc(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
                        </div>

                        <div className="p-3 bg-slate-900 text-right">
                            {calcOp && <p className="text-slate-500 text-[10px] font-mono">{calcPrev} {calcOp}</p>}
                            <p className="text-white text-2xl font-bold font-mono tracking-tight">{calcDisplay}</p>
                        </div>

                        <div className="grid grid-cols-4 gap-px bg-slate-200 p-px">
                            {['C', '⌫', '÷', '×', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '=', '0', '.'].map((key) => (
                                <button key={key} onClick={() => handleCalcPress(key)}
                                    className={`py-3 text-sm font-bold transition-all active:scale-95 cursor-pointer
                                                ${key === '=' ? 'col-span-1 row-span-2 bg-blue-500 text-white hover:bg-blue-600'
                                            : key === '0' ? 'col-span-2 bg-white hover:bg-slate-50 text-slate-800'
                                                : ['C', '⌫'].includes(key) ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    : ['+', '-', '×', '÷'].includes(key) ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                                        : 'bg-white text-slate-800 hover:bg-slate-50'}`}>
                                    {key}
                                </button>
                            ))}
                        </div>
                    </div>
                </Draggable>
            )}

            {/* ═══ FABs ═══ */}
            <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
                {/* Pending Repairs FAB */}
                <button onClick={() => setShowPendingDrawer(true)}
                    className="relative w-12 h-12 rounded-2xl bg-red-500 text-white shadow-lg shadow-red-500/30 flex items-center justify-center hover:bg-red-600 active:scale-90 transition-all cursor-pointer"
                    title="Pending Repairs">
                    <span className="text-lg">📋</span>
                    {pendingRepairs.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-red-600 text-[10px] font-black rounded-full flex items-center justify-center shadow-sm border border-red-200">
                            {pendingRepairs.length}
                        </span>
                    )}
                </button>

                {/* Repair FAB */}
                <button onClick={() => {
                    if (checkAccess()) setShowRepairModal(true);
                }}
                    className="w-12 h-12 rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30 flex items-center justify-center hover:bg-amber-600 active:scale-90 transition-all cursor-pointer"
                    title="New Repair Job">
                    <span className="text-lg">🔧</span>
                </button>

                {/* Calculator FAB */}
                <button onClick={() => setShowCalc(c => !c)}
                    className="w-12 h-12 rounded-2xl bg-slate-800 text-white shadow-lg shadow-slate-800/30 flex items-center justify-center hover:bg-slate-700 active:scale-90 transition-all cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <rect x="4" y="2" width="16" height="20" rx="2" />
                        <line x1="8" y1="6" x2="16" y2="6" />
                        <line x1="8" y1="10" x2="8" y2="10.01" />
                        <line x1="12" y1="10" x2="12" y2="10.01" />
                        <line x1="16" y1="10" x2="16" y2="10.01" />
                        <line x1="8" y1="14" x2="8" y2="14.01" />
                        <line x1="12" y1="14" x2="12" y2="14.01" />
                        <line x1="16" y1="14" x2="16" y2="14.01" />
                        <line x1="8" y1="18" x2="12" y2="18" />
                    </svg>
                </button>

                {/* Category Manager FAB */}
                <button onClick={() => {
                    if (checkAccess()) {
                        setShowCategoryManager(true);
                    }
                }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center hover:shadow-emerald-500/40 active:scale-90 transition-all cursor-pointer"
                    title="Category Manager">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>

            {/* ═══ PENDING REPAIRS DRAWER ═══ */}
            {showPendingDrawer && (
                <div className="fixed inset-0 z-[80]" onClick={() => setShowPendingDrawer(false)}>
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Drawer Header */}
                        <div className="bg-gradient-to-r from-red-500 to-orange-500 p-5 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">📋 Pending Repairs</h2>
                                <p className="text-xs text-red-100">{pendingRepairs.length} job{pendingRepairs.length !== 1 ? 's' : ''} awaiting completion</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => { setShowPendingDrawer(false); setShowRepairModal(true); }}
                                    className="px-3 py-1.5 bg-white/20 text-white text-xs font-bold rounded-lg hover:bg-white/30 transition-colors"
                                >
                                    + New Repair
                                </button>
                                <button onClick={() => setShowPendingDrawer(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white text-lg">
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Drawer Body */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {pendingRepairs.length === 0 ? (
                                <div className="text-center py-16">
                                    <span className="text-4xl mb-3 block">✅</span>
                                    <p className="text-slate-400 font-medium">No pending repairs!</p>
                                    <p className="text-slate-300 text-xs mt-1">All caught up — great work.</p>
                                </div>
                            ) : (
                                pendingRepairs.map(job => {
                                    const deliveryDate = job.deliveryDate ? new Date(job.deliveryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—';
                                    const isOverdue = job.deliveryDate && new Date(job.deliveryDate) < new Date();
                                    return (
                                        <div key={job.id} className={`p-4 rounded-2xl border transition-all ${isOverdue ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-black text-blue-600 font-mono">{job.refId}</span>
                                                        {isOverdue && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-600 text-[8px] font-bold uppercase">OVERDUE</span>}
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-800">{job.customerName}</p>
                                                    <p className="text-xs text-slate-500">📱 {job.deviceModel}</p>
                                                    <p className="text-[11px] text-slate-400 mt-1 bg-white px-2 py-1 rounded-lg border border-slate-100">{job.problem}</p>
                                                    <div className="flex gap-3 mt-2 text-[10px] text-slate-400">
                                                        <span>Due: {deliveryDate}</span>
                                                        <span>Est: {priceTag(job.estimatedCost)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleCompleteRepair(job)}
                                                    className="px-3 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 flex-shrink-0"
                                                >
                                                    ✅ Complete
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ LOCK SCREEN OVERLAY ═══ */}
            {isLocked && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center">
                    {/* Blur backdrop */}
                    <div className="absolute inset-0 backdrop-blur-2xl bg-slate-900/70" />

                    {/* Lock Card */}
                    <div className={`relative z-10 w-full max-w-xs mx-4 ${unlockError ? 'animate-shake' : ''}`}>
                        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 text-center border border-white/20">
                            {/* Lock Icon */}
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </div>

                            <h2 className="text-xl font-black text-slate-800 mb-1">Screen Locked</h2>
                            <p className="text-xs text-slate-400 mb-6">Enter your PIN to unlock</p>

                            {/* PIN Input */}
                            <form onSubmit={handleUnlock}>
                                <div className="flex justify-center gap-3 mb-4">
                                    {[0, 1, 2, 3].map(i => (
                                        <div
                                            key={i}
                                            className={`w-4 h-4 rounded-full transition-all duration-200 ${i < unlockPin.length
                                                ? unlockError ? 'bg-red-500 scale-110' : 'bg-violet-500 scale-110'
                                                : 'bg-slate-200'
                                                }`}
                                        />
                                    ))}
                                </div>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={4}
                                    value={unlockPin}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setUnlockPin(val);
                                        if (val.length === 4) {
                                            if (val === user?.pin) {
                                                setIsLocked(false);
                                                setUnlockPin('');
                                                setUnlockError(false);
                                            } else {
                                                setUnlockError(true);
                                                setUnlockPin('');
                                                setTimeout(() => setUnlockError(false), 1500);
                                            }
                                        }
                                    }}
                                    autoFocus
                                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-violet-500 focus:outline-none text-center text-2xl font-mono font-bold tracking-[0.5em] bg-slate-50 transition-colors"
                                    placeholder="• • • •"
                                />

                                {unlockError && (
                                    <p className="text-red-500 text-xs font-bold mt-2">❌ Wrong PIN. Try again.</p>
                                )}

                                <button
                                    type="submit"
                                    className="w-full mt-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:from-violet-700 hover:to-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-violet-600/20"
                                >
                                    🔓 Unlock
                                </button>
                            </form>

                            <p className="text-[10px] text-slate-300 mt-4">{user?.name || 'Salesman'} • Auto-locked after {autoLockTimeout}s</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Shake Animation */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-6px); }
                    20%, 40%, 60%, 80% { transform: translateX(6px); }
                }
                .animate-shake { animation: shake 0.5s ease-in-out; }
            `}</style>
        </div>
    );
}
