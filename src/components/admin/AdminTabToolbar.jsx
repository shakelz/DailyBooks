import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import DateRangeFilter from './DateRangeFilter';

export default function AdminTabToolbar({ dateSelection, setDateSelection, className = '' }) {
    const { role, isSuperAdmin, activeShopId, setActiveShopId, shops = [] } = useAuth();

    return (
        <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-end ${className}`.trim()}>
            {isSuperAdmin ? (
                <div className="w-full sm:w-auto sm:min-w-[330px]">
                    <div className="relative rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div className="pr-8">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Shop wechseln</p>
                            <select
                                value={activeShopId || ''}
                                onChange={(event) => setActiveShopId(event.target.value)}
                                className="mt-1 w-full appearance-none bg-transparent pr-6 text-base font-bold text-slate-700 outline-none"
                                style={{ fontSize: 16, fontWeight: 700 }}
                            >
                                {role === 'super_admin' ? (
                                    <option value="" style={{ fontSize: 16, fontWeight: 500 }}>Globale Ansicht (Alle Shops)</option>
                                ) : null}
                                {shops.length === 0 ? (
                                    <option value="" style={{ fontSize: 16, fontWeight: 500 }}>Keine Shops</option>
                                ) : (
                                    shops.map((shop) => (
                                        <option key={shop.id} value={shop.id} style={{ fontSize: 16, fontWeight: 500 }}>
                                            {shop.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                        <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                </div>
            ) : null}
            <div className="w-full sm:w-auto sm:min-w-[360px]">
                <DateRangeFilter
                    dateSelection={dateSelection}
                    setDateSelection={setDateSelection}
                    className="w-full justify-between"
                />
            </div>
        </div>
    );
}
