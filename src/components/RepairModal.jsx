import { useState } from 'react';
import { X, Printer, Wrench, Phone, User, Smartphone, Hash, FileText, Calendar, DollarSign } from 'lucide-react';
import { useRepairs } from '../context/RepairsContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { printRepairJobBill } from '../utils/printUtils';

export default function RepairModal({ isOpen, onClose }) {
    const { addRepair } = useRepairs();
    const { activeShop } = useAuth();
    const { t } = useLanguage();

    const [form, setForm] = useState({
        customerName: '',
        phone: '',
        deviceModel: '',
        imei: '',
        problem: '',
        notes: '',
        repairPerformer: 'shop', // 'shop' | 'external'
        technicianName: '',
        externalCost: '',
        advanceAmount: '',
        cost: '',
        deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    });
    const [errors, setErrors] = useState({});

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: '' }));
    };

    const resetForm = () => {
        setForm({
            customerName: '',
            phone: '',
            deviceModel: '',
            imei: '',
            problem: '',
            notes: '',
            repairPerformer: 'shop',
            technicianName: '',
            externalCost: '',
            advanceAmount: '',
            cost: '',
            deliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        });
        setErrors({});
    };

    const handleSave = async (shouldPrint = false) => {
        const nextErrors = {};
        if (!form.customerName.trim()) nextErrors.customerName = t('repair.customerNameRequired');
        if (!form.phone.trim()) nextErrors.phone = t('repair.phoneRequired');
        if (!form.deviceModel.trim()) nextErrors.deviceModel = t('repair.deviceModelRequired');
        if (!form.problem.trim()) nextErrors.problem = t('repair.problemRequired');
        if (form.repairPerformer === 'external' && !form.technicianName.trim()) {
            nextErrors.technicianName = 'Please enter technician / shop name';
        }
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }

        try {
            const isExternal = form.repairPerformer === 'external';
            const job = await addRepair({
                customerName: form.customerName.trim(),
                phone: form.phone.trim(),
                deviceModel: form.deviceModel.trim(),
                imei: form.imei.trim(),
                problem: form.problem.trim(),
                notes: form.notes.trim(),
                repairPerformer: form.repairPerformer,
                technicianName: isExternal ? form.technicianName.trim() : '',
                externalCost: isExternal ? (parseFloat(form.externalCost) || 0) : 0,
                deviceLocation: isExternal ? 'sent_to_technician' : 'in_shop',
                sentToTechnicianAt: isExternal ? new Date().toISOString() : null,
                advanceAmount: parseFloat(form.advanceAmount) || 0,
                cost: parseFloat(form.cost) || 0,
                estimatedCost: parseFloat(form.cost) || 0,
                delivery_at: form.deliveryDate,
                deliveryDate: form.deliveryDate,
            });

            if (!job || typeof job !== 'object') {
                throw new Error(t('repair.invalidSaveResponse'));
            }

            const invoiceNumber = String(job?.invoiceNumber || job?.invoice_number || job?.refId || job?.id || '').trim();

            if (shouldPrint) {
                printRepairJobBill({
                    ...job,
                    totalCost: parseFloat(form.cost) || 0,
                    advance: parseFloat(form.advanceAmount) || 0,
                    customerName: form.customerName.trim(),
                    phone: form.phone.trim(),
                    deviceModel: form.deviceModel.trim(),
                    issue: form.problem.trim(),
                    notes: form.notes.trim(),
                    expectedDelivery: form.deliveryDate,
                    status: 'pending'
                }, activeShop);
            } else if (invoiceNumber) {
                alert(`${t('repair.savedInvoice')} ${invoiceNumber}`);
            }

            setTimeout(() => {
                resetForm();
                onClose();
            }, shouldPrint ? 700 : 350);
        } catch (error) {
            console.error('Failed to save/print repair job:', error);
            alert(error?.message || t('repair.saveFailed'));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 rounded-t-3xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Wrench size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">{t('repair.title')}</h2>
                            <p className="text-xs text-blue-200">{t('repair.subtitle')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                        <X size={20} className="text-white" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Performer Selection: My Shop vs External */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                            Repair Done By
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => handleChange('repairPerformer', 'shop')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${form.repairPerformer === 'shop' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                🏪 My Shop (In-House)
                            </button>
                            <button
                                type="button"
                                onClick={() => handleChange('repairPerformer', 'external')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${form.repairPerformer === 'external' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                👤 Other Person / Shop
                            </button>
                        </div>
                    </div>

                    {/* External Technician Details if External */}
                    {form.repairPerformer === 'external' && (
                        <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase mb-1">
                                        <User size={12} /> Technician / Shop Name
                                    </label>
                                    <input
                                        value={form.technicianName}
                                        onChange={(event) => handleChange('technicianName', event.target.value)}
                                        className={`w-full px-3 py-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm font-medium ${errors.technicianName ? 'border-rose-300' : 'border-indigo-200'}`}
                                        placeholder="e.g. Ali Repair / FixMaster"
                                    />
                                    {errors.technicianName && <p className="mt-1 text-[10px] text-rose-600">{errors.technicianName}</p>}
                                </div>
                                <div>
                                    <label className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase mb-1">
                                        <DollarSign size={12} /> Amount Paid to Them (€)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={form.externalCost}
                                        onChange={(event) => handleChange('externalCost', event.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-indigo-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm font-medium font-mono"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <User size={12} /> {t('repair.customerName')}
                            </label>
                            <input
                                value={form.customerName}
                                onChange={(event) => handleChange('customerName', event.target.value)}
                                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium ${errors.customerName ? 'border-rose-300' : 'border-slate-200'}`}
                                placeholder="Max Mustermann"
                            />
                            {errors.customerName && <p className="mt-1 text-[10px] text-rose-600">{errors.customerName}</p>}
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Phone size={12} /> {t('repair.phone')}
                            </label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={(event) => handleChange('phone', event.target.value)}
                                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono ${errors.phone ? 'border-rose-300' : 'border-slate-200'}`}
                                placeholder="+49 170 1234567"
                            />
                            {errors.phone && <p className="mt-1 text-[10px] text-rose-600">{errors.phone}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Smartphone size={12} /> {t('repair.deviceModel')}
                            </label>
                            <input
                                value={form.deviceModel}
                                onChange={(event) => handleChange('deviceModel', event.target.value)}
                                className={`w-full px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium ${errors.deviceModel ? 'border-rose-300' : 'border-slate-200'}`}
                                placeholder="iPhone 15 Pro Max"
                            />
                            {errors.deviceModel && <p className="mt-1 text-[10px] text-rose-600">{errors.deviceModel}</p>}
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Hash size={12} /> {t('repair.imeiOptional')}
                            </label>
                            <input
                                value={form.imei}
                                onChange={(event) => handleChange('imei', event.target.value.replace(/\D/g, '').slice(0, 15))}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="IMEI Number"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <FileText size={12} /> {t('repair.problemDescription')}
                            </label>
                            <textarea
                                value={form.problem}
                                onChange={(event) => handleChange('problem', event.target.value)}
                                rows={2}
                                className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium resize-none ${errors.problem ? 'border-rose-300' : 'border-slate-200'}`}
                                placeholder={t('repair.problemPlaceholder')}
                            />
                            {errors.problem && <p className="mt-1 text-[10px] text-rose-600">{errors.problem}</p>}
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <DollarSign size={12} /> {t('repair.advance')}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.advanceAmount}
                                onChange={(event) => handleChange('advanceAmount', event.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Notes / Important Info */}
                    <div>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                            <FileText size={12} /> Notes / Important Info
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(event) => handleChange('notes', event.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium resize-none"
                            placeholder="Write anything important about this repair job (passcode, accessories left, customer note, etc.)..."
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <DollarSign size={12} /> {t('repair.totalCost')}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.cost}
                                onChange={(event) => handleChange('cost', event.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium font-mono"
                                placeholder="0.00"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase mb-1">
                                <Calendar size={12} /> {t('repair.expectedDelivery')}
                            </label>
                            <input
                                type="date"
                                value={form.deliveryDate}
                                onChange={(event) => handleChange('deliveryDate', event.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-sm font-medium"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-5 pt-0">
                    <button
                        onClick={() => handleSave(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20"
                    >
                        <Printer size={16} /> {t('repair.savePrint')}
                    </button>
                </div>
            </div>
        </div>
    );
}
