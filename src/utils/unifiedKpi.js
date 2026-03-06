const KPI_MODE_SALES = 'sales';
const KPI_MODE_PROFIT = 'profit';
const KPI_MODE_EXCLUDED = 'excluded';
const KPI_SCOPE_SALES = 'sales';
const KPI_SCOPE_EXPENSE = 'expense';

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeKpiScope(value = '') {
  const raw = normalizeToken(value);
  if (raw === KPI_SCOPE_EXPENSE || raw === 'purchase') return KPI_SCOPE_EXPENSE;
  return KPI_SCOPE_SALES;
}

function normalizeContributionMode(value = '') {
  if (typeof value === 'boolean') {
    return value ? KPI_MODE_PROFIT : KPI_MODE_SALES;
  }
  const raw = normalizeToken(value);
  if (raw === KPI_MODE_PROFIT) return KPI_MODE_PROFIT;
  if (raw === KPI_MODE_EXCLUDED || raw === 'exclude') return KPI_MODE_EXCLUDED;
  return KPI_MODE_SALES;
}

function scopedCategoryKey(scope = KPI_SCOPE_SALES, categoryName = '', subCategoryName = '') {
  return `${normalizeKpiScope(scope)}::${normalizeToken(categoryName)}::${normalizeToken(subCategoryName)}`;
}

function scopedCategoryIdKey(scope = KPI_SCOPE_SALES, categoryId = '') {
  return `${normalizeKpiScope(scope)}::id::${normalizeToken(categoryId)}`;
}

function parseTransactionDate(txn = {}) {
  const candidates = [
    txn?.timestamp,
    txn?.occurred_at,
    txn?.created_at,
    txn?.updated_at,
    txn?.date ? `${txn.date} ${txn?.time || ''}` : '',
  ];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseProductDate(product = {}) {
  const candidates = [product?.timestamp, product?.created_at, product?.updated_at];
  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseRepairDate(job = {}) {
  const candidates = [job?.completedAt, job?.completed_at, job?.createdAt, job?.created_at, job?.timestamp];
  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isCashbookTransaction(txn = {}) {
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return source === 'admin'
    || source === 'admin-income'
    || source === 'admin-expense'
    || source === 'cashbook';
}

function getTxType(txn = {}) {
  const txType = normalizeToken(txn?.tx_type || txn?.type || '');
  if (txType) return txType;
  const legacyType = normalizeToken(txn?.type || '');
  return legacyType;
}

function isFixedExpenseTxn(txn = {}) {
  return Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false);
}

function isSalesTxn(txn = {}) {
  const txType = getTxType(txn);
  return txType === 'product_sale' || txType === 'sale' || txType === 'income';
}

function isExpenseTxn(txn = {}) {
  const txType = getTxType(txn);
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return txType === 'shop_expense'
    || txType === 'expense'
    || txType === 'product_expense'
    || txType === 'product_purchase'
    || txType === 'purchase'
    || txType === 'adjustment'
    || (source === 'expense' || source === 'purchase');
}

function isProductSaleTxn(txn = {}) {
  return getTxType(txn) === 'product_sale';
}

function resolveCategoryLevel1(rawCategory) {
  if (!rawCategory) return '';
  if (typeof rawCategory === 'string') return String(rawCategory).trim();
  if (typeof rawCategory === 'object') return String(rawCategory?.level1 || rawCategory?.name || '').trim();
  return '';
}

function resolveTxnCategoryParts(txn = {}, productById = {}) {
  const linkedProduct = txn?.productId !== undefined && txn?.productId !== null
    ? productById[String(txn.productId)]
    : null;

  const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');
  const isRepairSource = sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_');
  const categoryName = isRepairSource
    ? 'Repair Job'
    : (
      resolveCategoryLevel1(txn?.category)
      || resolveCategoryLevel1(txn?.categorySnapshot)
      || resolveCategoryLevel1(txn?.productSnapshot?.category)
      || resolveCategoryLevel1(linkedProduct?.category)
      || 'General'
    );

  const subCategoryName = String(
    txn?.subCategory
      || txn?.subcategory
      || txn?.sub_category
      || txn?.productSnapshot?.subCategory
      || linkedProduct?.subCategory
      || ''
  ).trim();

  return {
    linkedProduct,
    categoryId: String(
      txn?.category_id
      || txn?.categoryId
      || txn?.productSnapshot?.category_id
      || txn?.productSnapshot?.categoryId
      || linkedProduct?.category_id
      || linkedProduct?.categoryId
      || ''
    ).trim(),
    categoryName,
    subCategoryName,
  };
}

function resolveConfiguredMode(categoryContributionModeMap = {}, scope = KPI_SCOPE_SALES, categoryName = '', subCategoryName = '', categoryId = '') {
  const idKey = scopedCategoryIdKey(scope, categoryId);
  if (normalizeToken(categoryId) && Object.prototype.hasOwnProperty.call(categoryContributionModeMap || {}, idKey)) {
    return normalizeContributionMode(categoryContributionModeMap[idKey]);
  }

  const exact = scopedCategoryKey(scope, categoryName, subCategoryName);
  if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap || {}, exact)) {
    return normalizeContributionMode(categoryContributionModeMap[exact]);
  }

  const fallback = scopedCategoryKey(scope, categoryName, '');
  if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap || {}, fallback)) {
    return normalizeContributionMode(categoryContributionModeMap[fallback]);
  }

  return KPI_MODE_SALES;
}

function resolveTxnContributionMode(txn = {}, scope = KPI_SCOPE_SALES, categoryContributionModeMap = {}, productById = {}) {
  const { categoryId, categoryName, subCategoryName } = resolveTxnCategoryParts(txn, productById);
  return resolveConfiguredMode(categoryContributionModeMap, scope, categoryName, subCategoryName, categoryId);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeTxnGrossProfit(txn = {}, linkedProduct = null) {
  const amount = safeNumber(txn?.amount, 0);
  const quantity = Math.max(1, parseInt(txn?.quantity || '1', 10) || 1);

  const purchaseAtTime = Number(txn?.purchasePriceAtTime ?? txn?.purchase_price_at_time);
  const snapshotPurchase = Number(txn?.productSnapshot?.purchasePrice ?? txn?.productSnapshot?.costPrice);
  const linkedPurchase = linkedProduct ? Number(linkedProduct?.purchasePrice) : NaN;

  const unitCost = Number.isFinite(purchaseAtTime)
    ? purchaseAtTime
    : (Number.isFinite(snapshotPurchase) ? snapshotPurchase : (Number.isFinite(linkedPurchase) ? linkedPurchase : 0));

  const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');
  const isRepair = sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_');

  if (isRepair && String(txn?.notes || '').includes('Parts Cost: €')) {
    const match = String(txn?.notes || '').match(/Parts Cost: €([\d.]+)/);
    const partsCost = match?.[1] ? safeNumber(match[1], 0) : 0;
    return amount - partsCost;
  }

  return amount - (unitCost * quantity);
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getPeriodMeta(date, periodType) {
  if (periodType === 'weekly') {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return {
      periodKey: key,
      periodLabel: `${start.getDate()}/${start.getMonth() + 1} - ${end.getDate()}/${end.getMonth() + 1}`,
      periodStartMs: start.getTime(),
    };
  }

  const key = getMonthKey(date);
  const monthIdx = date.getMonth();
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    periodKey: key,
    periodLabel: `${labels[monthIdx]} ${date.getFullYear()}`,
    periodStartMs: new Date(date.getFullYear(), monthIdx, 1).getTime(),
  };
}

function ensurePeriod(periodMap, date, periodType) {
  const { periodKey, periodLabel, periodStartMs } = getPeriodMeta(date, periodType);
  if (!periodMap[periodKey]) {
    periodMap[periodKey] = {
      periodKey,
      periodLabel,
      periodStartMs,
      sales: 0,
      profit: 0,
      expenses: 0,
      revenue: 0,
      income: 0,
      fixedExpenses: 0,
      repairProfit: 0,
      purchases: 0,
      smallExpenses: 0,
    };
  }
  return periodMap[periodKey];
}

function calculateRepairProfit(job = {}) {
  const estimated = safeNumber(job?.estimatedCost ?? job?.estimated_cost, 0);
  const partsCost = (Array.isArray(job?.partsUsed) ? job.partsUsed : []).reduce((sum, part) => {
    const qty = safeNumber(part?.quantity ?? part?.qty, 1);
    const cost = safeNumber(part?.costPrice ?? part?.price, 0);
    return sum + (qty * cost);
  }, 0);
  return estimated - partsCost;
}

function makeBreakdownKey(categoryName = '', subCategoryName = '', fallback = 'General') {
  const main = String(categoryName || '').trim() || fallback;
  const sub = String(subCategoryName || '').trim();
  return `${normalizeToken(main)}::${normalizeToken(sub)}`;
}

function makeBreakdownLabel(categoryName = '', subCategoryName = '', fallback = 'General') {
  const main = String(categoryName || '').trim() || fallback;
  const sub = String(subCategoryName || '').trim();
  return sub ? `${main} / ${sub}` : main;
}

export function calculateFilteredTotal({
  txn = {},
  scope = KPI_SCOPE_SALES,
  categoryContributionModeMap = {},
  productById = {},
}) {
  const { linkedProduct, categoryId, categoryName, subCategoryName } = resolveTxnCategoryParts(txn, productById);
  const mode = resolveConfiguredMode(categoryContributionModeMap, scope, categoryName, subCategoryName, categoryId);
  if (mode === KPI_MODE_EXCLUDED) {
    return {
      included: false,
      mode,
      amount: 0,
      categoryId,
      categoryName,
      subCategoryName,
      linkedProduct,
      rawAmount: safeNumber(txn?.amount, 0),
    };
  }

  const rawAmount = safeNumber(txn?.amount, 0);
  const amount = (scope === KPI_SCOPE_SALES && mode === KPI_MODE_PROFIT)
    ? computeTxnGrossProfit(txn, linkedProduct)
    : rawAmount;

  return {
    included: true,
    mode,
    amount,
    categoryId,
    categoryName,
    subCategoryName,
    linkedProduct,
    rawAmount,
  };
}

export function computeUnifiedKpiSnapshot({
  transactions = [],
  products = [],
  repairJobs = [],
  rangeStart,
  rangeEnd,
  periodType = 'monthly',
  categoryContributionModeMap = {},
}) {
  const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
  const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      totals: {
        revenue: 0,
        expenses: 0,
        income: 0,
        fixedExpenses: 0,
        smallExpenses: 0,
        purchases: 0,
        repairProfit: 0,
        productSaleRevenue: 0,
      },
      periodData: [],
      includedSalesTransactions: [],
      revenueBreakdown: [],
      expenseBreakdown: [],
      incomeBreakdown: [],
      salesGrowth: 0,
      productProfit: 0,
      serviceProfit: 0,
      rawSalesTotal: 0,
    };
  }

  const periodMap = {};
  const productById = (Array.isArray(products) ? products : []).reduce((acc, item) => {
    if (item?.id !== undefined && item?.id !== null) acc[String(item.id)] = item;
    return acc;
  }, {});

  let productSaleRevenue = 0;
  let revenue = 0;
  let fixedExpenses = 0;
  let smallExpenses = 0;
  let purchases = 0;
  let repairProfit = 0;
  let productProfit = 0;
  let serviceProfit = 0;
  let rawSalesTotal = 0;

  const includedSalesTransactions = [];
  const revenueBreakdownMap = new Map();
  const expenseBreakdownMap = new Map();

  const pushBreakdown = (map, categoryName, subCategoryName, amount, fallbackLabel = 'General') => {
    const key = makeBreakdownKey(categoryName, subCategoryName, fallbackLabel);
    const current = map.get(key) || {
      key,
      label: makeBreakdownLabel(categoryName, subCategoryName, fallbackLabel),
      amount: 0,
      count: 0,
    };
    current.amount += amount;
    current.count += 1;
    map.set(key, current);
  };

  (Array.isArray(transactions) ? transactions : []).forEach((txn) => {
    const date = parseTransactionDate(txn);
    if (!date || date < start || date > end) return;

    const period = ensurePeriod(periodMap, date, periodType);
    const { linkedProduct, categoryName, subCategoryName } = resolveTxnCategoryParts(txn, productById);

    if (isSalesTxn(txn) && !isCashbookTransaction(txn)) {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_SALES,
        categoryContributionModeMap,
        productById,
      });
      rawSalesTotal += filtered.rawAmount;
      if (isProductSaleTxn(txn)) productSaleRevenue += filtered.rawAmount;

      if (filtered.included) {
        const contribution = filtered.amount;
        revenue += contribution;
        period.revenue += contribution;
        period.sales += filtered.rawAmount;
        period.profit += contribution;
        includedSalesTransactions.push(txn);
        pushBreakdown(revenueBreakdownMap, filtered.categoryName, filtered.subCategoryName, contribution, 'Revenue');

        const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');
        const isRepair = sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_') || normalizeToken(filtered.categoryName).includes('repair');
        if (isRepair) serviceProfit += contribution;
        else productProfit += contribution;
      }
      return;
    }

    if (isExpenseTxn(txn) && !isCashbookTransaction(txn)) {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_EXPENSE,
        categoryContributionModeMap,
        productById,
      });
      if (!filtered.included) return;

      const amount = filtered.rawAmount;
      pushBreakdown(expenseBreakdownMap, filtered.categoryName || txn?.category || 'Other', filtered.subCategoryName, amount, 'Expenses');

      if (isFixedExpenseTxn(txn)) {
        fixedExpenses += amount;
        period.fixedExpenses += amount;
      } else {
        const txType = getTxType(txn);
        const isPurchaseLike = txType === 'product_purchase' || txType === 'product_expense' || txType === 'purchase';
        if (isPurchaseLike) {
          purchases += amount;
          period.purchases += amount;
        } else {
          smallExpenses += amount;
          period.smallExpenses += amount;
        }
      }

      period.expenses += amount;
      return;
    }
  });

  (Array.isArray(products) ? products : []).forEach((product) => {
    const date = parseProductDate(product);
    if (!date || date < start || date > end) return;

    const categoryName = resolveCategoryLevel1(product?.category) || 'Inventory';
    const mode = resolveConfiguredMode(
      categoryContributionModeMap,
      KPI_SCOPE_EXPENSE,
      categoryName,
      String(product?.subCategory || '').trim(),
      String(product?.category_id || product?.categoryId || '').trim(),
    );
    if (mode === KPI_MODE_EXCLUDED) return;

    const stock = safeNumber(product?.stock, 0);
    const purchasePrice = safeNumber(product?.purchasePrice, 0);
    const inventoryCost = purchasePrice * Math.max(0, stock);
    if (inventoryCost <= 0) return;

    const period = ensurePeriod(periodMap, date, periodType);
    purchases += inventoryCost;
    period.purchases += inventoryCost;
    period.expenses += inventoryCost;
    pushBreakdown(expenseBreakdownMap, categoryName, String(product?.subCategory || '').trim(), inventoryCost, 'Inventory');
  });

  (Array.isArray(repairJobs) ? repairJobs : []).forEach((job) => {
    const date = parseRepairDate(job);
    if (!date || date < start || date > end) return;

    const mode = resolveConfiguredMode(categoryContributionModeMap, KPI_SCOPE_SALES, 'Repair Job', '', String(job?.category_id || job?.categoryId || '').trim());
    if (mode === KPI_MODE_EXCLUDED) return;

    const estimatedCost = safeNumber(job?.estimatedCost ?? job?.estimated_cost, 0);
    const computedProfit = calculateRepairProfit(job);
    const contribution = mode === KPI_MODE_PROFIT ? computedProfit : estimatedCost;

    repairProfit += contribution;
    revenue += contribution;

    const period = ensurePeriod(periodMap, date, periodType);
    period.repairProfit += contribution;
    period.revenue += contribution;
    period.profit += contribution;
    serviceProfit += contribution;
    pushBreakdown(revenueBreakdownMap, 'Repair Job', '', contribution, 'Repair Job');
  });

  const expenses = fixedExpenses + smallExpenses + purchases;
  const income = revenue - expenses;

  const periodData = Object.values(periodMap)
    .sort((a, b) => a.periodStartMs - b.periodStartMs)
    .map((row) => ({
      ...row,
      income: row.revenue - row.expenses,
    }));

  const revenueBreakdown = Array.from(revenueBreakdownMap.values())
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const expenseBreakdown = Array.from(expenseBreakdownMap.values())
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const incomeMap = new Map();
  revenueBreakdown.forEach((row) => {
    incomeMap.set(row.key, { ...row });
  });
  expenseBreakdown.forEach((row) => {
    const existing = incomeMap.get(row.key) || { ...row, amount: 0, count: 0 };
    existing.amount -= row.amount;
    existing.count += row.count;
    incomeMap.set(row.key, existing);
  });
  const incomeBreakdown = Array.from(incomeMap.values())
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const activeSeries = periodData.filter((row) => row.sales > 0 || row.revenue > 0 || row.expenses > 0);
  const last = activeSeries[activeSeries.length - 1];
  const prev = activeSeries[activeSeries.length - 2];
  const currentValue = safeNumber(last?.revenue, 0);
  const previousValue = safeNumber(prev?.revenue, 0);
  const salesGrowth = previousValue > 0
    ? ((currentValue - previousValue) / previousValue) * 100
    : currentValue > 0 ? 100 : 0;

  return {
    totals: {
      revenue,
      expenses,
      income,
      fixedExpenses,
      smallExpenses,
      purchases,
      repairProfit,
      productSaleRevenue,
    },
    periodData,
    includedSalesTransactions,
    revenueBreakdown,
    expenseBreakdown,
    incomeBreakdown,
    salesGrowth,
    productProfit,
    serviceProfit,
    rawSalesTotal,
  };
}
