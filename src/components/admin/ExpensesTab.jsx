import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
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

const EXPENSE_CATEGORY_LABELS = {
    General: 'Allgemein',
    Rent: 'Miete',
    Utilities: 'Nebenkosten',
    Salary: 'Gehalt',
    Repairs: 'Reparaturen',
    'Stock Purchase': 'Wareneinkauf',
    'Online Purchase': 'Online-Einkauf',
    Transport: 'Transport',
    Marketing: 'Marketing',
    Misc: 'Sonstiges'
};

const PAYMENT_METHOD_LABELS = {
    Cash: 'Bar',
    Visa: 'Visa',
    Online: 'Online',
    'Bank Transfer': 'Überweisung'
};

const TYPE_LABELS = {
    expense: 'Ausgabe',
    income: 'Einnahme'
};

function getExpenseCategoryLabel(value) {
    return EXPENSE_CATEGORY_LABELS[value] || value || 'Allgemein';
}

function getPaymentMethodLabel(value) {
    return PAYMENT_METHOD_LABELS[value] || value || 'Bar';
}

function normalizeMonthlySalesmen(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .map((row) => ({
            user_id: String(row?.user_id || row?.id || '').trim(),
            full_name: String(row?.full_name || row?.name || '').trim() || 'Mitarbeiter',
            monthly_salary: parseFloat(row?.monthly_salary ?? row?.monthlySalary ?? 0) || 0,
            salary_type: String(row?.salary_type || row?.salaryType || '').toLowerCase().trim() || 'monthly',
            active: row?.active !== false,
            shop_id: String(row?.shop_id || '').trim(),
        }))
        .filter((row) => row.user_id && row.salary_type === 'monthly' && row.active && row.monthly_salary > 0);
}

function formatMonthLabel(value) {
    const date = new Date(`${String(value || '').trim()}-01T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(value || '').trim() || '-';
    return date.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
}

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

function parseTs(value) {
    const ms = Date.parse(value || '');
    return Number.isNaN(ms) ? NaN : ms;
}

function rangeOverlapMs(startMs, endMs, rangeStartMs, rangeEndMs) {
    const from = Math.max(startMs, rangeStartMs);
    const to = Math.min(endMs, rangeEndMs);
    return Math.max(0, to - from);
}

function localDayKey(ms) {
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function isCashbookEntry(txn) {
    const type = String(txn?.type || '').toLowerCase();
    if (type !== 'income' && type !== 'expense') return false;
    if (txn?.isFixedExpense) return true;
    const source = String(txn?.source || '').toLowerCase();
    return source === 'admin' || source === 'admin-income' || source === 'admin-expense' || source === 'cashbook';
}

function getTxnInvoiceNumber(txn) {
    return String(txn?.invoiceNumber || txn?.invoice_number || '').trim();
}

export default function ExpensesTab() {
    const { transactions, addTransaction, updateTransaction, deleteTransaction } = useInventory();
    const { attendanceLogs, salesmen, activeShopId } = useAuth();
    const salarySyncInFlightRef = useRef(false);
    const toastTimeoutRef = useRef(null);

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
    const [showSalarySection, setShowSalarySection] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [monthlySalesmen, setMonthlySalesmen] = useState([]);
    const [editedSalaries, setEditedSalaries] = useState({});
    const [isBooking, setIsBooking] = useState(false);
    const [alreadyBooked, setAlreadyBooked] = useState(false);
    const [toast, setToast] = useState('');

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

    const salaryBuckets = useMemo(() => {
        const staffById = new Map((salesmen || []).map((staff) => [String(staff?.id || ''), staff]));
        const logsByStaff = new Map();

        (attendanceLogs || []).forEach((log) => {
            const sid = String(log?.userId || log?.workerId || '');
            const ts = parseTs(log?.timestamp);
            if (!sid || !Number.isFinite(ts)) return;
            const existing = logsByStaff.get(sid) || [];
            existing.push({ ...log, _ts: ts });
            logsByStaff.set(sid, existing);
        });

        const startMs = rangeStart.getTime();
        const endMs = rangeEnd.getTime();
        const buckets = [];

        logsByStaff.forEach((logs, sid) => {
            const staff = staffById.get(String(sid));
            const hourlyRate = parseFloat(staff?.hourlyRate) || 12.5;
            const ordered = logs.slice().sort((a, b) => a._ts - b._ts);
            const dayBuckets = {};

            let openInMs = null;
            ordered.forEach((log) => {
                const type = String(log?.type || '').toUpperCase();
                if (type === 'IN') {
                    openInMs = log._ts;
                    return;
                }
                if (type === 'OUT' && openInMs !== null) {
                    const overlapMs = rangeOverlapMs(openInMs, log._ts, startMs, endMs);
                    if (overlapMs > 0) {
                        let cursor = Math.max(startMs, openInMs);
                        const maxEnd = Math.min(endMs, log._ts);
                        while (cursor < maxEnd) {
                            const current = new Date(cursor);
                            current.setHours(0, 0, 0, 0);
                            const nextDay = new Date(current);
                            nextDay.setDate(nextDay.getDate() + 1);
                            const segmentEnd = Math.min(maxEnd, nextDay.getTime());
                            const key = localDayKey(cursor);
                            dayBuckets[key] = (dayBuckets[key] || 0) + Math.max(0, segmentEnd - cursor);
                            cursor = segmentEnd;
                        }
                    }
                    openInMs = null;
                }
            });

            Object.entries(dayBuckets).forEach(([dayKey, ms]) => {
                const hours = ms / 3600000;
                if (hours <= 0) return;
                const amount = Number((hours * hourlyRate).toFixed(2));
                const stamp = new Date(`${dayKey}T12:00:00`);
                buckets.push({
                    workerId: String(sid),
                    staffName: String(staff?.name || 'Staff'),
                    dayKey,
                    amount,
                    timestamp: stamp.toISOString(),
                });
            });
        });

        return buckets;
    }, [attendanceLogs, salesmen, rangeStart, rangeEnd]);

    useEffect(() => {
        if (!Array.isArray(salaryBuckets) || salaryBuckets.length === 0) return;
        if (salarySyncInFlightRef.current) return;

        let cancelled = false;
        salarySyncInFlightRef.current = true;

        const syncSalaryToTransactions = async () => {
            try {
                const existingKeySet = new Set(
                    (Array.isArray(transactions) ? transactions : [])
                        .filter((txn) => {
                            const source = String(txn?.source || '').toLowerCase();
                            const category = String(txn?.category || '').toLowerCase();
                            const txType = String(txn?.tx_type || txn?.type || '').toLowerCase();
                            const isFixed = Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false) || txType === 'fixed_expense';
                            return source === 'admin-expense' && category === 'salary' && isFixed;
                        })
                        .map((txn) => {
                            const worker = String(txn?.workerId || txn?.worker_id || '').trim();
                            const notes = String(txn?.notes || '');
                            const matchedDay = notes.match(/salary_day:([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] || '';
                            const fallbackDay = parseTxnDate(txn) ? localDayKey(parseTxnDate(txn).getTime()) : '';
                            const dayKey = matchedDay || fallbackDay;
                            return worker && dayKey ? `${worker}::${dayKey}` : '';
                        })
                        .filter(Boolean)
                );

                for (const bucket of salaryBuckets) {
                    if (cancelled) break;
                    const dedupeKey = `${bucket.workerId}::${bucket.dayKey}`;
                    if (existingKeySet.has(dedupeKey)) continue;

                    const dt = new Date(bucket.timestamp);
                    await addTransaction({
                        desc: `Salary: ${bucket.staffName} (${bucket.dayKey})`,
                        amount: bucket.amount,
                        type: 'expense',
                        tx_type: 'fixed_expense',
                        category: 'Salary',
                        paymentMethod: 'Auto',
                        source: 'admin-expense',
                        is_fixed_expense: true,
                        isFixedExpense: true,
                        workerId: bucket.workerId,
                        notes: `salary_day:${bucket.dayKey} | worker_id:${bucket.workerId}`,
                        date: dt.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                        time: dt.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                        timestamp: dt.toISOString(),
                    });

                    existingKeySet.add(dedupeKey);
                }
            } catch (error) {
                console.error('Salary transaction sync failed:', error);
            } finally {
                salarySyncInFlightRef.current = false;
            }
        };

        syncSalaryToTransactions();
        return () => {
            cancelled = true;
        };
    }, [salaryBuckets, transactions, addTransaction]);

    const rows = useMemo(() => {
        const cashbookRows = transactions
            .filter((txn) => isCashbookEntry(txn))
            .filter((txn) => {
                const d = parseTxnDate(txn);
                return d && d >= rangeStart && d <= rangeEnd;
            })
            .map((txn) => ({ ...txn, isSynthetic: false }));

        return [...cashbookRows]
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

    const monthlySalesmenCount = monthlySalesmen.length;
    const totalMonthlySalary = useMemo(
        () => monthlySalesmen
            .reduce((sum, salesman) => sum + (parseFloat(editedSalaries[salesman.user_id] ?? salesman.monthly_salary) || 0), 0)
            .toFixed(2),
        [monthlySalesmen, editedSalaries]
    );
    const currentMonth = useMemo(() => formatMonthLabel(selectedMonth), [selectedMonth]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    const showToastMessage = (message, duration = 2200) => {
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        setToast(message);
        toastTimeoutRef.current = setTimeout(() => {
            setToast('');
            toastTimeoutRef.current = null;
        }, duration);
    };

    useEffect(() => {
        if (!activeShopId) {
            setMonthlySalesmen([]);
            setEditedSalaries({});
            return;
        }

        let cancelled = false;

        const fetchMonthlySalesmen = async () => {
            const fallbackRows = normalizeMonthlySalesmen(salesmen)
                .filter((salesman) => !salesman.shop_id || String(salesman.shop_id) === String(activeShopId));

            const preferredResult = await supabase
                .from('profiles')
                .select('user_id, full_name, monthly_salary, salary_type, active, shop_id')
                .eq('shop_id', activeShopId)
                .eq('salary_type', 'monthly')
                .eq('active', true)
                .gt('monthly_salary', 0);

            let rows = preferredResult.data;
            let error = preferredResult.error;

            if (error) {
                const fallbackQuery = await supabase
                    .from('profiles')
                    .select('user_id, full_name, monthly_salary, salary_type, shop_id')
                    .eq('shop_id', activeShopId)
                    .eq('salary_type', 'monthly')
                    .gt('monthly_salary', 0);
                rows = fallbackQuery.data;
                error = fallbackQuery.error;
            }

            const normalizedRows = error
                ? fallbackRows
                : normalizeMonthlySalesmen(rows).length > 0
                    ? normalizeMonthlySalesmen(rows)
                    : fallbackRows;

            if (cancelled) return;

            setMonthlySalesmen(normalizedRows);
            setEditedSalaries((prev) => {
                const validIds = new Set(normalizedRows.map((salesman) => salesman.user_id));
                return Object.fromEntries(
                    Object.entries(prev).filter(([userId]) => validIds.has(userId))
                );
            });
        };

        fetchMonthlySalesmen();

        return () => {
            cancelled = true;
        };
    }, [activeShopId, salesmen]);

    useEffect(() => {
        if (!activeShopId || !selectedMonth) {
            setAlreadyBooked(false);
            return;
        }

        let cancelled = false;

        const checkIfBooked = async () => {
            const { data, error } = await supabase
                .from('transactions')
                .select('transaction_id, notes')
                .eq('shop_id', activeShopId)
                .ilike('notes', `%monthly_salary%${selectedMonth}%`)
                .limit(1);

            if (cancelled) return;

            if (error) {
                const localMatch = (Array.isArray(transactions) ? transactions : []).some((txn) => {
                    const notes = String(txn?.notes || '');
                    return notes.includes('monthly_salary') && notes.includes(selectedMonth);
                });
                setAlreadyBooked(localMatch);
                return;
            }

            setAlreadyBooked(Array.isArray(data) && data.length > 0);
        };

        checkIfBooked();

        return () => {
            cancelled = true;
        };
    }, [activeShopId, selectedMonth, transactions]);

    const resetForm = () => {
        setDesc('');
        setAmount('');
        setCategory('General');
        setCategoryOption('General');
        setCustomCategory('');
        setPaymentMethod('Cash');
        setWhen(nowLocalInputValue());
    };

    const handleSalaryEdit = (userId, value) => {
        setEditedSalaries((prev) => ({ ...prev, [userId]: parseFloat(value) || 0 }));
    };

    const handleSalarySave = async (userId) => {
        if (!activeShopId) return;
        const newAmount = parseFloat(editedSalaries[userId]) || 0;

        let { error } = await supabase
            .from('profiles')
            .update({
                monthly_salary: newAmount,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('shop_id', activeShopId);

        if (error && /updated_at/i.test(String(error?.message || ''))) {
            const fallbackResult = await supabase
                .from('profiles')
                .update({ monthly_salary: newAmount })
                .eq('user_id', userId)
                .eq('shop_id', activeShopId);
            error = fallbackResult.error;
        }

        if (error) {
            alert(error?.message || 'Gehalt konnte nicht aktualisiert werden.');
            return;
        }

        setMonthlySalesmen((prev) => prev.map((salesman) => (
            salesman.user_id === userId
                ? { ...salesman, monthly_salary: newAmount }
                : salesman
        )));
        setEditedSalaries((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
        });
        showToastMessage('Gehalt aktualisiert');
    };

    const handleBookSalaries = async () => {
        if (!activeShopId) {
            alert('Bitte zuerst einen Shop auswählen.');
            return;
        }
        if (monthlySalesmen.length === 0) return;

        setIsBooking(true);

        try {
            const monthName = formatMonthLabel(selectedMonth);
            const bookingDate = new Date(`${selectedMonth}-01T12:00:00`);
            const safeBookingDate = Number.isNaN(bookingDate.getTime()) ? new Date() : bookingDate;

            for (const salesman of monthlySalesmen) {
                const amount = parseFloat(editedSalaries[salesman.user_id] ?? salesman.monthly_salary) || 0;
                if (amount <= 0) continue;

                await addTransaction({
                    desc: `Monatsgehalt - ${salesman.full_name} - ${monthName}`,
                    category: 'Personalkosten',
                    amount,
                    quantity: 1,
                    type: 'expense',
                    tx_type: 'fixed_expense',
                    paymentMethod: 'Bank Transfer',
                    is_fixed_expense: true,
                    isFixedExpense: true,
                    workerId: salesman.user_id,
                    shop_id: activeShopId,
                    notes: `monthly_salary;user_id=${salesman.user_id};month=${selectedMonth}`,
                    source: 'salary',
                    date: safeBookingDate.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                    time: safeBookingDate.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: safeBookingDate.toISOString(),
                });
            }

            setAlreadyBooked(true);
            showToastMessage(`Gehälter für ${monthName} erfolgreich gebucht`, 3200);
        } catch (error) {
            alert(`Fehler beim Buchen: ${error?.message || 'Unbekannter Fehler'}`);
        } finally {
            setIsBooking(false);
        }
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
            const isFixedExpenseEntry = entryType === 'expense';
            await addTransaction({
                desc: `${entryType === 'income' ? 'Income' : 'Expense'}: ${desc.trim()}`,
                amount: value,
                type: entryType,
                tx_type: isFixedExpenseEntry ? 'fixed_expense' : 'product_sale',
                category: resolvedCategory,
                paymentMethod,
                source: entryType === 'income' ? 'admin-income' : 'admin-expense',
                is_fixed_expense: isFixedExpenseEntry,
                isFixedExpense: isFixedExpenseEntry,
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
            const isFixedExpenseEntry = editType === 'expense';
            await updateTransaction(txnId, {
                desc: `${editType === 'income' ? 'Income' : 'Expense'}: ${editDesc.trim()}`,
                amount: value,
                type: editType,
                tx_type: isFixedExpenseEntry ? 'fixed_expense' : 'product_sale',
                category: resolvedCategory,
                paymentMethod: editPaymentMethod,
                source: editType === 'income' ? 'admin-income' : 'admin-expense',
                is_fixed_expense: isFixedExpenseEntry,
                isFixedExpense: isFixedExpenseEntry,
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
            {toast && (
                <div className="fixed right-4 top-4 z-50 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-2xl">
                    {toast}
                </div>
            )}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Ausgaben &amp; Einnahmen</h1>
                    <p className="text-slate-500 text-sm font-medium">Bearbeitbares Kassenbuch mit roten Ausgaben und grünen Einnahmen.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
                    <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
                        {showForm ? 'Abbrechen' : 'Ausgabe hinzufügen'}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mb-6">
                <button
                    type="button"
                    onClick={() => setShowSalarySection((prev) => !prev)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 rounded-2xl transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center">
                            <Users size={18} className="text-purple-600" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-black text-slate-800">Monatsgehälter buchen</p>
                            <p className="text-xs text-slate-500">
                                {currentMonth} - {monthlySalesmenCount} Mitarbeiter - Gesamt: €{totalMonthlySalary}
                            </p>
                        </div>
                    </div>
                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showSalarySection ? 'rotate-180' : ''}`} />
                </button>

                {showSalarySection && (
                    <div className="px-5 pb-5 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-3 mt-4 mb-4">
                            <label className="text-xs font-bold text-slate-500 uppercase">Monat:</label>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium"
                            />
                            {alreadyBooked && (
                                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                                    Bereits gebucht für diesen Monat
                                </span>
                            )}
                        </div>

                        {!activeShopId ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                Bitte einen Shop auswählen, um Monatsgehälter zu laden.
                            </div>
                        ) : monthlySalesmen.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                Keine Mitarbeiter mit Monatsgehalt gefunden.
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2 mb-4">
                                    {monthlySalesmen.map((salesman) => {
                                        const currentValue = parseFloat(editedSalaries[salesman.user_id] ?? salesman.monthly_salary) || 0;
                                        const savedValue = parseFloat(salesman.monthly_salary) || 0;
                                        const isDirty = editedSalaries[salesman.user_id] !== undefined && currentValue !== savedValue;
                                        return (
                                            <div key={salesman.user_id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-800">{salesman.full_name}</p>
                                                    <p className="text-xs text-slate-500">Monatsgehalt</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400">€</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={currentValue}
                                                        onChange={(e) => handleSalaryEdit(salesman.user_id, e.target.value)}
                                                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold text-right"
                                                    />
                                                    {isDirty && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSalarySave(salesman.user_id)}
                                                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg font-bold hover:bg-blue-700"
                                                        >
                                                            Speichern
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                                    <div>
                                        <p className="text-xs text-slate-500">Gesamtbetrag</p>
                                        <p className="text-xl font-black text-slate-800">€ {totalMonthlySalary}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleBookSalaries}
                                        disabled={isBooking || monthlySalesmen.length === 0}
                                        className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-60 transition-all"
                                    >
                                        {isBooking ? 'Wird gebucht...' : alreadyBooked ? 'Erneut buchen' : 'Gehälter buchen'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-red-100 bg-white p-4">
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Ausgaben</p>
                    <p className="text-2xl font-black text-red-600">{priceTag(totals.expense)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Einnahmen</p>
                    <p className="text-2xl font-black text-emerald-600">{priceTag(totals.income)}</p>
                </div>
                <div className={`rounded-2xl border bg-white p-4 ${net >= 0 ? 'border-blue-100' : 'border-orange-100'}`}>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${net >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>Saldo</p>
                    <p className={`text-2xl font-black ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{priceTag(net)}</p>
                </div>
            </div>

            {showForm && (
                <form onSubmit={submitEntry} className="rounded-2xl border border-blue-100 bg-white p-4 grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Typ</label>
                        <div className="grid grid-cols-2 gap-1">
                            <button type="button" onClick={() => setEntryType('expense')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${entryType === 'expense' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>{TYPE_LABELS.expense}</button>
                            <button type="button" onClick={() => setEntryType('income')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${entryType === 'income' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>{TYPE_LABELS.income}</button>
                        </div>
                    </div>
                    <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Beschreibung</label><input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Betrag</label><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kategorie</label>
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
                                <option key={`add-cat-${item}`} value={item}>{getExpenseCategoryLabel(item)}</option>
                            ))}
                            <option value="__custom__">Benutzerdefiniert...</option>
                        </select>
                        {categoryOption === '__custom__' && (
                            <input
                                value={customCategory}
                                onChange={(e) => {
                                    setCustomCategory(e.target.value);
                                    setCategory(e.target.value);
                                }}
                                placeholder="Eigene Kategorie eingeben"
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            />
                        )}
                    </div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zahlung</label><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="Cash">{getPaymentMethodLabel('Cash')}</option><option value="Visa">{getPaymentMethodLabel('Visa')}</option><option value="Online">{getPaymentMethodLabel('Online')}</option><option value="Bank Transfer">{getPaymentMethodLabel('Bank Transfer')}</option></select></div>
                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Datum &amp; Uhrzeit</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                    <div className="md:col-span-7"><button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700">Eintrag speichern</button></div>
                </form>
            )}

            <div className="rounded-2xl border border-slate-100 bg-white p-3 space-y-2 min-h-[280px]">
                {rows.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-10">Keine Einträge im gewählten Zeitraum.</p>
                ) : rows.map((txn) => {
                    const isIncome = txn.type === 'income';
                    const active = editingId === String(txn.id);
                    const isSynthetic = Boolean(txn.isSynthetic);
                    return (
                        <div key={txn.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                            {!active ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{txn.desc}</p>
                                        <p className="text-[11px] text-slate-500">
                                            {txn.date} {txn.time} | {getExpenseCategoryLabel(txn.category || 'General')} | {getPaymentMethodLabel(txn.paymentMethod || 'Cash')}
                                            {getTxnInvoiceNumber(txn) ? ` | Inv: ${getTxnInvoiceNumber(txn)}` : ''}
                                            {isSynthetic ? ' | Automatisch aus Mitarbeiterleistung' : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>{isIncome ? '+' : '-'}{priceTag(txn.amount)}</p>
                                        {!isSynthetic && <button onClick={() => beginEdit(txn)} className="px-2 py-1 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700">Bearbeiten</button>}
                                        {!isSynthetic && <button onClick={() => { if (window.confirm('Eintrag löschen?')) deleteTransaction(txn.id); }} className="px-2 py-1 text-xs rounded border border-red-200 bg-red-50 text-red-700">Löschen</button>}
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-end">
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Typ</label>
                                        <div className="grid grid-cols-2 gap-1">
                                            <button type="button" onClick={() => setEditType('expense')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${editType === 'expense' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}>{TYPE_LABELS.expense}</button>
                                            <button type="button" onClick={() => setEditType('income')} className={`text-xs font-bold rounded-lg border px-2 py-1.5 ${editType === 'income' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>{TYPE_LABELS.income}</button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Beschreibung</label><input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Betrag</label><input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Kategorie</label>
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
                                                <option key={`edit-cat-${item}`} value={item}>{getExpenseCategoryLabel(item)}</option>
                                            ))}
                                            <option value="__custom__">Benutzerdefiniert...</option>
                                        </select>
                                        {editCategoryOption === '__custom__' && (
                                            <input
                                                value={editCustomCategory}
                                                onChange={(e) => {
                                                    setEditCustomCategory(e.target.value);
                                                    setEditCategory(e.target.value);
                                                }}
                                                placeholder="Eigene Kategorie eingeben"
                                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                            />
                                        )}
                                    </div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Zahlung</label><select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="Cash">{getPaymentMethodLabel('Cash')}</option><option value="Visa">{getPaymentMethodLabel('Visa')}</option><option value="Online">{getPaymentMethodLabel('Online')}</option><option value="Bank Transfer">{getPaymentMethodLabel('Bank Transfer')}</option></select></div>
                                    <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Datum &amp; Uhrzeit</label><input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
                                    <div className="md:col-span-7 flex items-center justify-end gap-2">
                                        <button type="button" onClick={() => setEditingId('')} className="px-3 py-1.5 rounded border border-slate-200 text-xs font-bold text-slate-600">Abbrechen</button>
                                        <button type="button" onClick={() => saveEdit(txn.id)} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-bold">Speichern</button>
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
