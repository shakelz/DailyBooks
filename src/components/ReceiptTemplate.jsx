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
    const dividerStyle = { borderTop: '2px dotted #000', margin: '8px 0' };

    const renderIMEI = (item) => {
        const category = typeof item?.category === 'object' ? item.category?.level1 : item?.category;
        const isPhoneCategory = category && ['phone', 'smartphone', 'handy', 'mobile'].some((token) => String(category).toLowerCase().includes(token));
        if (!isPhoneCategory || !item?.verifiedAttributes?.IMEI) return null;
        return (
            <div style={{ fontSize: '10px', color: '#333', marginTop: '2px' }}>
                IMEI: {item.verifiedAttributes.IMEI}
            </div>
        );
    };

    return (
        <div
            ref={ref}
            style={{
                width: '80mm',
                padding: '10mm 5mm',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: '15px',
                lineHeight: '1.6',
                color: '#000',
                backgroundColor: '#fff',
                margin: '0 auto'
            }}
        >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: '900', fontSize: '24px', textAlign: 'center' }}>{receiptShopName}</div>
                {receiptShopAddress && <div style={{ fontSize: '14px', fontWeight: '600', textAlign: 'center', marginTop: '3px' }}>{receiptShopAddress}</div>}
                {receiptShopTelephone && <div style={{ fontSize: '14px', fontWeight: '600', textAlign: 'center', marginTop: '2px' }}>Tel: {receiptShopTelephone}</div>}
            </div>

            <div style={dividerStyle} />

            <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                <div><strong>Datum:</strong> {date || new Date().toLocaleDateString('de-DE')} {time || new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                <div><strong>Beleg-Nr:</strong> {transactionId || 'N/A'}</div>
            </div>

            <div style={dividerStyle} />

            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: '8px' }}>
                <colgroup>
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '48%' }} />
                    <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                    <tr style={{ fontWeight: '900', borderBottom: '1px solid #000', fontSize: '13px' }}>
                        <td style={{ paddingBottom: '6px', paddingRight: '8px', whiteSpace: 'nowrap' }}>Menge</td>
                        <td style={{ paddingBottom: '6px', paddingRight: '6px', whiteSpace: 'nowrap' }}>Artikel</td>
                        <td style={{ paddingBottom: '6px', textAlign: 'right' }}>Betrag</td>
                    </tr>
                </thead>
                <tbody>
                    {lineItems.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ verticalAlign: 'top', paddingTop: '7px', fontSize: '13px', fontWeight: '700' }}>{item?.quantity || 1}x</td>
                            <td style={{ verticalAlign: 'top', paddingTop: '7px', fontSize: '13px', fontWeight: '700' }}>
                                <div>{stripReceiptItemPrefix(item?.name || item?.productName || 'Artikel') || 'Artikel'}</div>
                                {renderIMEI(item)}
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '7px', fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>
                                {priceTag(asNumber(item?.amount))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={dividerStyle} />

            <table style={{ width: '100%', marginBottom: '8px', tableLayout: 'fixed' }}>
                <tbody>
                    <tr>
                        <td style={{ fontSize: '15px', fontWeight: '700' }}>Zwischensumme</td>
                        <td style={{ textAlign: 'right', fontSize: '15px', fontWeight: '700' }}>{priceTag(grossTotal)}</td>
                    </tr>
                    {shouldShowTax && (
                        <>
                            <tr>
                                <td style={{ fontSize: '14px', fontWeight: '700' }}>Netto (19%)</td>
                                <td style={{ textAlign: 'right', fontSize: '14px', fontWeight: '700' }}>{priceTag(netTotal)}</td>
                            </tr>
                            <tr>
                                <td style={{ fontSize: '14px', fontWeight: '700' }}>USt. (19%)</td>
                                <td style={{ textAlign: 'right', fontSize: '14px', fontWeight: '700' }}>{priceTag(taxTotal)}</td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ paddingTop: '6px' }}>
                                    <div style={dividerStyle} />
                                </td>
                            </tr>
                        </>
                    )}
                </tbody>
            </table>
            <div style={{ marginTop: '12px', fontSize: '11px', lineHeight: '1.5', fontWeight: '600', textAlign: 'center', width: '100%' }}>
                Rueckgabe/Umtausch innerhalb 14 Tagen nur in unbeschaedigter Originalverpackung. Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur. Vielen Dank. {receiptShopName}
            </div>
        </div>
    );
});

export default ReceiptTemplate;
