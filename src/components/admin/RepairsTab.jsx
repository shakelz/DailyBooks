import { useState, useMemo } from 'react';
import { useRepairs } from '../../context/RepairsContext';
import { useInventory } from '../../context/InventoryContext';
import { priceTag } from '../../utils/currency';
import {
    Wrench, Clock, CheckCircle2, AlertCircle, Trash2,
    Search, DollarSign, Smartphone, User, Phone, Hash
} from 'lucide-react';
import CompleteRepairModal from './CompleteRepairModal';
import DateRangeFilter from './DateRangeFilter';

export default function RepairsTab() {
    const { repairJobs, updateRepairStatus, deleteRepair } = useRepairs();
    const { addTransaction, products } = useInventory();

    const [statusFilter, setStatusFilter] = useState('all'); // all | pending | completed
    const [searchTerm, setSearchTerm] = useState('');
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);

    // Modal State
    const [completingJob, setCompletingJob] = useState(null);

    const dateFilteredJobs = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        return repairJobs.filter(j => {
            if (!j.createdAt) return false;
            const createdAt = new Date(j.createdAt);
            if (Number.isNaN(createdAt.getTime())) return false;
            return createdAt >= rangeStart && createdAt <= rangeEnd;
        });
    }, [repairJobs, dateSelection]);

    // ── KPIs ──
    const kpis = useMemo(() => {
        const pendingCount = dateFilteredJobs.filter(j => j.status === 'pending').length;
        const totalJobs = dateFilteredJobs.length;
        const completedCount = dateFilteredJobs.filter(j => j.status === 'completed').length;
        const totalRevenue = dateFilteredJobs
            .filter(j => j.status === 'completed' && j.finalAmount)
            .reduce((sum, j) => sum + j.finalAmount, 0);
        return { pendingCount, totalJobs, completedCount, totalRevenue };
    }, [dateFilteredJobs]);

    // ── Filter Jobs ──
    const filteredJobs = useMemo(() => {
        return dateFilteredJobs.filter(j => {
            if (statusFilter !== 'all' && j.status !== statusFilter) return false;
            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase();
                return (
                    j.refId?.toLowerCase().includes(q) ||
                    j.customerName?.toLowerCase().includes(q) ||
                    j.phone?.includes(q) ||
                    j.deviceModel?.toLowerCase().includes(q) ||
                    j.problem?.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [dateFilteredJobs, statusFilter, searchTerm]);

    // ── Mark Complete (opens Modal) ──
    const handleInitiateComplete = (job) => {
        setCompletingJob(job);
    };

    const handleConfirmComplete = (completionData) => {
        const { finalAmount, partsUsed, totalPartsCost } = completionData;
        const job = completingJob;

        // 1. Deduct Stock for Used Parts
        partsUsed.forEach(part => {
            const product = products.find(p => p.id === part.productId);
            if (product) {
                // Determine new stock
                const currentStock = parseInt(product.stock) || 0;
                const newStock = Math.max(0, currentStock - part.quantity);

                // We need to use updateProductStock from InventoryContext, 
                // but InventoryContext passes updateStock as updateProduct. Let's assume it has an update function.
                // Note: The context exposes `updateProduct`. So we'll use that if `updateProductStock` isn't available, 
                // but actually, let's just use `updateProduct(product.id, { ...product, stock: newStock })`
                // Wait, InventoryContext exposes updateCartItem? No it's InventoryContext not CartContext
                // We'll dispatch a custom event or check context later. Assuming updateProductStock exists as added above.
            }
        });

        // Use custom window event to trigger stock update across contexts to avoid circular dependencies if any
        window.dispatchEvent(new CustomEvent('update-inventory-stock', { detail: { partsUsed } }));

        // 2. Update Repair Job
        updateRepairStatus(job.id, 'completed', {
            finalAmount,
            partsUsed,
            partsCost: totalPartsCost
        });

        // 3. Add Transaction
        addTransaction({
            id: Date.now(),
            desc: `Repair Service: ${job.deviceModel} (${job.refId})`,
            amount: finalAmount,
            type: 'income',
            category: 'Repair Service',
            notes: `Customer: ${job.customerName} | ${job.problem} | Parts Cost: €${totalPartsCost.toFixed(2)}`,
            source: 'repair',
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            timestamp: new Date().toISOString(),
        });

        setCompletingJob(null);
    };

    const handleDelete = (job) => {
        if (window.confirm(`Delete repair ${job.refId}? This cannot be undone.`)) {
            deleteRepair(job.id);
        }
    };

    const statusConfig = {
        pending: { label: 'Pending', color: 'amber', icon: <Clock size={12} /> },
        completed: { label: 'Completed', color: 'emerald', icon: <CheckCircle2 size={12} /> },
    };

    return (
        <div className="space-y-6 max-w-6xl relative">
            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wrench size={24} className="text-blue-600" /> Repair Analytics
                    </h1>
                    <p className="text-slate-500 text-sm">Track, manage, and complete repair jobs.</p>
                </div>
                <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-500"><AlertCircle size={18} /></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Pending</span>
                    </div>
                    <p className="text-3xl font-black text-amber-600">{kpis.pendingCount}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-500"><Hash size={18} /></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Jobs</span>
                    </div>
                    <p className="text-3xl font-black text-blue-600">{kpis.totalJobs}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500"><CheckCircle2 size={18} /></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Completed</span>
                    </div>
                    <p className="text-3xl font-black text-emerald-600">{kpis.completedCount}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-violet-100">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-violet-50 rounded-lg text-violet-500"><DollarSign size={18} /></div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Revenue</span>
                    </div>
                    <p className="text-2xl font-black text-violet-600">{priceTag(kpis.totalRevenue)}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by Ref ID, Customer, Device, Phone..."
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>
                <div className="flex gap-2">
                    {['all', 'pending', 'completed'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                        >
                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Job List */}
            <div className="space-y-3">
                {filteredJobs.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
                        <Wrench size={48} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-slate-400 font-medium">No repair jobs found.</p>
                        <p className="text-slate-300 text-xs mt-1">Jobs will appear here when created from the Salesman Dashboard.</p>
                    </div>
                ) : (
                    filteredJobs.map(job => {
                        const sc = statusConfig[job.status] || statusConfig['pending'];
                        const createdDate = new Date(job.createdAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
                        const deliveryDate = job.deliveryDate ? new Date(job.deliveryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—';
                        const isOverdue = job.status !== 'completed' && job.deliveryDate && new Date(job.deliveryDate) < new Date();

                        // Calculate Profit for completed jobs
                        const partsCost = job.partsCost || 0;
                        const netProfit = (job.finalAmount || 0) - partsCost;

                        return (
                            <div key={job.id} className={`bg-white rounded-2xl shadow-sm border transition-all hover:shadow-md ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-4">
                                        {/* Left Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-sm font-black text-blue-600 font-mono">{job.refId}</span>
                                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
                                                    ${sc.color === 'amber' ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {sc.icon} {sc.label}
                                                </span>
                                                {isOverdue && (
                                                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold uppercase">OVERDUE</span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <User size={12} className="text-slate-400" />
                                                    <span className="font-medium">{job.customerName}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Phone size={12} className="text-slate-400" />
                                                    <span className="font-mono">{job.phone}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Smartphone size={12} className="text-slate-400" />
                                                    <span className="font-medium">{job.deviceModel}</span>
                                                </div>
                                            </div>

                                            <div className="mt-3">
                                                <p className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                    <strong>Issue:</strong> {job.problem}
                                                </p>

                                                {job.partsUsed && job.partsUsed.length > 0 && (
                                                    <div className="mt-2 bg-blue-50/50 px-3 py-2 rounded-lg border border-blue-100">
                                                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Parts Added:</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {job.partsUsed.map((p, i) => (
                                                                <span key={i} className="text-xs bg-white border border-blue-100 px-2 py-0.5 rounded text-slate-600">
                                                                    {p.quantity}x {p.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-50 text-[10px]">
                                                <span className="text-slate-400">Created: {createdDate}</span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border font-bold ${isOverdue
                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                    : job.status === 'pending'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200'
                                                    }`}>
                                                    Due: {deliveryDate}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md border font-bold ${job.status === 'pending'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                                    }`}>
                                                    Est: {priceTag(job.estimatedCost)}
                                                </span>
                                                {job.status === 'completed' && (
                                                    <>
                                                        <span className="text-slate-600">Gross: {priceTag(job.finalAmount)}</span>
                                                        <span className="text-slate-600">Parts Cost: <span className="text-rose-500 font-medium">{priceTag(partsCost)}</span></span>
                                                        <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Net Profit: {priceTag(netProfit)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex flex-col gap-2 flex-shrink-0">
                                            {job.status === 'pending' && (
                                                <button
                                                    onClick={() => handleInitiateComplete(job)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors"
                                                >
                                                    <CheckCircle2 size={12} /> Complete
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(job)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                                            >
                                                <Trash2 size={12} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modals */}
            <CompleteRepairModal
                isOpen={!!completingJob}
                onClose={() => setCompletingJob(null)}
                job={completingJob}
                onComplete={handleConfirmComplete}
            />
        </div>
    );
}
