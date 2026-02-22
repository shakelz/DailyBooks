import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RepairsContext = createContext(null);

export function RepairsProvider({ children }) {
    const [repairJobs, setRepairJobs] = useState(() => {
        const saved = localStorage.getItem('repairJobs');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('repairJobs', JSON.stringify(repairJobs));
    }, [repairJobs]);

    // Generate sequential Ref ID: REP-2026-001
    const generateRefId = useCallback(() => {
        const year = new Date().getFullYear();
        const yearJobs = repairJobs.filter(j => j.refId?.startsWith(`REP-${year}`));
        const nextNum = yearJobs.length + 1;
        return `REP-${year}-${String(nextNum).padStart(3, '0')}`;
    }, [repairJobs]);

    const addRepair = useCallback((repairData) => {
        const refId = generateRefId();
        const newJob = {
            id: Date.now(),
            refId,
            ...repairData,
            status: 'pending', // pending | in_progress | completed
            createdAt: new Date().toISOString(),
            completedAt: null,
            finalAmount: null,
        };
        setRepairJobs(prev => [newJob, ...prev]);
        return newJob;
    }, [generateRefId]);

    const updateRepairStatus = useCallback((id, status, extras = {}) => {
        setRepairJobs(prev => prev.map(job => {
            if (job.id === id) {
                return {
                    ...job,
                    status,
                    ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
                    ...extras,
                };
            }
            return job;
        }));
    }, []);

    const deleteRepair = useCallback((id) => {
        setRepairJobs(prev => prev.filter(j => j.id !== id));
    }, []);

    const value = {
        repairJobs,
        addRepair,
        updateRepairStatus,
        deleteRepair,
        generateRefId,
    };

    return (
        <RepairsContext.Provider value={value}>
            {children}
        </RepairsContext.Provider>
    );
}

export function useRepairs() {
    const context = useContext(RepairsContext);
    if (!context) throw new Error('useRepairs must be used within RepairsProvider');
    return context;
}
