import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Package, TrendingUp, Settings,
    LogOut, ChevronLeft, ChevronRight, Menu, FileText, Wrench
} from 'lucide-react';

export default function AdminPanel() {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, role } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const menuItems = [
        { label: 'Dashboard', route: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Inventory', route: '/admin/inventory', icon: <Package size={20} /> },
        { label: 'Insights', route: '/admin/insights', icon: <TrendingUp size={20} /> },
        { label: 'Repairs', route: '/admin/repairs', icon: <Wrench size={20} /> },
        { label: 'Expenses', route: '/admin/expenses', icon: <FileText size={20} /> },
        { label: 'Settings', route: '/admin/settings', icon: <Settings size={20} /> },
    ].filter(Boolean);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* ── Sidebar ── */}
            <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-white transition-all duration-300 flex flex-col shadow-xl z-20`}>

                {/* Header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
                    {sidebarOpen ? (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold">C</div>
                            <span className="font-bold text-lg tracking-tight">Daily<span className="text-cyan-400">Books</span></span>
                        </div>
                    ) : (
                        <div className="w-full flex justify-center">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold">C</div>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-6 px-3 space-y-1">
                    {menuItems.map((item) => {
                        const isActive = location.pathname.startsWith(item.route);
                        return (
                            <button
                                key={item.route}
                                onClick={() => navigate(item.route)}
                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    } ${!sidebarOpen && 'justify-center'}`}
                            >
                                <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                    {item.icon}
                                </span>
                                {sidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
                                {!sidebarOpen && isActive && <div className="absolute left-16 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">{item.label}</div>}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer / Logout */}
                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-400 hover:bg-slate-800 hover:text-red-300 transition-all ${!sidebarOpen && 'justify-center'}`}
                    >
                        <LogOut size={20} />
                        {sidebarOpen && <span className="font-medium text-sm">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

                {/* Top Mobile Bar (only visible on small screens) */}
                <div className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
                    <div className="font-bold text-slate-800">DailyBooks</div>
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-slate-600">
                        <Menu size={24} />
                    </button>
                </div>

                {/* Desktop Toggle Button (Absolute) */}
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="hidden md:flex absolute top-4 left-4 z-10 w-8 h-8 bg-white border border-slate-200 text-slate-500 rounded-lg items-center justify-center hover:bg-slate-50 hover:text-blue-600 shadow-sm transition-all"
                    style={{ left: -16 }} // Sneaky overlapping button? Maybe just put it in header.
                >
                    {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>

                {/* Scrollable Content Area */}
                <main className="flex-1 overflow-auto p-4 md:p-8 relative">
                    <div className="max-w-7xl mx-auto">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
