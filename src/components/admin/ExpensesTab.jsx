import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { priceTag } from '../../utils/currency';
import { Plus, Trash2, Calendar, FileText } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';

export default function ExpensesTab() {
    const { transactions, addTransaction, deleteTransaction } = useInventory();
    const { role } = useAuth();

    // States for Form
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('Rent');
    const [date, setDate] = useState(() => {
        const now = new Date();
        // Format as datetime-local value: YYYY-MM-DDTHH:MM
        return now.toISOString().slice(0, 16);
    });
    const [showForm, setShowForm] = useState(false);

    // ── Date Range State ──
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 90)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);



    // Filter fixed expenses by date range
    const fixedExpenses = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        return transactions
            .filter(t => {
                if (t.type !== 'expense' || !t.isFixedExpense) return false;
                if (!t.timestamp) return true; // show if no timestamp
                const tDate = new Date(t.timestamp);
                return tDate >= rangeStart && tDate <= rangeEnd;
            })
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }, [transactions, dateSelection]);

    const totalFiltered = useMemo(() => {
        return fixedExpenses.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    }, [fixedExpenses]);

    const totalLifetime = useMemo(() => {
        return transactions
            .filter(t => t.type === 'expense' && t.isFixedExpense)
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    }, [transactions]);

    const handleAddExpense = (e) => {
        e.preventDefault();
        if (!title || !amount) return;

        addTransaction({
            id: Date.now(),
            desc: `Fixed Expense: ${title}`,
            amount: parseFloat(amount),
            type: 'expense',
            category: category,
            isFixedExpense: true,
            date: new Date(date).toLocaleDateString('en-CA'),
            time: new Date(date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date(date).toISOString(),
            source: 'admin'
        });

        setTitle('');
        setAmount('');
        setShowForm(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Fixed Expenses</h1>
                    <p className="text-slate-500 text-sm font-medium">Manage Rent, Electricity, Salaries & other operational costs.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all text-sm font-bold"
                    >
                        {showForm ? 'Cancel' : <><Plus size={18} /> Add Expense</>}
                    </button>
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-blue-100 animate-in slide-in-from-top-4 duration-300">
                    <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                        <div className="md:col-span-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Category</label>
                            <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold" value={category} onChange={e => setCategory(e.target.value)}>
                                <option value="Rent">Rent</option>
                                <option value="Electricity">Electricity</option>
                                <option value="Internet">Internet</option>
                                <option value="Salary">Salary</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</label>
                            <input required type="text" placeholder="e.g. Shop Rent Feb 2026" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" value={title} onChange={e => setTitle(e.target.value)} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Amount (€)</label>
                            <input required type="number" min="0" step="0.01" placeholder="0.00" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" value={amount} onChange={e => setAmount(e.target.value)} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Date & Time</label>
                            <input type="datetime-local" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="md:col-span-1">
                            <button type="submit" className="w-full p-3 bg-indigo-600 text-white rounded-xl shadow shadow-indigo-500/30 hover:bg-indigo-700 active:scale-95 transition-all text-sm font-bold">
                                Save Expense
                            </button>
                        </div>
                    </form>
                </div>
            )}



            {/* List */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">Expense History</h3>
                        <p className="text-xs text-slate-400">Filtered operational costs for selected period</p>
                    </div>
                    <div className="text-right flex items-center gap-6">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Period Total</p>
                            <p className="text-xl font-black text-red-600">{priceTag(totalFiltered)}</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200"></div>
                        <div>
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider">Lifetime</p>
                            <p className="text-lg font-bold text-slate-400">{priceTag(totalLifetime)}</p>
                        </div>
                    </div>
                </div>
                <div className="md:hidden p-4 space-y-3">
                    {fixedExpenses.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-400 font-medium">
                            No fixed expenses recorded yet.
                        </div>
                    ) : fixedExpenses.map((txn) => (
                        <div key={`mobile-exp-${txn.id}`} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-9 h-9 rounded-lg bg-red-100 text-red-500 flex items-center justify-center shrink-0">
                                        <FileText size={16} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{txn.desc}</p>
                                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded inline-block mt-1">{txn.category}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { if (window.confirm('Delete expense?')) deleteTransaction(txn.id); }}
                                    className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all"
                                    title="Delete Expense"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-slate-500">
                                    <Calendar size={14} className="text-slate-400" />
                                    <span>{txn.date}</span>
                                    {txn.time && <span className="text-slate-400">{txn.time}</span>}
                                </div>
                                <span className="text-red-500 font-bold text-base">{priceTag(txn.amount)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="hidden md:block p-0 overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Details</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {fixedExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 text-sm font-medium">No fixed expenses recorded yet.</td>
                                </tr>
                            ) : fixedExpenses.map(txn => (
                                <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} className="text-slate-400" />
                                            <div>
                                                <span className="text-sm font-medium text-slate-600">{txn.date}</span>
                                                {txn.time && <span className="text-xs text-slate-400 ml-2">{txn.time}</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-500 flex items-center justify-center">
                                                <FileText size={16} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{txn.desc}</p>
                                                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded inline-block mt-1">{txn.category}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-red-500 font-bold">{priceTag(txn.amount)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { if (window.confirm('Delete expense?')) deleteTransaction(txn.id); }} className="p-2 text-slate-300 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Delete Expense">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
