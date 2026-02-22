import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Draggable from 'react-draggable';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import TotalBar from '../../components/TotalBar';
import TransactionList from '../../components/TransactionList';
import TransactionModal from '../../components/TransactionModal';
import SmartCategoryForm from '../../components/SmartCategoryForm';
import { generateId } from '../../data/inventoryStore';
import { priceTag } from '../../utils/currency';
import { ChevronRight } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';
import CategoryManagerModal from '../CategoryManagerModal';

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

function getDayKey(value) {
    const ms = getTimestampMs(value);
    if (Number.isNaN(ms)) return '';
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getStaffTxnId(txn) {
    return String(txn?.salesmanId || txn?.workerId || '');
}

// ══════════════════════════════════════════════════════════
// DailyBooks — Admin Dashboard (Unified UI)
// Matches Salesman UI + Admin Features (Production/Logs)
// ══════════════════════════════════════════════════════════

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { products, transactions, addTransaction, updateTransaction, deleteTransaction, lookupBarcode, searchProducts, getLowStockProducts, addProduct, adjustStock, getCategoryImage } = useInventory();
    const { role, user, logout: authLogout, attendanceLogs, salesmen, updateAttendanceLog, deleteAttendanceLog } = useAuth();

    // ── Profile/Search States ──
    const [searchTerm, setSearchTerm] = useState(''); // For TransactionList

    // ── Date Range Filter State ──
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);

    // ── Auth Check ──
    useEffect(() => {
        // Admin check is technically handled by App.jsx routes, but good for safety
        if (!user || role !== 'admin') {
            // navigate('/'); 
        }
    }, [user, role, navigate]);

    // ── Search + Product Modal ──
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    // ── Inventory Form Mode ──
    const [formMode, setFormMode] = useState('inventory'); // 'inventory' | 'purchase'
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [showCategoryManager, setShowCategoryManager] = useState(false);

    // ── Calculator State ──
    const [showCalc, setShowCalc] = useState(false);
    const [calcDisplay, setCalcDisplay] = useState('0');
    const [calcPrev, setCalcPrev] = useState(null);
    const [calcOp, setCalcOp] = useState(null);
    const calcNodeRef = useRef(null);

    // ── Success Popup ──
    const [showSuccess, setShowSuccess] = useState(false);

    // ── Attendance Editing ──
    const [editingLog, setEditingLog] = useState(null);

    // ── Scanner Buffer ──
    const scanBufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const scanTimeoutRef = useRef(null);
    const SCAN_SPEED_THRESHOLD = 80;

    // ── Live Ticker for Staff Production & Salary ──
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000); // Update every 1s for live salary
        return () => clearInterval(timer);
    }, []);

    // ═══════════════════ COMPUTED ═══════════════════

    // Standardize to the start and end of the selected date range for filtering
    const targetDateStart = new Date(dateSelection[0].startDate);
    targetDateStart.setHours(0, 0, 0, 0);

    const targetDateEnd = new Date(dateSelection[0].endDate);
    targetDateEnd.setHours(23, 59, 59, 999);
    const targetStartMs = targetDateStart.getTime();
    const targetEndMs = targetDateEnd.getTime();
    const nowMs = time.getTime();

    const formattedStartDate = targetDateStart.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedEndDate = targetDateEnd.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedDisplayDate = formattedStartDate === formattedEndDate ? formattedStartDate : `${formattedStartDate} - ${formattedEndDate}`;

    const allAttendanceLogs = useMemo(() => {
        return attendanceLogs
            .filter(l => l?.timestamp && !Number.isNaN(getTimestampMs(l.timestamp)))
            .sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
    }, [attendanceLogs]);

    const attendanceLogsInRange = useMemo(() => {
        return allAttendanceLogs
            .filter(l => {
                const ts = getTimestampMs(l.timestamp);
                return ts >= targetStartMs && ts <= targetEndMs;
            })
            .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
    }, [allAttendanceLogs, targetStartMs, targetEndMs]);

    // Salary paid transactions only in selected period
    const paidSalaryByStaffInRange = useMemo(() => {
        const earnings = {};
        transactions.forEach(t => {
            if (!(t.category === 'Salary' && t.type === 'expense' && t.isFixedExpense)) return;

            const ts = t.timestamp ? getTimestampMs(t.timestamp) : NaN;
            if (!Number.isNaN(ts) && (ts < targetStartMs || ts > targetEndMs)) return;
            if (Number.isNaN(ts)) {
                const dateStr = String(t.date || '').trim();
                if (dateStr !== formattedStartDate && dateStr !== formattedEndDate) return;
            }

            const idStr = String(t.salesmanId || t.workerId || '');
            if (!idStr) return;
            earnings[idStr] = (earnings[idStr] || 0) + (parseFloat(t.amount) || 0);
        });
        return earnings;
    }, [transactions, targetStartMs, targetEndMs, formattedStartDate, formattedEndDate]);

    const staffProductionStats = useMemo(() => {
        const logsByStaff = {};
        const allUserLogs = {};
        const outSessionEarnings = {};
        let totalProductionMs = 0;
        let totalEarning = 0;

        allAttendanceLogs.forEach(log => {
            const uid = String(log.userId || log.workerId || '');
            if (!uid) return;
            if (!allUserLogs[uid]) allUserLogs[uid] = [];
            allUserLogs[uid].push(log);
        });

        salesmen.forEach(staff => {
            const uid = String(staff.id);
            const userLogs = allUserLogs[uid] || [];
            const hourlyRate = parseFloat(staff.hourlyRate) || 12.50;

            let openInMs = null;
            let completedMs = 0;
            let liveMs = 0;
            let isOnline = false;

            userLogs.forEach(log => {
                const ts = getTimestampMs(log.timestamp);
                if (Number.isNaN(ts)) return;

                if (log.type === 'IN') {
                    openInMs = ts;
                    isOnline = true;
                    return;
                }

                if (log.type === 'OUT' && openInMs !== null) {
                    const overlapMs = getRangeOverlapMs(openInMs, ts, targetStartMs, targetEndMs);
                    completedMs += overlapMs;
                    if (overlapMs > 0 && log.id) {
                        outSessionEarnings[String(log.id)] = (overlapMs / 3600000) * hourlyRate;
                    }
                    openInMs = null;
                    isOnline = false;
                }
            });

            if (openInMs !== null) {
                liveMs = getRangeOverlapMs(openInMs, nowMs, targetStartMs, targetEndMs);
            }

            const totalMs = completedMs + liveMs;
            const totalHours = totalMs / 3600000;
            const liveHours = liveMs / 3600000;
            const earning = totalHours * hourlyRate;

            logsByStaff[uid] = {
                totalMs,
                totalHours,
                completedMs,
                liveMs,
                liveHours,
                isOnline,
                hourlyRate,
                earning
            };

            totalProductionMs += totalMs;
            totalEarning += earning;
        });

        return { byStaff: logsByStaff, outSessionEarnings, totalProductionMs, totalEarning };
    }, [allAttendanceLogs, salesmen, targetStartMs, targetEndMs, nowMs]);

    const findPayrollTxnForStaffDay = useCallback((staffId, dayKey) => {
        const targetStaffId = String(staffId || '');
        if (!targetStaffId || !dayKey) return null;

        const dayObj = new Date(`${dayKey}T00:00:00`);
        const dayLabelShort = dayObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        const dayLabelNumeric = dayObj.toLocaleDateString('en-PK');

        return transactions.find(t => {
            if (!(t.category === 'Salary' && t.type === 'expense' && t.source === 'payroll-auto')) return false;
            if (getStaffTxnId(t) !== targetStaffId) return false;

            const txnDayKey = getDayKey(t.timestamp || t.date);
            if (txnDayKey && txnDayKey === dayKey) return true;

            const txnDate = String(t.date || '').trim();
            return txnDate === dayLabelShort || txnDate === dayLabelNumeric;
        }) || null;
    }, [transactions]);

    const todayTransactions = transactions.filter(t => {
        if (!t.timestamp && !t.date) return false;
        // Hide salary transactions — those belong in ExpensesTab only
        if (t.category === 'Salary') return false;

        let tDate;
        if (t.timestamp) {
            tDate = new Date(t.timestamp);
        } else {
            // Very old fallback if timestamp doesn't exist
            tDate = new Date();
        }
        return tDate >= targetDateStart && tDate <= targetDateEnd;
    });
    const incomeTransactions = todayTransactions.filter(t => t.type === 'income');
    // Exclude fixed expenses from sales/purchase view — those belong in ExpensesTab only
    const expenseTransactions = todayTransactions.filter(t => t.type === 'expense' && !t.isFixedExpense);

    // ── Payment Method Breakdowns ──
    const getBreakdown = (txns) => {
        return txns.reduce((acc, t) => {
            const method = String(t.paymentMethod || 'cash').toLowerCase();
            const amt = parseFloat(t.amount) || 0;
            if (acc[method] !== undefined) {
                acc[method] += amt;
            } else {
                acc.cash += amt; // Fallback for 'Cash', 'CASH', 'Other', etc.
            }
            return acc;
        }, { cash: 0, visa: 0, online: 0 });
    };

    const incomeBreakdown = getBreakdown(incomeTransactions);
    const expenseBreakdown = getBreakdown(expenseTransactions);

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
            setSelectedProduct(barcodeResult);
            setShowTransactionModal(true);
            setSearchQuery('');
            setSuggestions([]);
            return;
        }

        // Then text search
        const results = searchProducts(searchQuery.trim());
        if (results.length > 0) {
            setSelectedProduct(results[0]);
            setShowTransactionModal(true);
            setSearchQuery('');
            setSuggestions([]);
        }
    };

    const selectSuggestion = (product) => {
        setSelectedProduct(product);
        setShowTransactionModal(true);
        setSearchQuery('');
        setSuggestions([]);
    };

    // ═══════════════════ ADD TO BILL ═══════════════════

    const handleAddToBill = (productWithQty) => {
        addTransaction(productWithQty);

        // Decrease Stock
        adjustStock(productWithQty.productId || productWithQty.id, -productWithQty.quantity);

        // Show Success Popup
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);

        setShowTransactionModal(false);
        setSelectedProduct(null);
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

    // ── Keyboard Scanner Logic ──
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
                    const code = scanBufferRef.current;
                    const product = lookupBarcode(code);
                    if (product) {
                        setSelectedProduct(product);
                        setShowTransactionModal(true);
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
                        const product = lookupBarcode(scanBufferRef.current);
                        if (product) {
                            setSelectedProduct(product);
                            setShowTransactionModal(true);
                        }
                    }
                    scanBufferRef.current = '';
                }, 200);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showInventoryForm, showCalc, showTransactionModal, lookupBarcode]);

    // ═══════════════════ RENDER ═══════════════════

    return (
        <div className="h-full flex flex-col space-y-4">

            {/* ═══ DASHBOARD HEADER ═══ */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Admin Dashboard</h1>
                    <p className="text-slate-500 text-sm font-medium">Overview & Performance for {formattedDisplayDate}</p>
                </div>

                <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
            </div>

            {/* ═══ TOTAL BAR ═══ */}
            <TotalBar
                totalIncome={totalIncome}
                totalExpense={totalExpense}
                netAmount={netAmount}
                incomeCount={incomeTransactions.length}
                expenseCount={expenseTransactions.length}
                incomeBreakdown={incomeBreakdown}
                expenseBreakdown={expenseBreakdown}
            />

            {/* ═══ MAIN CONTENT SCROLL ═══ */}
            <div className="flex-1 space-y-4">

                {/* ── ADMIN FEATURE: Staff Production & Logs ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* ── Staff Production & Live Salary ── */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <span>⏱️</span> Staff Production & Salary
                            </h3>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total {formattedDisplayDate}</p>
                                <p className="text-xs font-black text-emerald-600">
                                    {priceTag(staffProductionStats.totalEarning)}
                                </p>
                            </div>
                        </div>
                        <div className="p-0">
                            {salesmen.map(staff => {
                                const stat = staffProductionStats.byStaff[String(staff.id)] || {
                                    totalMs: 0,
                                    totalHours: 0,
                                    liveMs: 0,
                                    liveHours: 0,
                                    isOnline: false,
                                    hourlyRate: parseFloat(staff.hourlyRate) || 12.50,
                                    earning: 0
                                };

                                const totalMs = stat.totalMs;
                                const hours = Math.floor(totalMs / (1000 * 60 * 60));
                                const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
                                const hourlyRate = stat.hourlyRate;
                                const liveSalary = stat.liveHours * hourlyRate;
                                const totalEarnedToday = stat.earning;
                                const paidToday = paidSalaryByStaffInRange[String(staff.id)] || 0;
                                const isOnline = stat.isOnline;

                                return (
                                    <div key={staff.id} className="px-5 py-4 border-b border-slate-50 last:border-none hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm ${isOnline ? 'bg-green-100 text-green-600 ring-2 ring-green-500/20' : 'bg-slate-100 text-slate-400'}`}>
                                                    {staff.photo ? <img src={staff.photo} className="w-full h-full rounded-full object-cover" /> : '👤'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-700 text-sm">{staff.name}</p>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isOnline ? 'text-green-500 animate-pulse' : 'text-slate-400'}`}>
                                                        {isOnline ? '● Online Now' : '○ Offline'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-mono font-bold text-slate-800 text-sm">{hours}h {minutes}m</p>
                                                <p className="text-[10px] text-slate-400">Today's Production</p>
                                            </div>
                                        </div>
                                        {/* Live Salary Row */}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[52px]">
                                            {isOnline && stat.liveMs > 0 ? (
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    <span className="text-xs font-bold text-emerald-700 font-mono tabular-nums">€{liveSalary.toFixed(4)}</span>
                                                    <span className="text-[9px] text-emerald-500">session</span>
                                                </div>
                                            ) : null}
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-xl" title={`${stat.totalHours.toFixed(2)}h × €${hourlyRate}/hr`}>
                                                <span className="text-xs font-bold text-violet-700 font-mono">€{totalEarnedToday.toFixed(2)}</span>
                                                <span className="text-[9px] text-violet-500">today ({stat.totalHours.toFixed(1)}h)</span>
                                            </div>
                                            {paidToday > 0 && (
                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl">
                                                    <span className="text-xs font-bold text-blue-700 font-mono">€{paidToday.toFixed(2)}</span>
                                                    <span className="text-[9px] text-blue-500">paid</span>
                                                </div>
                                            )}
                                            {!isOnline && paidToday === 0 && totalEarnedToday === 0 && (
                                                <span className="text-[10px] text-slate-300">No earnings yet</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {salesmen.length === 0 && <p className="text-center py-6 text-sm text-slate-400">No staff registered.</p>}
                        </div>
                    </div>

                    {/* ── Attendance Log Table ── */}
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <span>📝</span> Activity Log ({formattedDisplayDate})
                            </h3>
                            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full font-bold text-slate-600">
                                {attendanceLogsInRange.length} Records
                            </span>
                        </div>
                        <div className="p-0">
                            {attendanceLogsInRange.length === 0 ? (
                                <p className="text-center py-6 text-sm text-slate-400">No attendance records for {formattedDisplayDate}.</p>
                            ) : (
                                <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold sticky top-0">
                                            <tr>
                                                <th className="px-5 py-2">Time</th>
                                                <th className="px-5 py-2">Staff</th>
                                                <th className="px-5 py-2 text-right">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {attendanceLogsInRange.map((log) => {
                                                const earnedAmount = log.type === 'OUT'
                                                    ? staffProductionStats.outSessionEarnings[String(log.id)] ?? null
                                                    : null;
                                                return (
                                                    <tr key={log.id} className="hover:bg-slate-50">
                                                        <td className="px-5 py-2.5 font-mono text-slate-600 text-xs">{log.time}</td>
                                                        <td className="px-5 py-2.5 font-bold text-slate-700">{log.userName}</td>
                                                        <td className="px-5 py-2.5 text-right flex items-center justify-end gap-2">
                                                            {earnedAmount !== null && earnedAmount > 0.001 && (
                                                                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold font-mono">
                                                                    €{earnedAmount.toFixed(2)}
                                                                </span>
                                                            )}
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${log.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${log.type === 'IN' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                                {log.type === 'IN' ? 'PUNCHED IN' : 'PUNCHED OUT'}
                                                            </span>
                                                            <button
                                                                onClick={() => setEditingLog(log)}
                                                                className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-500 transition-colors"
                                                                title="Edit Punch"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
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
                                <p className="text-[10px] text-emerald-500">{incomeTransactions.length} transactions on {formattedDisplayDate}</p>
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
                                    <p className="text-[10px] text-red-500">{expenseTransactions.length} transactions on {formattedDisplayDate}</p>
                                </div>
                            </div>
                            <button onClick={() => {
                                setFormMode('purchase'); setShowInventoryForm(true);
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

                        <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-bold whitespace-nowrap">{todayTransactions.length} total</span>
                    </div>
                    <div className="p-3">
                        <TransactionList transactions={todayTransactions} searchTerm={searchTerm} isAdminOverride={true} />
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
            <SmartCategoryForm
                isOpen={showInventoryForm}
                onClose={() => setShowInventoryForm(false)}
                onSubmit={(entry) => {
                    // SmartCategoryForm already calls addProduct internally.
                    // We only handle the transaction logic here.
                    if (formMode === 'purchase') {
                        const cost = (parseFloat(entry.purchasePrice) || 0) * (parseInt(entry.stock) || 1);
                        addTransaction({
                            id: Date.now() + 1,
                            desc: `Stock Purchase: ${entry.name}`,
                            amount: cost,
                            category: entry.category?.level1 || 'Inventory',
                            notes: `Added ${entry.stock} units via Purchase Entry. ${entry.notes || ''}`,
                            type: 'expense',
                            source: 'shop',
                            quantity: parseInt(entry.stock) || 1,
                            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                            salesmanName: 'Admin',
                            workerId: 'admin'
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
                onClose={() => { setShowTransactionModal(false); setSelectedProduct(null); }}
                onAddToBill={handleAddToBill}
                initialProduct={selectedProduct}
            />

            {/* ═══ ATTENDANCE EDIT MODAL ═══ */}
            {editingLog && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-slate-700">Edit Punch Record</h3>
                            <button onClick={() => setEditingLog(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Staff Name</label>
                                <p className="font-bold text-slate-700">{editingLog.userName}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Punch Type</label>
                                    <select
                                        value={editingLog.type}
                                        onChange={(e) => setEditingLog({ ...editingLog, type: e.target.value })}
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        <option value="IN">PUNCH IN</option>
                                        <option value="OUT">PUNCH OUT</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Time</label>
                                    <input
                                        type="text"
                                        value={editingLog.time}
                                        onChange={(e) => setEditingLog({ ...editingLog, time: e.target.value })}
                                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                </div>
                            </div>
                            <div className="pt-2 flex gap-2">
                                <button
                                    onClick={() => {
                                        if (window.confirm('Delete this punch record?')) {
                                            // If deleting an OUT log, also remove its salary transaction
                                            if (editingLog.type === 'OUT') {
                                                const salaryTxn = findPayrollTxnForStaffDay(editingLog.userId, getDayKey(editingLog.timestamp));
                                                if (salaryTxn) deleteTransaction(salaryTxn.id);
                                            }
                                            deleteAttendanceLog(editingLog.id);
                                            setEditingLog(null);
                                        }
                                    }}
                                    className="flex-1 py-2.5 border-2 border-red-100 text-red-500 rounded-xl text-xs font-bold hover:bg-red-50 transition-all"
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            // 1) Update the edited attendance row.
                                            updateAttendanceLog(editingLog.id, { type: editingLog.type, time: editingLog.time });

                                            // 2) Rebuild timestamp from edited time.
                                            let editedTimestamp = editingLog.timestamp;
                                            try {
                                                const timeMatch = editingLog.time.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
                                                if (timeMatch) {
                                                    let [, hours, minutes, ampm] = timeMatch;
                                                    hours = parseInt(hours, 10);
                                                    minutes = parseInt(minutes, 10);
                                                    if (ampm) {
                                                        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                                                        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
                                                    }
                                                    const dateObj = new Date(editingLog.timestamp);
                                                    dateObj.setHours(hours, minutes, 0, 0);
                                                    editedTimestamp = dateObj.toISOString();
                                                }
                                            } catch {
                                                // Keep original timestamp if parsing fails.
                                            }

                                            const editedDayKey = getDayKey(editedTimestamp);
                                            const resolvedLogs = attendanceLogs
                                                .map(l => l.id === editingLog.id
                                                    ? { ...l, type: editingLog.type, time: editingLog.time, timestamp: editedTimestamp }
                                                    : l
                                                )
                                                .filter(l => String(l.userId) === String(editingLog.userId) && getDayKey(l.timestamp) === editedDayKey)
                                                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

                                            // 3) Recalculate total salary from IN/OUT pairs for that day.
                                            let totalMs = 0;
                                            let openInMs = null;
                                            let lastOutMs = null;

                                            resolvedLogs.forEach(log => {
                                                const ts = getTimestampMs(log.timestamp);
                                                if (Number.isNaN(ts)) return;

                                                if (log.type === 'IN') {
                                                    openInMs = ts;
                                                    return;
                                                }

                                                if (log.type === 'OUT' && openInMs !== null) {
                                                    totalMs += Math.max(0, ts - openInMs);
                                                    lastOutMs = ts;
                                                    openInMs = null;
                                                }
                                            });

                                            const hoursWorked = totalMs / 3600000;
                                            const staff = salesmen.find(s => String(s.id) === String(editingLog.userId));
                                            const hourlyRate = parseFloat(staff?.hourlyRate) || 12.50;
                                            const newSalary = parseFloat((hoursWorked * hourlyRate).toFixed(2));
                                            const salaryDesc = `Salary: ${editingLog.userName} (${hoursWorked.toFixed(1)}h @ €${hourlyRate}/hr)`;

                                            const payrollMs = lastOutMs || getTimestampMs(editedTimestamp) || Date.now();
                                            const payrollDateObj = new Date(payrollMs);
                                            const payrollDate = payrollDateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
                                            const payrollTime = payrollDateObj.toLocaleTimeString('en-US', { hour12: false });
                                            const payrollTimestamp = payrollDateObj.toISOString();

                                            const salaryTxn = findPayrollTxnForStaffDay(editingLog.userId, editedDayKey);

                                            if (salaryTxn && newSalary > 0.001) {
                                                await updateTransaction(salaryTxn.id, {
                                                    amount: newSalary,
                                                    desc: salaryDesc,
                                                    date: payrollDate,
                                                    time: payrollTime,
                                                    timestamp: payrollTimestamp,
                                                    workerId: String(editingLog.userId),
                                                    salesmanName: editingLog.userName,
                                                    category: 'Salary',
                                                    source: 'payroll-auto',
                                                    type: 'expense',
                                                    isFixedExpense: true
                                                });
                                            } else if (salaryTxn && newSalary <= 0.001) {
                                                await deleteTransaction(salaryTxn.id);
                                            } else if (!salaryTxn && newSalary > 0.001) {
                                                await addTransaction({
                                                    id: generateId('SAL'),
                                                    desc: salaryDesc,
                                                    amount: newSalary,
                                                    type: 'expense',
                                                    category: 'Salary',
                                                    isFixedExpense: true,
                                                    date: payrollDate,
                                                    time: payrollTime,
                                                    timestamp: payrollTimestamp,
                                                    source: 'payroll-auto',
                                                    workerId: String(editingLog.userId),
                                                    salesmanName: editingLog.userName
                                                });
                                            }
                                        } catch (error) {
                                            console.error('Failed to sync salary expense after attendance edit:', error);
                                            alert(error?.message || 'Failed to sync salary expense entry.');
                                        } finally {
                                            setEditingLog(null);
                                        }
                                    }}
                                    className="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                <button onClick={() => setShowCalc(c => !c)}
                    className="w-12 h-12 rounded-2xl bg-slate-800 text-white shadow-lg shadow-slate-800/30 flex items-center justify-center hover:bg-slate-700 active:scale-90 transition-all cursor-pointer">
                    <span className="text-lg">🧮</span>
                </button>
                <button onClick={() => {
                    setShowCategoryManager(true);
                }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 flex items-center justify-center hover:shadow-blue-500/40 active:scale-90 transition-all cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
