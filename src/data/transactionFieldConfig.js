const RELATED_FIELD_CONFIG = {
    sales: {
        phone: [
            { key: 'imei', label: 'IMEI', type: 'text', placeholder: 'Enter IMEI number' },
            { key: 'storage', label: 'Storage', type: 'select', options: ['64GB', '128GB', '256GB', '512GB', '1TB'] },
            { key: 'color', label: 'Color', type: 'text', placeholder: 'Color variant' },
            { key: 'warranty', label: 'Warranty (months)', type: 'number', placeholder: '12' },
        ],
        mobile: [
            { key: 'imei', label: 'IMEI', type: 'text', placeholder: 'Enter IMEI number' },
            { key: 'storage', label: 'Storage', type: 'select', options: ['64GB', '128GB', '256GB', '512GB', '1TB'] },
            { key: 'color', label: 'Color', type: 'text', placeholder: 'Color variant' },
            { key: 'warranty', label: 'Warranty (months)', type: 'number', placeholder: '12' },
        ],
        accessory: [
            { key: 'brand', label: 'Brand', type: 'text', placeholder: 'Product brand' },
            { key: 'model', label: 'Model', type: 'text', placeholder: 'Model/Series' },
            { key: 'compatibility', label: 'Compatibility', type: 'text', placeholder: 'Compatible devices' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Open Box', 'Used'] },
        ],
        charger: [
            { key: 'brand', label: 'Brand', type: 'text', placeholder: 'Product brand' },
            { key: 'watt', label: 'Power (W)', type: 'number', placeholder: '20' },
            { key: 'compatibility', label: 'Compatibility', type: 'text', placeholder: 'Compatible devices' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Open Box', 'Used'] },
        ],
        default: [
            { key: 'customerName', label: 'Customer Name', type: 'text', placeholder: 'Walk-in customer' },
            { key: 'customerPhone', label: 'Customer Phone', type: 'text', placeholder: '+49...' },
            { key: 'invoiceRef', label: 'Invoice Ref', type: 'text', placeholder: 'INV-2026-001' },
        ],
    },
    purchase: {
        phone: [
            { key: 'supplier', label: 'Supplier', type: 'text', placeholder: 'Supplier name' },
            { key: 'invoiceNo', label: 'Invoice No', type: 'text', placeholder: 'BILL-001' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Refurbished', 'Used'] },
            { key: 'taxPercent', label: 'Tax %', type: 'number', placeholder: '19' },
        ],
        mobile: [
            { key: 'supplier', label: 'Supplier', type: 'text', placeholder: 'Supplier name' },
            { key: 'invoiceNo', label: 'Invoice No', type: 'text', placeholder: 'BILL-001' },
            { key: 'condition', label: 'Condition', type: 'select', options: ['New', 'Refurbished', 'Used'] },
            { key: 'taxPercent', label: 'Tax %', type: 'number', placeholder: '19' },
        ],
        default: [
            { key: 'supplier', label: 'Supplier', type: 'text', placeholder: 'Supplier/Vendor name' },
            { key: 'invoiceNo', label: 'Invoice No', type: 'text', placeholder: 'Purchase bill reference' },
            { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
            { key: 'paymentStatus', label: 'Payment Status', type: 'select', options: ['Paid', 'Partial', 'Credit'] },
        ],
    },
};

export function resolveRelatedFields(formType, categoryName, subCategoryName) {
    const type = String(formType || '').toLowerCase();
    const config = RELATED_FIELD_CONFIG[type] || RELATED_FIELD_CONFIG.sales;
    const key = `${String(categoryName || '').toLowerCase()} ${String(subCategoryName || '').toLowerCase()}`;

    const matcher = Object.keys(config).find((candidate) => candidate !== 'default' && key.includes(candidate));
    if (matcher) return config[matcher];
    return config.default || [];
}
