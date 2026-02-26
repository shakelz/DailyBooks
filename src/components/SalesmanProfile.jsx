import { useAuth } from '../context/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

export default function SalesmanProfile({ isOpen, onClose }) {
    const { user, isPunchedIn, handlePunch, logout, attendanceLogs } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const isOnLatestDashboard = location.pathname.includes('/salesman/latest-dashboard');

    // Get last punch time for display
    const todayStr = new Date().toLocaleDateString('en-PK');
    const myLogsToday = attendanceLogs.filter(l => l.date === todayStr && l.userId === user?.id);
    const lastLog = myLogsToday.length > 0 ? myLogsToday[0] : null;

    if (!isOpen) return null;

    const onPunchCommand = (type) => {
        handlePunch(type);
    };

    const handleLogout = () => {
        const result = logout();
        if (result?.success === false) {
            alert(result.message || 'Please Punch OUT before logout.');
            return;
        }
        navigate('/');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* ── Header with Photo ── */}
                <div className={`p-6 flex flex-col items-center transition-colors duration-500 ${isPunchedIn ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-slate-700 to-slate-800'}`}>
                    <div className="w-24 h-24 rounded-full bg-white p-1 shadow-xl mb-3 relative">
                        {user?.photo ? (
                            <img src={user.photo} alt={user.name} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-3xl">
                                👨‍💼
                            </div>
                        )}
                        {/* Status Indicator Pulse */}
                        <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${isPunchedIn ? 'bg-green-500' : 'bg-red-500'}`}>
                            {isPunchedIn && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75"></span>}
                        </div>
                    </div>
                    <h2 className="text-xl font-bold text-white">{user?.name || 'Salesman'}</h2>
                    <p className="text-white/70 text-sm font-medium">Sales Executive • DailyBooks</p>

                    {/* Status Badge */}
                    <div className={`mt-4 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 ${isPunchedIn ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-red-500/20 text-red-100 border border-red-400/30'}`}>
                        {isPunchedIn ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                Punched In at {lastLog?.time}
                            </>
                        ) : (
                            '🔴 Currently Offline'
                        )}
                    </div>
                </div>

                <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {/* Punch In */}
                    <button
                        onClick={() => onPunchCommand('IN')}
                        disabled={isPunchedIn}
                        className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 ${isPunchedIn
                            ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-green-50 border-green-100 text-green-600 hover:bg-green-100 hover:scale-105 shadow-sm'
                            }`}
                    >
                        <span className="text-3xl">🟢</span>
                        <span className="font-bold text-sm">Punch IN</span>
                    </button>

                    {/* Punch Out */}
                    <button
                        onClick={() => onPunchCommand('OUT')}
                        disabled={!isPunchedIn}
                        className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 ${!isPunchedIn
                            ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100 hover:scale-105 shadow-sm'
                            }`}
                    >
                        <span className="text-3xl">🔴</span>
                        <span className="font-bold text-sm">Punch OUT</span>
                    </button>

                    {/* Switch User */}
                    <button
                        onClick={() => {
                            const result = logout();
                            if (result?.success === false) {
                                alert(result.message || 'Please Punch OUT before switching user.');
                                return;
                            }
                            navigate('/');
                        }}
                        className="h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-blue-200 hover:text-blue-600 hover:shadow-md"
                    >
                        <span className="text-3xl">🔄</span>
                        <span className="font-bold text-sm">Switch User</span>
                    </button>

                    <button
                        onClick={() => {
                            navigate(isOnLatestDashboard ? '/salesman' : '/salesman/latest-dashboard');
                            onClose?.();
                        }}
                        className="h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100 hover:scale-105 shadow-sm"
                    >
                        <span className="text-3xl">{isOnLatestDashboard ? '✨' : '🕘'}</span>
                        <span className="font-bold text-sm">{isOnLatestDashboard ? 'New Dashboard' : 'Old Dashboard'}</span>
                    </button>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 bg-red-50 border-red-100 text-red-600 hover:bg-red-100 hover:scale-105 shadow-sm"
                    >
                        <span className="text-3xl">🚪</span>
                        <span className="font-bold text-sm">Logout</span>
                    </button>
                </div>

                <div className="p-4 pt-0">
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm hover:bg-slate-200 transition-colors">
                        Close Menu
                    </button>
                </div>
            </div>
        </div>
    );
}
