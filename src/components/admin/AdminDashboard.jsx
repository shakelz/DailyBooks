import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import DateRangeFilter from './DateRangeFilter';
import SalesmanDashboard from '../../pages/SalesmanDashboard';

export default function AdminDashboard() {
    const { setAdminTopBarContent } = useOutletContext() || {};
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setHours(0, 0, 0, 0)),
            endDate: new Date(),
            key: 'selection',
        }
    ]);

    useEffect(() => {
        if (!setAdminTopBarContent) return undefined;

        setAdminTopBarContent(
            <DateRangeFilter
                dateSelection={dateSelection}
                setDateSelection={setDateSelection}
                className="w-full justify-between"
            />
        );

        return () => setAdminTopBarContent(null);
    }, [dateSelection, setAdminTopBarContent]);

    return (
        <div className="space-y-4">
            <SalesmanDashboard adminView adminDashboardDateSelection={dateSelection} />
        </div>
    );
}
