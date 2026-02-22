import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const RepairsContext = createContext(null);

export function RepairsProvider({ children }) {
    const [repairJobs, setRepairJobs] = useState([]);

    // ── Preload Data from Supabase ──
    useEffect(() => {
        const fetchRepairs = async () => {
            const { data, error } = await supabase.from('repairs').select('*').order('createdAt', { ascending: false });
            if (!error && data) {
                setRepairJobs(data);
            }
        };
        fetchRepairs();

        const repairsSub = supabase.channel('public:repairs')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repairs' }, (payload) => {
                setRepairJobs(prev => {
                    if (prev.some(j => String(j.id) === String(payload.new.id))) return prev;
                    return [payload.new, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'repairs' }, (payload) => {
                setRepairJobs(prev => prev.map(j => String(j.id) === String(payload.new.id) ? { ...j, ...payload.new } : j));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'repairs' }, (payload) => {
                setRepairJobs(prev => prev.filter(j => String(j.id) !== String(payload.old.id)));
            })
            .subscribe();

        return () => supabase.removeChannel(repairsSub);
    }, []);

    // Generate sequential Ref ID: REP-2026-001 based on current array length
    // In a real multi-user env, we should query max ID from DB, but this works for now
    const generateRefId = useCallback(() => {
        const year = new Date().getFullYear();
        const yearJobs = repairJobs.filter(j => j.refId?.startsWith(`REP-${year}`));
        const nextNum = yearJobs.length + 1;
        return `REP-${year}-${String(nextNum).padStart(3, '0')}`;
    }, [repairJobs]);

    const addRepair = useCallback(async (repairData) => {
        const refId = generateRefId();
        const newJob = {
            id: String(Date.now()), // Text ID for Supabase
            refId,
            ...repairData,
            status: 'pending', // pending | in_progress | completed
            createdAt: new Date().toISOString(),
            completedAt: null,
            finalAmount: null,
            partsCost: 0,
            estimatedCost: repairData.estimatedCost || 0,
            partsUsed: []
        };

        // Optimistic UI Update
        setRepairJobs(prev => [newJob, ...prev]);

        // Supabase DB Update
        await supabase.from('repairs').insert([newJob]);

        return newJob;
    }, [generateRefId]);

    const updateRepairStatus = useCallback(async (id, status, extras = {}) => {
        const strId = String(id);
        const payload = {
            status,
            ...(status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
            ...extras,
        };

        // Optimistic UI
        setRepairJobs(prev => prev.map(job => {
            if (String(job.id) === strId) {
                return { ...job, ...payload };
            }
            return job;
        }));

        // Supabase DB Update
        await supabase.from('repairs').update(payload).eq('id', strId);
    }, []);

    const deleteRepair = useCallback(async (id) => {
        const strId = String(id);

        // Optimistic UI
        setRepairJobs(prev => prev.filter(j => String(j.id) !== strId));

        // Supabase DB Update
        await supabase.from('repairs').delete().eq('id', strId);
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
