import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const RepairsContext = createContext(null);

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function extractMissingColumnName(error) {
    const message = String(error?.message || '');
    if (!message) return '';
    const patterns = [
        /column ["']?([a-zA-Z0-9_]+)["']? of relation/i,
        /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
        /Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i,
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) return String(match[1]);
    }
    return '';
}

function isMissingColumnError(error, columnName) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('column') && message.includes(String(columnName || '').toLowerCase());
}

function isMissingRelationError(error, relationName = '') {
    const message = String(error?.message || '').toLowerCase();
    const isMissing = message.includes('does not exist')
        || message.includes('could not find the table')
        || message.includes('in the schema cache');
    if (!isMissing) return false;
    if (!relationName) return message.includes('relation') || message.includes('table');
    return message.includes(String(relationName || '').toLowerCase());
}

function isInvoiceNumberUniqueConstraintError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('repairs_invoice_number_key')
        || (message.includes('duplicate key value') && message.includes('invoice_number'));
}

async function executeWithPrunedColumns(operation, payload, maxAttempts = 24) {
    let candidate = payload && typeof payload === 'object' ? { ...payload } : {};
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await operation(candidate);
        if (!result?.error) return { ...result, payload: candidate };

        const missingColumn = extractMissingColumnName(result.error);
        if (!missingColumn || !Object.prototype.hasOwnProperty.call(candidate, missingColumn)) {
            return { ...result, payload: candidate };
        }
        delete candidate[missingColumn];
    }

    return { data: null, error: { message: 'Too many missing-column retries.' }, payload: candidate };
}

function parseIsoTimestamp(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
}

function toDateOnly(value) {
    const raw = cleanText(value);
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function formatShortInvoiceNumber(value = new Date()) {
    const parsed = value instanceof Date ? value : new Date(value);
    const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const year = String(safeDate.getFullYear()).slice(-2);
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function isUuidLike(value) {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw);
}

function normalizeRepairPart(part = {}) {
    const quantityRaw = parseFloat(part?.quantity ?? part?.qty ?? 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
    const priceRaw = parseFloat(part?.costPrice ?? part?.price ?? 0);
    const costPrice = Number.isFinite(priceRaw) ? priceRaw : 0;
    const productId = cleanText(part?.productId || part?.product_id);
    const name = cleanText(part?.name);

    return {
        ...part,
        id: cleanText(part?.id) || '',
        productId: productId || '',
        product_id: productId || null,
        name: name || 'Part',
        quantity,
        qty: quantity,
        costPrice,
        price: costPrice,
    };
}

function buildRepairPartsMap(rows = []) {
    return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        const repairId = cleanText(row?.repair_id || row?.repairId);
        if (!repairId) return acc;
        if (!acc[repairId]) acc[repairId] = [];
        acc[repairId].push(normalizeRepairPart(row));
        return acc;
    }, {});
}

function normalizeRepairRecord(record = {}, partsByRepair = {}) {
    const id = cleanText(record?.repair_id || record?.id) || String(record?.repair_id || record?.id || '');
    const createdIso = parseIsoTimestamp(record?.created_at || record?.createdAt || record?.timestamp) || new Date().toISOString();
    const completedIso = parseIsoTimestamp(record?.completed_at || record?.completedAt);
    const deliveryAt = toDateOnly(record?.delivery_date || record?.delivery_at || record?.deliveryDate);

    const mappedParts = id && Array.isArray(partsByRepair[id]) && partsByRepair[id].length > 0
        ? partsByRepair[id]
        : (Array.isArray(record?.partsUsed) ? record.partsUsed.map(normalizeRepairPart) : []);

    return {
        ...record,
        id,
        refId: cleanText(record?.refId || record?.ref_id),
        invoiceNumber: cleanText(record?.invoiceNumber || record?.invoice_number),
        invoice_number: cleanText(record?.invoiceNumber || record?.invoice_number),
        customerName: cleanText(record?.customerName || record?.customer_name),
        phone: cleanText(record?.customer_phone || record?.phone || record?.customerPhone),
        deviceModel: cleanText(record?.deviceModel || record?.device_model),
        imei: cleanText(record?.imei),
        problem: cleanText(record?.problem || record?.issueType),
        status: cleanText(record?.status) || 'pending',
        estimatedCost: parseFloat(record?.estimated_cost ?? record?.estimatedCost ?? 0) || 0,
        advanceAmount: parseFloat(record?.advance_amount ?? record?.advanceAmount ?? 0) || 0,
        created_at: createdIso,
        createdAt: createdIso,
        timestamp: createdIso,
        completed_at: completedIso || null,
        completedAt: completedIso || null,
        delivery_date: deliveryAt || null,
        delivery_at: deliveryAt || null,
        deliveryDate: deliveryAt || '',
        created_by: cleanText(record?.created_by || record?.createdBy),
        used_part_order_ids: Array.isArray(record?.used_part_order_ids) ? record.used_part_order_ids : [],
        partsUsed: mappedParts,
        shop_id: cleanText(record?.shop_id || record?.shopId),
    };
}

function buildRepairDedupeKey(record = {}) {
    const idKey = cleanText(record?.id || record?.repair_id).toLowerCase();
    if (idKey) return `id:${idKey}`;
    const refKey = cleanText(record?.invoiceNumber || record?.invoice_number || record?.refId || record?.ref_id).toLowerCase();
    if (refKey) return `ref:${refKey}`;
    const createdAt = cleanText(record?.created_at || record?.createdAt);
    const customer = cleanText(record?.customerName || record?.customer_name);
    const device = cleanText(record?.deviceModel || record?.device_model);
    return `tmp:${createdAt}:${customer}:${device}`;
}

function mergeRepairRecords(base = {}, incoming = {}) {
    const merged = { ...base, ...incoming };
    const mergedRef = cleanText(merged?.refId || merged?.ref_id || base?.refId || base?.ref_id || incoming?.refId || incoming?.ref_id);
    const mergedInvoice = cleanText(merged?.invoiceNumber || merged?.invoice_number || base?.invoiceNumber || base?.invoice_number || incoming?.invoiceNumber || incoming?.invoice_number || mergedRef);
    if (mergedRef) merged.refId = mergedRef;
    if (mergedInvoice) {
        merged.invoiceNumber = mergedInvoice;
        merged.invoice_number = mergedInvoice;
    }
    if ((!Array.isArray(merged.partsUsed) || merged.partsUsed.length === 0)) {
        if (Array.isArray(incoming.partsUsed) && incoming.partsUsed.length > 0) merged.partsUsed = incoming.partsUsed;
        else if (Array.isArray(base.partsUsed) && base.partsUsed.length > 0) merged.partsUsed = base.partsUsed;
    }
    return merged;
}

function sortRepairsByCreatedAt(rows = []) {
    const deduped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = buildRepairDedupeKey(row);
        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, row);
            return;
        }
        deduped.set(key, mergeRepairRecords(existing, row));
    });

    return [...deduped.values()].sort((a, b) => {
        const aMs = Date.parse(a?.created_at || a?.createdAt || '');
        const bMs = Date.parse(b?.created_at || b?.createdAt || '');
        return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });
}

function buildRepairInsertPayload(repair = {}, shopId = '') {
    const sid = cleanText(shopId);
    const createdAt = parseIsoTimestamp(repair?.created_at || repair?.createdAt) || new Date().toISOString();
    const completedAt = parseIsoTimestamp(repair?.completed_at || repair?.completedAt);
    const deliveryAt = toDateOnly(repair?.delivery_date || repair?.delivery_at || repair?.deliveryDate);

    const providedRepairId = cleanText(repair?.id);
    const payload = {
        customer_name: cleanText(repair?.customerName),
        customer_phone: cleanText(repair?.phone),
        device_model: cleanText(repair?.deviceModel),
        imei: cleanText(repair?.imei),
        problem: cleanText(repair?.problem),
        advance_amount: parseFloat(repair?.advanceAmount ?? 0) || 0,
        estimated_cost: parseFloat(repair?.estimatedCost ?? 0) || 0,
        delivery_date: deliveryAt || null,
        used_part_order_ids: Array.isArray(repair?.used_part_order_ids) ? repair.used_part_order_ids : [],
        status: cleanText(repair?.status) || 'pending',
        created_by: cleanText(repair?.created_by || repair?.createdBy || repair?.workerId || repair?.user_id) || null,
        created_at: createdAt,
        completed_at: completedAt || null,
        shop_id: sid,
    };

    const referenceValue = formatShortInvoiceNumber(createdAt);
    payload.ref_id = referenceValue;
    payload.invoice_number = referenceValue;

    if (isUuidLike(providedRepairId)) {
        payload.repair_id = providedRepairId;
    }

    return payload;
}

function buildRepairUpdatePayload(status, extras = {}) {
    const next = {
        status: cleanText(status) || cleanText(extras?.status) || 'pending',
        ...extras,
    };
    delete next.finalAmount;
    delete next.partsCost;

    if (next.status === 'completed' && !next.completed_at && !next.completedAt) {
        const nowIso = new Date().toISOString();
        next.completed_at = nowIso;
        next.completedAt = nowIso;
    }

    if (Object.prototype.hasOwnProperty.call(next, 'completedAt')) {
        const parsedCompletedAt = parseIsoTimestamp(next.completedAt);
        next.completed_at = parsedCompletedAt || next.completed_at || null;
        delete next.completedAt;
    }

    if (Object.prototype.hasOwnProperty.call(next, 'deliveryDate') || Object.prototype.hasOwnProperty.call(next, 'delivery_date') || Object.prototype.hasOwnProperty.call(next, 'delivery_at')) {
        const delivery = toDateOnly(next.delivery_date || next.delivery_at || next.deliveryDate);
        next.delivery_date = delivery || null;
        next.deliveryDate = delivery || null;
        delete next.delivery_at;
    }

    if (Object.prototype.hasOwnProperty.call(next, 'advanceAmount')) {
        next.advance_amount = parseFloat(next.advanceAmount ?? 0) || 0;
        delete next.advanceAmount;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'estimatedCost')) {
        next.estimated_cost = parseFloat(next.estimatedCost ?? 0) || 0;
        delete next.estimatedCost;
    }
    if (Array.isArray(next.partsUsed)) {
        next.partsUsed = next.partsUsed.map(normalizeRepairPart);
    }

    return next;
}

function buildRepairPartPayloads(partsUsed = [], repairId = '', shopId = '') {
    const rid = cleanText(repairId);
    const sid = cleanText(shopId);
    if (!rid || !sid) return [];

    return (Array.isArray(partsUsed) ? partsUsed : [])
        .map((part, index) => {
            const normalized = normalizeRepairPart(part);
            const partId = cleanText(normalized?.id) || `rp-${rid}-${index + 1}`;
            if (!normalized.product_id && !cleanText(normalized.name)) return null;
            return {
                id: partId,
                shop_id: sid,
                repair_id: rid,
                product_id: normalized.product_id || null,
                name: cleanText(normalized.name) || null,
                qty: parseFloat(normalized.qty ?? normalized.quantity ?? 1) || 1,
                price: parseFloat(normalized.price ?? normalized.costPrice ?? 0) || 0,
            };
        })
        .filter(Boolean);
}

export function RepairsProvider({ children }) {
    const { activeShopId, user } = useAuth();
    const [repairJobs, setRepairJobs] = useState([]);
    const [repairsLoaded, setRepairsLoaded] = useState(false);
    const optionalRelationsRef = useRef({ repair_parts: true });
    const isOptionalRelationAvailable = useCallback((relationName = '') => (
        optionalRelationsRef.current[cleanText(relationName)] !== false
    ), []);
    const markOptionalRelationUnavailable = useCallback((relationName = '') => {
        const key = cleanText(relationName);
        if (!key) return;
        optionalRelationsRef.current[key] = false;
    }, []);

    useEffect(() => {
        const sid = cleanText(activeShopId);
        if (!sid) {
            setRepairJobs([]);
            setRepairsLoaded(false);
            return undefined;
        }

        let cancelled = false;
        setRepairsLoaded(false);

        const fetchRepairs = async () => {
            const [repairsResult, partsResult] = await Promise.all([
                supabase.from('repairs').select('*').eq('shop_id', sid),
                isOptionalRelationAvailable('repair_parts')
                    ? supabase.from('repair_parts').select('*').eq('shop_id', sid)
                    : Promise.resolve({ data: [], error: null }),
            ]);

            if (cancelled) return;

            if (partsResult?.error && isMissingRelationError(partsResult.error, 'repair_parts')) {
                markOptionalRelationUnavailable('repair_parts');
            }
            const partsByRepair = (!partsResult.error && Array.isArray(partsResult.data))
                ? buildRepairPartsMap(partsResult.data)
                : {};

            if (!repairsResult.error && Array.isArray(repairsResult.data)) {
                const normalized = repairsResult.data.map((row) => normalizeRepairRecord(row, partsByRepair));
                setRepairJobs(sortRepairsByCreatedAt(normalized));
            } else {
                setRepairJobs([]);
            }
            setRepairsLoaded(true);
        };
        fetchRepairs();

        const shopFilter = `shop_id=eq.${sid}`;
        const repairsSub = supabase.channel(`public:repairs:${sid}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                const incoming = normalizeRepairRecord(payload.new);
                setRepairJobs((prev) => {
                    if (prev.some((job) => String(job.id) === String(incoming.id))) return prev;
                    return sortRepairsByCreatedAt([incoming, ...prev]);
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                const incoming = normalizeRepairRecord(payload.new);
                setRepairJobs((prev) => sortRepairsByCreatedAt(
                    prev.map((job) => String(job.id) === String(incoming.id)
                        ? normalizeRepairRecord({ ...job, ...incoming }, { [incoming.id]: incoming.partsUsed || [] })
                        : job)
                ));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'repairs', filter: shopFilter }, (payload) => {
                setRepairJobs((prev) => prev.filter((job) => String(job.id) !== String(payload.old.repair_id || payload.old.id)));
            })
            .on('broadcast', { event: 'repair_sync' }, (payload) => {
                const { action, data } = payload.payload || {};
                if (!data || cleanText(data.shop_id) !== sid) return;
                const incoming = normalizeRepairRecord(data);
                if (action === 'INSERT') {
                    setRepairJobs((prev) => {
                        if (prev.some((job) => String(job.id) === String(incoming.id))) return prev;
                        return sortRepairsByCreatedAt([incoming, ...prev]);
                    });
                } else if (action === 'UPDATE') {
                    setRepairJobs((prev) => sortRepairsByCreatedAt(
                        prev.map((job) => String(job.id) === String(incoming.id)
                            ? normalizeRepairRecord({ ...job, ...incoming }, { [incoming.id]: incoming.partsUsed || [] })
                            : job)
                    ));
                } else if (action === 'DELETE') {
                    setRepairJobs((prev) => prev.filter((job) => String(job.id) !== String(incoming.id)));
                }
            })
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(repairsSub);
        };
    }, [activeShopId, isOptionalRelationAvailable, markOptionalRelationUnavailable]);

    const generateRefId = useCallback(() => formatShortInvoiceNumber(new Date()), []);

    const syncRepairParts = useCallback(async (repairId, partsUsed = [], shopIdOverride = '') => {
        const sid = cleanText(shopIdOverride || activeShopId);
        const rid = cleanText(repairId);
        if (!sid || !rid) return;
        if (!isOptionalRelationAvailable('repair_parts')) return;

        const deleteResult = await supabase
            .from('repair_parts')
            .delete()
            .eq('shop_id', sid)
            .eq('repair_id', rid);

        if (deleteResult.error && isMissingRelationError(deleteResult.error, 'repair_parts')) {
            markOptionalRelationUnavailable('repair_parts');
            return;
        }
        if (deleteResult.error) {
            throw new Error(deleteResult.error.message || 'Failed to clear repair parts.');
        }

        const payloads = buildRepairPartPayloads(partsUsed, rid, sid);
        if (!payloads.length) return;

        for (const payload of payloads) {
            const insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('repair_parts').insert([candidate]),
                payload
            );
            if (insertResult.error && isMissingRelationError(insertResult.error, 'repair_parts')) {
                markOptionalRelationUnavailable('repair_parts');
                return;
            }
            if (insertResult.error) {
                throw new Error(insertResult.error.message || 'Failed to save repair parts.');
            }
        }
    }, [activeShopId, isOptionalRelationAvailable, markOptionalRelationUnavailable]);

    const addRepair = useCallback(async (repairData) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const refId = generateRefId();
        const createdAt = new Date().toISOString();
        const deliveryAt = toDateOnly(repairData?.delivery_at || repairData?.deliveryDate);
        const newJob = normalizeRepairRecord({
            ...repairData,
            id: String(Date.now()),
            refId,
            invoiceNumber: refId,
            invoice_number: refId,
            status: 'pending',
            created_by: isUuidLike(String(user?.id || '').trim()) ? String(user.id).trim() : null,
            createdBy: isUuidLike(String(user?.id || '').trim()) ? String(user.id).trim() : null,
            created_at: createdAt,
            createdAt,
            completed_at: null,
            completedAt: null,
            delivery_at: deliveryAt || null,
            deliveryDate: deliveryAt || '',
            estimatedCost: parseFloat(repairData?.estimatedCost ?? 0) || 0,
            advanceAmount: parseFloat(repairData?.advanceAmount ?? 0) || 0,
            partsUsed: [],
            shop_id: sid,
        });

        setRepairJobs((prev) => sortRepairsByCreatedAt([newJob, ...prev]));

        const insertPayload = buildRepairInsertPayload(newJob, sid);
        let insertResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('repairs').insert([candidate]).select('*').single(),
            insertPayload
        );

        if (insertResult.error && isInvoiceNumberUniqueConstraintError(insertResult.error)) {
            const duplicateFallbackPayload = { ...insertPayload };
            delete duplicateFallbackPayload.invoice_number;
            insertResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('repairs').insert([candidate]).select('*').single(),
                duplicateFallbackPayload
            );
        }

        if (insertResult.error && isMissingColumnError(insertResult.error, 'advanceAmount')) {
            const fallbackPayload = { ...insertPayload };
            delete fallbackPayload.advanceAmount;
            const retryResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('repairs').insert([candidate]).select('*').single(),
                fallbackPayload
            );
            if (retryResult.error) {
                setRepairJobs((prev) => prev.filter((job) => String(job.id) !== String(newJob.id)));
                throw new Error(retryResult.error.message || 'Failed to save repair job.');
            }
            const persisted = normalizeRepairRecord(retryResult.data || {}, {
                [String(retryResult.data?.repair_id || retryResult.data?.id || newJob.id)]: newJob.partsUsed || []
            });
            const persistedId = cleanText(persisted?.id) || cleanText(newJob.id);
            const savedJob = normalizeRepairRecord({ ...newJob, ...persisted, id: persistedId, shop_id: sid }, {
                [persistedId]: newJob.partsUsed || []
            });
            setRepairJobs((prev) => sortRepairsByCreatedAt(
                prev.map((job) => String(job.id) === String(newJob.id) ? savedJob : job)
            ));

            try {
                await syncRepairParts(persistedId, newJob.partsUsed, sid);
            } catch (partsError) {
                console.error(partsError);
            }

            supabase.channel(`public:repairs:${sid}`).send({
                type: 'broadcast',
                event: 'repair_sync',
                payload: { action: 'INSERT', data: savedJob }
            }).catch((error) => console.error(error));

            return savedJob;
        } else if (insertResult.error) {
            setRepairJobs((prev) => prev.filter((job) => String(job.id) !== String(newJob.id)));
            throw new Error(insertResult.error.message || 'Failed to save repair job.');
        }

        const persisted = normalizeRepairRecord(insertResult.data || {}, {
            [String(insertResult.data?.repair_id || insertResult.data?.id || newJob.id)]: newJob.partsUsed || []
        });
        const persistedId = cleanText(persisted?.id) || cleanText(newJob.id);
        const savedJob = normalizeRepairRecord({ ...newJob, ...persisted, id: persistedId, shop_id: sid }, {
            [persistedId]: newJob.partsUsed || []
        });
        setRepairJobs((prev) => sortRepairsByCreatedAt(
            prev.map((job) => String(job.id) === String(newJob.id) ? savedJob : job)
        ));

        try {
            await syncRepairParts(persistedId, newJob.partsUsed, sid);
        } catch (partsError) {
            console.error(partsError);
        }

        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'INSERT', data: savedJob }
        }).catch((error) => console.error(error));

        return savedJob;
    }, [activeShopId, generateRefId, syncRepairParts, user?.id]);

    const updateRepairStatus = useCallback(async (id, status, extras = {}) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        const currentJob = repairJobs.find((job) => String(job.id) === strId) || null;
        const patch = buildRepairUpdatePayload(status, extras);
        const mergedLocal = normalizeRepairRecord({ ...(currentJob || {}), ...patch, id: strId, shop_id: sid }, {
            [strId]: Array.isArray(patch.partsUsed) ? patch.partsUsed : (currentJob?.partsUsed || [])
        });

        setRepairJobs((prev) => sortRepairsByCreatedAt(
            prev.map((job) => String(job.id) === strId ? mergedLocal : job)
        ));

        const updateResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('repairs').update(candidate).eq('repair_id', strId).eq('shop_id', sid),
            patch
        );

        if (updateResult.error && isMissingColumnError(updateResult.error, 'advanceAmount')) {
            const fallbackPatch = { ...patch };
            delete fallbackPatch.advanceAmount;
            const retryResult = await executeWithPrunedColumns(
                (candidate) => supabase.from('repairs').update(candidate).eq('repair_id', strId).eq('shop_id', sid),
                fallbackPatch
            );
            if (retryResult.error) {
                throw new Error(retryResult.error.message || 'Failed to update repair job.');
            }
        } else if (updateResult.error) {
            throw new Error(updateResult.error.message || 'Failed to update repair job.');
        }

        if (Array.isArray(patch.partsUsed)) {
            try {
                await syncRepairParts(strId, patch.partsUsed, sid);
            } catch (partsError) {
                console.error(partsError);
            }
        }

        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'UPDATE', data: { id: strId, shop_id: sid, ...mergedLocal } }
        }).catch((error) => console.error(error));
    }, [activeShopId, repairJobs, syncRepairParts]);

    const deleteRepair = useCallback(async (id) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        setRepairJobs((prev) => prev.filter((job) => String(job.id) !== strId));

        if (isOptionalRelationAvailable('repair_parts')) {
            const partsDelete = await supabase
                .from('repair_parts')
                .delete()
                .eq('shop_id', sid)
                .eq('repair_id', strId);
            if (partsDelete.error && isMissingRelationError(partsDelete.error, 'repair_parts')) {
                markOptionalRelationUnavailable('repair_parts');
            } else if (partsDelete.error) {
                throw new Error(partsDelete.error.message || 'Failed to remove linked repair parts.');
            }
        }

        await supabase.from('repairs').delete().eq('repair_id', strId).eq('shop_id', sid);

        supabase.channel(`public:repairs:${sid}`).send({
            type: 'broadcast',
            event: 'repair_sync',
            payload: { action: 'DELETE', data: { id: strId, shop_id: sid } }
        }).catch((error) => console.error(error));
    }, [activeShopId, isOptionalRelationAvailable, markOptionalRelationUnavailable]);

    const value = {
        repairJobs,
        repairsLoaded,
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
