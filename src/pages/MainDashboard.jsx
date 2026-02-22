import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
// CategoryDropdown removed — replaced by Universal Inventory System
import FloatingWindowHelper from '../components/FloatingWindowHelper';

export default function MainDashboard() {
    const navigate = useNavigate();
    const { role, logout: authLogout } = useAuth();
    const isAdmin = role === 'admin';

    const today = new Date().toLocaleDateString('en-PK', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    const time = new Date().toLocaleTimeString('en-PK', {
        hour: '2-digit', minute: '2-digit'
    });

    // ── State Management ──
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

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">

            {/* ── Compact Top Bar ── */}
            <header className="bg-white border-b border-slate-200 shadow-sm">
                <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:bg-slate-100 transition-all cursor-pointer" title="Back to Dashboard">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">C</span>
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800 leading-tight">
                                Daily<span className="text-blue-600">Books</span>
                            </h1>
                            <p className="text-[10px] text-slate-400">{today} • {time}</p>
                        </div>
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
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${netAmount >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
                            }`}>
                            <span className={`text-xs font-bold ${netAmount >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                                Net: ₹{netAmount.toLocaleString('en-IN')}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                            {isAdmin ? 'Admin' : 'Salesman'}
                        </span>
                        <button
                            onClick={handleLogout}
                            id="main-logout-btn"
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                            title="Logout"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </button>
                    </div>
                </div>

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

            {/* ── Split Screen: Income | Expense ── */}
            <div className="flex h-screen">

                {/* ═══ LEFT: INCOME (Green) ═══ */}
                <div className="w-1/2 bg-green-50 p-4 border-r border-green-200 overflow-y-auto">
                    {/* Income Header */}
                    <div className="px-5 py-4 border-b border-emerald-200/60 bg-white/60 backdrop-blur-sm">
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
                                    id="add-income-entry"
                                    className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 active:scale-95 transition-all cursor-pointer shadow-sm shadow-emerald-500/25"
                                >
                                    + Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Income Entries */}
                    <div className="px-5 py-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                        {incomeEntries.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-emerald-400 font-medium">Koi income nahi aai abhi</p>
                                <p className="text-xs text-emerald-300 mt-1">Upar se category select karke add karo</p>
                            </div>
                        ) : (
                            incomeEntries.map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{entry.desc}</p>
                                            <p className="text-[10px] text-slate-400">{entry.time} {entry.category ? `• ${entry.category.mainCategory}` : ''}</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-emerald-600">+₹{entry.amount.toLocaleString('en-IN')}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* ═══ RIGHT: EXPENSE (Red) ═══ */}
                <div className="w-1/2 bg-red-50 p-4 overflow-y-auto">
                    {/* Expense Header */}
                    <div className="px-5 py-4 border-b border-red-200/60 bg-white/60 backdrop-blur-sm">
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
                                    id="add-expense-entry"
                                    className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95 transition-all cursor-pointer shadow-sm shadow-red-500/25"
                                >
                                    + Add
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Expense Entries */}
                    <div className="px-5 py-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                        {expenseEntries.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-100 mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                                    </svg>
                                </div>
                                <p className="text-sm text-red-400 font-medium">Koi kharcha nahi hua abhi</p>
                                <p className="text-xs text-red-300 mt-1">Upar se category select karke add karo</p>
                            </div>
                        ) : (
                            expenseEntries.map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-red-100 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-700">{entry.desc}</p>
                                            <p className="text-[10px] text-slate-400">{entry.time} {entry.category ? `• ${entry.category.mainCategory}` : ''}</p>
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-red-600">-₹{entry.amount.toLocaleString('en-IN')}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* ── Floating Helper Windows ── */}
            <FloatingWindowHelper transactions={allTransactions} />
        </div>
    );
}
