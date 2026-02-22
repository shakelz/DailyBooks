import { useState, useMemo } from 'react';
import { getStockSeverity } from '../data/inventoryStore';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import TransactionDetailModal from './TransactionDetailModal';

// ══════════════════════════════════════════════
// TransactionList — Full-detail transaction history
// Shows: Date, Time, ID, Product, Amount, Sold By
// ══════════════════════════════════════════════

export default function TransactionList({ transactions = [], searchTerm = '', isAdminOverride = false }) {
    const { role } = useAuth();
    const { deleteTransaction } = useInventory();
    const [selectedTxn, setSelectedTxn] = useState(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isEditRequested, setIsEditRequested] = useState(false);

    const isAdmin = isAdminOverride || role === 'admin';

    // ── Filtering Logic ──
    const filteredTransactions = useMemo(() => {
        // Only slice here if NOT searching
        const baseTransactions = searchTerm.trim() ? transactions : transactions.slice(0, 20);

        if (!searchTerm.trim()) return baseTransactions;
        const q = searchTerm.toLowerCase().trim();
        return transactions.filter(txn => {
            const prodName = String(txn.name || txn.desc || '').toLowerCase();
            const txnId = String(txn.id || '').toLowerCase();
            const masterId = String(txn.transactionId || '').toLowerCase();
            const custName = String(txn.customerInfo?.name || '').toLowerCase();
            return prodName.includes(q) || txnId.includes(q) || masterId.includes(q) || custName.includes(q);
        });
    }, [transactions, searchTerm]);

    const handleViewDetails = (txn, forceEdit = false) => {
        setSelectedTxn(txn);
        setIsEditRequested(forceEdit);
        setIsDetailOpen(true);
    };

    const handleDelete = (e, txnId) => {
        e.stopPropagation();
        if (window.confirm('Delete this transaction record?')) {
            deleteTransaction(txnId);
        }
    };

    const getSeverityDot = (stock) => {
        if (stock === null || stock === undefined) return 'bg-slate-300';
        const sev = getStockSeverity(stock);
        if (sev === 'red') return 'bg-red-500';
        if (sev === 'yellow') return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    return (
        <div className="space-y-1.5">
            {/* Table Header (Desktop-ish) */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <div className="col-span-2">Time / ID</div>
                <div className="col-span-4">Product Name</div>
                <div className="col-span-2">Sold/Purchased By</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-2"></div>
            </div>

            {filteredTransactions.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <p className="text-4xl mb-3">{searchTerm ? '🔍' : '📋'}</p>
                    <p className="text-sm font-medium">
                        {searchTerm ? 'Koi matching transaction nahi mili' : 'Koi transaction nahi abhi'}
                    </p>
                    {searchTerm && <p className="text-xs text-slate-300 mt-1">Search term: "{searchTerm}"</p>}
                </div>
            ) : (
                filteredTransactions.map((txn, index) => {
                    const isIncome = txn.type === 'income';
                    return (
                        <div
                            key={`${txn.id || 'txn'}-${index}`}
                            onClick={() => handleViewDetails(txn)}
                            className={`group grid grid-cols-1 sm:grid-cols-12 items-center gap-3 p-3 px-4 rounded-xl border transition-all cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] ${isIncome
                                ? 'bg-white border-slate-100 hover:border-emerald-200'
                                : 'bg-red-50/20 border-red-50 hover:border-red-200'
                                }`}
                        >
                            {/* 1. Time & ID */}
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
                                    <p className="text-xs font-bold text-slate-800">{txn.time}</p>
                                    <p className="text-[9px] font-mono text-slate-400 truncate max-w-[80px]" title={txn.transactionId ? `Master: ${txn.transactionId}` : txn.id}>
                                        {txn.transactionId && txn.isConsolidatedItem ? txn.transactionId : txn.id}
                                    </p>
                                </div>
                            </div>

                            {/* 2. Product Name */}
                            <div className="sm:col-span-4 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getSeverityDot(txn.stock)}`} />
                                    <p className="text-sm font-semibold text-slate-700 truncate">{txn.name || txn.desc}</p>
                                </div>
                                <p className="text-[10px] text-slate-400 sm:hidden">{txn.date}</p>
                            </div>

                            {/* 3. Sold/Purchased By */}
                            <div className="sm:col-span-2 hidden sm:block">
                                <p className="text-xs text-slate-500 font-medium truncate">{txn.salesmanName || txn.soldBy || 'Shop'}</p>
                            </div>

                            {/* 4. Amount */}
                            <div className="sm:col-span-2 text-right">
                                <p className={`text-sm font-black ${isIncome ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {isIncome ? '+' : '-'}€{parseFloat(txn.amount).toFixed(2)}
                                </p>
                                <p className="text-[9px] text-slate-400 sm:hidden">User: {txn.salesmanName || txn.soldBy || 'Shop'}</p>
                            </div>

                            {/* 5. Action Icons */}
                            <div className="sm:col-span-2 flex justify-end items-center gap-2">
                                {isAdmin ? (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleViewDetails(txn, true); }}
                                            className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                            title="Edit Transaction"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(e, txn.id)}
                                            className="w-8 h-8 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                            title="Delete Transaction"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
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
                    );
                })
            )}

            {/* Detail Modal Integration */}
            <TransactionDetailModal
                isOpen={isDetailOpen}
                onClose={() => { setIsDetailOpen(false); setIsEditRequested(false); }}
                txn={selectedTxn}
                initialEditMode={isEditRequested}
            />
        </div>
    );
}
