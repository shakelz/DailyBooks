import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [role, setRole] = useState(() => localStorage.getItem('role')); // 'admin' | 'salesman' | null
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    }); // For salesman details
    const [lowStockAlerts, setLowStockAlerts] = useState([]);

    // ── Persistent Data ──
    const [adminPassword, setAdminPassword] = useState(() => {
        return localStorage.getItem('adminPassword') || 'admin123';
    });

    const [slowMovingDays, setSlowMovingDays] = useState(() => {
        return parseInt(localStorage.getItem('slowMovingDays')) || 30;
    });

    const [autoLockEnabled, setAutoLockEnabled] = useState(() => {
        const saved = localStorage.getItem('autoLockEnabled');
        return saved !== null ? saved === 'true' : true;
    });

    const [autoLockTimeout, setAutoLockTimeout] = useState(() => {
        return parseInt(localStorage.getItem('autoLockTimeout')) || 120;
    });

    const [salesmen, setSalesmen] = useState(() => {
        const saved = localStorage.getItem('salesmen');
        return saved ? JSON.parse(saved) : [
            { id: 1, name: 'Ali', pin: '1234', active: true, hourlyRate: 12.50 }
        ];
    });

    // ── Persistence Effects ──
    useEffect(() => {
        if (role) localStorage.setItem('role', role);
        else localStorage.removeItem('role');

        if (user) localStorage.setItem('user', JSON.stringify(user));
        else localStorage.removeItem('user');
    }, [user, role]);

    useEffect(() => {
        localStorage.setItem('adminPassword', adminPassword);
    }, [adminPassword]);

    useEffect(() => {
        localStorage.setItem('slowMovingDays', String(slowMovingDays));
    }, [slowMovingDays]);

    useEffect(() => {
        localStorage.setItem('autoLockEnabled', String(autoLockEnabled));
    }, [autoLockEnabled]);

    useEffect(() => {
        localStorage.setItem('autoLockTimeout', String(autoLockTimeout));
    }, [autoLockTimeout]);

    useEffect(() => {
        localStorage.setItem('salesmen', JSON.stringify(salesmen));
    }, [salesmen]);

    // ── Storage Event Listener for Cross-Tab Sync ──
    useEffect(() => {
        const handleStorageChange = (e) => {
            // Don't sync role/user if the current session already has an active user
            // This prevents admin's role from being overwritten when a salesman logs in on another tab
            if (e.key === 'role' && !user) setRole(e.newValue);
            if (e.key === 'user' && e.newValue && !user) {
                try { setUser(JSON.parse(e.newValue)); }
                catch (err) { console.error("Sync error (user):", err); }
            }
            if (e.key === 'salesmen' && e.newValue) {
                try { setSalesmen(JSON.parse(e.newValue)); }
                catch (err) { console.error("Sync error (salesmen):", err); }
            }
            if (e.key === 'attendanceLogs' && e.newValue) {
                try { setAttendanceLogs(JSON.parse(e.newValue)); }
                catch (err) { console.error("Sync error (attendanceLogs):", err); }
            }
            if (e.key === 'adminPassword' && e.newValue) {
                setAdminPassword(e.newValue);
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    // ── Attendance Logs ──
    const [attendanceLogs, setAttendanceLogs] = useState(() => {
        const saved = localStorage.getItem('attendanceLogs');
        return saved ? JSON.parse(saved) : [];
    });

    // ── Punch In/Out State ──
    const [isPunchedIn, setIsPunchedIn] = useState(false);

    useEffect(() => {
        localStorage.setItem('attendanceLogs', JSON.stringify(attendanceLogs));

        // Sync isPunchedIn state on load/update
        if (user && role === 'salesman') {
            const todayStr = new Date().toLocaleDateString('en-PK');
            const myLogsToday = attendanceLogs.filter(l => l.date === todayStr && l.userId === user.id);
            if (myLogsToday.length > 0) {
                // Creates a new array to safe sort, though filter returns new array. 
                // Log logic: The LATEST log determines status. 
                // Assuming we prepend logs, index 0 is latest. 
                // But to be safe, let's sort by timestamp descending.
                const latest = myLogsToday.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
                setIsPunchedIn(latest.type === 'IN');
            } else {
                setIsPunchedIn(false);
            }
        }
    }, [attendanceLogs, user, role]);

    const handlePunch = (type) => { // type: 'IN' | 'OUT'
        if (!user) return;

        const log = {
            id: Date.now(),
            userId: user.id,
            userName: user.name,
            type,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString('en-PK'),
            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
        };

        setAttendanceLogs(prev => [log, ...prev]);
        setIsPunchedIn(type === 'IN');

        // ── Auto-save salary transaction on punch OUT ──
        if (type === 'OUT') {
            const todayStr = new Date().toLocaleDateString('en-PK');
            const salesman = salesmen.find(s => s.id === user.id);
            if (salesman) {
                // Find the latest IN log for this user today
                const myLogsToday = attendanceLogs
                    .filter(l => l.userId === user.id && l.date === todayStr)
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                const latestIn = myLogsToday.find(l => l.type === 'IN');
                if (latestIn?.timestamp) {
                    const shiftStart = new Date(latestIn.timestamp).getTime();
                    const now = Date.now();
                    const hoursWorked = (now - shiftStart) / 3600000;
                    const hourlyRate = salesman.hourlyRate || 12.50;
                    const sessionSalary = hoursWorked * hourlyRate;

                    if (sessionSalary > 0.001) { // Only save if meaningful
                        const salaryTxn = {
                            id: Date.now() + 1,
                            desc: `Salary: ${salesman.name} (${hoursWorked.toFixed(1)}h @ €${hourlyRate}/hr)`,
                            amount: parseFloat(sessionSalary.toFixed(2)),
                            type: 'expense',
                            category: 'Salary',
                            isFixedExpense: true,
                            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
                            time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
                            timestamp: new Date().toISOString(),
                            source: 'payroll-auto',
                            salesmanId: salesman.id,
                            salesmanName: salesman.name
                        };

                        // Save directly to localStorage transactions (InventoryContext's storage)
                        try {
                            const existing = JSON.parse(localStorage.getItem('transactions') || '[]');
                            const updated = [salaryTxn, ...existing];
                            localStorage.setItem('transactions', JSON.stringify(updated));

                            // Dispatch custom event so InventoryContext picks it up on same tab
                            window.dispatchEvent(new CustomEvent('transactions-updated', { detail: updated }));
                        } catch (e) {
                            console.error('Failed to auto-save salary transaction:', e);
                        }

                        // Reset accrued salary for this salesman
                        setSalesmen(prev => prev.map(s =>
                            s.id === salesman.id ? { ...s, totalAccruedSalary: 0 } : s
                        ));
                    }
                }
            }
        }
    };

    // Deprecated: addAttendanceLog
    const addAttendanceLog = (userObj, type) => handlePunch(type);

    const updateAttendanceLog = useCallback((id, updates) => {
        setAttendanceLogs(prev => prev.map(l => {
            if (l.id === id) {
                const newLog = { ...l, ...updates };
                // If time/date changed, reconstruct timestamp for duration logic
                if (updates.time) {
                    try {
                        // Parse "HH:MM AM/PM" or "HH:MM"
                        const timeMatch = newLog.time.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
                        if (timeMatch) {
                            let [_, hours, minutes, ampm] = timeMatch;
                            hours = parseInt(hours);
                            minutes = parseInt(minutes);

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
                return newLog;
            }
            return l;
        }));
    }, []);

    const deleteAttendanceLog = useCallback((id) => {
        setAttendanceLogs(prev => prev.filter(l => l.id !== id));
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
            const salesman = salesmen.find(s => s.pin === userData.pin);
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
        localStorage.removeItem('user'); // Optional: clear user on logout? 
        // Logic: setUser(null) triggers useEffect which sets localStorage 'user' to null. So removeItem is redundant but harmless.
    };

    // ── Management Functions ──
    const updateAdminPassword = (newPass) => {
        setAdminPassword(newPass);
    };

    const addSalesman = (name, pin) => {
        const newSalesman = { id: Date.now(), name, pin, active: true, hourlyRate: 12.50 };
        setSalesmen(prev => [...prev, newSalesman]);
    };

    const deleteSalesman = (id) => {
        setSalesmen(prev => prev.filter(s => s.id !== id));
    };

    const updateSalesman = (id, updates) => {
        setSalesmen(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        if (user && user.id === id) {
            setUser(prev => ({ ...prev, ...updates }));
        }
    };

    // ── Alert Logic (Existing) ──
    const addLowStockAlert = (product) => {
        setLowStockAlerts((prev) => {
            if (prev.some((a) => a.barcode === product.barcode)) return prev;
            return [
                { ...product, alertTime: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) },
                ...prev,
            ];
        });
    };

    const clearAlert = (barcode) => {
        setLowStockAlerts((prev) => prev.filter((a) => a.barcode !== barcode));
    };

    const clearAllAlerts = () => {
        setLowStockAlerts([]);
    };

    const value = {
        role, user, login, logout,
        salesmen, addSalesman, deleteSalesman, updateSalesman,
        adminPassword, updateAdminPassword,
        slowMovingDays, setSlowMovingDays,
        autoLockEnabled, setAutoLockEnabled,
        autoLockTimeout, setAutoLockTimeout,
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
