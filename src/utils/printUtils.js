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
  const totalCost = parseFloat(
    job?.totalCost ?? job?.total_cost ?? 
    job?.cost ?? job?.amount ?? job?.repairCost ?? job?.estimatedCost ?? 0
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
      body { font-family: 'Courier New', monospace; width: 80mm; margin: 0 auto; padding: 8mm 5mm; }
      .center { text-align: center; }
      .shop-name { font-size: 22px; font-weight: 900; text-align: center; }
      .shop-sub { font-size: 13px; text-align: center; color: #333; font-weight: 600; margin-top: 2px; }
      .bill-title { font-size: 16px; font-weight: 900; text-align: center; letter-spacing: 3px; border: 2px solid #000; padding: 4px 0; margin: 8px 0; }
      .job-number { font-size: 32px; font-weight: 900; text-align: center; letter-spacing: 4px; margin: 10px 0; }
      .divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
      .divider-solid { border: none; border-top: 2px solid #000; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; }
      td { font-size: 14px; padding: 5px 0; vertical-align: top; }
      .label { font-weight: 600; color: #333; width: 42%; }
      .value { font-weight: 700; color: #000; text-align: right; }
      .issue-box { border: 1px solid #000; padding: 6px 8px; margin: 8px 0; font-size: 14px; font-weight: 700; }
      .amount-label { font-size: 14px; font-weight: 600; color: #333; }
      .amount-value { font-size: 14px; font-weight: 700; text-align: right; }
      .total-label { font-size: 18px; font-weight: 900; }
      .total-value { font-size: 18px; font-weight: 900; text-align: right; }
      .footer { text-align: center; font-size: 12px; color: #555; font-weight: 600; margin-top: 12px; line-height: 1.6; }
      @media print { body { width: 80mm; } }
    </style>
  </head>
  <body>
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
  </body>
  </html>`

  const win = window.open('', '_blank', 'width=420,height=750')
  if(!win) return;
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 500)
}
