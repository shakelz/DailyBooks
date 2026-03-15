import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';
import SalesmanDashboard from '../../pages/SalesmanDashboard';

export default function AdminDashboard() {
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(),
            key: 'selection',
        }
    ]);

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
            </div>
            <SalesmanDashboard adminView adminDashboardDateSelection={dateSelection} />
        </div>
    );
}
