import { supabase } from '../supabaseClient';

const STARTING_INVOICE_NUMBER = 120010;
let localInvoiceCounter = null;
let reservationQueue = Promise.resolve();

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
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

