import { useMemo, useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { priceTag } from '../../utils/currency';
import DateRangeFilter from './DateRangeFilter';

const EXPENSE_CATEGORY_OPTIONS = [
    'General',
    'Rent',
    'Utilities',
    'Salary',
    'Repairs',
    'Stock Purchase',
    'Online Purchase',
    'Transport',
    'Marketing',
    'Misc'
];

function nowLocalInputValue() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function parseTxnDate(txn) {
    const raw = txn?.timestamp || `${txn?.date || ''} ${txn?.time || ''}`;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCashbookEntry(txn) {
    const type = String(txn?.type || '').toLowerCase();
    if (type !== 'income' && type !== 'expense') return false;
    if (txn?.isFixedExpense) return true;
    const source = String(txn?.source || '').toLowerCase();
    return source === 'admin' || source === 'admin-income' || source === 'admin-expense' || source === 'cashbook';
}

export default function ExpensesTab() {
    const { transactions, addTransaction, updateTransaction, deleteTransaction } = useInventory();

    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 90)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);

    const [showForm, setShowForm] = useState(false);
    const [entryType, setEntryType] = useState('expense');
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('General');
    const [categoryOption, setCategoryOption] = useState('General');
    const [customCategory, setCustomCategory] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [when, setWhen] = useState(nowLocalInputValue());

    const [editingId, setEditingId] = useState('');
    const [editType, setEditType] = useState('expense');
    const [editDesc, setEditDesc] = useState('');
    const [editAmount, setEditAmount] = useState('');
    const [editCategory, setEditCategory] = useState('General');
    const [editCategoryOption, setEditCategoryOption] = useState('General');
    const [editCustomCategory, setEditCustomCategory] = useState('');
    const [editPaymentMethod, setEditPaymentMethod] = useState('Cash');
    const [editWhen, setEditWhen] = useState(nowLocalInputValue());

    const rangeStart = useMemo(() => {
        const d = new Date(dateSelection[0].startDate);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [dateSelection]);

    const rangeEnd = useMemo(() => {
        const d = new Date(dateSelection[0].endDate);
        d.setHours(23, 59, 59, 999);
        return d;
    }, [dateSelection]);

    const rows = useMemo(() => {
        return transactions
            .filter((txn) => isCashbookEntry(txn))
            .filter((txn) => {
                const d = parseTxnDate(txn);
                return d && d >= rangeStart && d <= rangeEnd;
            })
            .sort((a, b) => (parseTxnDate(b)?.getTime() || 0) - (parseTxnDate(a)?.getTime() || 0));
    }, [transactions, rangeStart, rangeEnd]);

    const totals = useMemo(() => {
        return rows.reduce((acc, txn) => {
            const value = parseFloat(txn.amount) || 0;
            if (txn.type === 'income') acc.income += value;
            else acc.expense += value;
            return acc;
        }, { income: 0, expense: 0 });
    }, [rows]);

    const resetForm = () => {
        setDesc('');
        setAmount('');
        setCategory('General');
        setCategoryOption('General');
        setCustomCategory('');
        setPaymentMethod('Cash');
        setWhen(nowLocalInputValue());
    };

    const submitEntry = async (e) => {
        e.preventDefault();
        const value = parseFloat(amount);
        const dt = new Date(when);
        const resolvedCategory = categoryOption === '__custom__' ? customCategory.trim() : categoryOption;
        if (!desc.trim() || !resolvedCategory || !Number.isFinite(value) || value <= 0 || Number.isNaN(dt.getTime())) {
            alert('Please fill valid description, amount and date/time.');
            return;
        }
        try {
            await addTransaction({
                desc: `${entryType === 'income' ? 'Income' : 'Expense'}: ${desc.trim()}`,
                amount: value,
                type: entryType,
                category: resolvedCategory,
                paymentMethod,
                source: entryType === 'income' ? 'admin-income' : 'admin-expense',
                date: dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                timestamp: dt.toISOString(),
            });
            setShowForm(false);
            resetForm();
        } catch (error) {
            alert(error?.message || 'Failed to add entry.');
        }
    };

    const beginEdit = (txn) => {
        const dt = parseTxnDate(txn) || new Date();
        const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
        setEditingId(String(txn.id));
        setEditType(txn.type === 'income' ? 'income' : 'expense');
        setEditDesc(String(txn.desc || '').replace(/^Income:\s*/i, '').replace(/^Expense:\s*/i, ''));
        setEditAmount(String(parseFloat(txn.amount) || 0));
        const rawCategory = String(txn.category || 'General');
        setEditCategory(rawCategory);
        if (EXPENSE_CATEGORY_OPTIONS.includes(rawCategory)) {
            setEditCategoryOption(rawCategory);
            setEditCustomCategory('');
        } else {
            setEditCategoryOption('__custom__');
            setEditCustomCategory(rawCategory);
        }
        setEditPaymentMethod(String(txn.paymentMethod || 'Cash'));
        setEditWhen(local.toISOString().slice(0, 16));
    };

    const saveEdit = async (txnId) => {
        const value = parseFloat(editAmount);
        const dt = new Date(editWhen);
        const resolvedCategory = editCategoryOption === '__custom__' ? editCustomCategory.trim() : editCategoryOption;
        if (!editDesc.trim() || !resolvedCategory || !Number.isFinite(value) || value <= 0 || Number.isNaN(dt.getTime())) {
            alert('Please fill valid description, amount and date/time.');
            return;
        }
        try {
            await updateTransaction(txnId, {
                desc: `${editType === 'income' ? 'Income' : 'Expense'}: ${editDesc.trim()}`,
                amount: value,
                type: editType,
                category: resolvedCategory,
                paymentMethod: editPaymentMethod,
                source: editType === 'income' ? 'admin-income' : 'admin-expense',
                date: dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                time: dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                timestamp: dt.toISOString(),
            });
            setEditingId('');
        } catch (error) {
            alert(error?.message || 'Failed to update entry.');
        }
    };

    const net = totals.income - totals.expense;

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Expenses & Income</h1>
                    <p className="text-slate-500 text-sm font-medium">Editable ledger with red expense and green income amounts.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
                    <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
                        {showForm ? 'Cancel' : 'Add Expense / Income'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-red-100 bg-white p-4">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Expense</p>
                    <p className="text-2xl font-black text-red-600">{priceTag(totals.expense)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Income</p>
                    <p className="text-2xl font-black text-emerald-600">{priceTag(totals.income)}</p>
                </div>
                <div className={`rounded-2xl border bg-white p-4 ${net >= 0 ? 'border-blue-100' : 'border-orange-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${net >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Net</p>
                    <p className={`text-2xl font-black ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{priceTag(net)}</p>
                </div>
            </div>

            {showForm && (
                <form onSubmit={submitEntry} className="rounded-2xl border border-blue-100 bg-white p-4 grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Type</label>
                        <div className="grid grid-cols-2 gap-1">
                            <button type="button" onClick={() => setEntryType('expense')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${entryType === 'expense' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>Expense</button>
                            <button type="button" onClick={() => setEntryType('income')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${entryType === 'income' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>Income</button>
                        </div>
                    </div>
                    <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label><input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                        <select
                            value={categoryOption}
                            onChange={(e) => {
                                setCategoryOption(e.target.value);
                                if (e.target.value !== '__custom__') {
                                    setCategory(e.target.value);
                                }
                            }}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                            {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                                <option key={`add-cat-${item}`} value={item}>{item}</option>
                            ))}
                            <option value="__custom__">Custom...</option>
                        </select>
                        {categoryOption === '__custom__' && (
                            <input
                                value={customCategory}
                                onChange={(e) => {
                                    setCustomCategory(e.target.value);
                                    setCategory(e.target.value);
                                }}
                                placeholder="Enter custom category"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                        )}
                    </div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payment</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>Cash</option><option>Visa</option><option>Online</option><option>Bank Transfer</option></select></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date & Time</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div className="md:col-span-7"><button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">Save Entry</button></div>
                </form>
            )}

            <div className="rounded-2xl border border-slate-100 bg-white p-3 space-y-2 min-h-[280px]">
                {rows.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">No entries in selected range.</p>
                ) : rows.map((txn) => {
                    const isIncome = txn.type === 'income';
                    const active = editingId === String(txn.id);
                    return (
                        <div key={txn.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                            {!active ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{txn.desc}</p>
                                        <p className="text-[11px] text-slate-500">{txn.date} {txn.time} | {txn.category || 'General'} | {txn.paymentMethod || 'Cash'}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>{isIncome ? '+' : '-'}{priceTag(txn.amount)}</p>
                                        <button onClick={() => beginEdit(txn)} className="px-2 py-1 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700">Edit</button>
                                        <button onClick={() => { if (window.confirm('Delete entry?')) deleteTransaction(txn.id); }} className="px-2 py-1 text-xs rounded border border-red-200 bg-red-50 text-red-700">Delete</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Type</label>
                                        <div className="grid grid-cols-2 gap-1">
                                            <button type="button" onClick={() => setEditType('expense')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${editType === 'expense' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>Expense</button>
                                            <button type="button" onClick={() => setEditType('income')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${editType === 'income' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>Income</button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description</label><input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount</label><input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                                        <select
                                            value={editCategoryOption}
                                            onChange={(e) => {
                                                setEditCategoryOption(e.target.value);
                                                if (e.target.value !== '__custom__') {
                                                    setEditCategory(e.target.value);
                                                }
                                            }}
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                        >
                                            {EXPENSE_CATEGORY_OPTIONS.map((item) => (
                                                <option key={`edit-cat-${item}`} value={item}>{item}</option>
                                            ))}
                                            <option value="__custom__">Custom...</option>
                                        </select>
                                        {editCategoryOption === '__custom__' && (
                                            <input
                                                value={editCustomCategory}
                                                onChange={(e) => {
                                                    setEditCustomCategory(e.target.value);
                                                    setEditCategory(e.target.value);
                                                }}
                                                placeholder="Enter custom category"
                                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                            />
                                        )}
                                    </div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payment</label><select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>Cash</option><option>Visa</option><option>Online</option><option>Bank Transfer</option></select></div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date & Time</label><input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div className="md:col-span-7 flex items-center justify-end gap-2">
                                        <button type="button" onClick={() => setEditingId('')} className="px-3 py-1.5 rounded border border-slate-200 text-xs font-bold text-slate-600">Cancel</button>
                                        <button type="button" onClick={() => saveEdit(txn.id)} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-bold">Save</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

