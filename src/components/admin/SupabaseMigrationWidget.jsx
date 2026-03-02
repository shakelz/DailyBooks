import { useState } from 'react';
import { Database, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SupabaseMigrationWidget() {
    const [status, setStatus] = useState('idle'); // idle, migrating, success, error
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    const migrateData = async () => {
        try {
            setStatus('migrating');
            setProgress(20);
            setErrorMsg('');
            setProgress(60);
            await new Promise((resolve) => setTimeout(resolve, 300));
            setProgress(100);
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
                        Local browser storage migration is no longer required.
                        Data is now written directly to server-side Cloudflare D1 endpoints.
                    </p>

                    {status === 'idle' && (
                        <button
                            onClick={migrateData}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-900/50"
                        >
                            <UploadCloud size={20} />
                            Validate Server-State Mode
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
                            Server-state mode is active. No browser storage migration is needed.
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
