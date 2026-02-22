import React, { forwardRef } from 'react';
import { priceTag } from '../utils/currency';

// ══════════════════════════════════════════════════════════
// DailyBooks — German POS Thermal Receipt (80mm)
// ══════════════════════════════════════════════════════════

const ReceiptTemplate = forwardRef(({ items, transactionId, salesmanName, paymentMethod, date, time }, ref) => {
    // 1. Calculate Exact Totals (Brutto determines everything to avoid penny mismatch)
    const bruttoTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const nettoTotal = bruttoTotal / 1.19;
    const taxTotal = bruttoTotal - nettoTotal;

    // Helper: Safely get IMEI if product is a phone
    const renderIMEI = (item) => {
        const cat = typeof item.category === 'object' ? item.category?.level1 : item.category;
        const isPhone = cat && ['Phone', 'Smartphone', 'Handy'].some(c => cat.toLowerCase().includes(c.toLowerCase()));

        if (isPhone && item.verifiedAttributes?.IMEI) {
            return (
                <div style={{ fontSize: '10px', color: '#333', marginTop: '2px' }}>
                    IMEI: {item.verifiedAttributes.IMEI}
                </div>
            );
        }
        return null;
    };

    return (
        <div ref={ref} style={{
            width: '80mm',
            padding: '10mm 4mm',
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '12px',
            lineHeight: '1.4',
            color: '#000',
            backgroundColor: '#fff',
            margin: '0 auto'
        }}>
            {/* ── HEADER ── */}
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>CareFone UG</div>
                <div style={{ fontSize: '12px' }}>(haftungsbeschränkt)</div>
                <div style={{ marginTop: '4px' }}>Kurt-Schumacher-Damm 1</div>
                <div>13405 Berlin, Deutschland</div>
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

            {/* ── METADATA ── */}
            <div style={{ fontSize: '11px', marginBottom: '8px' }}>
                <div><strong>Datum:</strong> {date || new Date().toLocaleDateString('de-DE')} {time || new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</div>
                <div><strong>Beleg-Nr:</strong> {transactionId || 'N/A'}</div>
                <div><strong>Verkäufer:</strong> {salesmanName || 'Shop'}</div>
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

            {/* ── ITEMS TABLE ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px', fontSize: '12px' }}>
                <thead>
                    <tr style={{ fontWeight: 'bold', borderBottom: '1px solid #000' }}>
                        <td style={{ paddingBottom: '4px', width: '15%' }}>Mng</td>
                        <td style={{ paddingBottom: '4px', width: '55%' }}>Artikel</td>
                        <td style={{ paddingBottom: '4px', width: '30%', textAlign: 'right' }}>Betrag</td>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ verticalAlign: 'top', paddingTop: '6px' }}>
                                {item.quantity || 1}x
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '6px' }}>
                                <div>{item.name || item.productName || 'Item'}</div>
                                {renderIMEI(item)}
                            </td>
                            <td style={{ verticalAlign: 'top', paddingTop: '6px', textAlign: 'right' }}>
                                {priceTag(parseFloat(item.amount) || 0)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>

            {/* ── TAX BREAKDOWN (SumUp Style) ── */}
            <table style={{ width: '100%', fontSize: '11px', marginBottom: '8px' }}>
                <tbody>
                    <tr>
                        <td>Zwischensumme</td>
                        <td style={{ textAlign: 'right' }}>{priceTag(bruttoTotal)}</td>
                    </tr>
                    <tr>
                        <td>Netto (19%)</td>
                        <td style={{ textAlign: 'right' }}>{priceTag(nettoTotal)}</td>
                    </tr>
                    <tr>
                        <td>USt. (19%)</td>
                        <td style={{ textAlign: 'right' }}>{priceTag(taxTotal)}</td>
                    </tr>
                </tbody>
            </table>

            {/* ── GRAND TOTAL ── */}
            <table style={{ width: '100%', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #000', paddingTop: '4px', marginTop: '4px' }}>
                <tbody>
                    <tr>
                        <td>GESAMTBETRAG</td>
                        <td style={{ textAlign: 'right' }}>{priceTag(bruttoTotal)}</td>
                    </tr>
                </tbody>
            </table>

            <div style={{ borderTop: '1px dashed #000', margin: '16px 0 8px 0' }}></div>

            {/* ── FOOTER ── */}
            <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '16px' }}>
                <div style={{ marginBottom: '8px' }}>
                    <strong>Zahlart:</strong> {paymentMethod || 'Cash / Bar'}
                </div>

                <div style={{ marginTop: '24px', fontStyle: 'italic', fontSize: '9px', lineHeight: '1.2' }}>
                    ICH BESTÄTIGE DEN OBEN GENANNTEN GESAMTBETRAG ZU ZAHLEN (UNTERSCHRIFT DES KUNDEN)
                </div>

                <div style={{ borderTop: '1px solid #000', width: '80%', margin: '32px auto 8px auto' }}></div>
                <div style={{ fontSize: '9px' }}>Unterschrift</div>

                <div style={{ marginTop: '24px' }}>Vielen Dank für Ihren Einkauf!</div>
                <div style={{ fontWeight: 'bold', marginTop: '4px' }}>Powered by SumUp</div>
            </div>
        </div>
    );
});

export default ReceiptTemplate;
