import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SALESMAN_LOGIN_PATH = '/terminal-access-v1'
const ADMIN_LOGIN_PATH = '/management-portal-v1'
const SALESMAN_DASHBOARD_PATH = `${SALESMAN_LOGIN_PATH}/dashboard`

function normalizeRole(value = '') {
    const role = String(value || '').trim().toLowerCase()
    if (role === 'superadmin' || role === 'superuser') return 'super_admin'
    if (role === 'admin') return 'owner'
    return role
}

function adminTargetByRole(role = '') {
    return normalizeRole(role) === 'super_admin' ? `${ADMIN_LOGIN_PATH}/dashboard` : `${ADMIN_LOGIN_PATH}/owner-dashboard`
}

export default function LoginPage({ mode = 'salesman' }) {
    const navigate = useNavigate()
    const location = useLocation()
    const {
        login,
        role: authRole,
        user: authUser,
        authLoading,
        fetchPublicShops,
        shops,
    } = useAuth()
    const STATION_STORAGE_KEY = 'dailybooks_station_shop_id'
    const [stationShopId, setStationShopId] = useState(() => {
        try {
            return localStorage.getItem(STATION_STORAGE_KEY) || ''
        } catch {
            return ''
        }
    })
    const [stationShops, setStationShops] = useState([])
    const [showStationPicker, setShowStationPicker] = useState(false)
    const [matchedShopOptions, setMatchedShopOptions] = useState([])
    const [showShopSelectModal, setShowShopSelectModal] = useState(false)
    const [pendingPin, setPendingPin] = useState('')
    const isAdminMode = mode === 'admin'

    const [pin, setPin] = useState('')
    const [error, setError] = useState('')
    const [pinLoading, setPinLoading] = useState(false)

    const [adminUser, setAdminUser] = useState('')
    const [adminPass, setAdminPass] = useState('')
    const [showPass, setShowPass] = useState(false)
    const [adminError, setAdminError] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (authLoading) return
        if (!authUser || !authRole) return

        const normalizedRole = normalizeRole(authRole)
        if (normalizedRole === 'salesman') {
            navigate(SALESMAN_DASHBOARD_PATH, { replace: true })
            return
        }

        if (normalizedRole === 'super_admin' || normalizedRole === 'owner') {
            navigate(adminTargetByRole(normalizedRole), { replace: true })
            return
        }

        navigate(isAdminMode ? ADMIN_LOGIN_PATH : SALESMAN_LOGIN_PATH, { replace: true })
    }, [authLoading, authRole, authUser, isAdminMode, navigate])

    useEffect(() => {
        let active = true
        const loadShops = async () => {
            if (typeof fetchPublicShops === 'function') {
                const list = await fetchPublicShops()
                if (active && Array.isArray(list) && list.length > 0) {
                    setStationShops(list)
                }
            }
        }
        loadShops()
        return () => { active = false }
    }, [fetchPublicShops])

    useEffect(() => {
        if (location.pathname === '/login') {
            try {
                sessionStorage.setItem('dailybooks_login_origin', 'carefone');
                localStorage.setItem('dailybooks_login_origin', 'carefone');
            } catch {
                // Storage may be restricted
            }
        } else if (location.pathname === SALESMAN_LOGIN_PATH) {
            try {
                sessionStorage.setItem('dailybooks_login_origin', 'terminal');
                localStorage.setItem('dailybooks_login_origin', 'terminal');
            } catch {
                // Storage may be restricted
            }
        }
    }, [location.pathname])

    const handlePinInput = useCallback(async (digit) => {
        if (authLoading || pinLoading || isAdminMode) return
        if (pin.length >= 4) return

        const newPin = pin + digit
        setPin(newPin)
        setError('')

        if (newPin.length !== 4) return

        setPinLoading(true)
        try {
            const targetShopId = stationShopId || undefined
            const result = await login({ role: 'salesman', pin: newPin, shopId: targetShopId })
            if (result?.success) {
                navigate(result?.redirectTo || SALESMAN_DASHBOARD_PATH, { replace: true })
                return
            }

            if (result?.needsShopSelection) {
                setPendingPin(newPin)
                setMatchedShopOptions(result.matchedShops || [])
                setShowShopSelectModal(true)
                return
            }

            setError(result?.message || 'Invalid PIN. Try again.')
            setTimeout(() => {
                setPin('')
                setError('')
            }, 1200)
        } finally {
            setPinLoading(false)
        }
    }, [authLoading, isAdminMode, login, navigate, pin, pinLoading])

    const handleBackspace = useCallback(() => {
        if (pinLoading || isAdminMode) return
        setPin((prev) => prev.slice(0, -1))
        setError('')
    }, [isAdminMode, pinLoading])

    useEffect(() => {
        if (isAdminMode) return undefined

        const handleKeyDown = (event) => {
            if (event.key >= '0' && event.key <= '9') {
                handlePinInput(event.key)
                return
            }
            if (event.key === 'Backspace') {
                handleBackspace()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleBackspace, handlePinInput, isAdminMode])

    const handleAdminLogin = async (event) => {
        event.preventDefault()
        if (authLoading || isLoading) return
        setAdminError('')

        const identifier = adminUser.trim()
        const password = adminPass.trim()
        if (!identifier) {
            setAdminError('Email is required.')
            return
        }
        if (!password) {
            setAdminError('Password is required.')
            return
        }

        setIsLoading(true)
        try {
            const result = await login({
                role: 'admin',
                identifier,
                password,
            })

            if (result?.success) {
                const target = result.redirectTo || (ADMIN_LOGIN_PATH + '/dashboard')
                navigate(target, { replace: true })
                return
            }

            setAdminError(result?.message || 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre Eingaben.')
        } catch (error) {
            setAdminError(error?.message || 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre Eingaben.')
        } finally {
            setIsLoading(false)
        }
    }

    if (isAdminMode) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
                <div className="w-full max-w-sm">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/30 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white">Login</h2>
                        <p className="text-slate-400 text-sm mt-1">Email + Password</p>
                    </div>

                    <form onSubmit={handleAdminLogin} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={adminUser}
                                    onChange={(event) => { setAdminUser(event.target.value); setAdminError('') }}
                                    placeholder="owner@example.com"
                                    id="admin-identifier"
                                    autoComplete="username"
                                    className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={adminPass}
                                    onChange={(event) => { setAdminPass(event.target.value); setAdminError('') }}
                                    placeholder="........"
                                    id="admin-password"
                                    autoComplete="current-password"
                                    className="w-full pl-11 pr-12 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <button
                                    type="button"
                                    onClick={() => setShowPass((prev) => !prev)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors cursor-pointer"
                                >
                                    {showPass ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {adminError ? (
                            <p className="text-center text-red-400 text-sm animate-pulse font-medium">{adminError}</p>
                        ) : null}

                        <button
                            type="submit"
                            disabled={isLoading}
                            id="admin-submit-btn"
                            className={`w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-all duration-300 cursor-pointer ${isLoading
                                ? 'bg-blue-500/50 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 hover:shadow-xl hover:shadow-blue-500/25 active:scale-[0.98]'
                                }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Logging in...
                                </span>
                            ) : (
                                'Login'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    const availableShops = (Array.isArray(stationShops) && stationShops.length > 0)
        ? stationShops
        : (Array.isArray(shops) ? shops : [])

    const currentStationShop = availableShops.find((s) => String(s.id) === String(stationShopId)) || null

    const handleSelectStation = (selectedId) => {
        try {
            if (selectedId) {
                localStorage.setItem(STATION_STORAGE_KEY, selectedId)
            } else {
                localStorage.removeItem(STATION_STORAGE_KEY)
            }
        } catch {
            // Storage restricted
        }
        setStationShopId(selectedId)
        setShowStationPicker(false)
    }

    const handleDisambiguateShop = async (chosenShopId) => {
        handleSelectStation(chosenShopId)
        setShowShopSelectModal(false)
        setPinLoading(true)
        try {
            const result = await login({ role: 'salesman', pin: pendingPin, shopId: chosenShopId })
            if (result?.success) {
                navigate(result?.redirectTo || SALESMAN_DASHBOARD_PATH, { replace: true })
                return
            }
            setError(result?.message || 'Invalid PIN. Try again.')
            setTimeout(() => {
                setPin('')
                setError('')
            }, 1200)
        } finally {
            setPinLoading(false)
        }
    }

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/30 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Salesman Login</h2>
                    <p className="text-slate-400 text-sm mt-1">Enter your 4-digit PIN</p>
                </div>

                {/* Station / Shop badge */}
                <div className="mb-6 flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-slate-300 shadow-inner">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Station / Shop</p>
                            <p className="text-xs font-bold text-white truncate">
                                {currentStationShop?.name || (availableShops.length > 0 ? 'Not Assigned (Auto-Detect)' : 'Main Branch')}
                            </p>
                        </div>
                    </div>
                    {availableShops.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setShowStationPicker(true)}
                            className="px-3 py-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-xl border border-emerald-500/30 transition-all cursor-pointer shrink-0"
                        >
                            {stationShopId ? 'Switch' : 'Select'}
                        </button>
                    )}
                </div>

                <div className="flex justify-center gap-4 mb-8">
                    {[0, 1, 2, 3].map((index) => (
                        <div
                            key={index}
                            className={`w-4 h-4 rounded-full transition-all duration-200 ${index < pin.length
                                ? error
                                    ? 'bg-red-500 shadow-lg shadow-red-500/50 scale-110'
                                    : 'bg-emerald-400 shadow-lg shadow-emerald-400/50 scale-110'
                                : 'bg-slate-700 border-2 border-slate-600'
                                }`}
                        />
                    ))}
                </div>

                {error ? (
                    <p className="text-center text-red-400 text-sm mb-4 animate-pulse font-medium">{error}</p>
                ) : null}

                <div className="grid grid-cols-3 gap-3 mb-3">
                    {digits.map((digit) => (
                        <button
                            key={digit}
                            onClick={() => handlePinInput(String(digit))}
                            id={`pin-btn-${digit}`}
                            className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700/80 hover:border-slate-600 active:scale-95 transition-all duration-150 backdrop-blur-sm cursor-pointer"
                        >
                            {digit}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <button
                        type="button"
                        onClick={handleBackspace}
                        id="pin-btn-backspace"
                        className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:bg-slate-700/80 hover:text-white active:scale-95 transition-all duration-150 flex items-center justify-center cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePinInput('0')}
                        id="pin-btn-0"
                        className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700/80 hover:border-slate-600 active:scale-95 transition-all duration-150 backdrop-blur-sm cursor-pointer"
                    >
                        0
                    </button>
                    <div className="h-16" />
                </div>

                <div className="mt-4 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3">
                    <button
                        type="button"
                        id="admin-portal-cta"
                        onClick={() => {
                            try {
                                sessionStorage.setItem('dailybooks_login_origin', 'terminal');
                                localStorage.setItem('dailybooks_login_origin', 'terminal');
                            } catch {
                                // Storage may be restricted
                            }
                            navigate(ADMIN_LOGIN_PATH);
                        }}
                        className="w-full rounded-xl border border-blue-400/40 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-all hover:from-blue-500 hover:to-cyan-400"
                    >
                        Admin Portal
                    </button>
                    <p className="mt-2 text-center text-[11px] text-slate-400">For authorized management access only.</p>
                </div>
                {/* Station Picker Modal */}
                {showStationPicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                <div>
                                    <h3 className="text-base font-bold text-white">Select Shop Station</h3>
                                    <p className="text-xs text-slate-400">Lock this computer to a specific branch</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowStationPicker(false)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {availableShops.map((shop) => (
                                    <button
                                        key={shop.id}
                                        type="button"
                                        onClick={() => handleSelectStation(shop.id)}
                                        className={`w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between ${
                                            String(shop.id) === String(stationShopId)
                                                ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                                                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                                        }`}
                                    >
                                        <div>
                                            <p className="text-sm font-bold">{shop.name}</p>
                                            {shop.address && <p className="text-[11px] text-slate-400">{shop.address}</p>}
                                        </div>
                                        {String(shop.id) === String(stationShopId) && (
                                            <span className="text-xs font-black text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded-lg">Active</span>
                                        )}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => handleSelectStation('')}
                                    className="w-full p-2.5 rounded-xl border border-dashed border-slate-700 text-center text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                                >
                                    Clear (Auto-detect on login)
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Multiple Shops Disambiguation Modal */}
                {showShopSelectModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
                        <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-white shadow-2xl space-y-4">
                            <div>
                                <h3 className="text-base font-bold text-white">Which shop are you opening?</h3>
                                <p className="text-xs text-slate-400 mt-1">This PIN is active in multiple shops. Select your shop:</p>
                            </div>

                            <div className="space-y-2">
                                {matchedShopOptions.map((shop) => (
                                    <button
                                        key={shop.id}
                                        type="button"
                                        onClick={() => handleDisambiguateShop(shop.id)}
                                        className="w-full p-3.5 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-emerald-950/50 hover:border-emerald-500/50 text-left transition-all group"
                                    >
                                        <p className="text-sm font-bold text-white group-hover:text-emerald-300">{shop.name}</p>
                                        {shop.address && <p className="text-[11px] text-slate-400">{shop.address}</p>}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => { setShowShopSelectModal(false); setPin(''); setError(''); }}
                                className="w-full py-2 text-center text-xs text-slate-500 hover:text-slate-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
