export const printRepairJobBill = (job, activeShop) => {
  const shopName = String(activeShop?.name || 'Shop').trim() || 'Shop'
  const shopAddress = String(activeShop?.address || '').trim()
  const shopPhone = String(activeShop?.telephone || activeShop?.phone || '').trim()
  
  // Job number
  const jobNumber = String(
    job?.invoiceNumber || job?.invoice_number || 
    job?.refId || job?.jobNumber || job?.job_number ||
    job?.id || ''
  ).replace(/\D/g, '').slice(-6) || 'N/A'

  // Total cost
  const totalCost = parseFloat(
    job?.estimatedCost ?? job?.totalCost ?? job?.total_cost ?? 
    job?.cost ?? job?.repairCost ?? job?.amount ?? 0
  ) || 0

  // Advance
  const advance = parseFloat(
    job?.advance ?? job?.advanceAmount ?? 
    job?.advance_amount ?? job?.deposit ?? 0
  ) || 0

  const remaining = Math.max(0, totalCost - advance)
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

  const billTitle = isCompleted ? 'REPARATUR-BELEG' : 'ABHOLSCHEIN'

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>${billTitle} - #${escapePrintHtml(jobNumber)}</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        color: #000 !important;
        font-weight: 800 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      @media print {
        @page { size: 58mm auto; margin: 0mm; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 46mm !important;
        }
        .receipt-wrapper { width: 46mm !important; margin: 0; }
      }

      body {
        font-family: 'Segoe UI', Arial, -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', sans-serif;
        width: 46mm;
        margin: 0 auto;
        padding: 2mm 0.5mm 25mm 0.5mm;
        background: #fff;
        color: #000;
        font-size: 10px;
        font-weight: 800;
        line-height: 1.4;
      }

      .receipt-wrapper { width: 100%; max-width: 100%; }
      .receipt-header { text-align: center; margin-bottom: 6px; padding-top: 1mm; }
      .receipt-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 900 !important;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #000;
        border-bottom: 1.5px solid #000;
        padding-bottom: 1px;
        margin-bottom: 3px;
      }
      .shop-title {
        font-size: 16px;
        font-weight: 900 !important;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #000;
        line-height: 1.2;
        margin-bottom: 2px;
      }
      .shop-info {
        font-size: 9.5px;
        color: #000;
        line-height: 1.35;
        font-weight: 800 !important;
      }
      .job-box {
        text-align: center;
        margin: 5px 0;
        padding: 2px 0;
      }
      .job-number {
        font-size: 18px;
        font-weight: 900 !important;
        letter-spacing: 1.5px;
        font-family: monospace;
        color: #000;
      }
      .divider { border: none; border-top: 1.5px dashed #000; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      td { font-size: 10px; padding: 2px 0; vertical-align: top; font-weight: 800 !important; color: #000; }
      .label { font-weight: 800 !important; color: #000; width: 35%; word-break: break-word; }
      .value { font-weight: 900 !important; color: #000; text-align: right; width: 65%; word-break: break-word; }
      .issue-box {
        border: 1.5px solid #000;
        border-radius: 3px;
        padding: 5px;
        margin: 5px 0;
        font-size: 10px;
        font-weight: 800 !important;
        color: #000;
        background: #fff;
        line-height: 1.35;
      }
      .amount-table { width: 100%; margin: 5px 0; }
      .amount-table td { padding: 2px 0; font-size: 10px; font-weight: 800 !important; color: #000; }
      .amount-label { font-weight: 800 !important; color: #000; }
      .amount-value { font-weight: 900 !important; color: #000; text-align: right; font-variant-numeric: tabular-nums; }
      .total-row td {
        font-size: 13px !important;
        font-weight: 900 !important;
        color: #000;
        padding-top: 5px;
        padding-bottom: 3px;
        border-top: 2px solid #000;
      }
      .footer {
        text-align: center;
        font-size: 9px;
        color: #000;
        font-weight: 800 !important;
        margin-top: 8px;
        line-height: 1.4;
        border-top: 1.5px dashed #000;
        padding-top: 6px;
      }
      .footer-thanks {
        font-size: 10px;
        font-weight: 900 !important;
        color: #000;
        margin-top: 3px;
      }
    </style>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  </head>
  <body>
    <div class="receipt-wrapper">
      <div class="receipt-header">
        <div class="receipt-badge">${billTitle}</div>
        <div class="shop-title">${escapePrintHtml(shopName)}</div>
        ${shopAddress ? `<div class="shop-info">${escapePrintHtml(shopAddress)}</div>` : ''}
        ${shopPhone ? `<div class="shop-info">Tel: ${escapePrintHtml(shopPhone)}</div>` : ''}
      </div>
      
      <hr class="divider"/>
      
      <div class="job-box">
        <div style="font-size: 9.5px; font-weight: 900; letter-spacing: 1px; color: #000; text-transform: uppercase;">Auftragsnummer</div>
        <div class="job-number">#${escapePrintHtml(jobNumber)}</div>
      </div>
      
      <hr class="divider"/>
      
      <table>
        <tr><td class="label">Kunde:</td><td class="value">${escapePrintHtml(customerName)}</td></tr>
        <tr><td class="label">Telefon:</td><td class="value">${escapePrintHtml(phone)}</td></tr>
        <tr><td class="label">Ger&auml;t:</td><td class="value">${escapePrintHtml(deviceModel)}</td></tr>
        ${imei ? `<tr><td class="label">IMEI:</td><td class="value" style="font-family: monospace; font-weight: 900;">${escapePrintHtml(imei)}</td></tr>` : ''}
        ${!isCompleted ? `<tr><td class="label">Abholung:</td><td class="value">${escapePrintHtml(deliveryDate)}</td></tr>` : ''}
      </table>

      <div class="issue-box">
        <strong style="color: #000;">Fehler:</strong> ${escapePrintHtml(issue)}
      </div>

      ${!isCompleted ? `<table><tr><td class="label">Status:</td><td class="value">Ausstehend</td></tr></table>` : ''}

      <hr class="divider"/>

      <table class="amount-table">
        ${!isCompleted ? `
        <tr>
          <td class="amount-label">Gesamtkosten</td>
          <td class="amount-value">&euro;&nbsp;${formatReceiptMoney(totalCost)}</td>
        </tr>
        <tr>
          <td class="amount-label">Anzahlung</td>
          <td class="amount-value">&euro;&nbsp;${formatReceiptMoney(advance)}</td>
        </tr>
        ` : ''}
        <tr class="total-row">
          <td>${isCompleted ? 'GESAMTBETRAG' : 'RESTBETRAG'}</td>
          <td style="text-align: right;">&euro;&nbsp;${isCompleted ? formatReceiptMoney(totalCost) : formatReceiptMoney(remaining)}</td>
        </tr>
      </table>

      <div class="footer">
        ${isCompleted ? 'Reparatur erfolgreich abgeschlossen.' : 'Bitte diesen Kundenbeleg zur Abholung mitbringen.'}
        <div class="footer-thanks">${escapePrintHtml(shopName)}</div>
      </div>

      <!-- Feed spacer to make bill longer and prevent cutting into footer -->
      <div style="height: 25mm; width: 100%;"></div>
    </div>
  </body>
  </html>`

  const win = window.open('', 'repair-bill', 'width=340,height=640')
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

function stripReceiptItemPrefix(value = '') {
  return String(value || '')
    .replace(/^(sale|expense|purchase|revenue|income)\s*-\s*/i, '')
    .trim()
}

function formatReceiptMoney(value) {
  const amount = Number(value || 0)
  const hasDecimals = Math.abs(amount % 1) > 0.0001
  return amount.toLocaleString('de-DE', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })
}

function resolveReceiptItemLabel(item = {}) {
  return stripReceiptItemPrefix(String(
    item?.name
    || item?.productName
    || item?.product_name
    || item?.desc
    || 'Artikel'
  ).trim()) || 'Artikel'
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
    const rawLabel = resolveReceiptItemLabel(item)
    const label = escapePrintHtml(rawLabel)
    return `
      <tr>
        <td class="col-qty">${qty}x</td>
        <td class="col-name">
          <div class="item-name">${label}</div>
          ${imei ? `<div class="item-imei">IMEI: ${escapePrintHtml(imei)}</div>` : ''}
        </td>
        <td class="col-price">
          &euro;&nbsp;${formatReceiptMoney(resolveReceiptItemTotal(item))}
        </td>
      </tr>
    `
  }).join('')

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Beleg - ${escapePrintHtml(transactionId || '')}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          color: #000 !important;
          font-weight: 800 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        @media print {
          @page { size: 58mm auto; margin: 0mm; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 46mm !important;
          }
          .receipt-wrapper {
            width: 46mm !important;
            margin: 0 !important;
          }
        }
        body {
          font-family: 'Segoe UI', Arial, -apple-system, BlinkMacSystemFont, 'Roboto', 'Helvetica Neue', sans-serif;
          width: 46mm;
          margin: 0 auto;
          padding: 2mm 0.5mm 25mm 0.5mm;
          line-height: 1.4;
          color: #000;
          background: #fff;
          font-size: 10px;
          font-weight: 800;
          box-sizing: border-box;
        }
        .receipt-wrapper {
          width: 100%;
          max-width: 100%;
        }
        .receipt-header {
          text-align: center;
          margin-bottom: 6px;
          padding-top: 1mm;
        }
        .shop-title {
          font-size: 16px;
          font-weight: 900 !important;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #000;
          line-height: 1.2;
          margin-bottom: 2px;
        }
        .shop-info {
          font-size: 9.5px;
          font-weight: 800 !important;
          color: #000;
          line-height: 1.35;
          margin-top: 2px;
        }
        .divider {
          border: none;
          border-top: 1.5px dashed #000;
          margin: 6px 0;
        }
        .meta-box {
          font-size: 9.5px;
          font-weight: 800 !important;
          color: #000;
          margin-bottom: 4px;
          line-height: 1.4;
        }
        .meta-box div {
          color: #000;
          font-weight: 800 !important;
        }
        .meta-box strong {
          font-weight: 900 !important;
          color: #000;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-bottom: 4px;
        }
        th {
          font-size: 9.5px;
          font-weight: 900 !important;
          color: #000;
          border-bottom: 1.5px solid #000;
          padding-bottom: 4px;
        }
        td {
          vertical-align: top;
          padding: 3px 0;
          font-size: 10px;
          font-weight: 900 !important;
          color: #000;
        }
        .col-qty {
          width: 22%;
          text-align: left;
          font-weight: 900 !important;
          color: #000;
          padding-right: 4px;
          white-space: nowrap;
        }
        .col-name {
          width: 48%;
          text-align: left;
          padding-right: 3px;
          font-weight: 900 !important;
          color: #000;
        }
        .col-name .item-name {
          font-size: 10px;
          font-weight: 900 !important;
          color: #000;
          line-height: 1.25;
          word-break: break-word;
          overflow-wrap: break-word;
        }
        .col-name .item-imei {
          font-size: 8px;
          font-weight: 800 !important;
          color: #000;
          font-family: monospace;
          margin-top: 1px;
          word-break: break-all;
        }
        .col-price {
          width: 30%;
          text-align: right;
          font-weight: 900 !important;
          color: #000;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        .summary-table {
          width: 100%;
          margin-bottom: 4px;
          table-layout: fixed;
        }
        .summary-table td {
          padding: 2px 0;
          color: #000;
        }
        .summary-subtotal td {
          font-size: 10.5px;
          font-weight: 900 !important;
        }
        .summary-tax td {
          font-size: 9.5px;
          font-weight: 800 !important;
          padding: 1.5px 0;
        }
        .total-row td {
          font-size: 13px !important;
          font-weight: 900 !important;
          color: #000;
          padding-top: 5px;
          padding-bottom: 3px;
          border-top: 2px solid #000;
        }
        .footer-box {
          margin-top: 8px;
          font-size: 8.5px;
          line-height: 1.4;
          color: #000;
          font-weight: 800 !important;
          text-align: center;
          border-top: 1.5px dashed #000;
          padding-top: 6px;
        }
        .footer-thanks {
          font-size: 9.5px;
          font-weight: 900 !important;
          color: #000;
          margin-top: 3px;
        }
      </style>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    </head>
    <body>
      <div class="receipt-wrapper">
        <div class="receipt-header">
          <div class="shop-title">${escapePrintHtml(shopName)}</div>
          ${shopAddress ? `<div class="shop-info">${escapePrintHtml(shopAddress)}</div>` : ''}
          ${shopPhone ? `<div class="shop-info">Tel: ${escapePrintHtml(shopPhone)}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div class="meta-box">
          <div><strong>Datum:</strong> ${escapePrintHtml(timestamp.date)} ${escapePrintHtml(timestamp.time)}</div>
          <div><strong>Beleg-Nr:</strong> #${escapePrintHtml(transactionId || 'N/A')}</div>
        </div>

        <div class="divider"></div>

        <table>
          <colgroup>
            <col style="width: 22%;"/>
            <col style="width: 48%;"/>
            <col style="width: 30%;"/>
          </colgroup>
          <thead>
            <tr>
              <th style="text-align: left; padding-right: 4px; white-space: nowrap;">Menge</th>
              <th style="text-align: left; padding-right: 3px; white-space: nowrap;">Artikel</th>
              <th style="text-align: right;">Betrag</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows || `
              <tr>
                <td class="col-qty">1x</td>
                <td class="col-name"><div class="item-name">Artikel</div></td>
                <td class="col-price">&euro;&nbsp;0,00</td>
              </tr>
            `}
          </tbody>
        </table>

        <div class="divider"></div>

        <table class="summary-table">
          <tbody>
            <tr class="summary-subtotal">
              <td style="font-weight: 900 !important;">Zwischensumme</td>
              <td style="text-align: right; font-weight: 900 !important; font-variant-numeric: tabular-nums;">&euro;&nbsp;${formatReceiptMoney(grossTotal)}</td>
            </tr>
            ${shouldShowTax ? `
              <tr class="summary-tax">
                <td style="font-weight: 800 !important;">Netto (19%)</td>
                <td style="text-align: right; font-weight: 800 !important; font-variant-numeric: tabular-nums;">&euro;&nbsp;${formatReceiptMoney(netTotal)}</td>
              </tr>
              <tr class="summary-tax">
                <td style="font-weight: 800 !important;">USt. (19%)</td>
                <td style="text-align: right; font-weight: 800 !important; font-variant-numeric: tabular-nums;">&euro;&nbsp;${formatReceiptMoney(taxTotal)}</td>
              </tr>
              <tr>
                <td colSpan="2" style="padding-top: 6px;">
                  <div class="divider"></div>
                </td>
              </tr>
            ` : ''}
            <tr class="total-row">
              <td>GESAMTBETRAG</td>
              <td style="text-align: right; font-variant-numeric: tabular-nums;">&euro;&nbsp;${formatReceiptMoney(grossTotal)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer-box">
          R&uuml;ckgabe/Umtausch innerhalb 14 Tagen nur in unbesch&auml;digter Originalverpackung.<br/>
          Bei Defekt/Mangel erfolgt eine Erstattung oder Reparatur.
          <div class="footer-thanks">Vielen Dank f&uuml;r Ihren Einkauf! ${escapePrintHtml(shopName)}</div>
        </div>

        <!-- Feed spacer to make bill longer and prevent thermal paper cutting into the footer -->
        <div style="height: 25mm; width: 100%;"></div>
      </div>
    </body>
  </html>`
}

export function printKundenbeleg(items, transactionId, _paymentMethod, shopInfo, options = {}) {
  const win = window.open('', '_blank', 'width=340,height=640')
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
