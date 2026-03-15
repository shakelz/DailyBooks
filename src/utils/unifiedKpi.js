const KPI_MODE_SALES = 'sales';
const KPI_MODE_PROFIT = 'profit';
const KPI_MODE_EXCLUDED = 'excluded';
const KPI_SCOPE_SALES = 'sales';
const KPI_SCOPE_EXPENSE = 'expense';

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeAlphaToken(value = '') {
  return normalizeToken(value).replace(/[^a-z]/g, '');
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
  const sourceAlpha = normalizeAlphaToken(source);
  return source === 'admin'
    || source === 'admin-income'
    || source === 'admin-expense'
    || source === 'cashbook'
    || sourceAlpha === 'adminexpenses'
    || sourceAlpha === 'adminexpneses';
}

function getTxType(txn = {}) {
  const txType = normalizeToken(txn?.tx_type || txn?.type || '');
  if (txType) return txType;
  const legacyType = normalizeToken(txn?.type || '');
  return legacyType;
}

function isFixedExpenseType(txType = '') {
  const normalized = normalizeToken(txType);
  return normalized === 'fixed_expense'
    || normalized === 'fixed_expenses'
    || normalized === 'fixedexpense'
    || normalized === 'fixedexpenses';
}

function isProductExpenseType(txType = '') {
  const normalized = normalizeToken(txType);
  return normalized === 'product_expense'
    || normalized === 'product_expenses'
    || normalized === 'productpurchase'
    || normalized === 'product_purchase';
}

function isAdminExpenseSource(source = '') {
  const normalized = normalizeToken(source);
  const alpha = normalizeAlphaToken(source);
  return normalized === 'admin-expense'
    || normalized === 'admin-expenses'
    || normalized === 'admin-expneses'
    || alpha === 'adminexpense'
    || alpha === 'adminexpenses'
    || alpha === 'adminexpneses';
}

function isSalaryExpenseSource(source = '') {
  return normalizeToken(source) === 'salary';
}

function isFixedExpenseTxn(txn = {}) {
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return Boolean(txn?.is_fixed_expense ?? txn?.isFixedExpense ?? false)
    || isFixedExpenseType(getTxType(txn))
    || isAdminExpenseSource(source)
    || isSalaryExpenseSource(source);
}

function isInventoryPurchaseTxn(txn = {}) {
  const txType = getTxType(txn);
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return txType === 'product_purchase'
    || txType === 'purchase'
    || (isProductExpenseType(txType) && source === 'purchase');
}

function isSalesTxn(txn = {}) {
  const txType = getTxType(txn);
  return txType === 'product_sale'
    || txType === 'sale'
    || txType === 'income'
    || txType === 'repair_job'
    || txType === 'reparing_job'
    || txType === 'repair_amount';
}

function isExpenseTxn(txn = {}) {
  const txType = getTxType(txn);
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return isFixedExpenseType(txType)
    || txType === 'shop_expense'
    || txType === 'expense'
    || isProductExpenseType(txType)
    || txType === 'product_purchase'
    || txType === 'purchase'
    || txType === 'adjustment'
    || (source === 'expense' || source === 'purchase');
}

function resolveExpenseName(txn = {}) {
  const candidates = [
    txn?.expense_name,
    txn?.expenseName,
    txn?.expense_title,
    txn?.expenseTitle,
    txn?.desc,
    txn?.description,
    txn?.name,
    txn?.item_name,
    txn?.itemName,
  ];
  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function shouldIgnoreGeneralExpense(txn = {}, filtered = {}) {
  const txType = getTxType(txn);
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  const isExpenseSource = source === 'expense' || source === 'purchase';
  if (!isProductExpenseType(txType) || !isExpenseSource) return false;

  const categoryName = normalizeToken(filtered?.categoryName || '');
  if (categoryName !== 'general' && categoryName !== 'uncategorized') return false;

  const explicitCategory = normalizeToken(txn?.category || txn?.category_name || '');
  const explicitCategoryId = normalizeToken(txn?.category_id || txn?.categoryId || '');
  const explicitExpenseName = normalizeToken(resolveExpenseName(txn));

  return !explicitCategory && !explicitCategoryId && !explicitExpenseName;
}

function isProductSaleTxn(txn = {}) {
  const source = normalizeToken(txn?.source || txn?.tx_source || '');
  return getTxType(txn) === 'product_sale' && source === 'shop';
}

function resolveCategoryLevel1(rawCategory) {
  if (!rawCategory) return '';
  if (typeof rawCategory === 'string') return String(rawCategory).trim();
  if (typeof rawCategory === 'object') return String(rawCategory?.level1 || rawCategory?.name || '').trim();
  return '';
}

function resolveCategoryLevel2(rawCategory) {
  if (!rawCategory) return '';
  if (typeof rawCategory === 'string') return '';
  if (typeof rawCategory === 'object') {
    return String(rawCategory?.level2 || rawCategory?.subCategory || rawCategory?.sub_category || '').trim();
  }
  return '';
}

function resolveSubCategoryFromNotes(notes = '') {
  const text = String(notes || '').trim();
  if (!text) return '';
  const match = text.match(/subcategory\s*:\s*([^|,\n]+)/i);
  return match && match[1] ? String(match[1]).trim() : '';
}

function resolveTxnCategoryParts(txn = {}, productById = {}) {
  const linkedProduct = txn?.productId !== undefined && txn?.productId !== null
    ? productById[String(txn.productId)]
    : null;

  const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');
  const txType = getTxType(txn);
  const isRepairSource = sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_');
  const explicitCategoryName =
    resolveCategoryLevel1(txn?.category)
    || resolveCategoryLevel1(txn?.categorySnapshot)
    || resolveCategoryLevel1(txn?.productSnapshot?.category)
    || resolveCategoryLevel1(linkedProduct?.category);

  const subCategoryName = String(
    txn?.subCategory
      || txn?.sub_category_name
      || txn?.subcategory
      || txn?.sub_category
      || resolveSubCategoryFromNotes(txn?.notes)
      || txn?.categorySnapshot?.level2
      || txn?.categorySnapshot?.subCategory
      || txn?.productSnapshot?.subCategory
      || txn?.productSnapshot?.sub_category
      || resolveCategoryLevel2(txn?.category)
      || resolveCategoryLevel2(txn?.categorySnapshot)
      || resolveCategoryLevel2(txn?.productSnapshot?.category)
      || (Array.isArray(txn?.categoryPath) ? txn.categoryPath[1] : '')
      || (Array.isArray(txn?.productSnapshot?.categoryPath) ? txn.productSnapshot.categoryPath[1] : '')
      || resolveCategoryLevel2(linkedProduct?.category)
      || linkedProduct?.subCategory
      || linkedProduct?.subcategory
      || linkedProduct?.sub_category
      || linkedProduct?.category_level2
      || linkedProduct?.categoryLevel2
      || (Array.isArray(linkedProduct?.categoryPath) ? linkedProduct.categoryPath[1] : '')
      || ''
  ).trim();
  const descriptionFallback = resolveExpenseName(txn);
  const rawDescription = String(txn?.desc || txn?.description || txn?.name || '').trim();

  let categoryName = explicitCategoryName;
  if (!categoryName) {
    if (isRepairSource) {
      categoryName = 'Repair Job';
    } else if (subCategoryName) {
      categoryName = subCategoryName;
    } else if (descriptionFallback) {
      categoryName = descriptionFallback;
    } else if (rawDescription) {
      categoryName = rawDescription;
    } else if (isProductExpenseType(txType) && sourceText === 'expense') {
      categoryName = resolveExpenseName(txn) || 'Uncategorized';
    } else {
      categoryName = 'Uncategorized';
    }
  }
  if (normalizeToken(categoryName) === 'general' || normalizeToken(categoryName) === 'uncategorized') {
    if (subCategoryName) categoryName = subCategoryName;
    else if (descriptionFallback) categoryName = descriptionFallback;
    else if (rawDescription) categoryName = rawDescription;
  }

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

  const unitCost = Number.isFinite(purchaseAtTime) && purchaseAtTime > 0
    ? purchaseAtTime
    : (Number.isFinite(snapshotPurchase) && snapshotPurchase > 0
      ? snapshotPurchase
      : (Number.isFinite(linkedPurchase) && linkedPurchase > 0 ? linkedPurchase : 0));

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

function makeBreakdownKey(categoryName = '', subCategoryName = '', fallback = 'Uncategorized') {
  const main = String(categoryName || '').trim() || fallback;
  const sub = String(subCategoryName || '').trim();
  return `${normalizeToken(main)}::${normalizeToken(sub)}`;
}

function makeBreakdownLabel(categoryName = '', subCategoryName = '', fallback = 'Uncategorized') {
  const main = String(categoryName || '').trim() || fallback;
  const sub = String(subCategoryName || '').trim();
  return sub ? `${main} / ${sub}` : main;
}

export function calculateFilteredTotal({
  txn = {},
  scope = KPI_SCOPE_SALES,
  categoryContributionModeMap = {},
  productById = {},
  applyProfitModeForExpenseScope = false,
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
  const shouldApplyProfitMode = mode === KPI_MODE_PROFIT
    && (scope === KPI_SCOPE_SALES || (scope === KPI_SCOPE_EXPENSE && applyProfitModeForExpenseScope));
  const amount = shouldApplyProfitMode
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
  includeAdminFixedExpenses = true,
}) {
  const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
  const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      totals: {
        revenue: 0,
        expenses: 0,
        income: 0,
        finalProfit: 0,
        fixedExpenses: 0,
        smallExpenses: 0,
        purchases: 0,
        inventoryPurchases: 0,
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
      strictKpi: {
        productProfit: 0,
        serviceProfit: 0,
        grossNetProfit: 0,
        fixedExpenses: 0,
        nonFixedExpenses: 0,
        inventoryPurchases: 0,
        finalProfit: 0,
      },
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
  let inventoryPurchases = 0;
  let repairProfit = 0;
  let productProfit = 0;
  let serviceProfit = 0;
  let rawSalesTotal = 0;
  let strictProductProfit = 0;
  let strictServiceProfit = 0;
  let strictFixedExpenses = 0;
  let strictNonFixedExpenses = 0;
  let strictInventoryPurchases = 0;

  const includedSalesTransactions = [];
  const revenueBreakdownMap = new Map();
  const expenseBreakdownMap = new Map();

  const pushBreakdown = (map, categoryName, subCategoryName, amount, fallbackLabel = 'Uncategorized') => {
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
    const txType = getTxType(txn);
    const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');

    if (txType === 'product_sale' && sourceText === 'shop') {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_SALES,
        categoryContributionModeMap,
        productById,
      });
      if (filtered.included) strictProductProfit += filtered.amount;
    } else if (
      (sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_'))
      && (txType === 'repair_amount' || txType === 'repair_job' || txType === 'reparing_job' || txType === 'product_sale' || txType === 'sale' || txType === 'income')
    ) {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_SALES,
        categoryContributionModeMap,
        productById,
      });
      if (filtered.included) strictServiceProfit += filtered.amount;
    } else if (isExpenseTxn(txn)) {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_EXPENSE,
        categoryContributionModeMap,
        productById,
        applyProfitModeForExpenseScope: true,
      });
      if (filtered.included && !shouldIgnoreGeneralExpense(txn, filtered)) {
        if (isFixedExpenseTxn(txn)) {
          if (!includeAdminFixedExpenses && isAdminExpenseSource(sourceText)) {
            return;
          }
          strictFixedExpenses += filtered.amount;
        } else if (isInventoryPurchaseTxn(txn)) {
          strictInventoryPurchases += filtered.amount;
        } else if (!isAdminExpenseSource(sourceText)) {
          strictNonFixedExpenses += filtered.amount;
        }
      }
    }

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

    const shouldSkipAsCashbookExpense = isCashbookTransaction(txn)
      && txType !== 'fixed_expense'
      && !isFixedExpenseTxn(txn);

    if (isExpenseTxn(txn) && !shouldSkipAsCashbookExpense) {
      const filtered = calculateFilteredTotal({
        txn,
        scope: KPI_SCOPE_EXPENSE,
        categoryContributionModeMap,
        productById,
      });
      if (!filtered.included) return;
      if (shouldIgnoreGeneralExpense(txn, filtered)) return;

      const amount = filtered.rawAmount;
      pushBreakdown(expenseBreakdownMap, filtered.categoryName || txn?.category || 'Sonstiges', filtered.subCategoryName, amount, 'Expenses');
      if (isFixedExpenseTxn(txn) || isFixedExpenseType(txType)) {
        const sourceText = normalizeToken(txn?.source || txn?.tx_source || '');
        if (!includeAdminFixedExpenses && isAdminExpenseSource(sourceText)) {
          return;
        }
        fixedExpenses += amount;
        period.fixedExpenses += amount;
      } else {
        const isPurchaseLike = isInventoryPurchaseTxn(txn);
        if (isPurchaseLike) {
          purchases += amount;
          inventoryPurchases += amount;
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
  const finalProfit = (productProfit + serviceProfit) - (inventoryPurchases + fixedExpenses);
  const strictGrossNetProfit = strictProductProfit + strictServiceProfit;
  const strictFinalProfit = strictGrossNetProfit - (strictFixedExpenses + strictNonFixedExpenses + strictInventoryPurchases);

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
      finalProfit,
      fixedExpenses,
      smallExpenses,
      purchases,
      inventoryPurchases,
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
    strictKpi: {
      productProfit: strictProductProfit,
      serviceProfit: strictServiceProfit,
      grossNetProfit: strictGrossNetProfit,
      fixedExpenses: strictFixedExpenses,
      nonFixedExpenses: strictNonFixedExpenses,
      inventoryPurchases: strictInventoryPurchases,
      finalProfit: strictFinalProfit,
    },
  };
}
