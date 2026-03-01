import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { generateId } from '../data/inventoryStore';
import { priceTag } from '../utils/currency';

// Dynamic Attributes, Discount Logic, German Tax Breakdown

export default function TransactionModal({ isOpen, onClose, onAddToBill, initialProduct, editingItem }) {
    const { user, activeShop, billShowTax } = useAuth();
    const { addToCart, updateCartItem, setEditingCartItem } = useCart();
    const [status, setStatus] = useState('idle'); // idle, success
    const isEditMode = !!editingItem;

    const [product, setProduct] = useState(null);
    const [qty, setQty] = useState(1);

    const [basePrice, setBasePrice] = useState(0); // Editable retail price
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('');

    const [verifiedAttrs, setVerifiedAttrs] = useState({});

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerType, setCustomerType] = useState('New'); // 'New' | 'Regular'
    const [paymentMethod, setPaymentMethod] = useState('Cash'); // 'Cash' | 'Visa' | 'Online'
    const [includeTax, setIncludeTax] = useState(Boolean(billShowTax));

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
            setIncludeTax(editingItem.includeTax === undefined ? Boolean(billShowTax) : Boolean(editingItem.includeTax));
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
            setIncludeTax(Boolean(billShowTax));
            setStatus('idle');
        }
    }, [isOpen, initialProduct, editingItem, billShowTax]);

    if (!isOpen || !product) return null;

    const stockSource = [
        product.stock,
        product.qty,
        product.quantity,
        product.productSnapshot?.stock,
        product.raw?.stock,
    ].find((value) => value !== undefined && value !== null && String(value).trim() !== '');
    const parsedStock = Number(stockSource);
    const hasStockLimit = Number.isFinite(parsedStock);
    const availableStock = hasStockLimit ? Math.max(0, parsedStock) : Infinity;
    const isOutOfStock = hasStockLimit && availableStock <= 0;
    const exceedsStock = hasStockLimit && qty > availableStock;

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
        const escapeHtml = (value) => String(value || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll('\'', '&#39;');
        const formatMoney = (value) => `${Number(value || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
        const shopName = activeShop?.name || 'Shop';
        const shopAddress = activeShop?.address || activeShop?.location || '';
        const shopPhone = activeShop?.telephone || activeShop?.phone || '';

        const popup = window.open('', 'transaction-modal-print', 'width=420,height=760');
        if (!popup) return;

        popup.document.write(`
            <html>
                <head>
                    <title>Kassenbeleg</title>
                    <style>
                        body { font-family: 'Courier New', monospace; width: 58mm; margin: 0 auto; padding: 12px; }
                        h2,p { margin: 0; }
                        .row { display:flex; justify-content:space-between; margin-top:6px; font-size:12px; gap: 8px; }
                        .line { border-top:1px solid #000; margin:8px 0; }
                        .center { text-align: center; }
                    </style>
                </head>
                <body>
                    <div class="center">
                        <h2>${escapeHtml(shopName)}</h2>
                        ${shopAddress ? `<p>${escapeHtml(shopAddress)}</p>` : ''}
                        ${shopPhone ? `<p>Tel: ${escapeHtml(shopPhone)}</p>` : ''}
                        <p>Deutschland</p>
                    </div>
                    <div class="line"></div>
                    <div class="center" style="font-weight:700;">Beleg</div>
                    <div class="row"><span>Datum</span><span>${new Date().toLocaleString('de-DE')}</span></div>
                    <div class="row"><span>Belegnummer</span><span>${escapeHtml(transactionId)}</span></div>
                    <div class="line"></div>
                    <div class="row" style="font-weight:700; border-bottom:1px solid #000; padding-bottom:4px;"><span>Artikel</span><span>Betrag</span></div>
                    <div class="row"><span>${qty}x ${escapeHtml(product.name || 'Product')}</span><span>${formatMoney(grossTotal)}</span></div>
                    <div class="row"><span>Barcode</span><span>${escapeHtml(product.barcode || '-')}</span></div>
                    <div class="row"><span>Rabatt</span><span>${formatMoney(discountValue)}</span></div>
                    <div class="line"></div>
                    <div class="row"><strong>Zwischensumme</strong><strong>${formatMoney(grossTotal)}</strong></div>
                    <div class="row"><strong>Gesamtbetrag</strong><strong>${formatMoney(grossTotal)}</strong></div>
                    ${includeTax ? `<div class="row"><span>Netto (19%)</span><span>${formatMoney(netTotal)}</span></div>
                    <div class="row"><span>USt (19%)</span><span>${formatMoney(taxTotal)}</span></div>` : ''}
                    <div class="line"></div>
                    <div class="row"><span>Zahlung</span><span>${escapeHtml(paymentMethod || 'Cash')}</span></div>
                    <div class="row"><span>Transaktion-ID</span><span>${escapeHtml(transactionId)}</span></div>
                    <div class="line"></div>
                    <p style="font-size:10px; text-align:center;">Rückgabe/Umtausch innerhalb 14 Tagen nur in unbeschädigter Originalverpackung. Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur. Vielen Dank. ${escapeHtml(shopName)}</p>
                </body>
            </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const handleConfirm = async (e) => {
        e.preventDefault();
        if (!product) return;

        // Validation
        if (isOutOfStock) { alert('Product Out of Stock!'); return; }
        if (exceedsStock) { alert(`Only ${availableStock} units available!`); return; }

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
            includeTax: Boolean(includeTax),
            taxInfo: {
                net: includeTax ? netTotal : grossTotal,
                tax: includeTax ? taxTotal : 0,
                rate: includeTax ? 0.19 : 0
            },

            // Attributes
            verifiedAttributes: { ...verifiedAttrs },
            attributes: product.attributes || {},
            barcode: product.barcode || '',
            model: product.model || '',
            brand: product.brand || '',
            categorySnapshot: (product.category && typeof product.category === 'object') ? product.category : null,
            categoryPath: product.categoryPath || null,
            productSnapshot: {
                id: product.id || null,
                name: product.name || '',
                desc: product.desc || product.name || '',
                model: product.model || '',
                brand: product.brand || '',
                barcode: product.barcode || '',
                category: (product.category && typeof product.category === 'object') ? product.category : null,
                categoryPath: product.categoryPath || null,
                attributes: product.attributes || {},
                verifiedAttributes: { ...verifiedAttrs },
                purchasePrice: purchasePriceSnapshot,
                sellingPrice: currentBasePrice
            },

            // Customer
            customerInfo: {
                name: customerName || 'Walk-in',
                phone: customerPhone,
                type: customerType
            },

            // Meta
            desc: product.name || '',
            category: product.category?.level1 || (typeof product.category === 'string' ? product.category : '') || '',
            salesmanName: user?.name || 'Unknown',
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
            soldBy: user?.name || 'Unknown',
            paymentMethod,
            notes: notes,
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString(),
            type: 'income',
            source: 'shop'
        };

        try {
            await onAddToBill(transactionData);
        } catch (error) {
            alert(error?.message || 'Failed to complete sale');
            return;
        }

        setStatus('success');
        setTimeout(() => {
            onClose();
            setStatus('idle');
        }, 500);
    };

    const handleAddToCart = () => {
        if (!product) return;
        if (isOutOfStock) { alert('Product Out of Stock!'); return; }
        if (exceedsStock) { alert(`Only ${availableStock} units available!`); return; }

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
            includeTax: Boolean(includeTax),
            taxInfo: {
                net: includeTax ? netTotal : grossTotal,
                tax: includeTax ? taxTotal : 0,
                rate: includeTax ? 0.19 : 0
            },
            verifiedAttributes: { ...verifiedAttrs },
            attributes: product.attributes || {},
            barcode: product.barcode || '',
            model: product.model || '',
            brand: product.brand || '',
            categorySnapshot: (product.category && typeof product.category === 'object') ? product.category : null,
            categoryPath: product.categoryPath || null,
            productSnapshot: {
                id: product.productId || product.id || null,
                name: product.name || '',
                desc: product.desc || product.name || '',
                model: product.model || '',
                brand: product.brand || '',
                barcode: product.barcode || '',
                category: (product.category && typeof product.category === 'object') ? product.category : null,
                categoryPath: product.categoryPath || null,
                attributes: product.attributes || {},
                verifiedAttributes: { ...verifiedAttrs },
                purchasePrice: purchasePriceSnapshot,
                sellingPrice: currentBasePrice
            },
            customerInfo: { name: customerName || 'Walk-in', phone: customerPhone, type: customerType },
            paymentMethod,
            notes,
            salesmanName: user?.name || 'Unknown',
            salesmanNumber: user?.salesmanNumber || 0,
            workerId: String(user?.id || ''),
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200">

                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-base">
                            {product.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-800">{product.name}</h2>
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mt-0.5">
                                <span className="bg-slate-200 px-2 py-0.5 rounded">BC: {product.barcode}</span>
                                {product.model && <span className="px-2">Model: {product.model}</span>}
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors text-sm">x</button>
                </div>

                <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

                    <div className="space-y-2">

                        {/* Stock Warning */}
                        {!isOutOfStock && availableStock <= (product.stockAlert?.red || 5) && (
                            <div className="flex items-center gap-1.5 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <span className="text-base font-bold text-yellow-700">!</span>
                                <div>
                                    <p className="text-xs font-bold text-yellow-700">Stock Low: Only {availableStock} left</p>
                                </div>
                            </div>
                        )}

                        {/* Dynamic Attribute Verification Grid */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Product Verification</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {Object.keys(verifiedAttrs).length > 0 ? (
                                    Object.keys(verifiedAttrs).map(key => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{key}</label>
                                            <input type="text" placeholder={`Verify ${key} `} value={verifiedAttrs[key]}
                                                onChange={e => setVerifiedAttrs(prev => ({ ...prev, [key]: e.target.value }))}
                                                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 focus:border-blue-500 focus:outline-none text-xs transition-all shadow-sm" />
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-xs text-slate-400 italic">No attributes to verify</p>
                                )}
                            </div>
                        </div>

                        {/* Advanced Financials */}
                        <div className="bg-blue-50/30 p-3 rounded-xl border border-blue-100">
                            <h3 className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-2">Financials (EU Standard)</h3>

                            <div className="mb-2 flex items-center justify-between rounded-lg border border-blue-100 bg-white px-2.5 py-2">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Tax Inclusion</p>
                                    <p className="text-[10px] text-slate-400">Show Netto/USt on bill</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIncludeTax((prev) => !prev)}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${includeTax ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                >
                                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${includeTax ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Retail Price</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[11px]">EUR</span>
                                        <input type="number" value={basePrice} onChange={e => setBasePrice(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2 rounded-lg bg-white border border-slate-200 focus:border-blue-500 focus:outline-none text-sm font-bold text-slate-700 shadow-sm transition-all" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Quantity</label>
                                    <div className="flex items-center gap-1.5">
                                        <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-500">-</button>
                                        <div className="flex-1 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg font-bold text-slate-700 text-sm">{qty}</div>
                                        <button type="button" onClick={() => setQty(q => hasStockLimit ? Math.min(q + 1, availableStock) : q + 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 font-bold text-slate-500">+</button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Discount Value</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[11px]">EUR</span>
                                        <input type="number" value={discount} onChange={e => setDiscount(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2 rounded-lg bg-white border border-blue-200 focus:border-blue-500 focus:outline-none text-sm font-bold text-slate-800 shadow-sm transition-all" />
                                    </div>
                                </div>
                            </div>

                            {/* Netto/USt Breakdown */}
                            {includeTax ? (
                                <div className="mt-2 pt-2 border-t border-blue-100 space-y-1">
                                    <div className="flex justify-between text-[11px] font-medium text-slate-400 px-1">
                                        <span>Netto (Excl. 19% Tax)</span>
                                        <span>{priceTag(netTotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-medium text-slate-400 px-1">
                                        <span>USt (19% Tax)</span>
                                        <span>{priceTag(taxTotal)}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2 pt-2 border-t border-blue-100">
                                    <p className="text-[11px] text-slate-500 px-1">Tax lines are disabled for this bill.</p>
                                </div>
                            )}
                        </div>

                    </div>

                    <div className="flex flex-col h-full">

                        <div className="flex-1 space-y-2">
                            {/* Customer Info */}
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Customer & Payment</h3>
                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-2">
                                            <input type="text" placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-xs font-semibold transition-all placeholder:text-slate-400" />
                                        </div>
                                        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                                            className="w-full px-2 py-2 rounded-lg bg-blue-50 text-blue-600 border-0 focus:ring-2 focus:ring-blue-100 text-xs font-bold cursor-pointer">
                                            <option value="Cash">Cash</option>
                                            <option value="Visa">Visa</option>
                                            <option value="Online">Online</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="col-span-2">
                                            <input type="tel" placeholder="Phone Number" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-xs font-semibold transition-all placeholder:text-slate-400" />
                                        </div>
                                        <select value={customerType} onChange={e => setCustomerType(e.target.value)}
                                            className="w-full px-2 py-2 rounded-lg bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-xs font-semibold cursor-pointer">
                                            <option value="New">New</option>
                                            <option value="Regular">Regular</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Info */}
                            <div>
                                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transaction Meta</h3>
                                <textarea rows="3" placeholder="Additional Notes..." value={notes} onChange={e => setNotes(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 text-xs font-medium resize-none placeholder:text-slate-400" ></textarea>

                                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                                    <span>Sold By: {user?.name || 'Unknown'}</span>
                                    <span>{new Date().toLocaleDateString('en-PK')}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-500">Gross Total (Brutto)</span>
                                <span className="text-xl font-bold text-slate-800">{priceTag(grossTotal)}</span>
                            </div>

                            {isEditMode ? (
                                /* Edit Mode: Update Item only */
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={onClose} className="py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all cursor-pointer text-xs">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleAddToCart}
                                        disabled={isOutOfStock || exceedsStock}
                                        className={`py-2 rounded-lg text-white font-bold shadow-lg shadow-amber-500/20 active:scale-95 transition-all text-xs
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400'} `}>
                                        Update Item
                                    </button>
                                </div>
                            ) : (
                                /* Add Mode: Complete Sale OR Add to Cart */
                                <div className="grid grid-cols-3 gap-2">
                                    <button type="button" onClick={handlePrint} className="py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all cursor-pointer text-xs">
                                        Print
                                    </button>
                                    <button type="submit"
                                        disabled={isOutOfStock || exceedsStock}
                                        className={`py-2 rounded-lg text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-xs
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'} `}>
                                        Complete Sale
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddToCart}
                                        disabled={isOutOfStock || exceedsStock}
                                        className={`py-2 rounded-lg text-white font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-xs
                                        ${isOutOfStock ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400'} `}
                                    >
                                        Add to Cart
                                    </button>
                                </div>
                            )}
                        </div>

                    </div>
                </form>
            </div>
        </div>
    );
}




