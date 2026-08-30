import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { reserveNextInvoiceNumber } from '../utils/invoiceNumbers';

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

function isUuidLike(value) {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw);
}

function normalizeUuidArray(values = []) {
    if (!Array.isArray(values)) return [];
    return values
        .map((value) => cleanText(value))
        .filter((value) => isUuidLike(value));
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

const REPAIR_META_REGEX = /<!--REPAIR_META:([\s\S]*?)-->/;

function packRepairMetadata(problemText = '', meta = {}) {
    const cleanProblem = String(problemText || '').replace(REPAIR_META_REGEX, '').trim();
    const hasMeta = Boolean(
        meta.notes ||
        (meta.repairPerformer && meta.repairPerformer !== 'shop') ||
        meta.technicianName ||
        (meta.externalCost && Number(meta.externalCost) > 0) ||
        (meta.deviceLocation && meta.deviceLocation !== 'in_shop') ||
        meta.sentToTechnicianAt ||
        meta.receivedFromTechnicianAt
    );
    if (!hasMeta) return cleanProblem;

    const payload = {
        n: meta.notes ? String(meta.notes).trim() : undefined,
        p: meta.repairPerformer || undefined,
        t: meta.technicianName ? String(meta.technicianName).trim() : undefined,
        c: meta.externalCost ? Number(meta.externalCost) : undefined,
        l: meta.deviceLocation || undefined,
        s: meta.sentToTechnicianAt || undefined,
        r: meta.receivedFromTechnicianAt || undefined,
    };

    return `${cleanProblem} <!--REPAIR_META:${JSON.stringify(payload)}-->`.trim();
}

function unpackRepairMetadata(rawProblem = '') {
    const text = String(rawProblem || '');
    const match = text.match(REPAIR_META_REGEX);
    const cleanProblem = text.replace(REPAIR_META_REGEX, '').trim();
    if (!match || !match[1]) {
        return { problem: cleanProblem, meta: {} };
    }
    try {
        const parsed = JSON.parse(match[1]);
        return {
            problem: cleanProblem,
            meta: {
                notes: parsed.n || parsed.notes || '',
                repairPerformer: parsed.p || parsed.repairPerformer || 'shop',
                technicianName: parsed.t || parsed.technicianName || '',
                externalCost: parseFloat(parsed.c ?? parsed.externalCost ?? 0) || 0,
                deviceLocation: parsed.l || parsed.deviceLocation || 'in_shop',
                sentToTechnicianAt: parsed.s || parsed.sentToTechnicianAt || null,
                receivedFromTechnicianAt: parsed.r || parsed.receivedFromTechnicianAt || null,
            }
        };
    } catch {
        return { problem: cleanProblem, meta: {} };
    }
}

function normalizeRepairRecord(record = {}, partsByRepair = {}) {
    const id = cleanText(record?.repair_id || record?.id) || String(record?.repair_id || record?.id || '');
    const createdIso = parseIsoTimestamp(record?.created_at || record?.createdAt || record?.timestamp) || new Date().toISOString();
    const completedIso = parseIsoTimestamp(record?.completed_at || record?.completedAt);
    const deliveryAt = toDateOnly(record?.delivery_date || record?.delivery_at || record?.deliveryDate);

    // Unpack metadata embedded in problem for schemas without extra columns
    const rawProblem = record?.problem || record?.issueType || '';
    const { problem: cleanProblem, meta: unpackedMeta } = unpackRepairMetadata(rawProblem);

    const notes = cleanText(record?.notes || record?.note || unpackedMeta.notes || '');
    const repairPerformer = cleanText(record?.repair_performer || record?.repairPerformer || unpackedMeta.repairPerformer || 'shop') || 'shop';
    const technicianName = cleanText(record?.technician_name || record?.technicianName || unpackedMeta.technicianName || '');
    const externalCost = parseFloat(record?.external_cost ?? record?.externalCost ?? record?.amount_paid_to_technician ?? record?.amountPaidToTechnician ?? unpackedMeta.externalCost ?? 0) || 0;
    const deviceLocation = cleanText(record?.device_location || record?.deviceLocation || unpackedMeta.deviceLocation || 'in_shop') || 'in_shop';

    const sentAt = parseIsoTimestamp(record?.sent_to_technician_at || record?.sentToTechnicianAt || unpackedMeta.sentToTechnicianAt);
    const receivedBackAt = parseIsoTimestamp(record?.received_from_technician_at || record?.receivedFromTechnicianAt || unpackedMeta.receivedFromTechnicianAt);

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
        problem: cleanProblem,
        notes,
        repairPerformer,
        repair_performer: repairPerformer,
        technicianName,
        technician_name: technicianName,
        externalCost,
        external_cost: externalCost,
        deviceLocation,
        device_location: deviceLocation,
        sentToTechnicianAt: sentAt || null,
        sent_to_technician_at: sentAt || null,
        receivedFromTechnicianAt: receivedBackAt || null,
        received_from_technician_at: receivedBackAt || null,
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
    const sentAt = parseIsoTimestamp(repair?.sent_to_technician_at || repair?.sentToTechnicianAt);
    const receivedBackAt = parseIsoTimestamp(repair?.received_from_technician_at || repair?.receivedFromTechnicianAt);

    const notes = cleanText(repair?.notes || repair?.note || '');
    const repairPerformer = cleanText(repair?.repairPerformer || repair?.repair_performer || 'shop') || 'shop';
    const technicianName = cleanText(repair?.technicianName || repair?.technician_name || '') || null;
    const externalCost = parseFloat(repair?.externalCost ?? repair?.external_cost ?? 0) || 0;
    const deviceLocation = cleanText(repair?.deviceLocation || repair?.device_location || 'in_shop') || 'in_shop';

    const packedProblem = packRepairMetadata(repair?.problem, {
        notes,
        repairPerformer,
        technicianName,
        externalCost,
        deviceLocation,
        sentToTechnicianAt: sentAt,
        receivedFromTechnicianAt: receivedBackAt,
    });

    const providedRepairId = cleanText(repair?.id);
    const payload = {
        customer_name: cleanText(repair?.customerName),
        customer_phone: cleanText(repair?.phone),
        device_model: cleanText(repair?.deviceModel),
        imei: cleanText(repair?.imei),
        problem: packedProblem,
        notes,
        repair_performer: repairPerformer,
        technician_name: technicianName,
        external_cost: externalCost,
        device_location: deviceLocation,
        sent_to_technician_at: sentAt || null,
        received_from_technician_at: receivedBackAt || null,
        advance_amount: parseFloat(repair?.advanceAmount ?? 0) || 0,
        estimated_cost: parseFloat(repair?.estimatedCost ?? repair?.cost ?? 0) || 0,
        delivery_date: deliveryAt || null,
        used_part_order_ids: normalizeUuidArray(repair?.used_part_order_ids),
        status: cleanText(repair?.status) || 'pending',
        created_by: cleanText(repair?.created_by || repair?.createdBy || repair?.workerId || repair?.user_id) || null,
        created_at: createdAt,
        completed_at: completedAt || null,
        shop_id: sid,
    };

    const referenceValue = cleanText(repair?.invoiceNumber || repair?.invoice_number || repair?.refId || repair?.ref_id);
    payload.invoice_number = referenceValue || null;
    payload.ref_id = referenceValue || null;
    payload.refId = referenceValue || null;

    if (isUuidLike(providedRepairId)) {
        payload.repair_id = providedRepairId;
    }

    return payload;
}

function buildRepairUpdatePayload(status, extras = {}, currentJob = null) {
    const next = {
        status: cleanText(status) || cleanText(extras?.status) || (currentJob?.status || 'pending'),
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
    if (Object.prototype.hasOwnProperty.call(next, 'externalCost') || Object.prototype.hasOwnProperty.call(next, 'external_cost')) {
        const extCost = parseFloat(next.externalCost ?? next.external_cost ?? 0) || 0;
        next.external_cost = extCost;
        next.externalCost = extCost;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'repairPerformer') || Object.prototype.hasOwnProperty.call(next, 'repair_performer')) {
        const performer = cleanText(next.repairPerformer || next.repair_performer || 'shop') || 'shop';
        next.repair_performer = performer;
        next.repairPerformer = performer;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'technicianName') || Object.prototype.hasOwnProperty.call(next, 'technician_name')) {
        const techName = cleanText(next.technicianName || next.technician_name || '');
        next.technician_name = techName;
        next.technicianName = techName;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'deviceLocation') || Object.prototype.hasOwnProperty.call(next, 'device_location')) {
        const loc = cleanText(next.deviceLocation || next.device_location || 'in_shop') || 'in_shop';
        next.device_location = loc;
        next.deviceLocation = loc;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'sentToTechnicianAt') || Object.prototype.hasOwnProperty.call(next, 'sent_to_technician_at')) {
        const sAt = parseIsoTimestamp(next.sentToTechnicianAt || next.sent_to_technician_at);
        next.sent_to_technician_at = sAt || null;
        next.sentToTechnicianAt = sAt || null;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'receivedFromTechnicianAt') || Object.prototype.hasOwnProperty.call(next, 'received_from_technician_at')) {
        const rAt = parseIsoTimestamp(next.receivedFromTechnicianAt || next.received_from_technician_at);
        next.received_from_technician_at = rAt || null;
        next.receivedFromTechnicianAt = rAt || null;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'notes') || Object.prototype.hasOwnProperty.call(next, 'note')) {
        const notes = cleanText(next.notes || next.note || '');
        next.notes = notes;
    }

    // Always pack metadata into problem for bulletproof persistence across table schemas
    const rawProblem = next.problem || currentJob?.problem || '';
    const mergedNotes = next.notes !== undefined ? next.notes : (currentJob?.notes || '');
    const mergedPerformer = next.repairPerformer || next.repair_performer || currentJob?.repairPerformer || 'shop';
    const mergedTech = next.technicianName !== undefined ? next.technicianName : (currentJob?.technicianName || '');
    const mergedCost = next.externalCost !== undefined ? next.externalCost : (currentJob?.externalCost || 0);
    const mergedLoc = next.deviceLocation || next.device_location || currentJob?.deviceLocation || 'in_shop';
    const mergedSent = next.sentToTechnicianAt !== undefined ? next.sentToTechnicianAt : (currentJob?.sentToTechnicianAt || null);
    const mergedRec = next.receivedFromTechnicianAt !== undefined ? next.receivedFromTechnicianAt : (currentJob?.receivedFromTechnicianAt || null);

    next.problem = packRepairMetadata(rawProblem, {
        notes: mergedNotes,
        repairPerformer: mergedPerformer,
        technicianName: mergedTech,
        externalCost: mergedCost,
        deviceLocation: mergedLoc,
        sentToTechnicianAt: mergedSent,
        receivedFromTechnicianAt: mergedRec,
    });

    if (Array.isArray(next.partsUsed)) {
        next.partsUsed = next.partsUsed.map(normalizeRepairPart);
    }

    return next;
}
export function RepairsProvider({ children }) {
    const { activeShopId, user } = useAuth();
    const [repairJobs, setRepairJobs] = useState([]);
    const [repairsLoaded, setRepairsLoaded] = useState(false);
    const repairChannelRef = useRef(null);
    const broadcastRepairSync = useCallback((payload) => {
        const channel = repairChannelRef.current;
        if (!channel) return Promise.resolve(null);
        return channel.send({
            type: 'broadcast',
            event: 'repair_sync',
            payload,
        });
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
            let allRepairs = [];
            let offset = 0;
            const PAGE_SIZE = 1000;
            let lastError = null;

            while (true) {
                const repairsResult = await supabase
                    .from('repairs')
                    .select('*')
                    .eq('shop_id', sid)
                    .range(offset, offset + PAGE_SIZE - 1);

                if (repairsResult.error) {
                    lastError = repairsResult.error;
                    break;
                }

                const batch = Array.isArray(repairsResult.data) ? repairsResult.data : [];
                allRepairs.push(...batch);

                if (batch.length < PAGE_SIZE) break;
                offset += PAGE_SIZE;
            }

            if (cancelled) return;

            if (!lastError && allRepairs.length >= 0) {
                const normalized = allRepairs.map((row) => normalizeRepairRecord(row));
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
        repairChannelRef.current = repairsSub;

        return () => {
            cancelled = true;
            if (repairChannelRef.current === repairsSub) {
                repairChannelRef.current = null;
            }
            supabase.removeChannel(repairsSub);
        };
    }, [activeShopId]);

    const generateRefId = useCallback(async () => reserveNextInvoiceNumber(), []);

    const syncRepairParts = useCallback(async (repairId, partsUsed = [], shopIdOverride = '') => {
        void repairId;
        void partsUsed;
        void shopIdOverride;
    }, []);

    const addRepair = useCallback(async (repairData) => {
        const sid = cleanText(activeShopId);
        if (!sid) throw new Error('No active shop selected.');

        const refId = await generateRefId();
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


        const insertPayload = buildRepairInsertPayload(newJob, sid);
        let insertResult = await executeWithPrunedColumns(
            (candidate) => supabase.from('repairs').insert([candidate]).select('*').single(),
            insertPayload
        );

        if (insertResult.error && isInvoiceNumberUniqueConstraintError(insertResult.error)) {
            const duplicateRefId = await reserveNextInvoiceNumber();
            const duplicateFallbackPayload = {
                ...insertPayload,
                invoice_number: duplicateRefId,
                ref_id: duplicateRefId,
                refId: duplicateRefId,
            };
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
                throw new Error(retryResult.error.message || 'Failed to save repair job.');
            }
            const persisted = normalizeRepairRecord(retryResult.data || {}, {
                [String(retryResult.data?.repair_id || retryResult.data?.id || newJob.id)]: newJob.partsUsed || []
            });
            const persistedId = cleanText(persisted?.id) || cleanText(newJob.id);
            const savedJob = normalizeRepairRecord({ ...newJob, ...persisted, id: persistedId, shop_id: sid }, {
                [persistedId]: newJob.partsUsed || []
            });
            setRepairJobs((prev) => {
                if (prev.some((job) => String(job.id) === String(savedJob.id))) return prev;
                return sortRepairsByCreatedAt([savedJob, ...prev]);
            });

            try {
                await syncRepairParts(persistedId, newJob.partsUsed, sid);
            } catch (partsError) {
                console.error(partsError);
            }

            broadcastRepairSync({ action: 'INSERT', data: savedJob }).catch((error) => console.error(error));

            return savedJob;
        } else if (insertResult.error) {
            throw new Error(insertResult.error.message || 'Failed to save repair job.');
        }

        const persisted = normalizeRepairRecord(insertResult.data || {}, {
            [String(insertResult.data?.repair_id || insertResult.data?.id || newJob.id)]: newJob.partsUsed || []
        });
        const persistedId = cleanText(persisted?.id) || cleanText(newJob.id);
        const savedJob = normalizeRepairRecord({ ...newJob, ...persisted, id: persistedId, shop_id: sid }, {
            [persistedId]: newJob.partsUsed || []
        });
        setRepairJobs((prev) => {
            if (prev.some((job) => String(job.id) === String(savedJob.id))) return prev;
            return sortRepairsByCreatedAt([savedJob, ...prev]);
        });

        try {
            await syncRepairParts(persistedId, newJob.partsUsed, sid);
        } catch (partsError) {
            console.error(partsError);
        }

        broadcastRepairSync({ action: 'INSERT', data: savedJob }).catch((error) => console.error(error));

        return savedJob;
    }, [activeShopId, broadcastRepairSync, generateRefId, syncRepairParts, user?.id]);

    const updateRepairStatus = useCallback(async (id, status, extras = {}) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        const currentJob = repairJobs.find((job) => String(job.id) === strId) || null;
        const patch = buildRepairUpdatePayload(status, extras, currentJob);
        const dbPatch = { ...patch };
        delete dbPatch.partsUsed;
        delete dbPatch.ref_id;
        delete dbPatch.refId;
        const mergedLocal = normalizeRepairRecord({ ...(currentJob || {}), ...patch, id: strId, shop_id: sid }, {
            [strId]: Array.isArray(patch.partsUsed) ? patch.partsUsed : (currentJob?.partsUsed || [])
        });

        setRepairJobs((prev) => sortRepairsByCreatedAt(
            prev.map((job) => String(job.id) === strId ? mergedLocal : job)
        ));

        // Resilient DB updater trying repair_id first, then id
        const performDbUpdate = async (candidatePayload) => {
            let res = await supabase.from('repairs').update(candidatePayload).eq('repair_id', strId).eq('shop_id', sid).select('*');
            if (res.error && (res.error.message?.includes('repair_id') || res.error.code === '42703')) {
                res = await supabase.from('repairs').update(candidatePayload).eq('id', strId).eq('shop_id', sid).select('*');
            } else if (!res.error && (!res.data || (Array.isArray(res.data) && res.data.length === 0))) {
                const fallbackById = await supabase.from('repairs').update(candidatePayload).eq('id', strId).eq('shop_id', sid).select('*');
                if (!fallbackById.error && fallbackById.data && (!Array.isArray(fallbackById.data) || fallbackById.data.length > 0)) {
                    res = fallbackById;
                }
            }
            return res;
        };

        const updateResult = await executeWithPrunedColumns(
            performDbUpdate,
            dbPatch
        );

        if (updateResult.error && isMissingColumnError(updateResult.error, 'advanceAmount')) {
            const fallbackPatch = { ...dbPatch };
            delete fallbackPatch.advanceAmount;
            const retryResult = await executeWithPrunedColumns(
                performDbUpdate,
                fallbackPatch
            );
            if (retryResult.error) {
                console.error('Failed to update repair in DB:', retryResult.error);
            }
        } else if (updateResult.error) {
            console.error('Failed to update repair in DB:', updateResult.error);
        }

        if (Array.isArray(patch.partsUsed)) {
            try {
                await syncRepairParts(strId, patch.partsUsed, sid);
            } catch (partsError) {
                console.error(partsError);
            }
        }

        broadcastRepairSync({ action: 'UPDATE', data: { id: strId, shop_id: sid, ...mergedLocal } }).catch((error) => console.error(error));
        return mergedLocal;
    }, [activeShopId, broadcastRepairSync, repairJobs, syncRepairParts]);

    const deleteRepair = useCallback(async (id) => {
        const sid = cleanText(activeShopId);
        if (!sid) return;

        const strId = cleanText(id);
        if (!strId) return;

        setRepairJobs((prev) => prev.filter((job) => String(job.id) !== strId));

        let res = await supabase.from('repairs').delete().eq('repair_id', strId).eq('shop_id', sid);
        if (res.error && (res.error.message?.includes('repair_id') || res.error.code === '42703')) {
            await supabase.from('repairs').delete().eq('id', strId).eq('shop_id', sid);
        }

        broadcastRepairSync({ action: 'DELETE', data: { id: strId, shop_id: sid } }).catch((error) => console.error(error));
    }, [activeShopId, broadcastRepairSync]);

    const updateRepairJob = useCallback(async (id, fields = {}) => {
        const strId = cleanText(id);
        if (!strId) return;
        const currentJob = repairJobs.find((job) => String(job.id) === strId) || null;
        const status = fields.status || currentJob?.status || 'pending';
        return updateRepairStatus(strId, status, fields);
    }, [repairJobs, updateRepairStatus]);

    const value = {
        repairJobs,
        repairsLoaded,
        addRepair,
        updateRepairStatus,
        updateRepairJob,
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
