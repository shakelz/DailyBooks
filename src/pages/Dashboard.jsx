import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
// CategoryDropdown removed — replaced by Universal Inventory System
import FloatingWindowHelper from '../components/FloatingWindowHelper';

export default function Dashboard() {
    const navigate = useNavigate();
    const { role, logout: authLogout, lowStockAlerts, clearAlert, clearAllAlerts } = useAuth();
    const isAdmin = role === 'admin';

    const today = new Date().toLocaleDateString('en-PK', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    const [time, setTime] = useState(
        new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
    );

    // Update clock every minute
    useEffect(() => {
        const interval = setInterval(() => {
            setTime(new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }));
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // ── Layout State ──
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [activePage, setActivePage] = useState('Dashboard');
    const [showAlerts, setShowAlerts] = useState(false);

    // ── Income / Expense State ──
    const [todaySales, setTodaySales] = useState(0);
    const [todayPurchase, setTodayPurchase] = useState(0);
    const netAmount = todaySales - todayPurchase;

    const [incomeEntries, setIncomeEntries] = useState([]);
    const [expenseEntries, setExpenseEntries] = useState([]);

    const [selectedIncomeCategory, setSelectedIncomeCategory] = useState(null);
    const [selectedExpenseCategory, setSelectedExpenseCategory] = useState(null);
    const [incomeAmount, setIncomeAmount] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [incomeNote, setIncomeNote] = useState('');
    const [expenseNote, setExpenseNote] = useState('');

    // All transactions for floating window
    const allTransactions = [
        ...incomeEntries.map(e => ({ ...e, type: 'income' })),
        ...expenseEntries.map(e => ({ ...e, type: 'expense' })),
    ].sort((a, b) => b.id - a.id);

    const handleAddIncome = () => {
        if (!incomeAmount || parseFloat(incomeAmount) <= 0) return;
        const amount = parseFloat(incomeAmount);
        const entry = {
            id: Date.now(),
            desc: selectedIncomeCategory
                ? `${selectedIncomeCategory.detail} (${selectedIncomeCategory.productCategory})`
                : incomeNote || 'Income',
            amount,
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            category: selectedIncomeCategory,
        };
        setIncomeEntries([entry, ...incomeEntries]);
        setTodaySales(todaySales + amount);
        setIncomeAmount('');
        setIncomeNote('');
        setSelectedIncomeCategory(null);
    };

    const handleAddExpense = () => {
        if (!expenseAmount || parseFloat(expenseAmount) <= 0) return;
        const amount = parseFloat(expenseAmount);
        const entry = {
            id: Date.now(),
            desc: selectedExpenseCategory
                ? `${selectedExpenseCategory.detail} (${selectedExpenseCategory.productCategory})`
                : expenseNote || 'Expense',
            amount,
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            category: selectedExpenseCategory,
        };
        setExpenseEntries([entry, ...expenseEntries]);
        setTodayPurchase(todayPurchase + amount);
        setExpenseAmount('');
        setExpenseNote('');
        setSelectedExpenseCategory(null);
    };

    const handleLogout = () => {
        authLogout();
        navigate('/');
    };

    // Sidebar menu items (Admin only)
    const sidebarItems = [
        {
            label: 'Dashboard',
            route: '/dashboard',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
            ),
        },
        {
            label: 'Inventory',
            route: '/inventory',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
            ),
        },
        {
            label: 'Salesmen',
            route: '/salesmen',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            ),
        },
        {
            label: 'Reports',
            route: '/reports',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
        {
            label: 'Settings',
            route: '/settings',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
    ];

    const handleSidebarNav = (item) => {
        setActivePage(item.label);
        if (item.route !== '/dashboard') {
            navigate(item.route);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex">

            {/* ── Admin Sidebar ── */}
            {isAdmin && (
                <aside
                    className={`${sidebarOpen ? 'w-64' : 'w-20'} hidden md:flex flex-col bg-slate-900/95 border-r border-slate-700/50 backdrop-blur-xl transition-all duration-300 flex-shrink-0`}
                >
                    {/* Sidebar Header */}
                    <div className="px-4 py-4 border-b border-slate-700/50 flex items-center justify-between">
                        {sidebarOpen && (
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-md shadow-blue-500/20">
                                    <span className="text-sm font-bold text-white">C</span>
                                </div>
                                <div>
                                    <h1 className="text-base font-bold text-white leading-tight">
                                        Daily<span className="text-cyan-400">Books</span>
                                    </h1>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            id="sidebar-toggle-btn"
                            className="p-2 rounded-lg bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all cursor-pointer"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                            </svg>
                        </button>
                    </div>

                    {/* Admin Badge */}
                    <div className="px-4 py-3">
                        {sidebarOpen ? (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Admin Panel</span>
                            </div>
                        ) : (
                            <div className="flex justify-center">
                                <span className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
                            </div>
                        )}
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 px-3 py-2 space-y-1">
                        {sidebarItems.map((item) => (
                            <button
                                key={item.label}
                                onClick={() => handleSidebarNav(item)}
                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer
                  ${activePage === item.label
                                        ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-white border border-transparent'
                                    }
                  ${!sidebarOpen ? 'justify-center' : ''}
                `}
                            >
                                {item.icon}
                                {sidebarOpen && <span>{item.label}</span>}
                            </button>
                        ))}
                    </nav>

                    {/* Sidebar Footer */}
                    <div className="px-3 py-4 border-t border-slate-700/50">
                        <button
                            onClick={handleLogout}
                            id="sidebar-logout-btn"
                            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 cursor-pointer ${!sidebarOpen ? 'justify-center' : ''}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            {sidebarOpen && <span>Logout</span>}
                        </button>
                    </div>
                </aside>
            )}

            {/* ── Main Content Area ── */}
            <div className="flex-1 flex flex-col min-h-screen overflow-hidden">

                {/* ── Top Header Bar ── */}
                <header className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                    <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {(!isAdmin || !sidebarOpen) && (
                                <>
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                                        <span className="text-xs font-bold text-white">C</span>
                                    </div>
                                    <div>
                                        <h1 className="text-sm font-bold text-slate-800 leading-tight">
                                            Daily<span className="text-blue-600">Books</span>
                                        </h1>
                                        <p className="text-[10px] text-slate-400">{today} • {time}</p>
                                    </div>
                                </>
                            )}
                            {isAdmin && sidebarOpen && (
                                <p className="text-sm text-slate-500">{today} • {time}</p>
                            )}
                        </div>

                        {/* Summary Pills */}
                        <div className="hidden md:flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                </svg>
                                <span className="text-xs font-semibold text-emerald-700">₹{todaySales.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                </svg>
                                <span className="text-xs font-semibold text-red-700">₹{todayPurchase.toLocaleString('en-IN')}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${netAmount >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                                <span className={`text-xs font-bold ${netAmount >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Net: ₹{netAmount.toLocaleString('en-IN')}</span>
                            </div>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-2">
                            {/* Low Stock Alert Badge (Admin Only) */}
                            {isAdmin && lowStockAlerts.length > 0 && (
                                <button
                                    onClick={() => setShowAlerts(!showAlerts)}
                                    id="low-stock-alert-btn"
                                    className="relative p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all cursor-pointer"
                                    title="Low Stock Alerts"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                        {lowStockAlerts.length}
                                    </span>
                                </button>
                            )}

                            <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${isAdmin
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isAdmin ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                                {isAdmin ? 'Admin' : 'Salesman'}
                            </span>

                            {/* Mobile sidebar toggle for Admin */}
                            {isAdmin && (
                                <button
                                    onClick={() => setSidebarOpen(!sidebarOpen)}
                                    id="mobile-sidebar-toggle"
                                    className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </button>
                            )}

                            {/* Logout button (Salesman) */}
                            {!isAdmin && (
                                <button
                                    onClick={handleLogout}
                                    id="logout-btn"
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-all cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                    <span className="text-sm font-medium hidden sm:inline">Logout</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Admin Alert Panel (dropdown) */}
                    {isAdmin && showAlerts && lowStockAlerts.length > 0 && (
                        <div className="absolute right-4 top-14 w-80 bg-white rounded-2xl shadow-2xl border border-red-200 z-50 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-100">
                                <span className="text-sm font-bold text-red-700">🚨 Low Stock Alerts</span>
                                <button onClick={clearAllAlerts} className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer">
                                    Clear All
                                </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {lowStockAlerts.map((alert) => (
                                    <div key={alert.barcode} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 hover:bg-red-50/50">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-700 truncate">{alert.name}</p>
                                            <p className="text-[10px] text-slate-400">{alert.brand} • Stock: <span className="text-red-600 font-bold">{alert.stock}</span> • {alert.alertTime}</p>
                                        </div>
                                        <button onClick={() => clearAlert(alert.barcode)} className="ml-2 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 cursor-pointer">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mobile Summary Bar */}
                    <div className="md:hidden flex items-center justify-center gap-3 px-4 py-2 border-t border-slate-100 bg-slate-50">
                        <span className="text-xs font-semibold text-emerald-600">↑ ₹{todaySales.toLocaleString('en-IN')}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-xs font-semibold text-red-600">↓ ₹{todayPurchase.toLocaleString('en-IN')}</span>
                        <span className="text-slate-300">|</span>
                        <span className={`text-xs font-bold ${netAmount >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                            Net: ₹{netAmount.toLocaleString('en-IN')}
                        </span>
                    </div>
                </header>

                {/* ── Mobile Sidebar Overlay (Admin only) ── */}
                {isAdmin && sidebarOpen && (
                    <div className="md:hidden fixed inset-0 z-40">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                        <div className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 border-r border-slate-700/50 p-4 flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                                        <span className="text-sm font-bold text-white">C</span>
                                    </div>
                                    <span className="text-base font-bold text-white">Daily<span className="text-cyan-400">Books</span></span>
                                </div>
                                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <nav className="flex-1 space-y-1">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.label}
                                        onClick={() => { handleSidebarNav(item); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${activePage === item.label
                                            ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                                            : 'text-slate-400 hover:bg-slate-800/60 hover:text-white border border-transparent'
                                            }`}
                                    >
                                        {item.icon}
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </nav>
                            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer mt-4 border-t border-slate-700/50 pt-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* ══ Split Screen: Income | Expense ══ */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ═══ LEFT: INCOME (Green) ═══ */}
                    <div className="w-1/2 bg-green-50 border-r border-green-200 overflow-y-auto flex flex-col">
                        {/* Income Header */}
                        <div className="px-5 py-4 border-b border-emerald-200/60 bg-white/60 backdrop-blur-sm flex-shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-emerald-800">Income / Sales</h2>
                                        <p className="text-[11px] text-emerald-500">Aaj ki kamaai</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-emerald-600">₹{todaySales.toLocaleString('en-IN')}</p>
                                    <p className="text-[10px] text-emerald-400 uppercase tracking-wider">{incomeEntries.length} entries</p>
                                </div>
                            </div>

                            {/* Income Add Form */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <input placeholder="Category..." className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" onChange={e => setSelectedIncomeCategory({ detail: e.target.value })} />
                                    {selectedIncomeCategory && (
                                        <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-lg">
                                            {selectedIncomeCategory.detail}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Note (optional)"
                                        value={incomeNote}
                                        onChange={(e) => setIncomeNote(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400"
                                    />
                                    <input
                                        type="number"
                                        placeholder="₹ Amount"
                                        value={incomeAmount}
                                        onChange={(e) => setIncomeAmount(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddIncome()}
                                        className="w-28 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 font-semibold"
                                    />
                                    <button
                                        onClick={handleAddIncome}
                                        id="add-income-btn"
                                        className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer"
                                    >+</button>
                                </div>
                            </div>
                        </div>

                        {/* Income Entries List */}
                        <div className="flex-1 p-4 space-y-2">
                            {incomeEntries.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <p className="text-3xl mb-2">💰</p>
                                    <p className="text-sm">Koi income nahi abhi tak</p>
                                </div>
                            ) : (
                                incomeEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-emerald-100 shadow-sm">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{entry.desc}</p>
                                            <p className="text-[10px] text-slate-400">{entry.time}</p>
                                        </div>
                                        <span className="text-emerald-600 font-bold">+₹{entry.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ═══ RIGHT: EXPENSE (Red) ═══ */}
                    <div className="w-1/2 bg-red-50 overflow-y-auto flex flex-col">
                        {/* Expense Header */}
                        <div className="px-5 py-4 border-b border-red-200/60 bg-white/60 backdrop-blur-sm flex-shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-base font-bold text-red-800">Expense / Purchase</h2>
                                        <p className="text-[11px] text-red-500">Aaj ka kharcha</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-red-600">₹{todayPurchase.toLocaleString('en-IN')}</p>
                                    <p className="text-[10px] text-red-400 uppercase tracking-wider">{expenseEntries.length} entries</p>
                                </div>
                            </div>

                            {/* Expense Add Form */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <input placeholder="Category..." className="flex-1 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50" onChange={e => setSelectedExpenseCategory({ detail: e.target.value })} />
                                    {selectedExpenseCategory && (
                                        <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-lg">
                                            {selectedExpenseCategory.detail}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Note (optional)"
                                        value={expenseNote}
                                        onChange={(e) => setExpenseNote(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-red-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400"
                                    />
                                    <input
                                        type="number"
                                        placeholder="₹ Amount"
                                        value={expenseAmount}
                                        onChange={(e) => setExpenseAmount(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
                                        className="w-28 px-3 py-2 rounded-xl bg-white border border-red-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:border-red-400 font-semibold"
                                    />
                                    <button
                                        onClick={handleAddExpense}
                                        id="add-expense-btn"
                                        className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95 transition-all cursor-pointer"
                                    >+</button>
                                </div>
                            </div>
                        </div>

                        {/* Expense Entries List */}
                        <div className="flex-1 p-4 space-y-2">
                            {expenseEntries.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <p className="text-3xl mb-2">🧾</p>
                                    <p className="text-sm">Koi kharcha nahi abhi tak</p>
                                </div>
                            ) : (
                                expenseEntries.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-red-100 shadow-sm">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{entry.desc}</p>
                                            <p className="text-[10px] text-slate-400">{entry.time}</p>
                                        </div>
                                        <span className="text-red-600 font-bold">-₹{entry.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Floating Windows (Calculator + Recent Transactions) ── */}
            <FloatingWindowHelper transactions={allTransactions} />
        </div>
    );
}
