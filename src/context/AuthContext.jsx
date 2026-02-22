import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [role, setRole] = useState(() => localStorage.getItem('role')); // 'admin' | 'salesman' | null
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    }); // For salesman details
    const [lowStockAlerts, setLowStockAlerts] = useState([]);

    // ── Persistent Config Data ──
    const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('adminPassword') || 'admin123');
    const [slowMovingDays, setSlowMovingDays] = useState(() => parseInt(localStorage.getItem('slowMovingDays')) || 30);
    const [autoLockEnabled, setAutoLockEnabled] = useState(() => {
        const saved = localStorage.getItem('autoLockEnabled');
        return saved !== null ? saved === 'true' : true;
    });
    const [autoLockTimeout, setAutoLockTimeout] = useState(() => parseInt(localStorage.getItem('autoLockTimeout')) || 120);

    const [salesmen, setSalesmen] = useState(() => {
        const saved = localStorage.getItem('salesmen');
        return saved ? JSON.parse(saved) : [
            { id: 1, name: 'Ali', pin: '1234', active: true, hourlyRate: 12.50 }
        ];
    });

    // ── Persistence Effects ──
    useEffect(() => {
        if (role) localStorage.setItem('role', role); else localStorage.removeItem('role');
        if (user) localStorage.setItem('user', JSON.stringify(user)); else localStorage.removeItem('user');
    }, [user, role]);

    useEffect(() => { localStorage.setItem('adminPassword', adminPassword); }, [adminPassword]);
    useEffect(() => { localStorage.setItem('slowMovingDays', String(slowMovingDays)); }, [slowMovingDays]);
    useEffect(() => { localStorage.setItem('autoLockEnabled', String(autoLockEnabled)); }, [autoLockEnabled]);
    useEffect(() => { localStorage.setItem('autoLockTimeout', String(autoLockTimeout)); }, [autoLockTimeout]);
    useEffect(() => { localStorage.setItem('salesmen', JSON.stringify(salesmen)); }, [salesmen]);

    // ── Storage Event Listener for Cross-Tab Sync ──
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'role' && !user) setRole(e.newValue);
            if (e.key === 'user' && e.newValue && !user) {
                try { setUser(JSON.parse(e.newValue)); } catch (err) { console.error("Sync error (user):", err); }
            }
            if (e.key === 'salesmen' && e.newValue) {
                try { setSalesmen(JSON.parse(e.newValue)); } catch (err) { console.error("Sync error (salesmen):", err); }
            }
            if (e.key === 'adminPassword' && e.newValue) {
                setAdminPassword(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // ── Preloaded Attendance Logs from Supabase ──
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [isPunchedIn, setIsPunchedIn] = useState(false);

    // ── Live Broadcasting for Settings ──
    const broadcastSetting = useCallback(async (key, value) => {
        await supabase.channel('public:settings').send({
            type: 'broadcast',
            event: 'settings_sync',
            payload: { key, value }
        });
    }, []);

    useEffect(() => {
        const channel = supabase.channel('public:settings')
            .on('broadcast', { event: 'settings_sync' }, (payload) => {
                const { key, value } = payload.payload;
                if (key === 'salesmen') setSalesmen(value);
                else if (key === 'adminPassword') setAdminPassword(value);
                else if (key === 'slowMovingDays') setSlowMovingDays(value);
                else if (key === 'autoLockEnabled') setAutoLockEnabled(value);
                else if (key === 'autoLockTimeout') setAutoLockTimeout(value);
            })
            // Fallback for live attendance punches (bypasses DB Realtime if not configured)
            .on('broadcast', { event: 'punch_sync' }, (payload) => {
                const newLog = payload.payload;
                console.log("Broadcast Attendance sync received:", newLog);
                setAttendanceLogs(prev => {
                    if (prev.some(l => String(l.id) === String(newLog.id))) {
                        // It's an update
                        return prev.map(l => String(l.id) === String(newLog.id) ? { ...l, ...newLog } : l);
                    }
                    // It's an insert
                    return [newLog, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('broadcast', { event: 'punch_delete' }, (payload) => {
                const deletedLogId = payload.payload.id;
                console.log("Broadcast Attendance delete received:", deletedLogId);
                setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(deletedLogId)));
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    // Initial Fetch
    useEffect(() => {
        const fetchAttendance = async () => {
            const { data, error } = await supabase.from('attendance').select('*').order('timestamp', { ascending: false });
            if (!error && data) {
                // Map DB schema to local expectations (DB has UUID, local had timestamp-based IDs etc)
                // We'll standardise date and time strings for UI components
                const formatted = data.map(dbLog => {
                    const dObj = new Date(dbLog.timestamp);
                    return {
                        ...dbLog,
                        userId: parseInt(dbLog.workerId) || dbLog.workerId, // Parse back to int for local compatibility
                        userName: dbLog.workerName,
                        date: dObj.toLocaleDateString('en-PK'),
                        time: dObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                    };
                });
                setAttendanceLogs(formatted);
            }
        };
        fetchAttendance();

        // Listen for live updates via Supabase Realtime
        const attendanceSubscription = supabase.channel('public:attendance')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, (payload) => {
                const dbLog = payload.new;
                const dObj = new Date(dbLog.timestamp);
                const newLog = {
                    ...dbLog,
                    userId: parseInt(dbLog.workerId) || dbLog.workerId,
                    userName: dbLog.workerName,
                    date: dObj.toLocaleDateString('en-PK'),
                    time: dObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                };
                console.log("Realtime Attendance INSERT received:", newLog);
                setAttendanceLogs(prev => {
                    if (prev.some(l => String(l.id) === String(newLog.id))) return prev; // Avoid duplicates from optimistic UI
                    return [newLog, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, (payload) => {
                const dbLog = payload.new;
                const dObj = new Date(dbLog.timestamp);
                console.log("Realtime Attendance UPDATE received:", dbLog);
                setAttendanceLogs(prev => prev.map(l => {
                    if (String(l.id) === String(dbLog.id)) {
                        return {
                            ...l,
                            ...dbLog,
                            date: dObj.toLocaleDateString('en-PK'),
                            time: dObj.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                        };
                    }
                    return l;
                }));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance' }, (payload) => {
                setAttendanceLogs(prev => prev.filter(l => String(l.id) !== String(payload.old.id)));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(attendanceSubscription);
        };
    }, []);

    // Set `isPunchedIn` state on load/update
    useEffect(() => {
        if (user && role === 'salesman') {
            const todayStr = new Date().toLocaleDateString('en-PK');
            const myLogsToday = attendanceLogs.filter(l => l.date === todayStr && String(l.userId) === String(user.id));
            if (myLogsToday.length > 0) {
                const latest = myLogsToday.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                setIsPunchedIn(latest.type === 'IN');
            } else {
                setIsPunchedIn(false);
            }
        }
    }, [attendanceLogs, user, role]);

    const handlePunch = async (type) => { // type: 'IN' | 'OUT'
        if (!user) return;

        const ts = new Date();
        const uiLog = {
            id: crypto.randomUUID(), // Optimistic UUID
            userId: user.id,
            userName: user.name,
            workerId: String(user.id),
            workerName: user.name,
            type,
            timestamp: ts.toISOString(),
            date: ts.toLocaleDateString('en-PK'),
            time: ts.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            note: ''
        };

        // Optimistic update
        setAttendanceLogs(prev => [uiLog, ...prev]);
        setIsPunchedIn(type === 'IN');

        // Broadcast to other clients instantly
        supabase.channel('public:settings').send({
            type: 'broadcast',
            event: 'punch_sync',
            payload: uiLog
        }).catch(err => console.error("Forecast punch broadcast error:", err));

        // Supabase DB Update
        const { error } = await supabase.from('attendance').insert([{
            id: uiLog.id,
            workerId: String(user.id),
            workerName: user.name,
            type: type,
            timestamp: uiLog.timestamp,
            note: ''
        }]);

        if (error) {
            console.error('Failed to punch attendance:', error);
            // Typically revert optimistic state here, but omitting for brevity
            return;
        }

        // ── Auto-save salary transaction on punch OUT ──
        if (type === 'OUT') {
            const todayStr = ts.toLocaleDateString('en-PK');
            const salesman = salesmen.find(s => s.id === user.id);
            if (salesman) {
                const myLogsToday = attendanceLogs
                    .filter(l => l.userId === user.id && l.date === todayStr)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                const latestIn = myLogsToday.find(l => l.type === 'IN');
                if (latestIn?.timestamp) {
                    const shiftStart = new Date(latestIn.timestamp).getTime();
                    const now = ts.getTime();
                    const hoursWorked = (now - shiftStart) / 3600000;
                    const hourlyRate = salesman.hourlyRate || 12.50;
                    const sessionSalary = hoursWorked * hourlyRate;

                    if (sessionSalary > 0.001) {
                        const salaryTxn = {
                            id: String(Date.now()),
                            desc: `Salary: ${salesman.name} (${hoursWorked.toFixed(1)}h @ €${hourlyRate}/hr)`,
                            amount: parseFloat(sessionSalary.toFixed(2)),
                            type: 'expense',
                            category: 'Salary',
                            isFixedExpense: true,
                            date: ts.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            time: ts.toLocaleTimeString('en-US', { hour12: false }),
                            timestamp: ts.toISOString(),
                            source: 'payroll-auto',
                            workerId: String(salesman.id),
                            salesmanName: salesman.name
                        };

                        // Push directly to Supabase since transactions are now online
                        await supabase.from('transactions').insert([salaryTxn]);

                        // Tell InventoryContext to refetch or inject optimistic transaction
                        // (Usually a reload handles this perfectly, but an event works too)
                        window.dispatchEvent(new CustomEvent('transactions-added-remote', { detail: salaryTxn }));

                        setSalesmen(prev => prev.map(s => s.id === salesman.id ? { ...s, totalAccruedSalary: 0 } : s));
                    }
                }
            }
        }
    };

    const addAttendanceLog = (userObj, type) => handlePunch(type);

    const updateAttendanceLog = useCallback(async (id, updates) => {
        setAttendanceLogs(prev => prev.map(l => {
            if (l.id === id) {
                const newLog = { ...l, ...updates };
                if (updates.time) {
                    try {
                        const timeMatch = newLog.time.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
                        if (timeMatch) {
                            let [_, hours, minutes, ampm] = timeMatch;
                            hours = parseInt(hours); minutes = parseInt(minutes);
                            if (ampm) {
                                if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
                                if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
                            }
                            const dateObj = new Date(newLog.timestamp);
                            dateObj.setHours(hours, minutes, 0, 0);
                            newLog.timestamp = dateObj.toISOString();
                        }
                    } catch (e) {
                        console.error("Reconstruct timestamp failed:", e);
                    }
                }

                // Fire off Supabase update
                supabase.from('attendance').update({
                    type: newLog.type,
                    timestamp: newLog.timestamp,
                    note: newLog.note
                }).eq('id', newLog.id).then();

                // Broadcast update
                supabase.channel('public:settings').send({
                    type: 'broadcast',
                    event: 'punch_sync',
                    payload: newLog
                }).catch(e => console.error("Broadcast update error:", e));

                return newLog;
            }
            return l;
        }));
    }, []);

    const deleteAttendanceLog = useCallback(async (id) => {
        setAttendanceLogs(prev => prev.filter(l => l.id !== id));

        // Broadcast delete
        supabase.channel('public:settings').send({
            type: 'broadcast',
            event: 'punch_delete',
            payload: { id }
        }).catch(e => console.error("Broadcast delete error:", e));

        await supabase.from('attendance').delete().eq('id', id);
    }, []);

    // ── Auth Logic ──
    const login = (userData) => {
        if (userData.role === 'admin') {
            if (userData.password === adminPassword) {
                setRole('admin');
                setUser({ name: 'Admin', role: 'admin' });
                return { success: true };
            }
            return { success: false, message: 'Invalid Admin Password' };
        }

        if (userData.role === 'salesman') {
            const salesman = salesmen.find(s => String(s.pin) === String(userData.pin));
            if (salesman) {
                setRole('salesman');
                setUser(salesman);
                return { success: true };
            }
            return { success: false, message: 'Invalid PIN' };
        }
        return { success: false, message: 'Unknown Role' };
    };

    const logout = () => {
        setRole(null);
        setUser(null);
        setIsPunchedIn(false);
        setLowStockAlerts([]);
        localStorage.removeItem('user');
    };

    // ── Management Functions ──
    const updateAdminPassword = (newPass) => {
        setAdminPassword(newPass);
        broadcastSetting('adminPassword', newPass);
    };

    const addSalesman = (name, pin) => {
        const newSalesman = { id: Date.now(), name, pin, active: true, hourlyRate: 12.50 };
        setSalesmen(prev => {
            const next = [...prev, newSalesman];
            broadcastSetting('salesmen', next);
            return next;
        });
    };

    const deleteSalesman = (id) => {
        setSalesmen(prev => {
            const next = prev.filter(s => s.id !== id);
            broadcastSetting('salesmen', next);
            return next;
        });
    };

    const updateSalesman = (id, updates) => {
        setSalesmen(prev => {
            const next = prev.map(s => s.id === id ? { ...s, ...updates } : s);
            broadcastSetting('salesmen', next);
            return next;
        });
        if (user && user.id === id) setUser(prev => ({ ...prev, ...updates }));
    };

    const handleSetSlowMovingDays = (val) => {
        const newVal = typeof val === 'function' ? val(slowMovingDays) : val;
        setSlowMovingDays(newVal);
        broadcastSetting('slowMovingDays', newVal);
    };

    const handleSetAutoLockEnabled = (val) => {
        const newVal = typeof val === 'function' ? val(autoLockEnabled) : val;
        setAutoLockEnabled(newVal);
        broadcastSetting('autoLockEnabled', newVal);
    };

    const handleSetAutoLockTimeout = (val) => {
        const newVal = typeof val === 'function' ? val(autoLockTimeout) : val;
        setAutoLockTimeout(newVal);
        broadcastSetting('autoLockTimeout', newVal);
    };

    // ── Alert Logic ──
    const addLowStockAlert = (product) => {
        setLowStockAlerts((prev) => {
            if (prev.some((a) => a.barcode === product.barcode)) return prev;
            return [{ ...product, alertTime: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...prev];
        });
    };
    const clearAlert = (barcode) => setLowStockAlerts((prev) => prev.filter((a) => a.barcode !== barcode));
    const clearAllAlerts = () => setLowStockAlerts([]);

    const value = {
        role, user, login, logout,
        salesmen, addSalesman, deleteSalesman, updateSalesman,
        adminPassword, updateAdminPassword,
        slowMovingDays, setSlowMovingDays: handleSetSlowMovingDays,
        autoLockEnabled, setAutoLockEnabled: handleSetAutoLockEnabled,
        autoLockTimeout, setAutoLockTimeout: handleSetAutoLockTimeout,
        lowStockAlerts, addLowStockAlert, clearAlert, clearAllAlerts,
        attendanceLogs, handlePunch, isPunchedIn, addAttendanceLog,
        updateAttendanceLog, deleteAttendanceLog
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
}
