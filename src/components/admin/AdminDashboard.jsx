import { useState, useEffect } from 'react';
import AdminTabToolbar from './AdminTabToolbar';
import SalesmanDashboard from '../../pages/SalesmanDashboard';

const STORAGE_KEY = 'dailybooks_admin_dateselection';

function getInitialDateSelection() {
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed[0]?.startDate && parsed[0]?.endDate) {
                const s = new Date(parsed[0].startDate);
                const e = new Date(parsed[0].endDate);
                if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
                    return [
                        {
                            startDate: s,
                            endDate: e,
                            key: parsed[0].key || 'selection',
                        }
                    ];
                }
            }
        }
    } catch {}

    return [
        {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(),
            key: 'selection',
        }
    ];
}

export default function AdminDashboard() {
    const [dateSelection, setDateSelection] = useState(getInitialDateSelection);

    useEffect(() => {
        try {
            if (Array.isArray(dateSelection) && dateSelection[0]?.startDate && dateSelection[0]?.endDate) {
                const serialized = JSON.stringify([
                    {
                        startDate: dateSelection[0].startDate.toISOString(),
                        endDate: dateSelection[0].endDate.toISOString(),
                        key: dateSelection[0].key || 'selection',
                    }
                ]);
                sessionStorage.setItem(STORAGE_KEY, serialized);
                localStorage.setItem(STORAGE_KEY, serialized);
            }
        } catch {}
    }, [dateSelection]);

    return (
        <div className="space-y-4">
            <AdminTabToolbar dateSelection={dateSelection} setDateSelection={setDateSelection} />
            <SalesmanDashboard adminView adminDashboardDateSelection={dateSelection} />
        </div>
    );
}
