import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { X, Search, Plus, Minus, Package, DollarSign, CheckCircle2 } from 'lucide-react';
import { priceTag } from '../../utils/currency';

export default function CompleteRepairModal({ isOpen, onClose, job, onComplete }) {
    const { products } = useInventory();

    const [finalAmount, setFinalAmount] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Array of { product (from inventory), quantity, costPrice (snapshot at time of add) }
    const [selectedParts, setSelectedParts] = useState([]);

    // Initialize defaults when modal opens
    useEffect(() => {
        if (isOpen && job) {
            setFinalAmount(job.estimatedCost ? String(job.estimatedCost) : '');
            setSelectedParts([]);
            setSearchTerm('');
        }
    }, [isOpen, job]);

    // Search Inventory
    const searchResults = useMemo(() => {
        if (!isOpen || !job) return [];
        if (!searchTerm.trim()) return [];
        const q = searchTerm.toLowerCase();
        return products.filter(p =>
            p.stock > 0 && (
                (p.name || '').toLowerCase().includes(q) ||
                (p.model || '').toLowerCase().includes(q) ||
                (p.barcode || '').includes(q)
            )
        ).slice(0, 10); // Limit to 10 results
    }, [products, searchTerm, isOpen, job]);

    const totalPartsCost = selectedParts.reduce((sum, part) => sum + (part.costPrice * part.quantity), 0);

    if (!isOpen || !job) return null;

    const handleAddPart = (product) => {
        setSelectedParts(prev => {
            const existing = prev.find(p => p.product.id === product.id);
            if (existing) {
                // Check stock limits
                if (existing.quantity >= product.stock) {
                    alert(`Only ${product.stock} units available in inventory!`);
                    return prev;
                }
                return prev.map(p => p.product.id === product.id
                    ? { ...p, quantity: p.quantity + 1 }
                    : p
                );
            }
            return [...prev, { product, quantity: 1, costPrice: parseFloat(product.purchasePrice) || 0 }];
        });
        setSearchTerm(''); // Clear search after adding
    };

    const handleUpdateQuantity = (productId, delta) => {
        setSelectedParts(prev => {
            return prev.map(p => {
                if (p.product.id === productId) {
                    const newQty = p.quantity + delta;
                    if (newQty > p.product.stock) {
                        alert(`Only ${p.product.stock} units available!`);
                        return p;
                    }
                    return { ...p, quantity: Math.max(0, newQty) };
                }
                return p;
            }).filter(p => p.quantity > 0);
        });
    };

    const handleRemovePart = (productId) => {
        setSelectedParts(prev => prev.filter(p => p.product.id !== productId));
    };



    const handleSubmit = () => {
        const amount = parseFloat(finalAmount) || 0;
        if (amount < 0) {
            alert('Amount cannot be negative.');
            return;
        }

        // Map parts to a cleaner structure to save in the job
        const partsUsed = selectedParts.map(sp => ({
            productId: sp.product.id,
            name: sp.product.name,
            quantity: sp.quantity,
            costPrice: sp.costPrice // Save cost price at time of use
        }));

        onComplete({
            finalAmount: amount,
            partsUsed,
            totalPartsCost
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <CheckCircle2 size={24} /> Complete Repair
                        </h2>
                        <p className="text-emerald-100 text-sm">{job.refId} • {job.customerName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto space-y-6">

                    {/* Final Amount */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Final Bill Amount (€)</label>
                        <div className="relative">
                            <DollarSign size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="number"
                                value={finalAmount}
                                onChange={(e) => setFinalAmount(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-lg font-bold"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="border-t border-slate-100 my-4"></div>

                    {/* Parts Used Section */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                            <Package size={18} className="text-blue-500" /> Parts Used (Optional)
                        </h3>

                        {/* Search Inventory */}
                        <div className="relative mb-4">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search inventory for parts..."
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />

                            {/* Search Dropdown */}
                            {searchTerm.trim() && searchResults.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 shadow-lg rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                                    {searchResults.map(product => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleAddPart(product)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 flex justify-between items-center transition-colors"
                                        >
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{product.name}</p>
                                                <p className="text-[10px] text-slate-500">Stock: {product.stock} | Cost: {priceTag(product.purchasePrice || 0)}</p>
                                            </div>
                                            <Plus size={16} className="text-blue-500" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            {searchTerm.trim() && searchResults.length === 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 shadow-lg rounded-xl p-4 text-center">
                                    <p className="text-sm text-slate-500">No parts found in stock.</p>
                                </div>
                            )}
                        </div>

                        {/* Selected Parts List */}
                        {selectedParts.length > 0 ? (
                            <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                                {selectedParts.map(part => (
                                    <div key={part.product.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-800">{part.product.name}</p>
                                            <p className="text-[10px] text-slate-500">Cost: {priceTag(part.costPrice)}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
                                                <button onClick={() => handleUpdateQuantity(part.product.id, -1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Minus size={14} /></button>
                                                <span className="w-6 text-center text-sm font-bold block">{part.quantity}</span>
                                                <button onClick={() => handleUpdateQuantity(part.product.id, 1)} className="p-1 hover:bg-white rounded shadow-sm text-slate-600"><Plus size={14} /></button>
                                            </div>
                                            <span className="text-sm font-bold w-16 text-right">{priceTag(part.costPrice * part.quantity)}</span>
                                            <button onClick={() => handleRemovePart(part.product.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                                        </div>
                                    </div>
                                ))}

                                <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center text-sm">
                                    <span className="font-bold text-slate-500 uppercase tracking-wider">Total Parts Cost:</span>
                                    <span className="font-black text-rose-600">{priceTag(totalPartsCost)}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                <Package size={24} className="mx-auto text-slate-300 mb-2" />
                                <p className="text-xs font-medium text-slate-400">No parts added.</p>
                                <p className="text-xs text-slate-400">Search above if you used inventory items.</p>
                            </div>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 transition-colors">
                        <CheckCircle2 size={18} /> Confirm & Complete
                    </button>
                </div>
            </div>
        </div>
    );
}
