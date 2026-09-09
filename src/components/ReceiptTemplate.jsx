import React, { forwardRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { priceTag } from '../utils/currency';

function asNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function stripReceiptItemPrefix(value = '') {
    return String(value || '')
        .replace(/^(sale|expense|purchase|revenue|income)\s*-\s*/i, '')
        .trim();
}

const ReceiptTemplate = forwardRef(({
    items,
    transactionId,
    date,
    time,
    showTax,
    shopName,
    shopAddress,
    shopTelephone
}, ref) => {
    const { activeShop, billShowTax } = useAuth();
    const lineItems = Array.isArray(items) ? items : [];
    const grossTotal = lineItems.reduce((sum, item) => sum + asNumber(item?.amount), 0);
    const netTotal = grossTotal / 1.19;
    const taxTotal = grossTotal - netTotal;
    const shouldShowTax = showTax === undefined ? billShowTax : Boolean(showTax);
    const receiptShopName = String(shopName || activeShop?.name || 'Shop').trim() || 'Shop';
    const receiptShopAddress = String(shopAddress || activeShop?.address || '').trim();
    const receiptShopTelephone = String(shopTelephone || activeShop?.telephone || activeShop?.phone || '').trim();
    const dividerStyle = { borderTop: '2px dashed #000', margin: '12px 0' };

    const renderIMEI = (item) => {
        const category = typeof item?.category === 'object' ? item.category?.level1 : item?.category;
        const isPhoneCategory = category && ['phone', 'smartphone', 'handy', 'mobile'].some((token) => String(category).toLowerCase().includes(token));
        if (!isPhoneCategory || !item?.verifiedAttributes?.IMEI) return null;
        return (
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#000', marginTop: '3px', fontFamily: 'monospace' }}>
                IMEI: {item.verifiedAttributes.IMEI}
            </div>
        );
    };

    return (
        <div
            ref={ref}
            style={{
                width: '80mm',
                padding: '12mm 5mm 30mm 5mm',
                fontFamily: '"Segoe UI", Arial, "Helvetica Neue", sans-serif',
                fontSize: '15px',
                lineHeight: '1.65',
                fontWeight: '800',
                color: '#000',
                backgroundColor: '#fff',
                margin: '0 auto',
                boxSizing: 'border-box'
            }}
        >
            <style>
                {`
                    @media print {
                        @page { size: 80mm auto; margin: 0; }
                        body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                `}
            </style>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: '900', fontSize: '24px', textAlign: 'center', color: '#000' }}>{receiptShopName}</div>
                {receiptShopAddress && <div style={{ fontSize: '14px', fontWeight: '800', textAlign: 'center', marginTop: '4px', color: '#000' }}>{receiptShopAddress}</div>}
                {receiptShopTelephone && <div style={{ fontSize: '14px', fontWeight: '800', textAlign: 'center', marginTop: '3px', color: '#000' }}>Tel: {receiptShopTelephone}</div>}
            </div>

            <div style={dividerStyle} />

            <div style={{ fontSize: '14px', fontWeight: '800', marginBottom: '10px', color: '#000' }}>
                <div><strong>Datum:</strong> {date || new Date().toLocaleDateString('de-DE')} {time || new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                <div><strong>Beleg-Nr:</strong> {transactionId || 'N/A'}</div>
            </div>

            <div style={dividerStyle} />

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '10px' }}>
                <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '48%' }} />
                    <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                    <tr style={{ fontWeight: '900', borderBottom: '2px solid #000', fontSize: '14px', color: '#000' }}>
                        <td style={{ paddingBottom: '8px', paddingRight: '8px', whiteSpace: 'nowrap' }}>Menge</td>
                        <td style={{ paddingBottom: '8px', paddingRight: '6px', whiteSpace: 'nowrap' }}>Artikel</td>
                        <td style={{ paddingBottom: '8px', textAlign: 'right' }}>Betrag</td>
                    </tr>
                </thead>
                <tbody>
                    {lineItems.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ verticalAlign: 'top', paddingTop: '8px', paddingBottom: '4px', fontSize: '14px', fontWeight: '900', color: '#000' }}>{item?.quantity || 1}x</td>
                            <td style={{ verticalAlign: 'top', paddingTop: '8px', paddingBottom: '4px', fontSize: '14px', fontWeight: '900', color: '#000' }}>
                                <div>{stripReceiptItemPrefix(item?.name || item?.productName || 'Artikel') || 'Artikel'}</div>
                                {renderIMEI(item)}
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '8px', paddingBottom: '4px', fontSize: '14px', fontWeight: '900', textAlign: 'right', color: '#000' }}>
                                {priceTag(asNumber(item?.amount))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={dividerStyle} />

            <table style={{ width: '100%', marginBottom: '10px', tableLayout: 'fixed' }}>
                <tbody>
                    <tr>
                        <td style={{ fontSize: '16px', fontWeight: '900', padding: '4px 0', color: '#000' }}>Zwischensumme</td>
                        <td style={{ textAlign: 'right', fontSize: '16px', fontWeight: '900', padding: '4px 0', color: '#000' }}>{priceTag(grossTotal)}</td>
                    </tr>
                    {shouldShowTax && (
                        <>
                            <tr>
                                <td style={{ fontSize: '15px', fontWeight: '800', padding: '3px 0', color: '#000' }}>Netto (19%)</td>
                                <td style={{ textAlign: 'right', fontSize: '15px', fontWeight: '800', padding: '3px 0', color: '#000' }}>{priceTag(netTotal)}</td>
                            </tr>
                            <tr>
                                <td style={{ fontSize: '15px', fontWeight: '800', padding: '3px 0', color: '#000' }}>USt. (19%)</td>
                                <td style={{ textAlign: 'right', fontSize: '15px', fontWeight: '800', padding: '3px 0', color: '#000' }}>{priceTag(taxTotal)}</td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ paddingTop: '8px' }}>
                                    <div style={dividerStyle} />
                                </td>
                            </tr>
                        </>
                    )}
                </tbody>
            </table>
            <div style={{ marginTop: '16px', fontSize: '11.5px', lineHeight: '1.6', fontWeight: '800', textAlign: 'center', width: '100%', color: '#000' }}>
                Rueckgabe/Umtausch innerhalb 14 Tagen nur in unbeschaedigter Originalverpackung. Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur. Vielen Dank. {receiptShopName}
            </div>

            {/* Bottom feed spacer to make the bill longer and prevent thermal paper cutting into the footer */}
            <div style={{ height: '30mm', width: '100%' }} />
        </div>
    );
});

export default ReceiptTemplate;
