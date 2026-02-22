import { useState, useMemo, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Package, TrendingUp, Settings,
    LogOut, ChevronLeft, ChevronRight, Menu, FileText, Wrench
} from 'lucide-react';

export default function AdminPanel() {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout, role, isAdminLike, isSuperAdmin, activeShopId, setActiveShopId, shops } = useAuth();
    const [isMobile, setIsMobile] = useState(() => (
        typeof window !== 'undefined' ? window.innerWidth < 768 : false
    ));
    const [sidebarOpen, setSidebarOpen] = useState(() => (
        typeof window !== 'undefined' ? window.innerWidth >= 768 : true
    ));

    const currentShop = useMemo(
        () => shops.find((s) => String(s.id) === String(activeShopId)) || null,
        [shops, activeShopId]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const applyMode = (mobile) => {
            setIsMobile(mobile);
            setSidebarOpen(!mobile);
        };

        applyMode(mediaQuery.matches);

        const onChange = (event) => applyMode(event.matches);
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', onChange);
            return () => mediaQuery.removeEventListener('change', onChange);
        }

        mediaQuery.addListener(onChange);
        return () => mediaQuery.removeListener(onChange);
    }, []);

    useEffect(() => {
        if (isMobile) {
            setSidebarOpen(false);
        }
    }, [location.pathname, isMobile]);

    if (!isAdminLike) {
        return <Navigate to={role === 'salesman' ? '/salesman' : '/'} replace />;
    }

    const menuItems = [
        { label: 'Dashboard', route: '/admin/dashboard', icon: <LayoutDashboard size={20} /> },
        { label: 'Inventory', route: '/admin/inventory', icon: <Package size={20} /> },
        { label: 'Insights', route: '/admin/insights', icon: <TrendingUp size={20} /> },
        { label: 'Repairs', route: '/admin/repairs', icon: <Wrench size={20} /> },
        { label: 'Expenses', route: '/admin/expenses', icon: <FileText size={20} /> },
        (role !== 'salesman') ? { label: 'Settings', route: '/admin/settings', icon: <Settings size={20} /> } : null,
    ].filter(Boolean);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const navigateTo = (route) => {
        navigate(route);
        if (isMobile) setSidebarOpen(false);
    };

    const showSidebarLabels = isMobile || sidebarOpen;

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {isMobile && sidebarOpen && (
                <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setSidebarOpen(false)}
                    className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] z-30 md:hidden"
                />
            )}

            <aside
                className={`${isMobile
                    ? `fixed inset-y-0 left-0 w-72 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
                    : `${sidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300`
                    } bg-slate-900 text-white flex flex-col shadow-xl z-40`}
            >

                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
                    {showSidebarLabels ? (
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

                <nav className="flex-1 py-6 px-3 space-y-1">
                    {menuItems.map((item) => {
                        const isActive = location.pathname.startsWith(item.route);
                        return (
                            <button
                                key={item.route}
                                onClick={() => navigateTo(item.route)}
                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group
                                    ${isActive
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    } ${!showSidebarLabels && 'justify-center'}`}
                            >
                                <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                    {item.icon}
                                </span>
                                {showSidebarLabels && <span className="font-medium text-sm">{item.label}</span>}
                                {!showSidebarLabels && isActive && <div className="absolute left-16 bg-slate-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">{item.label}</div>}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={handleLogout}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-red-400 hover:bg-slate-800 hover:text-red-300 transition-all ${!showSidebarLabels && 'justify-center'}`}
                    >
                        <LogOut size={20} />
                        {showSidebarLabels && <span className="font-medium text-sm">Logout</span>}
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">

                <div className="md:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
                    <div>
                        <div className="font-bold text-slate-800">DailyBooks</div>
                        {currentShop && (
                            <div className="text-[10px] text-slate-400 font-semibold">{currentShop.name}</div>
                        )}
                    </div>
                    <button onClick={() => setSidebarOpen((prev) => !prev)} className="p-2 text-slate-600">
                        <Menu size={24} />
                    </button>
                </div>

                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="hidden md:flex absolute top-4 left-4 z-10 w-8 h-8 bg-white border border-slate-200 text-slate-500 rounded-lg items-center justify-center hover:bg-slate-50 hover:text-blue-600 shadow-sm transition-all"
                    style={{ left: -16 }}
                >
                    {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>

                <main className="flex-1 overflow-auto p-4 md:p-8 relative">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
                            {isSuperAdmin ? (
                                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Switch Shop</span>
                                    <select
                                        value={activeShopId || ''}
                                        onChange={(e) => setActiveShopId(e.target.value)}
                                        className="text-sm font-semibold text-slate-700 bg-transparent outline-none"
                                    >
                                        {shops.length === 0 ? (
                                            <option value="">No Shops</option>
                                        ) : (
                                            shops.map((shop) => (
                                                <option key={shop.id} value={shop.id}>
                                                    {shop.name}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
