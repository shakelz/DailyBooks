import { supabase } from '../supabaseClient';

const STARTING_INVOICE_NUMBER = 120010;
let localInvoiceCounter = null;
let reservationQueue = Promise.resolve();

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeStageCode(value = '') {
    const raw = cleanText(value).toLowerCase();
    if (!raw) return '';
    if (raw === 'a' || raw === 'advance') return 'A';
    if (raw === 'f' || raw === 'final') return 'F';
    return '';
}

function extractStageCodeFromText(value = '') {
    const raw = cleanText(value);
    if (!raw) return '';
    const normalized = raw.toLowerCase();

    if (normalized.includes('repair_payment_stage=advance')) return 'A';
    if (normalized.includes('repair_payment_stage=final')) return 'F';
    if (/\bstage\s*[:=]\s*advance\b/i.test(raw)) return 'A';
    if (/\bstage\s*[:=]\s*final\b/i.test(raw)) return 'F';
    if (/^\d{6}-a$/i.test(raw) || /^\d{6}-advance(?:-|$)/i.test(raw)) return 'A';
    if (/^\d{6}-f$/i.test(raw) || /^\d{6}-final(?:-|$)/i.test(raw)) return 'F';

    return '';
}

function extractRepairInvoiceBase(value = '') {
    const raw = cleanText(value);
    if (!raw) return '';
    const noteMatch = raw.match(/invoice_number\s*[=:]\s*(\d{6})/i);
    if (noteMatch?.[1]) return noteMatch[1];
    return '';
}

function extractOnlineOrderInvoiceBase(value = '') {
    const raw = cleanText(value);
    if (!raw) return '';
    const noteMatch = raw.match(/abholschein\s*[:#]?\s*(\d{6})/i);
    if (noteMatch?.[1]) return noteMatch[1];
    return '';
}

export function extractInvoiceNumberBase(value = '') {
    const raw = cleanText(String(value || ''));
    if (!raw) return '';

    const prefixedMatch = raw.match(/^(\d{6})(?:$|-[A-Za-z0-9-]+)/);
    if (prefixedMatch?.[1]) return prefixedMatch[1];

    const exactMatch = raw.match(/^(\d{6})$/);
    if (exactMatch?.[1]) return exactMatch[1];

    return '';
}

export function buildStageInvoiceNumber(baseValue = '', stageHint = '') {
    const base = extractInvoiceNumberBase(baseValue);
    if (!base) return cleanText(String(baseValue || ''));

    const stage = normalizeStageCode(stageHint) || extractStageCodeFromText(baseValue);
    return stage ? `${base}-${stage}` : base;
}

export function getCleanTransactionInvoiceNumber(txn = {}) {
    const rawInvoice = cleanText(String(txn?.invoice_number || txn?.invoiceNumber || ''));
    const notes = cleanText(String(txn?.notes || ''));
    const description = cleanText(String(txn?.desc || txn?.description || ''));
    const category = cleanText(String(txn?.category || ''));
    const source = cleanText(String(txn?.source || txn?.tx_source || '')).toLowerCase();

    let base = '';
    if (source === 'repair') {
        base = extractRepairInvoiceBase(notes)
            || extractRepairInvoiceBase(description)
            || extractInvoiceNumberBase(rawInvoice);
    } else if (source === 'online-order') {
        base = extractOnlineOrderInvoiceBase(notes)
            || extractOnlineOrderInvoiceBase(description)
            || extractInvoiceNumberBase(rawInvoice);
    } else {
        base = extractInvoiceNumberBase(rawInvoice);
    }

    if (!base) return rawInvoice;

    const stage = extractStageCodeFromText(notes)
        || extractStageCodeFromText(description)
        || extractStageCodeFromText(category)
        || extractStageCodeFromText(rawInvoice);

    if (source === 'repair' || source === 'online-order') {
        return stage ? `${base}-${stage}` : base;
    }

    return buildStageInvoiceNumber(rawInvoice, stage) || base;
}

function parseSixDigitInvoiceNumber(value = '') {
    const raw = cleanText(String(value || ''));
    if (!/^\d{6}$/.test(raw)) return 0;
    return Number(raw) || 0;
}

async function fetchMaxSequentialNumber(tableName, columnName) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .select(columnName)
            .order(columnName, { ascending: false })
            .limit(50);

        if (error) return STARTING_INVOICE_NUMBER - 1;

        return (Array.isArray(data) ? data : []).reduce((maxValue, row) => {
            const numericValue = parseSixDigitInvoiceNumber(row?.[columnName]);
            return numericValue > maxValue ? numericValue : maxValue;
        }, STARTING_INVOICE_NUMBER - 1);
    } catch {
        return STARTING_INVOICE_NUMBER - 1;
    }
}

async function reserveNextInvoiceNumberInternal() {
    const rpcResult = await supabase.rpc('next_global_invoice_number');
    const rpcValue = cleanText(String(rpcResult?.data || ''));
    if (!rpcResult?.error && /^\d{6}$/.test(rpcValue)) {
        localInvoiceCounter = Number(rpcValue);
        return rpcValue;
    }

    if (localInvoiceCounter === null) {
        const [transactionMax, repairMax, onlineOrderMax] = await Promise.all([
            fetchMaxSequentialNumber('transactions', 'invoice_number'),
            fetchMaxSequentialNumber('repairs', 'invoice_number'),
            fetchMaxSequentialNumber('online_part_orders', 'abholschein_number'),
        ]);
        localInvoiceCounter = Math.max(
            STARTING_INVOICE_NUMBER - 1,
            transactionMax,
            repairMax,
            onlineOrderMax
        );
    }

    localInvoiceCounter += 1;
    return String(localInvoiceCounter).padStart(6, '0');
}

export async function reserveNextInvoiceNumber() {
    const run = async () => reserveNextInvoiceNumberInternal();
    const nextReservation = reservationQueue.then(run, run);
    reservationQueue = nextReservation.then(() => undefined, () => undefined);
    return nextReservation;
}
