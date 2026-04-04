export const printRepairJobBill = (job, activeShop) => {
  const shopName = String(activeShop?.name || 'Shop').trim()
  const shopAddress = String(activeShop?.address || '').trim()
  const shopPhone = String(activeShop?.telephone || activeShop?.phone || '').trim()
  
  // Job number
  const jobNumber = String(
    job?.invoiceNumber || job?.invoice_number || 
    job?.refId || job?.jobNumber || job?.job_number ||
    job?.id || ''
  ).replace(/\D/g, '').slice(-6) || 'N/A'

  // Total cost
  // Prioritize repair-specific fields before 'amount', because when
  // printing from a transaction, 'amount' is just the partial payment.
  const totalCost = parseFloat(
    job?.estimatedCost ?? job?.totalCost ?? job?.total_cost ?? 
    job?.cost ?? job?.repairCost ?? job?.amount ?? 0
  ) || 0

  // Advance
  const advance = parseFloat(
    job?.advance ?? job?.advanceAmount ?? 
    job?.advance_amount ?? job?.deposit ?? 0
  ) || 0

  const remaining = Math.max(0, totalCost - advance).toFixed(2)
  const isCompleted = String(job?.status || '').toLowerCase() === 'completed'
  
  const customerName = String(job?.customerName || job?.customer_name || job?.name || '-')
  const phone = String(job?.phone || job?.phoneNumber || job?.phone_number || job?.customerPhone || '-')
  const deviceModel = String(job?.deviceModel || job?.device_model || job?.device || '-')
  const imei = String(job?.imei || job?.IMEI || '')
  const issue = String(job?.issue || job?.problem || job?.problemDescription || job?.problem_description || job?.issueType || '-')
  
  const deliveryDateSource = job?.expectedDelivery || job?.expected_delivery || job?.deliveryDate || job?.delivery_at
  const deliveryDate = deliveryDateSource
    ? new Date(deliveryDateSource).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-'

  const billTitle = isCompleted ? 'KASSENBON' : 'ABHOLSCHEIN'

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      
      @media print {
        @page { size: 58mm auto; margin: 0mm; }
        html, body {
          margin: 0;
          padding: 0;
          width: 47mm;
        }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        
        .receipt-wrapper {
          width: 100%;
          margin: 0;
        }
      }

      body {
        font-family: 'Arial', 'Helvetica', sans-serif;
        width: 47mm;
        margin: 0;
        padding: 2mm 0.5mm;
        background: #fff;
        color: #000;
        font-weight: 900;
        line-height: 1.4;
      }

      .receipt-wrapper {
        width: 100%;
        max-width: 100%;
      }

      .center { text-align: center; }
      .shop-name { font-size: 13px; font-weight: 900; text-align: center; }
      .shop-sub { font-size: 10px; font-weight: 900; text-align: center; color: #000; margin-top: 1px; }
      .bill-title { font-size: 13px; font-weight: 900; text-align: center; letter-spacing: 2px; border: 2px solid #000; padding: 3px 0; margin: 4px 0; }
      .job-number { font-size: 22px; font-weight: 900; text-align: center; letter-spacing: 2px; margin: 4px 0; }
      .divider { border: none; border-top: 1px dashed #999; margin: 4px 0; }
      .divider-solid { border: none; border-top: 2px solid #000; margin: 4px 0; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { font-size: 11px; padding: 2px 0; vertical-align: top; }
      .label { font-weight: 900; color: #000; width: 52%; word-break: break-word; }
      .value { font-weight: 900; color: #000; text-align: right; width: 45%; word-break: break-all; }
      .issue-box { border: 2px solid #000; padding: 3px; margin: 4px 0; font-size: 11px; font-weight: 900; }
      .amount-label { font-size: 11px; font-weight: 900; color: #000; width: 52%; word-break: break-word; }
      .amount-value { font-size: 11px; font-weight: 900; text-align: right; width: 45%; word-break: break-all; }
      .total-label { font-size: 14px; font-weight: 900; width: 52%; word-break: break-word; }
      .total-value { font-size: 14px; font-weight: 900; text-align: right; width: 45%; word-break: break-all; }
      .footer { text-align: center; font-size: 10px; color: #000; font-weight: 900; margin-top: 4px; line-height: 1.4; }
    </style>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  </head>
  <body>
    <div class="receipt-wrapper">
      <p class="bill-title">${billTitle}</p>
      <p class="shop-name">${shopName}</p>
    ${shopAddress ? `<p class="shop-sub">${shopAddress}</p>` : ''}
    ${shopPhone ? `<p class="shop-sub">Tel: ${shopPhone}</p>` : ''}
    
    <hr class="divider"/>
    
    <p class="job-number">${jobNumber}</p>
    
    <hr class="divider"/>
    
    <table>
      <tr><td class="label">Name</td><td class="value">${customerName}</td></tr>
      <tr><td class="label">Telefon</td><td class="value">${phone}</td></tr>
      <tr><td class="label">Gerät</td><td class="value">${deviceModel}</td></tr>
      ${imei ? `<tr><td class="label">IMEI</td><td class="value">${imei}</td></tr>` : ''}
      ${!isCompleted ? `<tr><td class="label">Abholung</td><td class="value">${deliveryDate}</td></tr>` : ''}
    </table>

    <div class="issue-box">Fehler: ${issue}</div>

    ${!isCompleted ? `<table><tr><td class="label">Status</td><td class="value">Ausstehend</td></tr></table>` : ''}

    <hr class="divider-solid"/>

    ${!isCompleted ? `
    <table>
      <tr>
        <td class="amount-label">Kosten</td>
        <td class="amount-value">€ ${totalCost.toFixed(2)}</td>
      </tr>
      <tr>
        <td class="amount-label">Anzahlung</td>
        <td class="amount-value">€ ${advance.toFixed(2)}</td>
      </tr>
    </table>
    <hr class="divider-solid"/>
    ` : ''}

    <table>
      <tr>
        <td class="total-label">${isCompleted ? 'Gesamt' : 'Restbetrag'}</td>
        <td class="total-value">€ ${isCompleted ? totalCost.toFixed(2) : remaining}</td>
      </tr>
    </table>

    <hr class="divider"/>
    
    <p class="footer">
      ${isCompleted ? 'Vielen Dank für Ihren Auftrag!' : 'Bitte diesen Kundenbeleg zur Abholung mitbringen.'}<br/>
      ${shopName}
    </p>
    </div>
  </body>
  </html>`

  const win = window.open('', 'repair-bill', 'width=300,height=500')
  if(!win) return;
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 800)
}

function escapePrintHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

function formatReceiptMoney(value) {
  return Number(value || 0).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function resolveReceiptItemLabel(item = {}) {
  return String(
    item?.name
    || item?.productName
    || item?.product_name
    || item?.desc
    || 'Artikel'
  ).trim() || 'Artikel'
}

function resolveReceiptItemTotal(item = {}) {
  return Number(item?.total ?? item?.amount ?? 0) || 0
}

function resolveReceiptItemQuantity(item = {}) {
  return Math.max(1, parseInt(item?.quantity || '1', 10) || 1)
}

function resolveReceiptItemCategory(item = {}) {
  const category = item?.categorySnapshot || item?.category || item?.productSnapshot?.category || ''
  if (!category) return ''
  if (typeof category === 'string') return category.trim()
  return String(category?.level1 || category?.name || '').trim()
}

function resolveReceiptItemImei(item = {}) {
  const attrs = {
    ...(item?.productSnapshot?.verifiedAttributes || {}),
    ...(item?.verifiedAttributes || {}),
  }
  const imei = attrs.IMEI || attrs.imei || ''
  if (!imei) return ''
  const category = resolveReceiptItemCategory(item).toLowerCase()
  const looksLikePhone = category.includes('phone')
    || category.includes('smartphone')
    || category.includes('handy')
    || category.includes('mobile')
  return looksLikePhone ? String(imei).trim() : ''
}

function buildReceiptTimestamp(issuedAt) {
  const source = issuedAt ? new Date(issuedAt) : new Date()
  const safeDate = Number.isNaN(source.getTime()) ? new Date() : source
  return {
    date: safeDate.toLocaleDateString('de-DE'),
    time: safeDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
  }
}

function buildKundenbelegHtml({
  items = [],
  transactionId,
  shopInfo,
  issuedAt,
  showTax = true,
}) {
  const shopName = String(shopInfo?.name || 'Shop').trim() || 'Shop'
  const shopAddress = String(shopInfo?.address || '').trim()
  const shopPhone = String(shopInfo?.telephone || shopInfo?.phone || '').trim()
  const lineItems = Array.isArray(items) ? items : []
  const grossTotal = lineItems.reduce((sum, item) => sum + resolveReceiptItemTotal(item), 0)
  const netTotal = grossTotal / 1.19
  const taxTotal = grossTotal - netTotal
  const shouldShowTax = Boolean(showTax)
  const timestamp = buildReceiptTimestamp(issuedAt)
  const itemRows = lineItems.map((item) => {
    const qty = resolveReceiptItemQuantity(item)
    const imei = resolveReceiptItemImei(item)
    return `
      <tr>
        <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900;">${qty}x</td>
        <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900;">
          <div>${escapePrintHtml(resolveReceiptItemLabel(item))}</div>
          ${imei ? `<div style="font-size: 10px; color: #333; margin-top: 2px;">IMEI: ${escapePrintHtml(imei)}</div>` : ''}
        </td>
        <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900; text-align: right; width: 45%; word-break: break-all;">
          &euro; ${formatReceiptMoney(resolveReceiptItemTotal(item))}
        </td>
      </tr>
    `
  }).join('')

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>KUNDENBELEG</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @media print {
          @page { size: 58mm auto; margin: 0mm; }
          html, body { margin: 0; padding: 0; width: 47mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        body {
          font-family: 'Arial', 'Helvetica', sans-serif;
          width: 47mm;
          margin: 0;
          padding: 2mm 0.5mm;
          line-height: 1.6;
          color: #000;
          background: #fff;
          font-weight: 900;
        }
        .divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      </style>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    </head>
    <body>
      <div style="font-weight: 900; font-size: 24px; text-align: center;">${escapePrintHtml(shopName)}</div>
      ${shopAddress ? `<div style="font-size: 11px; font-weight: 900; text-align: center; margin-top: 3px; color: #000;">${escapePrintHtml(shopAddress)}</div>` : ''}
      ${shopPhone ? `<div style="font-size: 11px; font-weight: 900; text-align: center; margin-top: 2px; color: #000;">Tel: ${escapePrintHtml(shopPhone)}</div>` : ''}

      <hr class="divider"/>

      <div style="font-size: 13px; font-weight: 800; margin-bottom: 8px;">
        <div><strong>Datum:</strong> ${escapePrintHtml(timestamp.date)} ${escapePrintHtml(timestamp.time)}</div>
        <div><strong>Beleg-Nr:</strong> ${escapePrintHtml(transactionId || 'N/A')}</div>
      </div>

      <hr class="divider"/>

      <table style="margin-bottom: 8px;">
        <thead>
          <tr style="font-weight: 900; border-bottom: 1px solid #000; font-size: 12px;">
            <td style="padding-bottom: 6px; width: 15%;">Menge</td>
            <td style="padding-bottom: 6px; width: 55%;">Artikel</td>
            <td style="padding-bottom: 6px; width: 30%; text-align: right;">Betrag</td>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `
            <tr>
              <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900;">1x</td>
              <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900;">Artikel</td>
              <td style="vertical-align: top; padding-top: 7px; font-size: 12px; font-weight: 900; text-align: right; width: 45%; word-break: break-all;">&euro; 0,00</td>
            </tr>
          `}
        </tbody>
      </table>

      <hr class="divider"/>

      <table style="width: 100%; margin-bottom: 8px;">
        <tbody>
          <tr>
            <td style="font-size: 12px; font-weight: 900;">Zwischensumme</td>
            <td style="text-align: right; font-size: 12px; font-weight: 900; width: 45%; word-break: break-all;">&euro; ${formatReceiptMoney(grossTotal)}</td>
          </tr>
          ${shouldShowTax ? `
            <tr>
              <td style="font-size: 11px; font-weight: 900;">Netto (19%)</td>
              <td style="text-align: right; font-size: 11px; font-weight: 900; width: 45%; word-break: break-all;">&euro; ${formatReceiptMoney(netTotal)}</td>
            </tr>
            <tr>
              <td style="font-size: 11px; font-weight: 900;">USt. (19%)</td>
              <td style="text-align: right; font-size: 11px; font-weight: 900; width: 45%; word-break: break-all;">&euro; ${formatReceiptMoney(taxTotal)}</td>
            </tr>
          ` : ''}
        </tbody>
      </table>

      <div style="margin-top: 12px; font-size: 13px; line-height: 1.5; font-weight: 900; text-align: center; color: #000;">
        R&uuml;ckgabe/Umtausch innerhalb 14 Tagen nur in unbesch&auml;digter Originalverpackung.
        Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur. Vielen Dank. ${escapePrintHtml(shopName)}
      </div>
    </body>
  </html>`
}

export function printKundenbeleg(items, transactionId, _paymentMethod, shopInfo, options = {}) {
  const win = window.open('', '_blank', 'width=300,height=600')
  if (!win) return

  win.document.write(buildKundenbelegHtml({
    items,
    transactionId,
    shopInfo,
    issuedAt: options?.issuedAt,
    showTax: options?.showTax === undefined ? true : Boolean(options.showTax),
  }))
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 800)
}
