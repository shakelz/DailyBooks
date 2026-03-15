import { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useRepairs } from '../../context/RepairsContext';
import { priceTag, CURRENCY_CONFIG } from '../../utils/currency';
import { computeUnifiedKpiSnapshot } from '../../utils/unifiedKpi';
import { supabase } from '../../supabaseClient';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Area, PieChart, Pie, Cell, LabelList
} from 'recharts';
import DateRangeFilter from './DateRangeFilter';
import { TrendingUp, DollarSign, Activity, AlertCircle, Calendar, Filter, Zap, Package, RefreshCw, BarChart3, Scale, Users, Wrench, ChevronDown, ChevronUp } from 'lucide-react';

const KPI_MODE_SALES = 'sales';
const KPI_MODE_PROFIT = 'profit';
const KPI_MODE_EXCLUDED = 'excluded';
const CHART_CARD_CLASS = 'bg-white rounded-2xl border border-slate-200 shadow-sm p-5';

function normalizeToken(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeContributionMode(value = '') {
    const raw = normalizeToken(value);
    if (raw === KPI_MODE_PROFIT) return KPI_MODE_PROFIT;
    if (raw === KPI_MODE_EXCLUDED || raw === 'exclude') return KPI_MODE_EXCLUDED;
    return KPI_MODE_SALES;
}

function normalizeKpiScope(value = '') {
    const raw = normalizeToken(value);
    if (raw === 'expense' || raw === 'purchase') return 'expense';
    return 'sales';
}

function scopedCategoryKey(scope = 'sales', categoryName = '', subCategoryName = '') {
    return `${normalizeKpiScope(scope)}::${normalizeToken(categoryName)}::${normalizeToken(subCategoryName)}`;
}

function scopedCategoryIdKey(scope = 'sales', categoryId = '') {
    return `${normalizeKpiScope(scope)}::id::${normalizeToken(categoryId)}`;
}

function toLocalDateKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function toInputDateString(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
        const fallback = new Date();
        return toLocalDateKey(fallback);
    }
    return toLocalDateKey(d);
}

function safeDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function safeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isUUID(value = '') {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function parseTransactionDate(txn) {
    const parsed = new Date(txn?.occurred_at || txn?.created_at || txn?.timestamp || `${txn?.date || ''} ${txn?.time || ''}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isCashbookEntry(txn) {
    const source = String(txn?.source || '').toLowerCase();
    return source === 'admin'
        || source === 'admin-income'
        || source === 'admin-expense'
        || source === 'cashbook';
}

function isRepairRevenueTransaction(txn) {
    if (String(txn?.type || '').toLowerCase() !== 'income') return false;
    const source = String(txn?.source || '').toLowerCase();
    const category = String(txn?.category || '').toLowerCase();
    return source === 'repair'
        || source.startsWith('repair-')
        || source.startsWith('repair_')
        || category.includes('repair');
}

export default function InsightsTab() {
    const { transactions: contextTransactions, products } = useInventory();
    const { isAdminLike, slowMovingDays, salesmen, attendanceLogs, activeShopId, user } = useAuth();
    const { repairJobs } = useRepairs();
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)),
            endDate: new Date(),
            key: 'selection'
        }
    ]);
    const timeView = ((new Date(dateSelection[0].endDate) - new Date(dateSelection[0].startDate)) / (1000 * 60 * 60 * 24)) <= 60 ? 'weekly' : 'monthly';
    const [peakHourMode, setPeakHourMode] = useState('today'); // 'today' or '7d'
    const [showFinalProfitBreakdown, setShowFinalProfitBreakdown] = useState(false);
    const [showGrossProfitBreakdown, setShowGrossProfitBreakdown] = useState(false);
    const [categoryContributionModeMap, setCategoryContributionModeMap] = useState({});
    const transactions = useMemo(() => contextTransactions || [], [contextTransactions]);

    const settingsShopId = String(activeShopId || user?.shop_id || '').trim();

    const chartTransactions = useMemo(() => {
        return (contextTransactions || [])
            .filter((txn) => {
                const amount = parseFloat(txn?.amount || 0);
                return amount > 0;
            })
            .map((txn) => ({
                ...txn,
                notes: String(txn?.notes || txn?.note || '').trim(),
                description: String(txn?.description || txn?.desc || '').trim(),
                resolvedCategoryName: String(txn?.resolvedCategoryName || '').trim() || null,
            }));
    }, [contextTransactions]);

    useEffect(() => {
        if (!settingsShopId) {
            setCategoryContributionModeMap({});
            return;
        }

        let cancelled = false;
        const loadSettings = async () => {
            const result = await supabase
                .from('kpi_profit_category_settings')
                .select('*')
                .eq('shop_id', settingsShopId);
            if (cancelled) return;
            if (result.error || !Array.isArray(result.data)) {
                setCategoryContributionModeMap({});
                return;
            }

            const nextMap = result.data.reduce((acc, row) => {
                const scope = normalizeKpiScope(row?.kpi_scope || row?.scope);
                const categoryName = String(row?.category_name || '').trim();
                const subCategoryName = String(row?.sub_category_name || '').trim();
                const categoryId = String(row?.category_id || row?.categoryId || '').trim();
                if (!categoryName) return acc;
                const modeFromContributionColumn = row?.contribution_mode ?? row?.contributionMode;
                const modeFromLegacyBool = row?.profit_only ?? row?.profitOnly ?? row?.is_profit_only;
                const resolvedMode = (modeFromContributionColumn === undefined || modeFromContributionColumn === null || String(modeFromContributionColumn).trim() === '')
                    ? (Boolean(modeFromLegacyBool) ? KPI_MODE_PROFIT : KPI_MODE_SALES)
                    : normalizeContributionMode(modeFromContributionColumn);

                acc[scopedCategoryKey(scope, categoryName, subCategoryName)] = resolvedMode;
                if (categoryId) {
                    acc[scopedCategoryIdKey(scope, categoryId)] = resolvedMode;
                }
                return acc;
            }, {});
            setCategoryContributionModeMap(nextMap);
        };

        loadSettings();
        return () => {
            cancelled = true;
        };
    }, [settingsShopId]);

    // ── Helper: Calculate Business Metrics ──
    const analytics = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);
        const diffDays = (rangeEnd - rangeStart) / (1000 * 60 * 60 * 24);
        const periodType = diffDays <= 60 ? 'weekly' : 'monthly';

        const unified = computeUnifiedKpiSnapshot({
            transactions,
            products,
            repairJobs,
            rangeStart,
            rangeEnd,
            periodType,
            categoryContributionModeMap,
        });

        const productById = products.reduce((acc, p) => {
            if (p?.id !== undefined && p?.id !== null) acc[String(p.id)] = p;
            return acc;
        }, {});

        const extractCategoryLevel1 = (rawCategory) => {
            if (!rawCategory) return '';
            if (typeof rawCategory === 'string') return safeText(rawCategory);
            if (typeof rawCategory === 'object') return safeText(rawCategory.level1 || rawCategory.name || '');
            return '';
        };

        const extractSubCategory = (txn = {}, linkedProduct = null) => {
            const direct = safeText(txn?.subCategory || txn?.subcategory || txn?.sub_category);
            if (direct) return direct;
            const snapshot = safeText(txn?.productSnapshot?.subCategory || txn?.productSnapshot?.sub_category);
            if (snapshot) return snapshot;
            if (Array.isArray(txn?.categoryPath) && txn.categoryPath[1]) return safeText(txn.categoryPath[1]);
            if (Array.isArray(txn?.productSnapshot?.categoryPath) && txn.productSnapshot.categoryPath[1]) return safeText(txn.productSnapshot.categoryPath[1]);
            return safeText(linkedProduct?.subCategory || linkedProduct?.subcategory);
        };

        const resolveCategoryName = (txn, linkedProduct = null) => {
            const sourceText = String(txn?.source || txn?.tx_source || '').toLowerCase();
            if (sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_')) {
                return 'Repair Job';
            }

            const directCategory =
                extractCategoryLevel1(txn?.category)
                || extractCategoryLevel1(txn?.categorySnapshot)
                || extractCategoryLevel1(txn?.productSnapshot?.category);
            if (directCategory) return directCategory;
            if (Array.isArray(txn?.categoryPath) && txn.categoryPath[0]) return safeText(txn.categoryPath[0]);
            if (Array.isArray(txn?.productSnapshot?.categoryPath) && txn.productSnapshot.categoryPath[0]) return safeText(txn.productSnapshot.categoryPath[0]);
            const linkedCategory = extractCategoryLevel1(linkedProduct?.category);
            return linkedCategory || 'General Sales';
        };

        const resolveContributionMode = (scope, categoryName, subCategoryName) => {
            const exactKey = scopedCategoryKey(scope, categoryName, subCategoryName);
            if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap, exactKey)) {
                return normalizeContributionMode(categoryContributionModeMap[exactKey]);
            }
            const categoryOnlyKey = scopedCategoryKey(scope, categoryName, '');
            if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap, categoryOnlyKey)) {
                return normalizeContributionMode(categoryContributionModeMap[categoryOnlyKey]);
            }
            return KPI_MODE_SALES;
        };

        const resolveRevenueContribution = (txn = {}, linkedProduct = null, categoryName = '', subCategoryName = '') => {
            const amount = parseFloat(txn?.amount) || 0;
            const mode = resolveContributionMode('sales', categoryName, subCategoryName);
            if (mode === KPI_MODE_EXCLUDED) return 0;
            if (mode === KPI_MODE_SALES) return amount;

            const quantity = Math.max(1, parseInt(txn.quantity || '1', 10) || 1);
            const purchaseAtTime = Number(txn?.purchasePriceAtTime ?? txn?.purchase_price_at_time);
            const snapshotPurchase = Number(txn?.productSnapshot?.purchasePrice ?? txn?.productSnapshot?.costPrice);
            const linkedPurchase = linkedProduct ? Number(linkedProduct?.purchasePrice) : NaN;
            const unitCost = Number.isFinite(purchaseAtTime)
                ? purchaseAtTime
                : (Number.isFinite(snapshotPurchase) ? snapshotPurchase : (Number.isFinite(linkedPurchase) ? linkedPurchase : 0));

            return amount - (unitCost * quantity);
        };

        const resolveSalesmanName = (txn) => {
            const workerId = safeText(txn?.workerId || txn?.userId || '');
            if (workerId) {
                const matched = (salesmen || []).find((staff) => String(staff?.id) === workerId);
                const matchedName = safeText(matched?.name);
                if (matchedName) return matchedName;
            }
            return safeText(txn?.salesmanName) || safeText(txn?.userName) || safeText(txn?.soldBy) || safeText(txn?.staffName) || 'Unknown';
        };

        const supplierStats = {};
        const categoryStats = {};
        const productStats = {};
        const salesmanStats = {};

        let totalSales = unified.rawSalesTotal;
        let totalCOGS = 0;

        (unified.includedSalesTransactions || []).forEach((txn) => {
            const txnDate = parseTransactionDate(txn);
            if (!txnDate || txnDate < rangeStart || txnDate > rangeEnd) return;

            const linkedProduct = txn?.productId !== undefined && txn?.productId !== null ? productById[String(txn.productId)] : null;
            const categoryName = resolveCategoryName(txn, linkedProduct);
            const subCategoryName = extractSubCategory(txn, linkedProduct);

            const saleAmount = parseFloat(txn.amount) || 0;
            const quantity = Math.max(1, parseInt(txn.quantity || '1', 10) || 1);
            const purchaseAtTime = Number(txn?.purchasePriceAtTime ?? txn?.purchase_price_at_time);
            const snapshotPurchase = Number(txn?.productSnapshot?.purchasePrice ?? txn?.productSnapshot?.costPrice);
            const linkedPurchase = linkedProduct ? Number(linkedProduct?.purchasePrice) : NaN;
            const unitCost = Number.isFinite(purchaseAtTime)
                ? purchaseAtTime
                : (Number.isFinite(snapshotPurchase) ? snapshotPurchase : (Number.isFinite(linkedPurchase) ? linkedPurchase : 0));
            const buyAmount = unitCost * quantity;

            let grossProfit = saleAmount - buyAmount;
            const sourceText = String(txn?.source || '').toLowerCase();
            const isRepair = sourceText === 'repair' || sourceText.startsWith('repair-') || sourceText.startsWith('repair_') || categoryName === 'Repair Job';
            if (isRepair && txn?.notes && String(txn.notes).includes('Parts Cost: €')) {
                const match = String(txn.notes).match(/Parts Cost: €([\d.]+)/);
                const partsCost = match && match[1] ? parseFloat(match[1]) : 0;
                grossProfit = saleAmount - (Number.isFinite(partsCost) ? partsCost : 0);
            }

            const kpiContribution = resolveRevenueContribution(txn, linkedProduct, categoryName, subCategoryName);
            if (!isRepair) {
                totalCOGS += buyAmount;
            }

            if (txn.productId) {
                const productKey = String(txn.productId);
                if (!productStats[productKey]) productStats[productKey] = { name: txn.name || txn.desc || linkedProduct?.name || 'Unknown', qty: 0, profit: 0 };
                productStats[productKey].qty += quantity;
                productStats[productKey].profit += kpiContribution;
            }

            if (!categoryStats[categoryName]) categoryStats[categoryName] = { name: categoryName, value: 0 };
            categoryStats[categoryName].value += kpiContribution;

            let supplierName = safeText(txn.purchaseFrom) || safeText(linkedProduct?.purchaseFrom) || 'Local/Unspecified';
            if (linkedProduct && safeText(linkedProduct.productUrl)) {
                if (linkedProduct.productUrl.startsWith('http')) {
                    try {
                        supplierName = new URL(linkedProduct.productUrl).hostname.replace('www.', '');
                    } catch {
                        supplierName = linkedProduct.productUrl;
                    }
                } else {
                    supplierName = linkedProduct.productUrl;
                }
            }

            if (!supplierStats[supplierName]) supplierStats[supplierName] = { name: supplierName, volume: 0, profit: 0, marginSum: 0, count: 0 };
            supplierStats[supplierName].volume += saleAmount;
            supplierStats[supplierName].profit += kpiContribution;
            if (saleAmount > 0) {
                supplierStats[supplierName].marginSum += ((kpiContribution / saleAmount) * 100);
                supplierStats[supplierName].count += 1;
            }

            if (!isRepair) {
                const salesman = resolveSalesmanName(txn);
                if (salesman && salesman.toLowerCase() !== 'unknown') {
                    if (!salesmanStats[salesman]) salesmanStats[salesman] = { name: salesman, sales: 0, marginSum: 0, count: 0, totalDiscount: 0, profit: 0 };
                    salesmanStats[salesman].sales += saleAmount;
                    salesmanStats[salesman].profit += kpiContribution;
                    if (saleAmount > 0) {
                        salesmanStats[salesman].marginSum += ((kpiContribution / saleAmount) * 100);
                        salesmanStats[salesman].count += 1;
                    }
                    salesmanStats[salesman].totalDiscount += parseFloat(txn.discount || 0);
                }
            }
        });

        const chartData = (unified.periodData || [])
            .map((point, idx, arr) => {
                const windowSize = periodType === 'weekly' ? 4 : 3;
                const from = Math.max(0, idx - (windowSize - 1));
                const slice = arr.slice(from, idx + 1);
                const avg = slice.reduce((sum, item) => sum + item.revenue, 0) / Math.max(1, slice.length);
                return {
                    ...point,
                    trend: avg,
                    date: point.periodLabel,
                };
            });

        const supplierData = Object.values(supplierStats)
            .map((s) => ({ ...s, avgMargin: s.count ? (s.marginSum / s.count) : 0 }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10);

        const categoryData = Object.values(categoryStats)
            .map((c) => ({ ...c, value: parseFloat((c.value || 0).toFixed(2)) }))
            .filter((c) => c.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const bestSellers = Object.values(productStats)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);

        const salesmanData = Object.values(salesmanStats)
            .map((s) => ({
                ...s,
                avgMargin: s.count > 0 ? (s.marginSum / s.count) : 0,
                avgDiscount: s.count > 0 ? (s.totalDiscount / s.count) : 0,
            }))
            .sort((a, b) => b.sales - a.sales);

        const currentStockValue = products.reduce((acc, p) => acc + ((parseFloat(p.purchasePrice) || 0) * (parseInt(p.stock) || 0)), 0);
        const turnoverRatio = currentStockValue > 0 ? (totalCOGS / currentStockValue) : 0;

        const nowMs = new Date().getTime();
        let slowMovingCount = 0;
        let fastMovingCount = 0;
        let slowMovingValue = 0;

        products.forEach((p) => {
            if (!p.timestamp) return;
            const diffDays = (nowMs - new Date(p.timestamp).getTime()) / (1000 * 3600 * 24);
            if (diffDays > slowMovingDays) {
                slowMovingCount += 1;
                slowMovingValue += ((parseFloat(p.purchasePrice) || 0) * (parseInt(p.stock) || 0));
            } else {
                fastMovingCount += 1;
            }
        });

        const strictKpi = unified.strictKpi || {};
        const productProfit = Number.isFinite(strictKpi.productProfit) ? strictKpi.productProfit : unified.productProfit;
        const serviceProfit = Number.isFinite(strictKpi.serviceProfit) ? strictKpi.serviceProfit : unified.serviceProfit;
        const totalProfit = Number.isFinite(strictKpi.grossNetProfit) ? strictKpi.grossNetProfit : (productProfit + serviceProfit);
        const totalFixedExpenses = Number.isFinite(strictKpi.fixedExpenses) ? strictKpi.fixedExpenses : unified.totals.fixedExpenses;
        const totalNonFixedExpenses = Number.isFinite(strictKpi.nonFixedExpenses) ? strictKpi.nonFixedExpenses : unified.totals.smallExpenses;
        const totalInventoryPurchases = Number.isFinite(strictKpi.inventoryPurchases)
            ? strictKpi.inventoryPurchases
            : (unified.totals.inventoryPurchases || unified.totals.purchases || 0);
        const finalProfit = Number.isFinite(strictKpi.finalProfit)
            ? strictKpi.finalProfit
            : ((productProfit + serviceProfit) - (totalFixedExpenses + totalNonFixedExpenses + totalInventoryPurchases));
        const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
        const salesGrowth = unified.salesGrowth;

        return {
            totalSales,
            totalProfit,
            productProfit,
            serviceProfit,
            totalFixedExpenses,
            totalNonFixedExpenses,
            totalInventoryPurchases,
            finalProfit,
            avgMargin,
            salesGrowth,
            turnoverRatio,
            chartData,
            profitVsExpenseData: chartData.map((row) => ({
                periodLabel: row.periodLabel,
                profit: row.revenue,
                expenses: row.expenses,
            })),
            sourceBreakdown: {
                productSaleRevenue: unified.totals.productSaleRevenue,
                repairProfit: unified.totals.repairProfit,
                smallExpenses: totalNonFixedExpenses,
                purchases: totalInventoryPurchases,
                fixedExpenses: totalFixedExpenses,
            },
            supplierData,
            categoryData,
            bestSellers,
            salesmanData,
            inventoryHealth: [
                { name: `Fast Moving (<${slowMovingDays}d)`, value: fastMovingCount },
                { name: `Slow Moving (>${slowMovingDays}d)`, value: slowMovingCount },
            ],
            slowMovingValue,
        };
    }, [transactions, products, repairJobs, dateSelection, salesmen, slowMovingDays, categoryContributionModeMap]);

    // ── Peak Hours Analysis ──
    const peakData = useMemo(() => {
        const hourlyCounts = new Array(15).fill(0); // 09:00 to 23:00 (15 slots)
        const offset = 9; // Start at 9 AM

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);

        transactions.forEach(t => {
            if (!t.timestamp || t.type !== 'income' || isCashbookEntry(t)) return;
            const tDate = new Date(t.timestamp);
            const hour = tDate.getHours();

            if (hour < 9 || hour > 23) return; // Ignore non-business hours? Or just map all. User said 9 AM to 9 PM.

            // Filter Logic
            let include = false;
            if (peakHourMode === 'today') {
                if (tDate >= startOfToday) include = true;
            } else {
                if (tDate >= sevenDaysAgo) include = true;
            }

            if (include) {
                // Determine slot index (Hour - 9).
                // But wait, if hour is 9, index 0.
                const idx = hour - 9;
                if (idx >= 0 && idx < hourlyCounts.length) {
                    hourlyCounts[idx] += 1;
                }
            }
        });

        // If 7d mode, average it?
        // User said "pichle 7 dinon ka average hourly traffic".
        // simple avg: total / 7.
        // But maybe we should divide by the number of days that actually had data?
        // Let's stick to simple / 7 for "weekly average" context.
        const divisor = peakHourMode === '7d' ? 7 : 1;

        // Find Peak for highlighting
        let maxVal = 0;
        const data = hourlyCounts.map((count, idx) => {
            const val = count / divisor;
            if (val > maxVal) maxVal = val;
            return {
                hour: `${idx + 9}:00`,
                count: val,
                rawCount: count
            };
        });

        // Add fill color
        return data.map(d => ({
            ...d,
            fill: d.count === maxVal && maxVal > 0 ? '#f59e0b' : '#3b82f6' // Orange for Peak, Blue for rest
        }));
    }, [transactions, peakHourMode]);

    const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
    const EXPENSE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#0ea5e9', '#22c55e', '#ec4899'];

    // ── Salary Analytics per salesman ──
    const salaryData = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        const perSalesman = {};
        let totalSalary = 0;

        transactions.forEach(t => {
            if (t.category !== 'Salary' || t.type !== 'expense' || !t.isFixedExpense) return;
            if (!t.timestamp) return;
            const tDate = new Date(t.timestamp);
            if (tDate < rangeStart || tDate > rangeEnd) return;

            const name = t.salesmanName || t.desc?.replace('Salary: ', '').split(' (')[0] || 'Unknown';
            const amount = parseFloat(t.amount) || 0;
            if (!perSalesman[name]) perSalesman[name] = { name, totalPaid: 0, sessions: 0 };
            perSalesman[name].totalPaid += amount;
            perSalesman[name].sessions += 1;
            totalSalary += amount;
        });

        return {
            perSalesman: Object.values(perSalesman).sort((a, b) => b.totalPaid - a.totalPaid),
            totalSalary
        };
    }, [transactions, dateSelection]);

    // ── Expense Breakdown by category ──
    const expenseData = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        const byCategory = {};
        let total = 0;

        transactions.forEach(t => {
            if (t.type !== 'expense' || !t.isFixedExpense) return;
            if (!t.timestamp) return;
            const tDate = new Date(t.timestamp);
            if (tDate < rangeStart || tDate > rangeEnd) return;

            const mode = (() => {
                const exact = scopedCategoryKey('expense', t.category || 'Other', t.subCategory || t.subcategory || '');
                if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap, exact)) {
                    return normalizeContributionMode(categoryContributionModeMap[exact]);
                }
                const fallback = scopedCategoryKey('expense', t.category || 'Other', '');
                if (Object.prototype.hasOwnProperty.call(categoryContributionModeMap, fallback)) {
                    return normalizeContributionMode(categoryContributionModeMap[fallback]);
                }
                return KPI_MODE_SALES;
            })();
            if (mode === KPI_MODE_EXCLUDED) return;

            const cat = t.category || 'Other';
            const amount = parseFloat(t.amount) || 0;
            if (!byCategory[cat]) byCategory[cat] = { name: cat, value: 0, count: 0 };
            byCategory[cat].value += amount;
            byCategory[cat].count += 1;
            total += amount;
        });

        return {
            categories: Object.values(byCategory).sort((a, b) => b.value - a.value),
            total
        };
    }, [transactions, dateSelection, categoryContributionModeMap]);

    // ── Repairs Analytics ──
    const repairsData = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        const filtered = repairJobs.filter(j => {
            if (!j.createdAt) return false;
            const d = safeDate(j.createdAt);
            if (!d) return false;
            return d >= rangeStart && d <= rangeEnd;
        });

        const pending = filtered.filter(j => j.status === 'pending').length;
        const inProgress = filtered.filter(j => j.status === 'in_progress').length;
        const completed = filtered.filter(j => j.status === 'completed');
        const repairRevenueTxns = transactions
            .filter((txn) => isRepairRevenueTransaction(txn))
            .filter((txn) => {
                const d = parseTransactionDate(txn);
                return d && d >= rangeStart && d <= rangeEnd;
            });
        const completedRevenue = repairRevenueTxns.reduce((sum, txn) => sum + (parseFloat(txn.amount) || 0), 0);
        const estimatedTotal = filtered.reduce((sum, j) => sum + (parseFloat(j.estimatedCost) || 0), 0);

        // Average turnaround (days) for completed
        let avgTurnaround = 0;
        if (completed.length > 0) {
            const totalDays = completed.reduce((sum, j) => {
                const start = new Date(j.createdAt).getTime();
                const end = new Date(j.completedAt || j.createdAt).getTime();
                return sum + (end - start) / (1000 * 3600 * 24);
            }, 0);
            avgTurnaround = totalDays / completed.length;
        }

        return { total: filtered.length, pending, inProgress, completed: completed.length, completedRevenue, estimatedTotal, avgTurnaround };
    }, [repairJobs, dateSelection, transactions]);

    // ── Categorical Breakdown Data ──
    const extractChartCategory = (txn) => {
        if (txn?.resolvedCategoryName) {
            return String(txn.resolvedCategoryName).trim();
        }

        const notes = String(txn?.notes || txn?.note || '');
        const subCategoryMatch = notes.match(/SubCategory[:\s]+([^|;\n]+)/i);
        if (subCategoryMatch?.[1]?.trim()) {
            return subCategoryMatch[1].trim();
        }

        const categoryMatch = notes.match(/Category[:\s]+([^|;\n]+)/i);
        if (categoryMatch?.[1]?.trim()) {
            return categoryMatch[1].trim();
        }

        const cat = txn?.category;
        if (cat && typeof cat === 'object') {
            return String(cat.level1 || cat.name || cat.label || '').trim() || null;
        }
        if (typeof cat === 'string' && cat.trim()) {
            const trimmed = cat.trim();
            if (isUUID(trimmed)) return null;
            return trimmed;
        }
        const fallback = String(txn?.category_name || txn?.categoryName || txn?.cat || '').trim();
        if (fallback && !isUUID(fallback)) return fallback;

        const description = String(txn?.description || txn?.desc || '').trim();
        const descriptionLower = description.toLowerCase();
        if (description && description.length < 50 && !descriptionLower.includes('repair') && !descriptionLower.includes('salary')) {
            return description;
        }

        return null;
    };

    const isExpenseTypeResolved = (txn) => {
        const t = String(txn?.type || txn?.tx_type || txn?.transactionType || '').toLowerCase().trim();
        return t === 'product_purchase' || t === 'shop_expense' || t === 'purchase' || t === 'expense';
    };

    const isSaleTypeResolved = (txn) => {
        const t = String(txn?.type || txn?.tx_type || txn?.transactionType || '').toLowerCase().trim();
        return t === 'product_sale' || t === 'shop' || t === 'sale' || t === 'income' || t === 'repair_amount';
    };

    const purchaseChartTransactions = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        return chartTransactions.filter((txn) => {
            if (!isExpenseTypeResolved(txn)) return false;
            const d = parseTransactionDate(txn);
            return d && d >= rangeStart && d <= rangeEnd;
        });
    }, [chartTransactions, dateSelection]);

    const salesChartTransactions = useMemo(() => {
        const rangeStart = new Date(dateSelection[0].startDate);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(dateSelection[0].endDate);
        rangeEnd.setHours(23, 59, 59, 999);

        return chartTransactions.filter((txn) => {
            if (!isSaleTypeResolved(txn)) return false;
            const d = parseTransactionDate(txn);
            return d && d >= rangeStart && d <= rangeEnd;
        });
    }, [chartTransactions, dateSelection]);

    const categoryExpenseData = useMemo(() => {
        const grouped = purchaseChartTransactions.reduce((acc, txn) => {
            const category = extractChartCategory(txn);
            if (!category) return acc;
            acc[category] = (acc[category] || 0) + (parseFloat(txn.amount) || 0);
            return acc;
        }, {});

        return Object.entries(grouped)
            .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10);
    }, [purchaseChartTransactions]);

    const categorySalesData = useMemo(() => {
        const grouped = salesChartTransactions.reduce((acc, txn) => {
            const category = extractChartCategory(txn);
            if (!category) return acc;
            acc[category] = (acc[category] || 0) + (parseFloat(txn.amount) || 0);
            return acc;
        }, {});

        return Object.entries(grouped)
            .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10);
    }, [salesChartTransactions]);

    return (
        <div className="space-y-4 animate-in fade-in duration-500 pb-10 max-w-[1500px] mx-auto">
            {/* ── Header ── */}
            <div className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/60 p-5 shadow-sm">
                <div className="absolute -left-10 -top-14 h-32 w-32 rounded-full bg-blue-200/40 blur-3xl" />
                <div className="absolute -bottom-16 right-0 h-40 w-40 rounded-full bg-emerald-200/30 blur-3xl" />
                <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0 h-full">
                        <span className="inline-flex items-center rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500 shadow-sm">
                            Insights Hub
                        </span>
                        <div className="mt-3">
                            <h1 className="text-2xl md:text-[2rem] font-black text-slate-800 tracking-tight">Business Intelligence</h1>
                            <p className="text-slate-500 text-sm md:text-[15px] font-medium mt-1 max-w-2xl">
                                Financial KPIs, market trends, category mix, and inventory signals in one cleaner workspace.
                            </p>
                        </div>
                    </div>

                    <div className="w-full xl:w-auto">
                        <div className="rounded-2xl border border-white/80 bg-white/85 p-2 shadow-sm backdrop-blur">
                            <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 1. Financial KPIs (The Big Picture) ── */}
            <section className="space-y-4">
                <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.24em] mb-1">Overview</p>
                    <h2 className="text-lg font-black tracking-tight text-slate-800">Financial Snapshot</h2>
                    <p className="text-sm font-medium text-slate-500 mt-1">Core profit, growth, and expense metrics for the currently selected range.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-4">
                {isAdminLike && (
                    <div className="min-w-0 h-full">
                        <MetricCard
                            title="Final Profit (Net-Net)"
                            value={priceTag(analytics.finalProfit)}
                            icon={<DollarSign size={24} />}
                            color="emerald"
                            trend={analytics.salesGrowth > 0 ? `+${analytics.salesGrowth.toFixed(1)}%` : null}
                            onClick={() => setShowFinalProfitBreakdown(prev => !prev)}
                            isActive={showFinalProfitBreakdown}
                            hint={showFinalProfitBreakdown ? 'Hide calculation details' : 'Tap to view calculation details'}
                        />
                    </div>
                )}
                {isAdminLike && (
                    <div className="min-w-0 h-full">
                        <MetricCard
                            title="Total Fixed Expenses"
                            value={priceTag(analytics.totalFixedExpenses)}
                            icon={<Activity size={24} />}
                            color="red"
                            subtext="Rent, Salary, etc."
                        />
                    </div>
                )}
                {isAdminLike && (
                    <div className="min-w-0 h-full">
                        <MetricCard
                            title="Non-fixed Expenses"
                            value={priceTag(analytics.totalNonFixedExpenses)}
                            icon={<AlertCircle size={24} />}
                            color="amber"
                            subtext="tx_type: product_expense, source: expense"
                        />
                    </div>
                )}
                <div className="min-w-0 h-full">
                    <MetricCard
                        title="Gross Net Profit"
                        value={priceTag(analytics.totalProfit)}
                        icon={<TrendingUp size={24} />}
                        color="blue"
                        subtext={`Prod: ${priceTag(analytics.productProfit)} | Serv: ${priceTag(analytics.serviceProfit)}`}
                        onClick={() => setShowGrossProfitBreakdown(prev => !prev)}
                        isActive={showGrossProfitBreakdown}
                        hint={showGrossProfitBreakdown ? 'Hide calculation details' : 'Tap to view calculation details'}
                    />
                </div>
                <div className="min-w-0 h-full">
                    <MetricCard
                        title="Sales Growth (Weekly)"
                        value={`${analytics.salesGrowth > 0 ? '+' : ''}${analytics.salesGrowth.toFixed(1)}%`}
                        icon={<TrendingUp size={24} />}
                        color={analytics.salesGrowth >= 0 ? 'purple' : 'red'}
                        subtext={`vs Previous ${timeView === 'weekly' ? 'Week' : 'Month'}`}
                    />
                </div>
                </div>

                <div className="mt-4 space-y-4">
                {isAdminLike && showFinalProfitBreakdown && (
                <div className="bg-white border border-emerald-100 rounded-2xl shadow-sm p-5">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Final Profit Calculation</h3>
                        <span className="text-xs font-bold text-emerald-600">Net = (Product Profit + Service Profit) - (Fixed Expenses + Non-fixed Expenses + Inventory Purchases)</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Profit</p>
                            <p className="text-lg font-black text-slate-800">{priceTag(analytics.productProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Service Profit</p>
                            <p className="text-lg font-black text-slate-800">{priceTag(analytics.serviceProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Gross Net Profit</p>
                            <p className="text-lg font-black text-blue-700">{priceTag(analytics.totalProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
                            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Total Fixed Expenses</p>
                            <p className="text-lg font-black text-red-700">{priceTag(analytics.totalFixedExpenses)}</p>
                        </div>
                        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3">
                            <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Non-fixed Expenses</p>
                            <p className="text-lg font-black text-orange-700">{priceTag(analytics.totalNonFixedExpenses)}</p>
                        </div>
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Inventory Purchases</p>
                            <p className="text-lg font-black text-amber-700">{priceTag(analytics.totalInventoryPurchases)}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 md:col-span-2 xl:col-span-2">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Final Profit (Net-Net)</p>
                            <p className="text-2xl font-black text-emerald-700">{priceTag(analytics.finalProfit)}</p>
                        </div>
                    </div>
                </div>
                )}

                {showGrossProfitBreakdown && (
                <div className="bg-white border border-blue-100 rounded-2xl shadow-sm p-5">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Gross Net Profit Calculation</h3>
                        <span className="text-xs font-bold text-blue-600">Gross = Product Profit + Service Profit</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product Profit</p>
                            <p className="text-lg font-black text-slate-800">{priceTag(analytics.productProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Service Profit</p>
                            <p className="text-lg font-black text-slate-800">{priceTag(analytics.serviceProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Gross Net Profit</p>
                            <p className="text-lg font-black text-blue-700">{priceTag(analytics.totalProfit)}</p>
                        </div>
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Average Margin</p>
                            <p className="text-lg font-black text-indigo-700">{analytics.avgMargin.toFixed(1)}%</p>
                        </div>
                    </div>
                </div>
                )}
                </div>
            </section>

            {/* ── 2. Team Performance (Salesman Leaderboard) ── */}
            <section className={CHART_CARD_CLASS}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                    <div className="flex items-start gap-3">
                        <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600"><Users size={20} /></div>
                        <div className="flex-1">
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Salesman Leaderboard</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Top performers by revenue and margin</p>
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        Selected Range
                    </div>
                </div>
                <div className="md:hidden space-y-2">
                    {analytics.salesmanData.length === 0 ? (
                        <div className="py-6 text-center text-sm text-slate-400 rounded-2xl border border-slate-200 bg-slate-50">
                            No sales data found.
                        </div>
                    ) : analytics.salesmanData.map((staff, idx) => (
                        <div key={`mobile-leader-${idx}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-700 text-white'}`}>
                                        {idx + 1}
                                    </span>
                                    <p className="font-bold text-sm text-slate-800 truncate">{staff.name}</p>
                                </div>
                                <p className="font-black text-emerald-600">{priceTag(staff.sales)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                                <div className="rounded-xl border border-slate-100 bg-white px-2 py-2">
                                    <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Avg Margin</p>
                                    <p className="font-bold text-blue-500">{staff.avgMargin.toFixed(1)}%</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-white px-2 py-2">
                                    <p className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Avg Discount</p>
                                    <p className="font-bold text-red-500">{priceTag(staff.avgDiscount)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left border-collapse bg-white">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80">
                                <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rank/Name</th>
                                <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Gross Sales</th>
                                <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Avg Margin</th>
                                <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Avg Discount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {analytics.salesmanData.map((staff, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-700 text-white'}`}>
                                                {idx + 1}
                                            </span>
                                            <span className="font-bold text-sm text-slate-800">{staff.name}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center font-black text-emerald-600">{priceTag(staff.sales)}</td>
                                    <td className="py-3 px-4 text-center text-sm font-bold text-blue-500">{staff.avgMargin.toFixed(1)}%</td>
                                    <td className="py-3 px-4 text-center text-sm font-bold text-red-500">{priceTag(staff.avgDiscount)}</td>
                                </tr>
                            ))}
                            {analytics.salesmanData.length === 0 && (
                                <tr><td colSpan="4" className="py-6 text-center text-sm text-slate-400">No sales data found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* ── 3. Advanced Visualizations ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Sales vs Time (Line Chart) */}
                <div className={`${CHART_CARD_CLASS} min-h-[360px] overflow-hidden`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Sales vs. Time</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Daily Performance & Trends</p>
                        </div>
                        <Calendar size={20} className="text-slate-300" />
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                            <ComposedChart data={analytics.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={0} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value, name) => [name === 'trend' ? `€${(Number(value) || 0).toFixed(2)}` : priceTag(Number(value) || 0), name === 'trend' ? `${timeView === 'weekly' ? '4-Week' : '3-Month'} Trend` : 'Sales']} />
                                <Legend iconType="circle" />
                                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                                <Line type="monotone" dataKey="trend" stroke="#fbbf24" strokeWidth={3} dot={false} name={timeView === 'weekly' ? '4-Week Trend' : '3-Month Trend'} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Profit vs Expense Over Time */}
                <div className={`${CHART_CARD_CLASS} min-h-[360px] overflow-hidden`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Profit vs Expense</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{timeView === 'weekly' ? 'Weekly' : 'Monthly'} Comparison</p>
                        </div>
                        <Scale size={20} className="text-slate-300" />
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={analytics.profitVsExpenseData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="periodLabel" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} interval={0} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value) => priceTag(Number(value) || 0)} />
                                <Legend iconType="circle" />
                                <Bar dataKey="profit" name="Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ── Categorical Breakdown — Horizontal Bar Charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Sales by Category */}
                <div className={`${CHART_CARD_CLASS} overflow-hidden`}>
                    <div className="flex items-start gap-3 mb-4">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-500"><BarChart3 size={20} /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Sales by Category</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Revenue breakdown per category</p>
                        </div>
                    </div>
                    {categorySalesData.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No sales data available for this period.</p>
                    ) : (
                        <div style={{ width: '100%', height: `${Math.max(280, categorySalesData.length * 42)}px` }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categorySalesData} layout="vertical" margin={{ top: 4, right: 80, left: 20, bottom: 4 }} barCategoryGap="25%" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `€${v}`} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} width={130} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(value) => [`€${value.toFixed(2)}`, 'Sales']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={22}>
                                        <LabelList dataKey="amount" position="right" formatter={(value) => `€${value.toFixed(0)}`} style={{ fontSize: '11px', fontWeight: '700', fill: '#334155' }} />
                                        {categorySalesData.map((entry, index) => (
                                            <Cell key={`sales-cell-${index}`} fill={['#3b82f6','#10b981','#8b5cf6','#06b6d4','#f59e0b','#ec4899','#14b8a6','#6366f1','#84cc16','#0ea5e9'][index % 10]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Expense by Category */}
                <div className={`${CHART_CARD_CLASS} overflow-hidden`}>
                    <div className="flex items-start gap-3 mb-4">
                        <div className="p-3 bg-red-50 rounded-xl text-red-500"><DollarSign size={20} /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Expense by Category</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Purchase/expense breakdown per category</p>
                        </div>
                    </div>
                    {categoryExpenseData.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No expense data available for this period.</p>
                    ) : (
                        <div style={{ width: '100%', height: `${Math.max(280, categoryExpenseData.length * 42)}px` }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryExpenseData} layout="vertical" margin={{ top: 4, right: 80, left: 20, bottom: 4 }} barCategoryGap="25%" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => `€${v}`} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="category" tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }} width={130} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(value) => [`€${value.toFixed(2)}`, 'Expense']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} maxBarSize={22}>
                                        <LabelList dataKey="amount" position="right" formatter={(value) => `€${value.toFixed(0)}`} style={{ fontSize: '11px', fontWeight: '700', fill: '#334155' }} />
                                        {categoryExpenseData.map((entry, index) => (
                                            <Cell key={`expense-cell-${index}`} fill={['#f97316','#ef4444','#a855f7','#f59e0b','#ec4899','#14b8a6','#8b5cf6','#06b6d4','#10b981','#3b82f6'][index % 10]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Peak Hours + Pie Charts ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Peak Hours Analysis */}
                <div className={`${CHART_CARD_CLASS} min-h-[360px] flex flex-col overflow-hidden`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Peak Hours</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">When is the rush?</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setPeakHourMode('today')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${peakHourMode === 'today' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setPeakHourMode('7d')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${peakHourMode === '7d' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
                            >
                                7-Day Avg
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 w-full min-h-[250px]">
                        <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={peakData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    formatter={(val) => [val.toFixed(1), 'Transactions']}
                                />
                                <Bar dataKey="count" radius={[4, 4, 4, 4]} maxBarSize={30}>
                                    {peakData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Profitability (Pie Chart) */}
                <div className={`${CHART_CARD_CLASS} min-h-[360px] flex flex-col overflow-hidden`}>
                    <h3 className="text-sm font-black text-slate-800 mb-0.5">Category Profitability</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4">Which categories are Cash Cows?</p>
                    <div className="flex-1 w-full min-h-[250px]">
                        {analytics.categoryData.length > 0 ? (
                            <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                                <PieChart>
                                    <Pie data={analytics.categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {analytics.categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => priceTag(Number(value) || 0)} contentStyle={{ borderRadius: '12px' }} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-center">
                                <p className="text-sm text-slate-400 font-medium">No profitable category data in this range.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>


            {/* ── 4. Data Science Insights ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Top 5 Best Sellers */}
                <div className={`${CHART_CARD_CLASS} h-full`}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-500"><Zap size={20} /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Top 5 Best Sellers</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fastest Moving Products</p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {analytics.bestSellers.map((product, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{idx + 1}</span>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 line-clamp-1">{product.name}</p>
                                        <p className="text-[10px] text-slate-400">{product.qty} units sold</p>
                                    </div>
                                </div>
                                <p className="text-sm font-bold text-emerald-600">{priceTag(product.profit)}</p>
                            </div>
                        ))}
                        {analytics.bestSellers.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No sales data yet.</p>}
                    </div>
                </div>

                {/* Supplier Performance */}
                <div className={`${CHART_CARD_CLASS} h-full`}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-500"><Package size={20} /></div>
                        <div>
                            <h3 className="text-sm font-black text-slate-800 mb-0.5">Supplier Performance</h3>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Profit Leaders (Domain vs Local)</p>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                            <BarChart data={analytics.supplierData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={0} />
                                <YAxis orientation="left" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                                <Tooltip contentStyle={{ borderRadius: '12px' }} formatter={(val) => priceTag(val)} />
                                <Bar dataKey="profit" name="Net Profit" fill="#8b5cf6" radius={[4, 4, 4, 4]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Inventory Intelligence */}
                <div className="space-y-4">
                    {/* Turnover Ratio */}
                    <div className={CHART_CARD_CLASS}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <RefreshCw size={18} className="text-blue-500" />
                                <span className="text-sm font-bold text-slate-500 uppercase">Inventory Turnover</span>
                            </div>
                            <span className="text-2xl font-black text-slate-800">{analytics.turnoverRatio.toFixed(2)}x</span>
                        </div>
                        <p className="text-xs text-slate-400">Ratio of Sold Items Cost vs Avg Inventory Value. Higher is better.</p>
                    </div>

                    {/* Stock Aging Analysis */}
                    <div className={`${CHART_CARD_CLASS} flex-1`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-50 rounded-xl text-red-500"><AlertCircle size={20} /></div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800 mb-0.5">Stock Aging</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Risk Analysis ({'>'}30 Days)</p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-sm font-bold text-slate-600">Slow Moving Value</span>
                                <span className="text-xl font-black text-red-600">{priceTag(analytics.slowMovingValue)}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="bg-red-500 h-full rounded-full" style={{ width: '100%' }}></div> {/* Visual bar just for effect */}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">Capital tied up in items older than 30 days.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 5. Salary, Expenses & Repairs Analytics (Admin Only) ── */}
            {isAdminLike && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* Salary Analytics */}
                    <div className={`${CHART_CARD_CLASS} h-full`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500"><DollarSign size={20} /></div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800 mb-0.5">Salary Report</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Per-Salesman Breakdown</p>
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-slate-100">
                            <span className="text-sm font-bold text-slate-500">Total Salary Paid</span>
                            <span className="text-2xl font-black text-emerald-600">{priceTag(salaryData.totalSalary)}</span>
                        </div>
                        <div className="space-y-3">
                            {salaryData.perSalesman.map((s, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">
                                            {s.name[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800">{s.name}</p>
                                            <p className="text-[10px] text-slate-400">{s.sessions} session{s.sessions !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-emerald-600 font-mono">{priceTag(s.totalPaid)}</p>
                                </div>
                            ))}
                            {salaryData.perSalesman.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No salary data in this range.</p>}
                        </div>
                    </div>

                    {/* Expense Breakdown */}
                    <div className={`${CHART_CARD_CLASS} h-full`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-50 rounded-xl text-red-500"><Activity size={20} /></div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800 mb-0.5">Expense Breakdown</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">By Category</p>
                            </div>
                        </div>
                        <div className="flex items-baseline justify-between mb-4 pb-4 border-b border-slate-100">
                            <span className="text-sm font-bold text-slate-500">Total Expenses</span>
                            <span className="text-2xl font-black text-red-600">{priceTag(expenseData.total)}</span>
                        </div>
                        {expenseData.categories.length > 0 ? (
                            <>
                                <div className="h-48 w-full mb-4">
                                    <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                                        <PieChart>
                                            <Pie data={expenseData.categories} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                                                {expenseData.categories.map((entry, index) => (
                                                    <Cell key={`exp-${index}`} fill={EXPENSE_COLORS[index % EXPENSE_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => priceTag(value)} contentStyle={{ borderRadius: '12px' }} />
                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-2">
                                    {expenseData.categories.map((cat, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLORS[idx % EXPENSE_COLORS.length] }}></span>
                                                <span className="font-medium text-slate-700">{cat.name}</span>
                                                <span className="text-[10px] text-slate-400">({cat.count})</span>
                                            </div>
                                            <span className="font-bold text-slate-800 font-mono">{priceTag(cat.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-slate-400 text-sm text-center py-4">No expenses in this range.</p>
                        )}
                    </div>

                    {/* Repairs Analytics */}
                    <div className={`${CHART_CARD_CLASS} h-full`}>
                        <div className="flex flex-col gap-3 mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-purple-50 rounded-xl text-purple-500"><Wrench size={20} /></div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 mb-0.5">Repairs Report</h3>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Service Performance</p>
                                </div>
                            </div>
                        </div>
                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                <p className="text-2xl font-black text-slate-800">{repairsData.total}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Total Jobs</p>
                            </div>
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                                <p className="text-2xl font-black text-emerald-600">{repairsData.completed}</p>
                                <p className="text-[10px] font-bold text-emerald-500 uppercase">Completed</p>
                            </div>
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                                <p className="text-2xl font-black text-amber-600">{repairsData.pending + repairsData.inProgress}</p>
                                <p className="text-[10px] font-bold text-amber-500 uppercase">Pending</p>
                            </div>
                            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                                <p className="text-2xl font-black text-blue-600">{repairsData.avgTurnaround.toFixed(1)}d</p>
                                <p className="text-[10px] font-bold text-blue-500 uppercase">Avg Turnaround</p>
                            </div>
                        </div>
                        {/* Revenue */}
                        <div className="space-y-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-500">Completed Revenue</span>
                                <span className="text-lg font-black text-emerald-600 font-mono">{priceTag(repairsData.completedRevenue)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-500">Estimated Pipeline</span>
                                <span className="text-lg font-black text-blue-600 font-mono">{priceTag(repairsData.estimatedTotal)}</span>
                            </div>
                            {/* Completion Rate Bar */}
                            <div className="mt-2">
                                <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                    <span>Completion Rate</span>
                                    <span>{repairsData.total > 0 ? ((repairsData.completed / repairsData.total) * 100).toFixed(0) : 0}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                    <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-full rounded-full transition-all" style={{ width: `${repairsData.total > 0 ? (repairsData.completed / repairsData.total) * 100 : 0}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}

function MetricCard({ title, value, icon, color, trend, subtext, onClick, isActive, hint }) {
    const colorStyles = {
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        purple: 'bg-purple-50 text-purple-600 border-purple-100',
        red: 'bg-red-50 text-red-600 border-red-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
    };

    const sharedClassName = `p-5 rounded-2xl border shadow-sm flex h-full items-start justify-between gap-4 bg-white border-slate-200 md:hover:border-blue-300 md:hover:shadow-md transition-all group w-full text-left ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'ring-2 ring-emerald-200 border-emerald-200' : ''}`;

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={sharedClassName}>
                <div>
                    <p className="text-[10px] xl:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 xl:mb-2">{title}</p>
                    <h3 className="text-xl xl:text-3xl font-black text-slate-800 tracking-tight leading-tight break-words">{value}</h3>
                    {trend && <p className={`text-[10px] xl:text-xs font-bold mt-1 xl:mt-2 flex items-center gap-1 ${trend.startsWith('-') ? 'text-red-500' : 'text-emerald-500'}`}>
                        <TrendingUp size={12} /> {trend}
                    </p>}
                    {subtext && <p className="text-[9px] xl:text-[10px] text-slate-400 mt-1 font-medium">{subtext}</p>}
                    {hint && <p className="text-[9px] xl:text-[10px] text-slate-500 mt-1 font-semibold">{hint}</p>}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                    <div className={`p-3 xl:p-4 rounded-2xl ${colorStyles[color]} group-hover:scale-110 transition-transform`}>
                        {icon}
                    </div>
                    <div className="text-slate-400">
                        {isActive ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>
            </button>
        );
    }

    return (
        <div className={sharedClassName}>
            <div>
                <p className="text-[10px] xl:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 xl:mb-2">{title}</p>
                <h3 className="text-xl xl:text-3xl font-black text-slate-800 tracking-tight leading-tight break-words">{value}</h3>
                {trend && <p className={`text-[10px] xl:text-xs font-bold mt-1 xl:mt-2 flex items-center gap-1 ${trend.startsWith('-') ? 'text-red-500' : 'text-emerald-500'}`}>
                    <TrendingUp size={12} /> {trend}
                </p>}
                {subtext && <p className="text-[9px] xl:text-[10px] text-slate-400 mt-1 font-medium">{subtext}</p>}
            </div>
            <div className={`p-3 xl:p-4 rounded-2xl ${colorStyles[color]} group-hover:scale-110 transition-transform ml-2 shrink-0`}>
                {icon}
            </div>
        </div>
    );
}




