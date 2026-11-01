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
        logout,
        role: authRole,
        user: authUser,
        authLoading,
        fetchPublicShops,
        shops,
    } = useAuth()
    const STATION_STORAGE_KEY = 'dailybooks_station_shop_id_v3'
    const [stationShopId, setStationShopId] = useState(() => {
        try {
            localStorage.removeItem('dailybooks_station_shop_id')
            localStorage.removeItem('dailybooks_station_shop_id_v2')
            localStorage.removeItem('dailybooks_station_shop')
            return localStorage.getItem(STATION_STORAGE_KEY) || ''
        } catch {
            return ''
        }
    })
    const [stationShops, setStationShops] = useState([])
    const [isFetchingShops, setIsFetchingShops] = useState(true)
    const [showSqlHelp, setShowSqlHelp] = useState(false)
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
        // desktop_session handled without wiping auth

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
    }, [authLoading, authRole, authUser, isAdminMode, navigate, logout])

    const loadShops = useCallback(async () => {
        setIsFetchingShops(true)
        if (typeof fetchPublicShops === 'function') {
            try {
                const list = await fetchPublicShops()
                if (Array.isArray(list) && list.length > 0) {
                    setStationShops(list)
                } else {
                    try {
                        const cached = localStorage.getItem('dailybooks_known_shops')
                        if (cached) {
                            const parsed = JSON.parse(cached)
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setStationShops(parsed)
                            }
                        }
                    } catch {}
                }
            } catch {
                // Ignore shop fetch errors
            } finally {
                setIsFetchingShops(false)
            }
        } else {
            setIsFetchingShops(false)
        }
    }, [fetchPublicShops])

    useEffect(() => {
        loadShops()
    }, [loadShops])

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
                const returnedShopId = String(result?.shopId || result?.shop_id || '')
                // Strict station-lock guard: if station was selected, reject if logged in shop does not match
                if (stationShopId && returnedShopId) {
                    const isMatch = (() => {
                        const s = String(stationShopId).trim().toLowerCase()
                        const r = returnedShopId.trim().toLowerCase()
                        if (s === r) return true
                        const shop = (Array.isArray(availableShops) ? availableShops : []).find((item) => {
                            const id1 = String(item?.id || '').trim().toLowerCase()
                            const id2 = String(item?.shop_id || '').trim().toLowerCase()
                            return id1 === s || id2 === s
                        })
                        if (shop) {
                            const id1 = String(shop?.id || '').trim().toLowerCase()
                            const id2 = String(shop?.shop_id || '').trim().toLowerCase()
                            return r === id1 || r === id2
                        }
                        return false
                    })()

                    if (!isMatch) {
                        setError('Dieser PIN-Code gehört nicht zu dieser Filiale.')
                        setTimeout(() => {
                            setPin('')
                            setError('')
                        }, 1400)
                        return
                    }
                }
                if (!stationShopId && returnedShopId) {
                    try {
                        localStorage.setItem(STATION_STORAGE_KEY, String(returnedShopId))
                    } catch {}
                    setStationShopId(String(returnedShopId))
                }
                navigate(result?.redirectTo || SALESMAN_DASHBOARD_PATH, { replace: true })
                return
            }

            setError(result?.message || 'Ungültige PIN für diese Filiale.')
            setTimeout(() => {
                setPin('')
                setError('')
            }, 1400)
        } finally {
            setPinLoading(false)
        }
    }, [authLoading, isAdminMode, login, navigate, pin, pinLoading, stationShopId])

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
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Passwort</label>
                            <div className="relative">
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    value={adminPass}
                                    onChange={(event) => { setAdminPass(event.target.value); setAdminError('') }}
                                    placeholder="••••••••"
                                    id="admin-password"
                                    autoComplete="current-password"
                                    className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <button
                                    type="button"
                                    onClick={() => setShowPass((prev) => !prev)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPass ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
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
                            id="admin-login-submit"
                            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            ) : null}
                            <span>{isLoading ? 'Anmelden...' : 'Anmelden'}</span>
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => navigate(SALESMAN_LOGIN_PATH)}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            Kassen-Terminal öffnen
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const cachedKnownShops = (() => {
        try {
            const raw = localStorage.getItem('dailybooks_known_shops');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    })();

    const availableShops = (Array.isArray(stationShops) && stationShops.length > 0)
        ? stationShops
        : (Array.isArray(shops) && shops.length > 0
            ? shops
            : cachedKnownShops)

    const currentStationShop = availableShops.find((s) => String(s.id) === String(stationShopId)) || null

    const handleConfirmStation = (selectedId) => {
        try {
            if (selectedId) {
                localStorage.setItem(STATION_STORAGE_KEY, String(selectedId))
            }
        } catch {
            // Storage restricted
        }
        setStationShopId(String(selectedId))
    }

    const handleResetStation = () => {
        try {
            localStorage.removeItem(STATION_STORAGE_KEY)
        } catch {
            // Storage restricted
        }
        setStationShopId('')
        setPin('')
        setError('')
    }

    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]

    const renderKeypad = () => (
        <div className="space-y-4">
            <div className="flex justify-center gap-4 my-4">
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

            {pinLoading && (
                <div className="text-center text-xs text-emerald-400 flex items-center justify-center gap-2 py-1">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Verbinde mit Filiale...</span>
                </div>
            )}

            {error ? (
                <p className="text-center text-red-400 text-sm mb-2 animate-pulse font-medium">{error}</p>
            ) : null}

            <div className="grid grid-cols-3 gap-3 mb-3">
                {digits.map((digit) => (
                    <button
                        key={digit}
                        type="button"
                        onClick={() => handlePinInput(String(digit))}
                        id={`pin-btn-${digit}`}
                        disabled={pinLoading}
                        className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700/80 hover:border-slate-600 active:scale-95 transition-all duration-150 backdrop-blur-sm cursor-pointer disabled:opacity-50"
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
                    disabled={pinLoading}
                    className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:bg-slate-700/80 hover:text-white active:scale-95 transition-all duration-150 flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H19a2 2 0 012 2v10a2 2 0 01-2 2h-8.172a2 2 0 01-1.414-.586L3 12z" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => handlePinInput('0')}
                    id="pin-btn-0"
                    disabled={pinLoading}
                    className="h-16 rounded-2xl bg-slate-800/80 border border-slate-700/50 text-white text-2xl font-semibold hover:bg-slate-700/80 hover:border-slate-600 active:scale-95 transition-all duration-150 backdrop-blur-sm cursor-pointer disabled:opacity-50"
                >
                    0
                </button>
                <div className="h-16" />
            </div>
        </div>
    )

    // ONE-TIME SETUP: If not admin mode and this device hasn't selected a shop yet
    if (!isAdminMode && !stationShopId) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl p-6 md:p-8 text-white shadow-2xl space-y-6 backdrop-blur-md">
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/20 mb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-black text-white">Station Setup</h2>
                        <p className="text-xs text-slate-400 max-w-xs mx-auto">
                            Wählen Sie Ihre Filiale für diesen Computer, oder geben Sie direkt Ihre Mitarbeiter-PIN ein:
                        </p>
                    </div>

                    {availableShops.length > 0 ? (
                        <div className="space-y-4">
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
                                Filiale für diesen Computer auswählen
                            </p>
                            <div className="space-y-2.5">
                                {availableShops.map((shop) => (
                                    <button
                                        key={shop.id}
                                        type="button"
                                        onClick={() => handleConfirmStation(shop.id)}
                                        className="w-full p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:bg-emerald-950/40 hover:border-emerald-500/50 text-left transition-all group cursor-pointer shadow-md"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                                                    {shop.name}
                                                </p>
                                                {shop.address && (
                                                    <p className="text-xs text-slate-400 mt-0.5">{shop.address}</p>
                                                )}
                                                {shop.telephone && (
                                                    <p className="text-[11px] text-slate-500 mt-0.5">📞 {shop.telephone}</p>
                                                )}
                                            </div>
                                            <div className="w-8 h-8 rounded-xl bg-slate-700/50 group-hover:bg-emerald-500 text-slate-400 group-hover:text-white flex items-center justify-center font-bold text-sm transition-all">
                                                ✓
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="relative py-2">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-800" />
                                </div>
                                <div className="relative flex justify-center text-[10px] uppercase">
                                    <span className="bg-slate-900 px-3 text-slate-500 font-bold tracking-wider">
                                        oder per Mitarbeiter-PIN
                                    </span>
                                </div>
                            </div>

                            {renderKeypad()}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/70 text-center space-y-1">
                                <p className="text-xs font-semibold text-emerald-400">
                                    Mitarbeiter-PIN eingeben:
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    Geben Sie Ihre 4-stellige PIN ein. Das System erkennt Ihre Filiale automatisch und sperrt diesen Computer auf Ihren Standort.
                                </p>
                            </div>

                            {/* Render Direct PIN Keypad */}
                            {renderKeypad()}

                            <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => navigate(ADMIN_LOGIN_PATH)}
                                    className="w-full py-2.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <span>🔑 Als Admin anmelden & Filiale zuweisen</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={loadShops}
                                    className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    <span>🔄 Filialen erneut laden</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowSqlHelp(!showSqlHelp)}
                                    className="text-[11px] text-slate-500 hover:text-slate-400 underline text-center pt-1 cursor-pointer"
                                >
                                    {showSqlHelp ? 'Hilfe ausblenden' : 'Warum werden keine Filialen angezeigt? (Admin-Info)'}
                                </button>
                                {showSqlHelp && (
                                    <div className="p-3 rounded-xl bg-slate-800/90 border border-slate-700 text-[11px] text-slate-300 space-y-2">
                                        <p className="font-bold text-amber-400">Supabase Sicherheitsrichtlinie (RLS):</p>
                                        <p>In Supabase ist die Tabelle <code className="text-cyan-300 font-mono">shops</code> geschützt. Führen Sie im Supabase SQL Editor folgendes aus, damit Filialen ohne vorherigen Login sichtbar sind:</p>
                                        <pre className="p-2 rounded bg-black/60 text-emerald-400 font-mono text-[10px] overflow-x-auto select-all">
CREATE POLICY "Allow public read access to shops" ON public.shops FOR SELECT TO anon, authenticated USING (true);
                                        </pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                        <p className="text-[11px] text-emerald-300 font-medium">
                            🔒 Einmal eingestellt, startet die Kassen-Software immer direkt für diese Filiale.
                        </p>
                    </div>

                    <div className="pt-1 text-center">
                        <button
                            type="button"
                            onClick={() => navigate(ADMIN_LOGIN_PATH)}
                            className="text-xs text-slate-500 hover:text-slate-300 underline cursor-pointer"
                        >
                            Open Admin Portal
                        </button>
                    </div>
                </div>
            </div>
        )
    }

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

                {/* Station / Shop badge (Permanently locked - with Change option) */}
                <div className="mb-6 flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/90 border border-slate-700/80 text-slate-300 shadow-inner">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Station / Branch</p>
                            <p className="text-xs font-bold text-white truncate">
                                {currentStationShop?.name || 'Assigned Branch'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-700/50 text-[10px] font-bold text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Locked</span>
                        </div>
                    </div>
                </div>

                {renderKeypad()}

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
                        className="w-full rounded-xl border border-blue-400/40 bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-all hover:from-blue-500 hover:to-cyan-400 cursor-pointer"
                    >
                        Admin Portal
                    </button>
                    <p className="mt-2 text-center text-[11px] text-slate-400">For authorized management access only.</p>
                </div>

            </div>
        </div>
    )
}
