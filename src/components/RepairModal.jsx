import { useState } from 'react';
import { useRepairs } from '../context/RepairsContext';
import { X, Printer, Save, Wrench, Phone, User, Smartphone, Hash, FileText, Calendar, DollarSign } from 'lucide-react';

export default function RepairModal({ isOpen, onClose }) {
    const { addRepair } = useRepairs();

    const [form, setForm] = useState({
        customerName: '',
        phone: '',
        deviceModel: '',
        imei: '',
        problem: '',
        estimatedCost: '',
        deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0], // +3 days default
    });

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const resetForm = () => {
        setForm({
            customerName: '', phone: '', deviceModel: '', imei: '',
            problem: '', estimatedCost: '',
            deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        });
    };

    const handleSave = async (shouldPrint = false) => {
        if (!form.customerName.trim() || !form.phone.trim() || !form.deviceModel.trim() || !form.problem.trim()) {
            alert('Please fill in Customer Name, Phone, Device Model, and Problem.');
            return;
        }

        try {
            const job = await addRepair({
                customerName: form.customerName.trim(),
                phone: form.phone.trim(),
                deviceModel: form.deviceModel.trim(),
                imei: form.imei.trim(),
                problem: form.problem.trim(),
                estimatedCost: parseFloat(form.estimatedCost) || 0,
                deliveryDate: form.deliveryDate,
            });

            if (!job || typeof job !== 'object') {
                throw new Error('Repair job save response is invalid.');
            }

            if (shouldPrint) {
                const printWindow = window.open('', '_blank', 'width=420,height=700');
                if (!printWindow) {
                    alert('Popup blocked. Please allow popups to print.');
                } else {
                    const html = generatePrintHTML(job);
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
            }

            setTimeout(() => {
                resetForm();
                onClose();
            }, shouldPrint ? 700 : 350);
        } catch (error) {
            console.error('Failed to save/print repair job:', error);
            alert(error?.message || 'Failed to save repair job.');
        }
    };

    const generatePrintHTML = (job) => {
        const deliveryFormatted = new Date(job.deliveryDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
        return `<!DOCTYPE html>
<html>
<head>
    <title>Repair Labels - ${job.refId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; width: 80mm; }
        .label { padding: 4mm; page-break-after: always; border-bottom: 2px dashed #000; }
        .label:last-child { border-bottom: none; page-break-after: auto; }
        .shop-name { font-size: 16px; font-weight: bold; text-align: center; margin-bottom: 2mm; }
        .shop-addr { font-size: 10px; text-align: center; margin-bottom: 3mm; color: #333; }
        .divider { border-top: 1px solid #000; margin: 2mm 0; }
        .row { display: flex; justify-content: space-between; font-size: 11px; margin: 1mm 0; }
        .row .label-text { font-weight: bold; }
        .ref-id { font-size: 18px; font-weight: bold; text-align: center; margin: 3mm 0; letter-spacing: 2px; }
        .problem { font-size: 11px; margin: 2mm 0; padding: 2mm; border: 1px solid #ccc; background: #f5f5f5; }
        .title { font-size: 9px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; text-align: center; margin-bottom: 2mm; color: #666; }
        @media print { body { width: 80mm; } .label { break-inside: avoid; } }
    </style>
</head>
<body>
    <!-- CUSTOMER COPY -->
    <div class="label">
        <div class="title">— Customer Copy —</div>
        <div class="shop-name">DailyBooks</div>
        <div class="shop-addr">Kurt-Schumacher-Damm 1</div>
        <div class="divider"></div>
        <div class="ref-id">${job.refId}</div>
        <div class="divider"></div>
        <div class="row"><span class="label-text">Name:</span><span>${job.customerName}</span></div>
        <div class="row"><span class="label-text">Phone:</span><span>${job.phone}</span></div>
        <div class="row"><span class="label-text">Device:</span><span>${job.deviceModel}</span></div>
        ${job.imei ? `<div class="row"><span class="label-text">IMEI:</span><span>${job.imei}</span></div>` : ''}
        <div class="divider"></div>
        <div class="problem"><strong>Problem:</strong> ${job.problem}</div>
        <div class="row"><span class="label-text">Est. Cost:</span><span>€${job.estimatedCost.toFixed(2)}</span></div>
        <div class="row"><span class="label-text">Delivery:</span><span>${deliveryFormatted}</span></div>
        <div class="divider"></div>
        <div style="font-size:8px;text-align:center;margin-top:2mm;color:#999;">Thank you for choosing DailyBooks!</div>
    </div>

    <!-- SHOP LABEL (stick on phone) -->
    <div class="label">
        <div class="title">— Shop Label —</div>
        <div class="ref-id" style="font-size:22px;">${job.refId}</div>
        <div class="divider"></div>
        <div class="problem"><strong>Issue:</strong> ${job.problem}</div>
        <div class="row"><span class="label-text">Device:</span><span>${job.deviceModel}</span></div>
        <div class="row"><span class="label-text">Due:</span><span>${deliveryFormatted}</span></div>
    </div>
</body>
</html>`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 rounded-t-3xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Wrench size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">New Repair Job</h2>
                            <p className="text-xs text-blue-200">Fill in repair details below</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                {/* Form */}
                <div className="p-5 space-y-4">
                    {/* Customer Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <User size={12} /> Customer Name *
                            </label>
                            <input
                                value={form.customerName}
                                onChange={e => handleChange('customerName', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium"
                                placeholder="Max Mustermann"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Phone size={12} /> Phone *
                            </label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={e => handleChange('phone', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="+49 170 1234567"
                            />
                        </div>
                    </div>

                    {/* Device Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Smartphone size={12} /> Device Model *
                            </label>
                            <input
                                value={form.deviceModel}
                                onChange={e => handleChange('deviceModel', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium"
                                placeholder="iPhone 15 Pro Max"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Hash size={12} /> IMEI (optional)
                            </label>
                            <input
                                value={form.imei}
                                onChange={e => handleChange('imei', e.target.value.replace(/\D/g, '').slice(0, 15))}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="IMEI Number"
                            />
                        </div>
                    </div>

                    {/* Problem */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                            <FileText size={12} /> Problem Description *
                        </label>
                        <textarea
                            value={form.problem}
                            onChange={e => handleChange('problem', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium resize-none"
                            placeholder="Describe the issue... e.g. Screen broken, battery replacement, water damage..."
                        />
                    </div>

                    {/* Cost & Date */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <DollarSign size={12} /> Estimated Cost (€)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.estimatedCost}
                                onChange={e => handleChange('estimatedCost', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Calendar size={12} /> Expected Delivery
                            </label>
                            <input
                                type="date"
                                value={form.deliveryDate}
                                onChange={e => handleChange('deliveryDate', e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-5 pt-0 flex gap-3">
                    <button
                        onClick={() => handleSave(false)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/20"
                    >
                        <Save size={16} /> Save
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20"
                    >
                        <Printer size={16} /> Save & Print
                    </button>
                </div>
            </div>
        </div>
    );
}
