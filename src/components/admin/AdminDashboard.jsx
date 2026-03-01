import { useOutletContext } from 'react-router-dom';
import SalesmanDashboard from '../../pages/SalesmanDashboard';

export default function AdminDashboard() {
    const { adminDashboardDateSelection } = useOutletContext() || {};
    return <SalesmanDashboard adminView adminDashboardDateSelection={adminDashboardDateSelection} />;
}
