import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const RepairsContext = createContext(null);

export function RepairsProvider({ children }) {
    const { activeShopId } = useAuth();
    const [repairJobs, setRepairJobs] = useState([]);

    // ── Preload Data from Supabase ──
    useEffect(() => {
        const sid = String(activeShopId || '').trim();
        if (!sid) {
            setRepairJobs([]);
            return undefined;
        }

        let cancelled = false;

        const fetchRepairs = async () => {
            const { data, error } = await supabase
                .from('repairs')
                .select('*')
                .eq('shop_id', sid)
                .order('createdAt', { ascending: false });
            if (!cancelled && !error && data) {
                setRepairJobs(data);
            } else if (!cancelled && error) {
                setRepairJobs([]);
            }
        };
        fetchRepairs();

        const shopFilter = `shop_id=eq.${sid}`;
        const repairsSub = supabase.channel(`public:repairs:${sid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                setRepairJobs(prev => {
                    if (prev.some(j => String(j.id) === String(payload.new.id))) return prev;
                    return [payload.new, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                setRepairJobs(prev => prev.map(j => String(j.id) === String(payload.new.id) ? { ...j, ...payload.new } : j));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                setRepairJobs(prev => prev.filter(j => String(j.id) !== String(payload.old.id)));
            })
            // Fallback Broadcast
            .on('broadcast', { event: 'repair_sync' }, (payload) => {
                const { action, data } = payload.payload;
                if (!data || String(data.shop_id || '').trim() !== sid) return;
                if (action === 'INSERT') {
                    setRepairJobs(prev => {
                        if (prev.some(j => String(j.id) === String(data.id))) return prev;
                        return [data, ...prev].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    });
                } else if (action === 'UPDATE') {
                    setRepairJobs(prev => prev.map(j => String(j.id) === String(data.id) ? { ...j, ...data } : j));
                } else if (action === 'DELETE') {
                    setRepairJobs(prev => prev.filter(j => String(j.id) !== String(data.id)));
                }
            })
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(repairsSub);
        };
    }, [activeShopId]);

    // Generate sequential Ref ID: REP-2026-001 based on current array length
    // In a real multi-user env, we should query max ID from DB, but this works for now
    const generateRefId = useCallback(() => {
        const year = new Date().getFullYear();
        const yearJobs = repairJobs.filter(j => j.refId?.startsWith(`REP-${year}`));
        const nextNum = yearJobs.length + 1;
        return `REP-${year}-${String(nextNum).padStart(3, '0')}`;
    }, [repairJobs]);

    const addRepair = useCallback(async (repairData) => {
        const sid = String(activeShopId || '').trim();
        if (!sid) throw new Error('No active shop selected.');

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
            partsUsed: [],
            shop_id: sid
        };

        // Optimistic UI Update
        setRepairJobs(prev => [newJob, ...prev]);

        // Supabase DB Update
        await supabase.from('repairs').insert([newJob]);

        // Broadcast Fallback
        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'INSERT', data: newJob }
        }).catch(e => console.error(e));

        return newJob;
    }, [generateRefId, activeShopId]);

    const updateRepairStatus = useCallback(async (id, status, extras = {}) => {
        const sid = String(activeShopId || '').trim();
        if (!sid) return;

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
        await supabase.from('repairs').update(payload).eq('id', strId).eq('shop_id', sid);

        // Broadcast Fallback
        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'UPDATE', data: { id: strId, shop_id: sid, ...payload } }
        }).catch(e => console.error(e));
    }, [activeShopId]);

    const deleteRepair = useCallback(async (id) => {
        const sid = String(activeShopId || '').trim();
        if (!sid) return;

        const strId = String(id);

        // Optimistic UI
        setRepairJobs(prev => prev.filter(j => String(j.id) !== strId));

        // Supabase DB Update
        await supabase.from('repairs').delete().eq('id', strId).eq('shop_id', sid);

        // Broadcast Fallback
        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'DELETE', data: { id: strId, shop_id: sid } }
        }).catch(e => console.error(e));
    }, [activeShopId]);

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
