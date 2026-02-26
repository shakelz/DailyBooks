import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { X, Search, Plus, Minus, Package, DollarSign, CheckCircle2, Printer } from 'lucide-react';
import { priceTag } from '../../utils/currency';

export default function CompleteRepairModal({ isOpen, onClose, job, onComplete }) {
    const { products } = useInventory();
    const { activeShop } = useAuth();

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

    const generateCompletionPrintHTML = (printData) => {
        const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
        ));
        const toAmount = (value) => `€${(parseFloat(value) || 0).toFixed(2)}`;
        const toDate = (value, withTime = false) => {
            if (!value) return 'N/A';
            const parsed = new Date(value);
            if (Number.isNaN(parsed.getTime())) return 'N/A';
            if (withTime) {
                return parsed.toLocaleString('de-DE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
            return parsed.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        const partsRows = (printData.partsUsed || []).length > 0
            ? printData.partsUsed.map((part) => {
                const qty = parseInt(part.quantity, 10) || 0;
                const unit = parseFloat(part.costPrice) || 0;
                const total = qty * unit;
                return `
                    <tr>
                        <td>${qty}x</td>
                        <td>${esc(part.name || 'Part')}</td>
                        <td style="text-align:right">${toAmount(total)}</td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="3" style="text-align:center;color:#666;">No parts used</td></tr>';

        const serviceAmount = parseFloat(printData.finalAmount) || 0;
        const partsCost = parseFloat(printData.totalPartsCost) || 0;
        const netEarning = serviceAmount - partsCost;
        const completedAt = printData.completedAt || new Date().toISOString();
        const receiptShopName = String(activeShop?.name || 'Shop').trim() || 'Shop';
        const receiptShopAddress = String(activeShop?.address || activeShop?.location || '').trim();

        return `<!DOCTYPE html>
<html>
<head>
    <title>Reparaturrechnung - ${esc(printData.refId)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; width: 80mm; }
        .slip { padding: 4mm; page-break-after: always; border-bottom: 2px dashed #000; }
        .slip:last-child { border-bottom: none; page-break-after: auto; }
        .title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-bottom: 2mm; color: #666; }
        .shop-name { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 2mm; }
        .shop-addr { font-size: 10px; text-align: center; margin-bottom: 3mm; color: #333; }
        .divider { border-top: 1px solid #000; margin: 2mm 0; }
        .ref-id { font-size: 18px; font-weight: bold; text-align: center; margin: 3mm 0; letter-spacing: 2px; }
        .row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin: 1mm 0; }
        .row .label-text { font-weight: bold; white-space: nowrap; }
        .problem { font-size: 11px; margin: 2mm 0; padding: 2mm; border: 1px solid #ccc; background: #f5f5f5; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 2mm; }
        th, td { padding: 1.5mm 0; border-bottom: 1px dotted #ccc; }
        th { text-align: left; font-size: 10px; text-transform: uppercase; color: #555; }
        @media print { body { width: 80mm; } .slip { break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="slip">
        <div class="title">— Reparaturabschluss —</div>
        <div class="shop-name">${esc(receiptShopName)}</div>
        ${receiptShopAddress ? `<div class="shop-addr">${esc(receiptShopAddress)}</div>` : ''}
        <div class="divider"></div>
        <div class="ref-id">${esc(printData.refId)}</div>
        <div class="divider"></div>
        <div class="row"><span class="label-text">Fertiggestellt:</span><span>${toDate(completedAt, true)}</span></div>
        <div class="row"><span class="label-text">Abholdatum:</span><span>${toDate(printData.deliveryDate)}</span></div>
        <div class="divider"></div>
        <div class="row"><span class="label-text">Name:</span><span>${esc(printData.customerName)}</span></div>
        <div class="row"><span class="label-text">Telefon:</span><span>${esc(printData.phone)}</span></div>
        <div class="row"><span class="label-text">Geraet:</span><span>${esc(printData.deviceModel)}</span></div>
        ${printData.imei ? `<div class="row"><span class="label-text">IMEI:</span><span>${esc(printData.imei)}</span></div>` : ''}
        <div class="problem"><strong>Fehler:</strong> ${esc(printData.problem || 'N/A')}</div>
        <div class="divider"></div>
        <div class="row" style="font-size:13px;"><span class="label-text">Endbetrag:</span><span><strong>${toAmount(serviceAmount)}</strong></span></div>
        <div class="divider"></div>
        <div class="title" style="text-align:left; margin-bottom:1mm;">Verwendete Teile</div>
        <table>
            <thead>
                <tr><th>Qty</th><th>Part</th><th style="text-align:right">Amount</th></tr>
            </thead>
            <tbody>
                ${partsRows}
            </tbody>
        </table>
        <div class="row"><span class="label-text">Teilekosten:</span><span>${toAmount(partsCost)}</span></div>
        <div class="divider"></div>
        <div style="font-size:8px;text-align:center;margin-top:2mm;color:#999;">Vielen Dank. ${esc(receiptShopName)}</div>
    </div>

    <div class="slip">
        <div class="title">— Ladenkopie —</div>
        <div class="ref-id">${esc(printData.refId)}</div>
        <div class="divider"></div>
        <div class="row"><span class="label-text">Kunde:</span><span>${esc(printData.customerName)}</span></div>
        <div class="row"><span class="label-text">Geraet:</span><span>${esc(printData.deviceModel)}</span></div>
        <div class="row"><span class="label-text">Fertiggestellt:</span><span>${toDate(completedAt, true)}</span></div>
        <div class="problem"><strong>Fehler:</strong> ${esc(printData.problem || 'N/A')}</div>
        <div class="divider"></div>
        <div class="row"><span class="label-text">Servicebetrag:</span><span>${toAmount(serviceAmount)}</span></div>
        <div class="row"><span class="label-text">Teilekosten:</span><span>${toAmount(partsCost)}</span></div>
        <div class="row" style="font-size:13px;"><span class="label-text">Nettoertrag:</span><span><strong>${toAmount(netEarning)}</strong></span></div>
    </div>
</body>
</html>`;
    };

    const handleSubmit = async (shouldPrint = false) => {
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

        let printWindow = null;
        if (shouldPrint) {
            printWindow = window.open('', '_blank', 'width=420,height=760');
            if (!printWindow) {
                alert('Popup blocked. Please allow popups to print.');
            }
        }

        try {
            const completedAt = new Date().toISOString();
            await Promise.resolve(onComplete({
                finalAmount: amount,
                partsUsed,
                totalPartsCost
            }));

            if (shouldPrint && printWindow) {
                const printPayload = {
                    ...job,
                    finalAmount: amount,
                    partsUsed,
                    totalPartsCost,
                    completedAt
                };
                const html = generateCompletionPrintHTML(printPayload);
                printWindow.document.open();
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                printWindow.onload = () => {
                    setTimeout(() => {
                        printWindow.print();
                    }, 150);
                };
            }

            onClose();
        } catch (error) {
            console.error('Failed to complete/print repair:', error);
            alert(error?.message || 'Failed to complete repair.');
        }
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
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-wrap">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={() => handleSubmit(true)} className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 transition-colors">
                        <Printer size={18} /> Complete & Print
                    </button>
                    <button onClick={() => handleSubmit(false)} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 transition-colors">
                        <CheckCircle2 size={18} /> Confirm & Complete
                    </button>
                </div>
            </div>
        </div>
    );
}
