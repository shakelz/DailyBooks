import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ComingSoonPage({ title = 'Coming Soon', icon = '🚧' }) {
    const navigate = useNavigate();
    const { role } = useAuth();
    const isAdmin = role === 'admin';

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
            <div className="text-center max-w-md">
                <div className="text-7xl mb-6 animate-bounce">{icon}</div>
                <h1 className="text-3xl font-bold text-white mb-3">{title}</h1>
                <p className="text-slate-400 text-sm mb-8">
                    Ye feature jaldi aa raha hai! Hum is par kaam kar rahe hain.
                </p>
                <button
                    onClick={() => navigate('/dashboard')}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold hover:from-blue-600 hover:to-cyan-500 active:scale-95 transition-all cursor-pointer shadow-lg shadow-blue-500/25"
                >
                    ← Back to Dashboard
                </button>
            </div>
        </div>
    );
}
