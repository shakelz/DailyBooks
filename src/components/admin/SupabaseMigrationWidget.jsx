import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Database, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SupabaseMigrationWidget() {
    const [status, setStatus] = useState('idle'); // idle, migrating, success, error
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const migrateData = async () => {
        try {
            setStatus('migrating');
            setProgress(10);
            setErrorMsg('');

            // 1. Read Local Storage
            const rawInventory = localStorage.getItem('inventory');
            const rawTxns = localStorage.getItem('transactions');
            const rawRepairs = localStorage.getItem('repairJobs');
            const rawAttendance = localStorage.getItem('attendanceLogs');

            const products = rawInventory ? JSON.parse(rawInventory) : [];
            const txns = rawTxns ? JSON.parse(rawTxns) : [];
            const repairs = rawRepairs ? JSON.parse(rawRepairs) : [];
            const attendance = rawAttendance ? JSON.parse(rawAttendance) : [];

            setProgress(30);

            // 2. Format & Insert Inventory
            if (products.length > 0) {
                const formattedProducts = products.map(p => ({
                    id: String(p.id),
                    name: p.name,
                    purchasePrice: parseFloat(p.purchasePrice || 0),
                    sellingPrice: parseFloat(p.price || p.sellingPrice || 0),
                    stock: parseInt(p.stock || 0),
                    category: p.category?.level1 || p.category || '',
                    barcode: p.barcode || '',
                    productUrl: p.productUrl || '',
                    timestamp: p.timestamp ? new Date(p.timestamp).toISOString() : new Date().toISOString()
                }));
                const { error } = await supabase.from('inventory').upsert(formattedProducts, { onConflict: 'id' });
                if (error) throw new Error('Inventory Insert Failed: ' + error.message);
            }
            setProgress(50);

            // 3. Format & Insert Repairs
            if (repairs.length > 0) {
                const formattedRepairs = repairs.map(r => ({
                    id: String(r.id),
                    refId: r.refId,
                    customerName: r.customerName,
                    phone: r.phone || '',
                    deviceModel: r.deviceModel || '',
                    imei: r.imei || '',
                    problem: r.problem || '',
                    status: r.status || 'pending',
                    estimatedCost: parseFloat(r.estimatedCost || 0),
                    finalAmount: parseFloat(r.finalAmount || 0),
                    partsCost: parseFloat(r.partsCost || 0),
                    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
                    completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
                    partsUsed: r.partsUsed || []
                }));
                const { error } = await supabase.from('repairs').upsert(formattedRepairs, { onConflict: 'id' });
                if (error) throw new Error('Repairs Insert Failed: ' + error.message);
            }
            setProgress(70);

            // 4. Format & Insert Transactions
            // NOTE: Local txns don't have order_id out of the box, we will just insert flat.
            if (txns.length > 0) {
                // Chunk inserting for large transaction histories
                const chunkSize = 200;
                for (let i = 0; i < txns.length; i += chunkSize) {
                    const chunk = txns.slice(i, i + chunkSize);
                    const formattedTxns = chunk.map(t => ({
                        id: String(t.id),
                        desc: t.desc || '',
                        amount: parseFloat(t.amount || 0),
                        type: t.type || '',
                        category: t.category || '',
                        notes: t.notes || '',
                        source: t.source || 'shop',
                        quantity: parseInt(t.quantity || 1),
                        date: t.date || '',
                        time: t.time || '',
                        timestamp: t.timestamp ? new Date(t.timestamp).toISOString() : new Date().toISOString(),
                        isFixedExpense: t.isFixedExpense || false,
                        productId: t.productId ? String(t.productId) : null,
                        workerId: t.workerId || null,
                        salesmanName: t.userName || t.salesmanName || ''
                    }));

                    const { error } = await supabase.from('transactions').upsert(formattedTxns, { onConflict: 'id' });
                    if (error) throw new Error('Transactions Insert Failed: ' + error.message);
                }
            }
            setProgress(85);

            // 5. Format & Insert Attendance
            if (attendance.length > 0) {
                const formattedAttendance = attendance.map(a => ({
                    id: a.id || undefined, // UUID auto-generated if undefined
                    workerId: String(a.workerId),
                    workerName: a.workerName || '',
                    type: a.type || 'IN',
                    timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString(),
                    note: a.note || ''
                }));
                // Bulk insert without replacing exact IDs if they didn't have UUIDs originally
                // If they did have simple string IDs, Supabase UUID primary key might reject them. 
                // We'll insert fresh since it's just a log.
                const { error } = await supabase.from('attendance').insert(formattedAttendance);
                if (error) throw new Error('Attendance Insert Failed: ' + error.message);
            }

            setProgress(100);
            setStatus('success');

        } catch (err) {
            console.error("Migration Error:", err);
            setErrorMsg(err.message);
            setStatus('error');
        }
    };

    return (
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-700/50 mb-8">
            <div className="flex items-start gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                    <Database size={28} />
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1">Migrate Local Data to Supabase</h3>
                    <p className="text-indigo-200 text-sm mb-4">
                        Push your browser's offline database `(localStorage)` to your secure Cloud PostgreSQL Database.
                        Do this exactly ONCE before we switch the system over to Full Cloud.
                    </p>

                    {status === 'idle' && (
                        <button
                            onClick={migrateData}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-900/50"
                        >
                            <UploadCloud size={20} />
                            Start Cloud Migration
                        </button>
                    )}

                    {status === 'migrating' && (
                        <div className="space-y-2 max-w-md">
                            <div className="flex justify-between text-xs font-bold text-indigo-300">
                                <span>Migrating Data...</span>
                                <span>{progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="mt-2 p-4 bg-emerald-500/20 border border-emerald-500/50 rounded-xl flex items-center gap-3 text-emerald-400 font-bold">
                            <CheckCircle2 size={24} />
                            Migration Completed Successfully! You can now switch to the Cloud CRUD Logic.
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="mt-2 p-4 bg-red-500/20 border border-red-500/50 rounded-xl flex items-start gap-3">
                            <AlertCircle size={24} className="text-red-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-red-400">Migration Failed</h4>
                                <p className="text-red-200 text-sm mt-1">{errorMsg}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
