import { useMemo, useState } from 'react';
import { getStockSeverity } from '../data/inventoryStore';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import TransactionDetailModal from './TransactionDetailModal';

function toAmount(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toQty(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 1;
}

function toTimestamp(txn) {
    if (txn?.timestamp) {
        const ts = new Date(txn.timestamp).getTime();
        if (Number.isFinite(ts)) return ts;
    }
    const fallback = new Date(`${txn?.date || ''} ${txn?.time || ''}`).getTime();
    return Number.isFinite(fallback) ? fallback : 0;
}

function resolveSalesmanNo(txn, salesmen = []) {
    const direct = Number(txn?.salesmanNumber || 0);
    if (direct > 0) return `#${direct}`;

    const workerRef = String(txn?.workerId || txn?.salesmanId || txn?.userId || '').trim();
    if (workerRef) {
        const worker = salesmen.find((s) => String(s.id) === workerRef);
        const mapped = Number(worker?.salesmanNumber || 0);
        if (mapped > 0) return `#${mapped}`;
        if (workerRef !== 'admin') return `#${workerRef}`;
    }
    return 'Shop';
}

function matchesTxn(txn, query, salesmen = []) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;

    const prodName = String(txn?.name || txn?.desc || '').toLowerCase();
    const txnId = String(txn?.id || '').toLowerCase();
    const masterId = String(txn?.transactionId || '').toLowerCase();
    const custName = String(txn?.customerInfo?.name || '').toLowerCase();
    const category = typeof txn?.category === 'object'
        ? String(txn?.category?.level1 || '').toLowerCase()
        : String(txn?.category || '').toLowerCase();
    const salesmanNo = resolveSalesmanNo(txn, salesmen).toLowerCase();
    return (
        prodName.includes(q)
        || txnId.includes(q)
        || masterId.includes(q)
        || custName.includes(q)
        || category.includes(q)
        || salesmanNo.includes(q)
    );
}

function buildGroupedRows(transactions = []) {
    const sorted = [...transactions].sort((a, b) => toTimestamp(b) - toTimestamp(a));
    const byMasterId = new Map();

    sorted.forEach((txn) => {
        const masterId = String(txn?.transactionId || '').trim();
        if (!masterId) return;
        const bucket = byMasterId.get(masterId) || [];
        bucket.push(txn);
        byMasterId.set(masterId, bucket);
    });

    const consumed = new Set();
    const rows = [];

    sorted.forEach((txn) => {
        const rowId = String(txn?.id || '');
        if (consumed.has(rowId)) return;

        const masterId = String(txn?.transactionId || '').trim();
        const siblings = masterId ? (byMasterId.get(masterId) || []) : [];

        if (masterId && siblings.length > 1) {
            siblings.forEach((item) => consumed.add(String(item?.id || '')));

            const totalAmount = siblings.reduce((sum, item) => sum + toAmount(item?.amount), 0);
            const totalQty = siblings.reduce((sum, item) => sum + toQty(item?.quantity), 0);
            const firstName = String(txn?.name || txn?.desc || 'Items').trim() || 'Items';
            const label = `${firstName} + ${siblings.length - 1} more`;

            rows.push({
                ...txn,
                id: `group:${masterId}`,
                name: label,
                desc: label,
                amount: totalAmount,
                quantity: totalQty,
                groupedItems: siblings,
                isConsolidatedItem: true,
                __rowType: 'group',
                __groupKey: masterId,
                __groupCount: siblings.length,
                __primaryId: String(txn?.id || ''),
            });
            return;
        }

        consumed.add(rowId);
        rows.push({
            ...txn,
            groupedItems: [txn],
            __rowType: 'single',
            __groupKey: rowId || `single:${Math.random()}`,
            __groupCount: 1,
        });
    });

    return rows;
}

function getSeverityDot(stock) {
    if (stock === null || stock === undefined) return 'bg-slate-300';
    const sev = getStockSeverity(stock);
    if (sev === 'red') return 'bg-red-500';
    if (sev === 'yellow') return 'bg-amber-500';
    return 'bg-emerald-500';
}

export default function TransactionList({ transactions = [], searchTerm = '', isAdminOverride = false }) {
    const { isAdminLike, user, salesmen } = useAuth();
    const { deleteTransaction, updateTransaction } = useInventory();
    const [selectedTxn, setSelectedTxn] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isEditRequested, setIsEditRequested] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState({});
    const [bulkPaymentMethod, setBulkPaymentMethod] = useState('');
    const [bulkCategory, setBulkCategory] = useState('');
    const [bulkBusy, setBulkBusy] = useState(false);

    const canEditTransactions = isAdminLike || Boolean(user?.canEditTransactions);
    const canBulkEdit = isAdminLike || Boolean(user?.canBulkEdit);
    const isAdmin = isAdminOverride || canEditTransactions;

    const rows = useMemo(() => {
        const grouped = buildGroupedRows(transactions);
        const q = String(searchTerm || '').trim();
        const filtered = q
            ? grouped.filter((row) => {
                if (matchesTxn(row, q, salesmen)) return true;
                if (row.__rowType === 'group') return row.groupedItems.some((item) => matchesTxn(item, q, salesmen));
                return false;
            })
            : grouped.slice(0, 20);
        return filtered;
    }, [transactions, searchTerm, salesmen]);

    const selectedCount = useMemo(
        () => Object.values(selectedIds).filter(Boolean).length,
        [selectedIds]
    );

    const handleViewDetails = (txn, forceEdit = false) => {
        setSelectedTxn(txn);
        setIsEditRequested(forceEdit);
        setIsDetailOpen(true);
    };

    const handleDelete = (e, txnId) => {
        e.stopPropagation();
        if (window.confirm('Delete this transaction record?')) {
            deleteTransaction(txnId);
            setSelectedIds((prev) => {
                const next = { ...prev };
                delete next[String(txnId)];
                return next;
            });
        }
    };

    const toggleGroup = (e, groupKey) => {
        e.stopPropagation();
        setExpandedGroups((prev) => ({
            ...prev,
            [groupKey]: !prev[groupKey]
        }));
    };

    const toggleTxnSelection = (txnId, checked) => {
        const key = String(txnId || '');
        if (!key) return;
        setSelectedIds((prev) => ({ ...prev, [key]: checked }));
    };

    const toggleGroupSelection = (items, checked) => {
        const nextPatch = {};
        (items || []).forEach((item) => {
            const id = String(item?.id || '');
            if (id) nextPatch[id] = checked;
        });
        setSelectedIds((prev) => ({ ...prev, ...nextPatch }));
    };

    const clearBulkSelection = () => {
        setSelectedIds({});
        setBulkPaymentMethod('');
        setBulkCategory('');
    };

    const handleBulkApply = async () => {
        const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
        if (!ids.length) {
            alert('Select at least one transaction');
            return;
        }

        const patch = {};
        if (bulkPaymentMethod.trim()) patch.paymentMethod = bulkPaymentMethod.trim();
        if (bulkCategory.trim()) patch.category = bulkCategory.trim();

        if (!Object.keys(patch).length) {
            alert('Choose at least one field (payment method or category)');
            return;
        }

        setBulkBusy(true);
        try {
            for (const id of ids) {
                await updateTransaction(id, patch);
            }
            clearBulkSelection();
            setBulkMode(false);
        } catch (error) {
            alert(error?.message || 'Bulk update failed');
        } finally {
            setBulkBusy(false);
        }
    };

    const handleBulkDelete = async () => {
        const ids = Object.keys(selectedIds).filter((id) => selectedIds[id]);
        if (!ids.length) {
            alert('Select at least one transaction');
            return;
        }

        if (!window.confirm(`Delete ${ids.length} selected transactions?`)) return;

        setBulkBusy(true);
        try {
            for (const id of ids) {
                await deleteTransaction(id);
            }
            clearBulkSelection();
            setBulkMode(false);
        } catch (error) {
            alert(error?.message || 'Bulk delete failed');
        } finally {
            setBulkBusy(false);
        }
    };

    return (
        <div className="space-y-1.5">
            {(canBulkEdit || isAdminOverride) && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bulk Edit</p>
                        <button
                            type="button"
                            onClick={() => {
                                const next = !bulkMode;
                                setBulkMode(next);
                                if (!next) clearBulkSelection();
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${bulkMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                        >
                            {bulkMode ? 'Disable' : 'Enable'}
                        </button>
                    </div>

                    {bulkMode && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payment</label>
                                <select
                                    value={bulkPaymentMethod}
                                    onChange={(e) => setBulkPaymentMethod(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                                >
                                    <option value="">No change</option>
                                    <option value="Cash">Cash</option>
                                    <option value="Visa">Visa</option>
                                    <option value="Online">Online</option>
                                    <option value="SumUp">SumUp</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Category</label>
                                <input
                                    value={bulkCategory}
                                    onChange={(e) => setBulkCategory(e.target.value)}
                                    placeholder="No change"
                                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
                                />
                            </div>
                            <div className="md:col-span-3 flex items-center gap-2">
                                <span className="text-xs text-slate-500">{selectedCount} selected</span>
                                <button
                                    type="button"
                                    disabled={bulkBusy}
                                    onClick={handleBulkApply}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-60"
                                >
                                    Apply
                                </button>
                                <button
                                    type="button"
                                    disabled={bulkBusy}
                                    onClick={handleBulkDelete}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold disabled:opacity-60"
                                >
                                    Delete
                                </button>
                                <button
                                    type="button"
                                    disabled={bulkBusy}
                                    onClick={clearBulkSelection}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-60"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <div className="col-span-2">Time / ID</div>
                <div className="col-span-4">Product Name</div>
                <div className="col-span-2">Salesman No.</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-2"></div>
            </div>

            {rows.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <p className="text-4xl mb-3">{searchTerm ? '🔍' : '📋'}</p>
                    <p className="text-sm font-medium">
                        {searchTerm ? 'Koi matching transaction nahi mili' : 'Koi transaction nahi abhi'}
                    </p>
                    {searchTerm && <p className="text-xs text-slate-300 mt-1">Search term: "{searchTerm}"</p>}
                </div>
            ) : (
                rows.map((row, index) => {
                    const groupedItems = Array.isArray(row.groupedItems) ? row.groupedItems : [row];
                    const isGroup = row.__rowType === 'group';
                    const baseTxn = groupedItems[0] || row;
                    const isIncome = baseTxn?.type === 'income';
                    const groupKey = row.__groupKey || String(row?.id || index);
                    const expanded = Boolean(expandedGroups[groupKey]);
                    const rowAmount = groupedItems.reduce((sum, item) => sum + toAmount(item?.amount), 0);
                    const salesmanNo = resolveSalesmanNo(baseTxn, salesmen);

                    return (
                        <div key={`${groupKey}-${index}`} className="space-y-1">
                            <div
                                onClick={() => handleViewDetails(row)}
                                className={`group grid grid-cols-1 sm:grid-cols-12 items-center gap-3 p-3 px-4 rounded-xl border transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] ${isIncome
                                    ? 'bg-white border-slate-100 hover:border-emerald-200'
                                    : 'bg-red-50/20 border-red-50 hover:border-red-200'
                                    }`}
                            >
                                <div className="sm:col-span-2 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0">
                                    <div className={`sm:hidden w-8 h-8 rounded-lg flex items-center justify-center ${isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            {isIncome
                                                ? <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                                                : <path strokeLinecap="round" strokeLinejoin="round" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                                            }
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">{baseTxn?.time}</p>
                                        <p className="text-[9px] font-mono text-slate-400 truncate max-w-[130px]" title={row?.transactionId || row?.id}>
                                            {isGroup ? row?.transactionId : (row?.transactionId && row?.isConsolidatedItem ? row.transactionId : row?.id)}
                                        </p>
                                    </div>
                                </div>

                                <div className="sm:col-span-4 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getSeverityDot(baseTxn?.stock)}`} />
                                        <p className="text-sm font-semibold text-slate-700 truncate">{row?.name || row?.desc}</p>
                                        {isGroup && (
                                            <button
                                                type="button"
                                                onClick={(e) => toggleGroup(e, groupKey)}
                                                className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100"
                                                title={expanded ? 'Hide items' : 'Show items'}
                                            >
                                                {expanded ? '−' : '+'}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 sm:hidden">{baseTxn?.date}</p>
                                    {isGroup && (
                                        <p className="text-[10px] text-blue-500 font-semibold mt-0.5">
                                            {groupedItems.length} products in this bill
                                        </p>
                                    )}
                                </div>

                                <div className="sm:col-span-2 hidden sm:block">
                                    <p className="text-xs text-slate-500 font-medium truncate">{salesmanNo}</p>
                                </div>

                                <div className="sm:col-span-2 text-right">
                                    <p className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {isIncome ? '+' : '-'}€{rowAmount.toFixed(2)}
                                    </p>
                                    <p className="text-[9px] text-slate-400 sm:hidden">No: {salesmanNo}</p>
                                </div>

                                <div className="sm:col-span-2 flex justify-end items-center gap-2">
                                    {bulkMode && (
                                        <input
                                            type="checkbox"
                                            checked={isGroup
                                                ? groupedItems.every((item) => selectedIds[String(item?.id || '')])
                                                : Boolean(selectedIds[String(row?.id || '')])}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                if (isGroup) {
                                                    toggleGroupSelection(groupedItems, e.target.checked);
                                                } else {
                                                    toggleTxnSelection(row?.id, e.target.checked);
                                                }
                                            }}
                                            className="h-4 w-4"
                                            title="Select for bulk edit"
                                        />
                                    )}

                                    {isAdmin ? (
                                        <>
                                            {!isGroup && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleViewDetails(row, true); }}
                                                        className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                                        title="Edit Transaction"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDelete(e, row?.id)}
                                                        className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                                        title="Delete Transaction"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </>
                                            )}
                                            {isGroup && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleViewDetails(row); }}
                                                    className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all flex items-center justify-center shadow-sm"
                                                    title="Open bill details"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </button>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center text-slate-300 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isGroup && expanded && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
                                    {groupedItems.map((item, itemIdx) => {
                                        const itemIncome = item?.type === 'income';
                                        const itemSalesmanNo = resolveSalesmanNo(item, salesmen);
                                        return (
                                            <div
                                                key={`${item?.id || 'item'}-${itemIdx}`}
                                                onClick={() => handleViewDetails(item)}
                                                className="group flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-100 hover:border-blue-200 cursor-pointer"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{item?.name || item?.desc || 'Item'}</p>
                                                    <p className="text-[10px] text-slate-400">
                                                        Qty {toQty(item?.quantity)} · {item?.time || '--:--'} · {itemSalesmanNo}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {bulkMode && (
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(selectedIds[String(item?.id || '')])}
                                                            onChange={(e) => {
                                                                e.stopPropagation();
                                                                toggleTxnSelection(item?.id, e.target.checked);
                                                            }}
                                                            className="h-4 w-4"
                                                            title="Select for bulk edit"
                                                        />
                                                    )}
                                                    {isAdmin && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); handleViewDetails(item, true); }}
                                                                className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleDelete(e, item?.id)}
                                                                className="text-[10px] px-2 py-1 rounded bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                                                            >
                                                                Delete
                                                            </button>
                                                        </>
                                                    )}
                                                    <p className={`text-xs font-black ${itemIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {itemIncome ? '+' : '-'}€{toAmount(item?.amount).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            <TransactionDetailModal
                isOpen={isDetailOpen}
                onClose={() => { setIsDetailOpen(false); setIsEditRequested(false); }}
                txn={selectedTxn}
                initialEditMode={isEditRequested}
            />
        </div>
    );
}
