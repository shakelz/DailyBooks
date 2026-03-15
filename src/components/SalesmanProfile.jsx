import { useRef, useState } from 'react';
import { Camera, Languages, LogIn, LogOut, Power, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

async function fileToProfileDataUrl(file) {
    const imageUrl = URL.createObjectURL(file);
    try {
        const bitmap = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Invalid image file.'));
            image.src = imageUrl;
        });

        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width || maxSide, bitmap.height || maxSide));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((bitmap.width || maxSide) * scale));
        canvas.height = Math.max(1, Math.round((bitmap.height || maxSide) * scale));

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Unable to process selected image.');
        }

        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
        URL.revokeObjectURL(imageUrl);
    }
}

export default function SalesmanProfile({ isOpen, onClose }) {
    const {
        user,
        isPunchedIn,
        isAttendanceActionPending,
        punchIn,
        punchOut,
        logout,
        attendanceLogs,
        updateCurrentUserProfile,
    } = useAuth();
    const { language, setLanguage, t } = useLanguage();
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [isPhotoBusy, setIsPhotoBusy] = useState(false);
    const [photoFeedback, setPhotoFeedback] = useState('');
    const [photoError, setPhotoError] = useState('');

    const salesmanLoginPath = '/terminal-access-v1';

    const todayStr = new Date().toLocaleDateString('en-PK');
    const myLogsToday = attendanceLogs.filter((log) => log.date === todayStr && log.userId === user?.id);
    const lastLog = myLogsToday.length > 0 ? myLogsToday[0] : null;

    if (!isOpen) return null;

    const onPunchCommand = (type) => {
        const normalizedType = String(type || '').toUpperCase();
        if (normalizedType === 'IN') {
            punchIn();
            return;
        }
        if (normalizedType === 'OUT') {
            punchOut();
        }
    };

    const handleLogout = () => {
        const result = logout();
        if (result?.success === false) {
            alert(result.message || t('profile.punchOutBeforeLogout'));
            return;
        }
        navigate(result?.redirectTo || salesmanLoginPath);
    };

    const handlePhotoSelection = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        setPhotoFeedback('');
        setPhotoError('');

        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            setPhotoError(t('profile.photoTypeError'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setPhotoError(t('profile.photoSizeError'));
            return;
        }

        setIsPhotoBusy(true);
        try {
            const photoDataUrl = await fileToProfileDataUrl(file);
            await updateCurrentUserProfile({ profileImage: photoDataUrl });
            setPhotoFeedback(t('profile.photoUpdated'));
        } catch (error) {
            console.error('Failed to update profile photo:', error);
            setPhotoError(error?.message || t('profile.photoSaveError'));
        } finally {
            setIsPhotoBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className={`p-6 flex flex-col items-center transition-colors duration-500 ${isPunchedIn ? 'bg-gradient-to-br from-emerald-600 to-teal-700' : 'bg-gradient-to-br from-slate-700 to-slate-800'}`}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handlePhotoSelection}
                    />

                    <div className="w-24 h-24 rounded-full bg-white p-1 shadow-xl mb-3 relative">
                        {user?.photo ? (
                            <img src={user.photo} alt={user?.name || t('profile.fallbackName')} className="w-full h-full rounded-full object-cover" />
                        ) : (
                            <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-3xl">
                                U
                            </div>
                        )}
                        <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${isPunchedIn ? 'bg-green-500' : 'bg-red-500'}`}>
                            {isPunchedIn && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75"></span>}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isPhotoBusy}
                        className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        <Camera size={14} />
                        {isPhotoBusy
                            ? t('profile.photoUploading')
                            : (user?.photo ? t('profile.photoUpdate') : t('profile.photoUpload'))}
                    </button>

                    <h2 className="text-xl font-bold text-white">{user?.name || t('profile.fallbackName')}</h2>
                    <p className="text-white/70 text-sm font-medium">{t('profile.roleSubtitle')}</p>

                    <div className={`mt-4 px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 ${isPunchedIn ? 'bg-white/20 text-white backdrop-blur-sm' : 'bg-red-500/20 text-red-100 border border-red-400/30'}`}>
                        {isPunchedIn ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                {t('profile.punchedInAt')} {lastLog?.time}
                            </>
                        ) : (
                            <>
                                <span className="w-2 h-2 rounded-full bg-red-300" />
                                {t('profile.currentlyOffline')}
                            </>
                        )}
                    </div>

                    {(photoFeedback || photoError) && (
                        <p className={`mt-3 text-center text-xs font-semibold ${photoError ? 'text-rose-200' : 'text-emerald-100'}`}>
                            {photoError || photoFeedback}
                        </p>
                    )}
                </div>

                <div className="p-5 grid grid-cols-2 gap-3">
                    <button
                        onClick={() => onPunchCommand('IN')}
                        disabled={isPunchedIn || isAttendanceActionPending}
                        className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 ${(isPunchedIn || isAttendanceActionPending)
                            ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-green-50 border-green-100 text-green-600 hover:bg-green-100 hover:scale-105 shadow-sm'
                            }`}
                    >
                        <span className="flex items-center justify-center">
                            <LogIn size={30} strokeWidth={2.4} />
                        </span>
                        <span className="font-bold text-sm">{t('profile.punchIn')}</span>
                    </button>

                    <button
                        onClick={() => onPunchCommand('OUT')}
                        disabled={!isPunchedIn || isAttendanceActionPending}
                        className={`h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 ${(!isPunchedIn || isAttendanceActionPending)
                            ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-red-50 border-red-100 text-red-600 hover:bg-red-100 hover:scale-105 shadow-sm'
                            }`}
                    >
                        <span className="flex items-center justify-center">
                            <LogOut size={30} strokeWidth={2.4} />
                        </span>
                        <span className="font-bold text-sm">{t('profile.punchOut')}</span>
                    </button>

                    <button
                        onClick={() => {
                            const result = logout();
                            if (result?.success === false) {
                                alert(result.message || t('profile.punchOutBeforeSwitch'));
                                return;
                            }
                            navigate(result?.redirectTo || salesmanLoginPath);
                        }}
                        className="h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-blue-200 hover:text-blue-600 hover:shadow-md"
                    >
                        <span className="flex items-center justify-center">
                            <Users size={30} strokeWidth={2.2} />
                        </span>
                        <span className="font-bold text-sm">{t('profile.switchUser')}</span>
                    </button>

                    <button
                        onClick={handleLogout}
                        className="h-24 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all p-3 border-2 bg-red-50 border-red-100 text-red-600 hover:bg-red-100 hover:scale-105 shadow-sm"
                    >
                        <span className="flex items-center justify-center">
                            <Power size={28} strokeWidth={2.4} />
                        </span>
                        <span className="font-bold text-sm">{t('profile.logout')}</span>
                    </button>
                </div>

                <div className="px-5 pb-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                            <Languages size={16} />
                            {t('profile.language')}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{t('profile.languageHint')}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setLanguage('en')}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${language === 'en' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
                            >
                                {t('profile.english')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setLanguage('de')}
                                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${language === 'de' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
                            >
                                {t('profile.german')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-0">
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold text-sm hover:bg-slate-200 transition-colors">
                        {t('profile.closeMenu')}
                    </button>
                </div>
            </div>
        </div>
    );
}
