import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../context/InventoryContext';
import { priceTag } from '../utils/currency';
import { generateId } from '../data/inventoryStore';
import { Pencil, Trash2, ShoppingCart, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { useRef, useState, useEffect } from 'react';
import ReceiptTemplate from './ReceiptTemplate';

// ══════════════════════════════════════════════════════════
// DailyBooks — Cart Sidebar (Live Order Panel)
// Shows current cart items with edit/remove, totals, finalize
// ══════════════════════════════════════════════════════════

export default function CartSidebar({ onEditItem, onFinalized }) {
    const { cart, cartTotal, cartNetTotal, cartTaxTotal, removeFromCart, clearCart } = useCart();
    const { user } = useAuth();
    const { addTransaction, adjustStock } = useInventory();

    const receiptRef = useRef();
    const [finalizingRef, setFinalizingRef] = useState(null);

    const printReceipt = useReactToPrint({
        contentRef: receiptRef,
        documentTitle: `Receipt-${new Date().getTime()}`,
        onAfterPrint: () => {
            // Clear cart & clear ref AFTER printing dialog finishes
            clearCart();
            setFinalizingRef(null);
            if (onFinalized) onFinalized();
        }
    });

    // Watch for finalizingRef to be set. Once set, DOM is ready to print.
    useEffect(() => {
        if (finalizingRef) {
            printReceipt();
        }
    }, [finalizingRef, printReceipt]);

    // ── Handlers ──
    const handleFinalize = () => {
        // Generate ONE master transaction ID for this entire cart
        const masterTransactionId = generateId('TXN');
        const currentDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        const currentTime = new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });

        // 1. Add individual transaction for each item in the cart
        // so they show up as separate rows in Recent Transactions,
        // but share the SAME transactionId for searching/grouping.
        cart.forEach(item => {
            const itemNotes = String(item.notes || '').trim();
            const individualTxn = {
                ...item,
                id: generateId('ITM'), // Unique ID for literal row
                transactionId: masterTransactionId, // Shared Master ID
                desc: item.name || item.productName || 'Item',
                amount: item.amount || 0,
                profit: parseFloat(item.profit) || 0,
                discount: parseFloat(item.discount) || 0,
                quantity: parseInt(item.quantity) || 1,
                date: currentDate,
                time: currentTime,
                timestamp: new Date().toISOString(),
                type: 'income',
                category: item.category || 'Sales',
                source: 'shop',
                soldBy: user?.name || 'Unknown',
                userName: user?.name || 'Unknown',
                userId: user?.id,
                customerInfo: item.customerInfo || cart[0]?.customerInfo || { name: 'Walk-in', phone: '', type: 'New' },
                paymentMethod: item.paymentMethod || cart[0]?.paymentMethod || 'Cash',
                notes: itemNotes ? `${itemNotes} | Part of multi-item sale ${masterTransactionId}` : `Part of multi-item sale ${masterTransactionId}`,
                isConsolidatedItem: true
            };

            // Add to transaction history
            addTransaction(individualTxn);

            // 2. Adjust stock
            adjustStock(item.productId || item.id, -individualTxn.quantity);
        });

        // 3. Set ref which triggers the useEffect -> printReceipt
        setFinalizingRef(masterTransactionId);
    };

    return (
        <div className={`fixed right-20 top-4 h-[calc(100vh-2rem)] w-[340px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 ${cart.length === 0 ? 'opacity-0 pointer-events-none translate-x-8' : 'opacity-100 translate-x-0'}`}>
            {cart.length > 0 && (
                <>
                    {/* Header */}
                    <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ShoppingCart size={18} />
                            <span className="font-bold text-sm">Live Order</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">{cart.length}</span>
                        </div>
                        <button
                            onClick={clearCart}
                            className="text-white/70 hover:text-white transition-colors p-1"
                            title="Clear Cart"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Cart Items */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {cart.map((item, idx) => (
                            <div key={item.cartItemId} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                                <div className="flex items-start gap-3 justify-between">
                                    {/* Product Image */}
                                    <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                        {item.image ? (
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-xl">📦</span>
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{item.name || item.productName || 'Item'}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">x{item.quantity || 1}</span>
                                            {item.discount > 0 && (
                                                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">-€{item.discount}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2">
                                        <span className="text-sm font-black text-slate-800 font-mono whitespace-nowrap">
                                            {priceTag(item.amount || 0)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-slate-100">
                                    <button
                                        onClick={() => onEditItem(item)}
                                        className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"
                                        title="Edit Item"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => removeFromCart(item.cartItemId)}
                                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors"
                                        title="Remove"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Footer: Totals + Finalize */}
                    <div className="border-t border-slate-200 p-4 bg-slate-50 shrink-0">
                        {/* Tax Breakdown */}
                        <div className="space-y-1 mb-3">
                            <div className="flex justify-between text-[11px] text-slate-400">
                                <span>Netto (excl. 19%)</span>
                                <span className="font-mono">{priceTag(cartNetTotal)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-400">
                                <span>USt (19%)</span>
                                <span className="font-mono">{priceTag(cartTaxTotal)}</span>
                            </div>
                        </div>

                        {/* Grand Total */}
                        <div className="flex justify-between items-center mb-4 pt-3 border-t border-slate-200">
                            <span className="text-sm font-bold text-slate-600">Grand Total</span>
                            <span className="text-2xl font-black text-slate-800">{priceTag(cartTotal)}</span>
                        </div>

                        {/* Finalize Button */}
                        <button
                            onClick={handleFinalize}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-emerald-500 active:scale-[0.98] transition-all text-sm"
                        >
                            🧾 Finalize & Print Bill
                        </button>
                    </div>

                    {/* Hidden Receipt Component */}
                    <div className="hidden">
                        <ReceiptTemplate
                            ref={receiptRef}
                            items={cart}
                            transactionId={finalizingRef}
                            salesmanName={user?.name || 'Shop'}
                            paymentMethod={cart[0]?.paymentMethod || 'Cash'}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
