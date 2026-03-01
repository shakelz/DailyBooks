import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';

// ══════════════════════════════════════════════════════════
// TransactionDetailModal — v5 Detail View
// Displays full transaction history data with re-print capability
// ══════════════════════════════════════════════════════════

export default function TransactionDetailModal({ isOpen, onClose, txn, initialEditMode = false }) {
    const { isAdminLike, activeShop, billShowTax, salesmen } = useAuth();
    const { updateTransaction, deleteTransaction, products } = useInventory();

    const [isEditing, setIsEditing] = useState(initialEditMode);
    const [editData, setEditData] = useState(null);

    useEffect(() => {
        if (isOpen && txn) {
            setEditData({ ...txn });
            setIsEditing(initialEditMode);
        }
    }, [isOpen, txn, initialEditMode]);

    if (!isOpen || !txn || !editData) return null;

    const isAdmin = isAdminLike;

    const isIncome = txn.type === 'income';
    const groupedItems = Array.isArray(txn.groupedItems) && txn.groupedItems.length > 0 ? txn.groupedItems : [txn];
    const groupCount = groupedItems.length;

    // Financials
    const amount = groupedItems.reduce((sum, item) => sum + (parseFloat(item?.amount) || 0), 0);
    const discountValue = parseFloat(txn.discount) || 0;
    const unitPrice = parseFloat(txn.unitPrice) || 0;
    const qty = parseInt(txn.quantity) || 1;
    const basePrice = parseFloat(txn.stdPriceAtTime) || (unitPrice + discountValue);

    // Tax (19% German standard)
    const net = groupedItems.reduce((sum, item) => {
        if (item?.taxInfo?.net !== undefined && item?.taxInfo?.net !== null) {
            return sum + (parseFloat(item.taxInfo.net) || 0);
        }
        const lineAmount = parseFloat(item?.amount) || 0;
        return sum + (lineAmount / 1.19);
    }, 0);
    const tax = groupedItems.reduce((sum, item) => {
        if (item?.taxInfo?.tax !== undefined && item?.taxInfo?.tax !== null) {
            return sum + (parseFloat(item.taxInfo.tax) || 0);
        }
        const lineAmount = parseFloat(item?.amount) || 0;
        return sum + (lineAmount - (lineAmount / 1.19));
    }, 0);
    const showTax = billShowTax !== false;
    const formatAmount = (value) => `EUR ${Number(value || 0).toLocaleString('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
    const receiptShopName = activeShop?.name || 'Shop';
    const receiptShopAddress = activeShop?.address || activeShop?.location || '';
    const receiptShopPhone = activeShop?.telephone || activeShop?.phone || '';
    const workerRef = String(txn?.workerId || txn?.salesmanId || '');
    const worker = salesmen.find((row) => String(row.id) === workerRef);
    const salesmanLabel = worker?.salesmanNumber
        ? `#${worker.salesmanNumber}`
        : (workerRef && workerRef !== 'admin' ? `#${workerRef}` : 'Shop');

    const currentProduct = txn.productId
        ? products.find(p => String(p.id) === String(txn.productId))
        : null;
    const snapshotProduct = txn.productSnapshot || {};

    const displayBarcode = txn.barcode || snapshotProduct.barcode || currentProduct?.barcode || 'N/A';
    const displayModel = txn.model || snapshotProduct.model || currentProduct?.model || 'N/A';
    const displayBrand = txn.brand || snapshotProduct.brand || currentProduct?.brand || 'N/A';
    const displayProductId = txn.productId || snapshotProduct.id || currentProduct?.id || 'N/A';
    const displayCategory = txn.categorySnapshot
        || snapshotProduct.category
        || (txn.category && typeof txn.category === 'object' ? txn.category : null)
        || (currentProduct?.category && typeof currentProduct.category === 'object' ? currentProduct.category : null);
    const displayCategoryPath = txn.categoryPath || snapshotProduct.categoryPath || currentProduct?.categoryPath || null;
    const displayBuyAtSale = parseFloat(txn.purchasePriceAtTime ?? snapshotProduct.purchasePrice ?? 0) || 0;
    const displayUnitAtSale = parseFloat(txn.stdPriceAtTime ?? txn.unitPrice ?? snapshotProduct.sellingPrice ?? 0) || 0;
    const displayPurchaseFrom = txn.purchaseFrom || snapshotProduct.purchaseFrom || currentProduct?.purchaseFrom || '';

    const mergedSpecs = {
        ...(currentProduct?.attributes || {}),
        ...(snapshotProduct?.attributes || {}),
        ...(txn.attributes || {}),
        ...(snapshotProduct?.verifiedAttributes || {}),
        ...(txn.verifiedAttributes || {}),
    };
    const specEntries = Object.entries(mergedSpecs).filter(([key, value]) => {
        if (String(key).startsWith('__')) return false;
        if (value === null || value === undefined) return false;
        return String(value).trim().length > 0;
    });

        const handlePrint = () => {
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));

        const printRows = groupedItems.map((item) => {
            const lineQty = parseInt(item?.quantity || 1, 10) || 1;
            const lineAmount = parseFloat(item?.amount) || 0;
            const attrs = item?.verifiedAttributes
                ? Object.entries(item.verifiedAttributes)
                    .filter(([, value]) => String(value || '').trim())
                    .map(([key, value]) => `<span style="font-size: 9px;">${esc(String(key).toUpperCase())}: ${esc(value)}</span>`)
                    .join('<br/>')
                : '';
            return `
                <tr>
                    <td>
                        ${esc(item?.name || item?.desc || 'Artikel')}
                        ${attrs ? `<br/>${attrs}` : ''}
                    </td>
                    <td class="text-right">${lineQty}</td>
                    <td class="text-right">${formatAmount(lineAmount)}</td>
                </tr>
            `;
        }).join('');

        const taxRows = showTax
            ? `
                <table style="font-size: 10px;">
                    <tr>
                        <td>Netto (19%)</td>
                        <td class="text-right">${formatAmount(net)}</td>
                    </tr>
                    <tr>
                        <td>USt (19%)</td>
                        <td class="text-right">${formatAmount(tax)}</td>
                    </tr>
                </table>
            `
            : '';

        const receiptHTML = `
            <html>
            <head>
                <title>Beleg ${esc(txn.transactionId || txn.id)}</title>
                <style>
                    @page { size: 80mm 200mm; margin: 0; }
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        width: 72mm;
                        margin: 0 auto;
                        padding: 10mm 2mm;
                        font-size: 11px;
                        line-height: 1.4;
                        color: #000;
                    }
                    .text-center { text-align: center; }
                    .text-right { text-align: right; }
                    .bold { font-weight: bold; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 8px 0; }
                    td { vertical-align: top; }
                    .fs-lg { font-size: 14px; }
                    .footer-text { font-size: 9px; margin-top: 15px; }
                </style>
            </head>
            <body>
                <div class="text-center">
                    <div class="bold fs-lg">${esc(receiptShopName)}</div>
                    ${receiptShopAddress ? `<div style="margin-top: 4px;">${esc(receiptShopAddress)}</div>` : ''}
                    ${receiptShopPhone ? `<div style="margin-top: 2px;">Tel: ${esc(receiptShopPhone)}</div>` : ''}
                </div>

                <div class="divider"></div>

                <div style="font-size: 10px;">
                    <div>Datum: ${esc(txn.date)} ${esc(txn.time)}</div>
                    <div>Beleg-Nr: ${esc(txn.transactionId || txn.id)}</div>
                    ${groupCount > 1 ? `<div>Positionen: ${groupCount}</div>` : ''}
                </div>

                <div class="divider"></div>

                <table>
                    <tr class="bold">
                        <td>Artikel</td>
                        <td class="text-right">Menge</td>
                        <td class="text-right">Betrag</td>
                    </tr>
                    ${printRows}
                </table>

                <div class="divider"></div>

                <table class="bold">
                    <tr>
                        <td>Zwischensumme</td>
                        <td class="text-right">${formatAmount(amount)}</td>
                    </tr>
                </table>

                ${taxRows}

                <table class="bold fs-lg" style="border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
                    <tr>
                        <td>GESAMTBETRAG</td>
                        <td class="text-right">${formatAmount(amount)}</td>
                    </tr>
                </table>

                <div class="divider"></div>

                <div style="margin-top: 10px; font-size: 9px;">
                    <div>Zahlungsart: ${esc(txn.paymentMethod || 'Bar')}</div>
                    <div style="margin-top: 8px;">
                        Rueckgabe/Umtausch innerhalb von 14 Tagen nur bei Schaden mit Beleg.
                    </div>
                </div>

                <div class="text-center footer-text" style="margin-top: 25px;">
                    <div>Vielen Dank fuer Ihren Einkauf!</div>
                    <div class="bold">${esc(receiptShopName)}</div>
                </div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank', 'width=450,height=600');
        win.document.write(receiptHTML);
        win.document.close();
        setTimeout(() => {
            win.print();
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-200">

                {/* Header */}
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{isEditing ? 'Edit Transaction' : 'Transaction Details'}</h2>
                        <p className="text-xs font-mono text-slate-400">{txn.id} • {txn.date} {txn.time}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">✕</button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
                    {isEditing ? (
                        <div className="space-y-6">
                            <section>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Core Information</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Description / Product</label>
                                        <input
                                            type="text"
                                            value={editData.name || editData.desc}
                                            onChange={(e) => setEditData({ ...editData, name: e.target.value, desc: e.target.value })}
                                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Amount (€)</label>
                                            <input
                                                type="number"
                                                value={editData.amount}
                                                onChange={(e) => setEditData({ ...editData, amount: parseFloat(e.target.value) || 0 })}
                                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Payment Method</label>
                                            <select
                                                value={editData.paymentMethod || 'cash'}
                                                onChange={(e) => setEditData({ ...editData, paymentMethod: e.target.value })}
                                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500/20"
                                            >
                                                <option value="cash">💵 Cash</option>
                                                <option value="visa">💳 Visa</option>
                                                <option value="online">🌐 Online</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Notes</h3>
                                <textarea
                                    value={editData.notes || ''}
                                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                                    rows={3}
                                    placeholder="Add any internal notes..."
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm italic focus:ring-2 focus:ring-blue-500/20"
                                />
                            </section>
                        </div>
                    ) : (
                        <>

                            {/* Product & Category Section */}
                            <section>
                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Item details</h3>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Product Name</p>
                                            <p className="font-bold text-slate-800">{txn.name || txn.desc || 'Unknown Product'}</p>
                                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">Barcode: {displayBarcode}</p>
                                        </div>
                                        <div className="space-y-3">
                                            {(displayCategory || displayCategoryPath) && (
                                                <div>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Category</p>
                                                    {Array.isArray(displayCategoryPath) && displayCategoryPath.length > 0 ? (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {displayCategoryPath.map((cat, idx) => (
                                                                <span key={`${cat}-${idx}`} className={`px-2 py-0.5 rounded text-[10px] font-bold ${idx === displayCategoryPath.length - 1 ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'}`}>
                                                                    {cat}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : typeof displayCategoryPath === 'string' && displayCategoryPath.trim().length > 0 ? (
                                                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{displayCategoryPath}</span>
                                                    ) : typeof displayCategory === 'object' ? (
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {displayCategory.level1 && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{displayCategory.level1}</span>}
                                                            {displayCategory.level2 && <span className="text-slate-300">›</span>}
                                                            {displayCategory.level2 && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{displayCategory.level2}</span>}
                                                            {displayCategory.level3 && <span className="text-slate-300">›</span>}
                                                            {displayCategory.level3 && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold">{displayCategory.level3}</span>}
                                                        </div>
                                                    ) : (
                                                        <span className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{String(displayCategory)}</span>
                                                    )}
                                                </div>
                                            )}
                                            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-600 rounded-lg text-xs font-bold">
                                                Qty: {qty}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-200/50">
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Product ID</p>
                                            <p className="text-sm text-slate-700 font-medium break-all">{displayProductId}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Model</p>
                                            <p className="text-sm text-slate-700 font-medium">{displayModel}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Brand</p>
                                            <p className="text-sm text-slate-700 font-medium">{displayBrand}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Unit (At Sale)</p>
                                            <p className="text-sm text-slate-700 font-medium">{formatAmount(displayUnitAtSale)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase">Buy (At Sale)</p>
                                            <p className="text-sm text-slate-700 font-medium">{formatAmount(displayBuyAtSale)}</p>
                                        </div>
                                    </div>

                                    {specEntries.length > 0 && (
                                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200/50">
                                            {specEntries.map(([key, value]) => (
                                                <div key={key}>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase">{key}</p>
                                                    <p className="text-sm text-slate-700 font-medium">{String(value)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Financials Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <section>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Financial Breakdown</h3>
                                    <div className="space-y-2 px-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Retail Price</span>
                                            <span className="text-slate-700 font-semibold">{formatAmount(basePrice)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">Discount</span>
                                            <span className="text-red-500 font-semibold">-{formatAmount(discountValue)}</span>
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                                            <span className="text-sm font-bold text-slate-800">Final Price</span>
                                            <span className="text-lg font-bold text-emerald-600">{formatAmount(amount)}</span>
                                        </div>
                                    </div>
                                </section>                                {showTax && (
                                    <section>
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tax Inclusion (19%)</h3>
                                        <div className="space-y-2 px-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Netto</span>
                                                <span className="text-slate-700">{formatAmount(net)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">USt (Tax)</span>
                                                <span className="text-slate-700">{formatAmount(tax)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t border-slate-100">
                                                <span className="text-sm font-bold text-slate-800">Brutto</span>
                                                <span className="text-sm font-bold text-slate-800">{formatAmount(amount)}</span>
                                            </div>
                                        </div>
                                    </section>
                                )}
                            </div>

                            {/* Customer & Metadata */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                <section>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Customer Information</h3>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <p className="text-sm text-slate-800 font-bold mb-1">{txn.customerInfo?.name || 'Walk-in Customer'}</p>
                                        <p className="text-sm text-slate-500">{txn.customerInfo?.phone || 'No phone provided'}</p>
                                        <p className="text-[9px] mt-2 font-bold text-blue-500 uppercase tracking-tight">{txn.customerInfo?.type || 'New'} Customer</p>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Metadata</h3>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-xs text-slate-500">Salesman No.</span>
                                            <span className="text-xs font-bold text-slate-800">{salesmanLabel}</span>
                                        </div>
                                        {displayPurchaseFrom && (
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs text-slate-500">Purchase From</span>
                                                <span className="text-xs font-bold text-slate-800">{displayPurchaseFrom}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs text-slate-500">Type</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isIncome ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                                {txn.type}
                                            </span>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            {/* Notes */}
                            {txn.notes && (
                                <section>
                                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Notes</h3>
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 italic text-sm text-slate-600">
                                        "{txn.notes}"
                                    </div>
                                </section>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
                    {isEditing ? (
                        <>
                            <button
                                onClick={() => {
                                    if (window.confirm('Are you sure you want to delete this transaction record?')) {
                                        deleteTransaction(txn.id);
                                        onClose();
                                    }
                                }}
                                className="px-6 py-3 border-2 border-red-100 text-red-500 rounded-xl font-bold hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                            </button>
                            <div className="flex-1 flex gap-3">
                                <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-100 transition-all">
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await updateTransaction(txn.id, editData);
                                            setIsEditing(false);
                                        } catch (error) {
                                            alert(error?.message || 'Failed to update transaction.');
                                        }
                                    }}
                                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button onClick={handlePrint} className="flex-1 py-3 bg-white border-2 border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-100 transition-all flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Re-print Receipt
                            </button>

                            {isAdmin && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="px-6 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 border-2 border-blue-100/50 transition-all flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                </button>
                            )}

                            <button onClick={onClose} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all active:scale-95">
                                Close
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}


