import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { generateId } from '../data/inventoryStore';
import { priceTag, CURRENCY_CONFIG } from '../utils/currency';
import { useReactToPrint } from 'react-to-print';
import { useRef } from 'react';
import ReceiptTemplate from './ReceiptTemplate';

// ══════════════════════════════════════════════════════════
// TransactionModal — POS System (v4 Advanced)
// Dynamic Attributes, Discount Logic, German Tax Breakdown
// ══════════════════════════════════════════════════════════

export default function TransactionModal({ isOpen, onClose, onAddToBill, initialProduct, editingItem }) {
    const { user } = useAuth();
    const { addToCart, updateCartItem, setEditingCartItem } = useCart();
    const [status, setStatus] = useState('idle'); // idle, success
    const isEditMode = !!editingItem;
    const receiptRef = useRef();

    // ── Product State ──
    const [product, setProduct] = useState(null);
    const [qty, setQty] = useState(1);

    // ── Financials ──
    const [basePrice, setBasePrice] = useState(0); // Editable retail price
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('');

    // ── Dynamic Attributes State ──
    const [verifiedAttrs, setVerifiedAttrs] = useState({});

    // ── Customer Info ──
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerType, setCustomerType] = useState('New'); // 'New' | 'Regular'
    const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'Visa' | 'Online'

    // ── Transaction ID ──
    const [transactionId, setTransactionId] = useState('');

    useEffect(() => {
        if (isOpen && editingItem) {
            // EDIT MODE: Pre-fill from cart item
            setProduct(editingItem);
            setQty(editingItem.quantity || 1);
            setBasePrice(editingItem.unitPrice || editingItem.sellingPrice || 0);
            setDiscount(editingItem.discount || 0);
            setNotes(editingItem.notes || '');
            setTransactionId(editingItem.transactionId || generateId('TXN'));
            setVerifiedAttrs(editingItem.verifiedAttributes || {});
            setCustomerName(editingItem.customerInfo?.name || '');
            setCustomerPhone(editingItem.customerInfo?.phone || '');
            setCustomerType(editingItem.customerInfo?.type || 'New');
            setPaymentMethod(editingItem.paymentMethod || 'Cash');
            setStatus('idle');
        } else if (isOpen && initialProduct) {
            // ADD MODE: Fresh from product
            setProduct(initialProduct);
            setQty(1);
            setBasePrice(initialProduct.sellingPrice || 0);
            setDiscount(0);
            setNotes('');
            setTransactionId(generateId('TXN'));

            // Initialize dynamic attributes from product
            const initialAttrs = {};
            if (initialProduct.attributes) {
                Object.keys(initialProduct.attributes).forEach(key => {
                    initialAttrs[key] = initialProduct.attributes[key] || '';
                });
            }
            setVerifiedAttrs(initialAttrs);

            // Reset Customer
            setCustomerName('');
            setCustomerPhone('');
            setCustomerType('New');
            setStatus('idle');
        }
    }, [isOpen, initialProduct, editingItem]);

    // ── Print Logic ──
    const printReceipt = useReactToPrint({
        contentRef: receiptRef,
        documentTitle: `Receipt-${transactionId}`
    });

    if (!isOpen || !product) return null;

    // ── Stock Logic ──
    const availableStock = parseInt(product.stock) || 0;
    const isOutOfStock = availableStock <= 0;

    // ── Financial Logic ──
    const currentBasePrice = parseFloat(basePrice) || 0;
    const discountValue = parseFloat(discount) || 0;
    const finalUnitPrice = Math.max(0, currentBasePrice - discountValue);
    const grossTotal = finalUnitPrice * qty;

    // German Tax (Inclusive 19%)
    const netTotal = grossTotal / 1.19;
    const taxTotal = grossTotal - netTotal;

    const purchasePriceSnapshot = parseFloat(product.purchasePrice) || 0;
    const estimatedProfit = (finalUnitPrice - purchasePriceSnapshot) * qty;

    const handlePrint = () => {
        printReceipt();
    };

    const handleConfirm = (e) => {
        e.preventDefault();
        if (!product) return;

        // Validation
        if (isOutOfStock) { alert('Product Out of Stock!'); return; }
        if (qty > availableStock) { alert(`Only ${availableStock} units available!`); return; }

        const transactionData = {
            ...product,
            productId: product.id,
            id: transactionId,
            transactionId,
            quantity: parseInt(qty) || 1,
            unitPrice: finalUnitPrice,
            stdPriceAtTime: currentBasePrice,
            purchasePriceAtTime: purchasePriceSnapshot,
            profit: estimatedProfit,

            // Financials
            amount: grossTotal,
            discount: discountValue,
            taxInfo: {
                net: netTotal,
                tax: taxTotal,
                rate: 0.19
            },

            // Attributes
            verifiedAttributes: { ...verifiedAttrs },

            // Customer
            customerInfo: {
                name: customerName || 'Walk-in',
                phone: customerPhone,
                type: customerType
            },

            // Meta
            soldBy: user?.name || 'Unknown',
            notes: notes,
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString(),
            type: 'income',
            source: 'shop'
        };

        onAddToBill(transactionData);

        setStatus('success');
        setTimeout(() => {
            onClose();
            setStatus('idle');
        }, 500);
    };

    // ── Add to Cart handler ──
    const handleAddToCart = () => {
        if (!product) return;
        if (isOutOfStock) { alert('Product Out of Stock!'); return; }
        if (qty > availableStock) { alert(`Only ${availableStock} units available!`); return; }

        const cartData = {
            ...product,
            productId: product.productId || product.id,
            name: product.name,
            transactionId,
            quantity: parseInt(qty) || 1,
            unitPrice: finalUnitPrice,
            stdPriceAtTime: currentBasePrice,
            purchasePriceAtTime: purchasePriceSnapshot,
            profit: estimatedProfit,
            amount: grossTotal,
            discount: discountValue,
            taxInfo: { net: netTotal, tax: taxTotal, rate: 0.19 },
            verifiedAttributes: { ...verifiedAttrs },
            customerInfo: { name: customerName || 'Walk-in', phone: customerPhone, type: customerType },
            paymentMethod,
            notes,
        };

        if (isEditMode && editingItem) {
            updateCartItem(editingItem.cartItemId, cartData);
            setEditingCartItem(null);
        } else {
            addToCart(cartData);
        }

        setStatus('success');
        setTimeout(() => { onClose(); setStatus('idle'); }, 400);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh] border border-slate-200">

                {/* ═══ Header ═══ */}
                <div className="px-8 py-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xl">
                            {product.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{product.name}</h2>
                            <div className="flex items-center gap-3 text-xs font-mono text-slate-500 mt-0.5">
                                <span className="bg-slate-200 px-2 py-0.5 rounded">BC: {product.barcode}</span>
                                {product.model && <span className="px-2">Model: {product.model}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors text-xl">✕</button>
                </div>

                <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* ═══ LEFT COLUMN: Product & Financials ═══ */}
                    <div className="space-y-6">

                        {/* Stock Warning */}
                        {!isOutOfStock && availableStock <= (product.stockAlert?.red || 5) && (
                            <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                                <span className="text-xl">⚠️</span>
                                <div>
                                    <p className="text-sm font-bold text-yellow-700">Stock Low: Only {availableStock} left</p>
                                </div>
                            </div>
                        )}

                        {/* Dynamic Attribute Verification Grid */}
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Product Verification</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {Object.keys(verifiedAttrs).length > 0 ? (
                                    Object.keys(verifiedAttrs).map(key => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{key}</label>
                                            <input type="text" placeholder={`Verify ${key} `} value={verifiedAttrs[key]}
                                                onChange={e => setVerifiedAttrs(prev => ({ ...prev, [key]: e.target.value }))}
                                                className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:outline-none text-sm transition-all shadow-sm" />
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-slate-400 italic">No attributes to verify</p>
                                )}
                            </div>
                        </div>

                        {/* Advanced Financials */}
                        <div className="bg-blue-50/30 p-5 rounded-2xl border border-blue-100">
                            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-4">Financials (EU Standard)</h3>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Retail Price</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">€</span>
                                        <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)}
                                            className="w-full pl-7 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:outline-none text-md font-bold text-slate-700 shadow-sm transition-all" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quantity</label>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-500">-</button>
                                        <div className="flex-1 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-bold text-slate-700">{qty}</div>
                                        <button type="button" onClick={() => setQty(q => Math.min(q + 1, availableStock))} className="w-10 h-10 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-500">+</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Discount Value</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">€</span>
                                        <input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
                                            className="w-full pl-7 pr-4 py-2.5 rounded-xl bg-white border border-blue-200 focus:border-blue-500 focus:outline-none text-md font-bold text-slate-800 shadow-sm transition-all" />
                                    </div>
                                </div>
                            </div>

                            {/* Netto/USt Breakdown */}
                            <div className="mt-4 pt-4 border-t border-blue-100 space-y-1.5">
                                <div className="flex justify-between text-[11px] font-medium text-slate-400 px-1">
                                    <span>Netto (Excl. 19% Tax)</span>
                                    <span>{priceTag(netTotal)}</span>
                                </div>
                                <div className="flex justify-between text-[11px] font-medium text-slate-400 px-1">
                                    <span>USt (19% Tax)</span>
                                    <span>{priceTag(taxTotal)}</span>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* ═══ RIGHT COLUMN: Customer & Summary ═══ */}
                    <div className="flex flex-col h-full">

                        <div className="flex-1 space-y-6">
                            {/* Customer Info */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Customer & Payment</h3>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2">
                                            <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-sm font-semibold transition-all placeholder:text-slate-400" />
                                        </div>
                                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                            className="w-full px-2 py-3 rounded-xl bg-blue-50 text-blue-600 border-0 focus:ring-2 focus:ring-blue-100 text-sm font-bold cursor-pointer">
                                            <option value="Cash">Cash</option>
                                            <option value="Visa">Visa</option>
                                            <option value="Online">Online</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2">
                                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                                                className="w-full px-4 py-3 rounded-xl bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-sm font-semibold transition-all placeholder:text-slate-400" />
                                        </div>
                                        <select value={customerType} onChange={e => setCustomerType(e.target.value)}
                                            className="w-full px-2 py-3 rounded-xl bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-sm font-semibold cursor-pointer">
                                            <option value="New">New</option>
                                            <option value="Regular">Regular</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Info */}
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Transaction Meta</h3>
                                <textarea rows="3" placeholder="Additional Notes..." value={notes} onChange={e => setNotes(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-sm font-medium resize-none placeholder:text-slate-400" ></textarea>

                                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                                    <span>Sold By: {user?.name || 'Unknown'}</span>
                                    <span>{new Date().toLocaleDateString('en-PK')}</span>
                                </div>
                            </div>
                        </div>

                        {/* ═══ FOOTER ACTIONS ═══ */}
                        <div className="mt-8 pt-6 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-sm font-bold text-slate-500">Gross Total (Brutto)</span>
                                <span className="text-2xl font-bold text-slate-800">{priceTag(grossTotal)}</span>
                            </div>

                            {isEditMode ? (
                                /* Edit Mode: Update Item only */
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={onClose} className="py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all cursor-pointer">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleAddToCart}
                                        disabled={isOutOfStock || qty > availableStock}
                                        className={`py - 3.5 rounded - xl text - white font - bold shadow - lg shadow - amber - 500 / 20 active: scale - 95 transition - all
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400'} `}>
                                        ✏️ Update Item
                                    </button>
                                </div>
                            ) : (
                                /* Add Mode: Complete Sale OR Add to Cart */
                                <div className="grid grid-cols-3 gap-3">
                                    <button type="button" onClick={handlePrint} className="py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all cursor-pointer text-sm">
                                        Print
                                    </button>
                                    <button type="submit"
                                        disabled={isOutOfStock || qty > availableStock}
                                        className={`py - 3.5 rounded - xl text - white font - bold shadow - lg shadow - blue - 500 / 20 active: scale - 95 transition - all text - sm
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'} `}>
                                        Complete Sale
                                    </button>
                                    <button type="button" onClick={handleAddToCart}
                                        disabled={isOutOfStock || qty > availableStock}
                                        className={`py - 3.5 rounded - xl text - white font - bold shadow - lg shadow - emerald - 500 / 20 active: scale - 95 transition - all text - sm
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'} `}>
                                        🛒 Add to Cart
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </form>
            </div>

            {/* ── Hidden Print Area ── */}
            <div style={{ display: 'none' }}>
                <ReceiptTemplate
                    ref={receiptRef}
                    items={[{
                        name: product.name,
                        productName: product.name,
                        category: product.category,
                        quantity: qty,
                        amount: grossTotal,
                        verifiedAttributes: { ...verifiedAttrs }
                    }]}
                    transactionId={transactionId}
                    salesmanName={user?.name || 'Unknown'}
                    paymentMethod={paymentMethod}
                />
            </div>
        </div>
    );
}

