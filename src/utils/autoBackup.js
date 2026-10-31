/**
 * Automated 15-day transactions backup utility
 * Exports full transaction logs to a clean CSV file and automatically
 * downloads it every 15 days to the local computer.
 */

const BACKUP_INTERVAL_MS = 15 * 24 * 60 * 60 * 1000; // 15 days
const BACKUP_TIMESTAMP_KEY = 'dailybooks_last_auto_backup_ts';

export function getBackupStatus() {
    try {
        const raw = localStorage.getItem(BACKUP_TIMESTAMP_KEY);
        if (!raw) return { hasBackup: false, lastBackupDate: null, daysSince: null, daysUntilNext: 0 };
        const ts = Number(raw);
        if (Number.isNaN(ts) || ts <= 0) return { hasBackup: false, lastBackupDate: null, daysSince: null, daysUntilNext: 0 };

        const now = Date.now();
        const elapsed = now - ts;
        const daysSince = Math.floor(elapsed / (24 * 60 * 60 * 1000));
        const daysUntilNext = Math.max(0, Math.ceil((BACKUP_INTERVAL_MS - elapsed) / (24 * 60 * 60 * 1000)));

        return {
            hasBackup: true,
            lastBackupDate: new Date(ts),
            daysSince,
            daysUntilNext,
            dueNow: elapsed >= BACKUP_INTERVAL_MS,
        };
    } catch {
        return { hasBackup: false, lastBackupDate: null, daysSince: null, daysUntilNext: 0, dueNow: false };
    }
}

function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
}

export function exportTransactionsCSV(transactions = [], shops = [], customFilename = '') {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return false;
    }

    const shopMap = {};
    (Array.isArray(shops) ? shops : []).forEach((s) => {
        if (s?.id) shopMap[String(s.id)] = s?.name || s?.shop_name || 'Shop';
    });

    const headers = [
        'ID',
        'Date',
        'Time',
        'Type',
        'Item / Description',
        'Category',
        'Subcategory',
        'Quantity',
        'Unit Price (€)',
        'Total Amount (€)',
        'Payment Method',
        'Worker / Salesman',
        'Shop',
        'Invoice Number',
        'Notes',
    ];

    const rows = transactions.map((txn) => {
        const shopId = String(txn?.shop_id || txn?.shopId || '');
        const shopName = shopMap[shopId] || txn?.shopName || shopId || '-';
        const dateVal = txn?.date || (txn?.created_at ? new Date(txn.created_at).toLocaleDateString('de-DE') : '');
        const timeVal = txn?.time || (txn?.created_at ? new Date(txn.created_at).toLocaleTimeString('de-DE') : '');
        const desc = txn?.desc || txn?.description || txn?.name || txn?.productName || '';
        const cat = txn?.category || txn?.category_name || '';
        const subCat = txn?.subCategory || txn?.sub_category || '';
        const qty = txn?.qty ?? txn?.quantity ?? 1;
        const unitPrice = parseFloat(txn?.unitPrice ?? txn?.unit_price ?? txn?.amount ?? 0) || 0;
        const totalAmount = parseFloat(txn?.amount ?? txn?.total ?? 0) || 0;
        const paymentMethod = txn?.paymentMethod || txn?.payment_method || 'Bar';
        const worker = txn?.workerName || txn?.salesmanName || txn?.created_by_name || '';
        const invoiceNum = txn?.invoiceNumber || txn?.invoice_number || txn?.invNum || '';
        const notes = txn?.notes || '';

        return [
            escapeCsvField(txn?.id || txn?.transactionId || ''),
            escapeCsvField(dateVal),
            escapeCsvField(timeVal),
            escapeCsvField(txn?.type || txn?.tx_type || 'Sale'),
            escapeCsvField(desc),
            escapeCsvField(cat),
            escapeCsvField(subCat),
            escapeCsvField(qty),
            escapeCsvField(unitPrice.toFixed(2)),
            escapeCsvField(totalAmount.toFixed(2)),
            escapeCsvField(paymentMethod),
            escapeCsvField(worker),
            escapeCsvField(shopName),
            escapeCsvField(invoiceNum),
            escapeCsvField(notes),
        ].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = customFilename || `Carefone-Backup-Transactions-${dateStr}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    try {
        localStorage.setItem(BACKUP_TIMESTAMP_KEY, String(now.getTime()));
    } catch {}

    return true;
}

export function checkAndTriggerAutoBackup(transactions = [], shops = []) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return { triggered: false, reason: 'no_transactions' };
    }

    const status = getBackupStatus();

    // If never backed up, or >= 15 days have passed since last backup
    if (!status.hasBackup || status.dueNow) {
        const success = exportTransactionsCSV(transactions, shops);
        if (success) {
            console.log('[AutoBackup] 15-day automated transactions backup downloaded successfully.');
            return { triggered: true };
        }
    }

    return { triggered: false, daysUntilNext: status.daysUntilNext };
}
