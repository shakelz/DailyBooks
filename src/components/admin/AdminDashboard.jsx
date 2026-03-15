import { useState } from 'react';
import AdminTabToolbar from './AdminTabToolbar';
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
            <AdminTabToolbar dateSelection={dateSelection} setDateSelection={setDateSelection} />
            <SalesmanDashboard adminView adminDashboardDateSelection={dateSelection} />
        </div>
    );
}
