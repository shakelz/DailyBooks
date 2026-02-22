import { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useRepairs } from '../../context/RepairsContext';
import { priceTag, CURRENCY_CONFIG } from '../../utils/currency';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, DollarSign, Activity, AlertCircle, Calendar, Filter, Zap, Package, RefreshCw, BarChart3, Scale, Users, Wrench } from 'lucide-react';
import DateRangeFilter from './DateRangeFilter';

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

export default function InsightsTab() {
    const { transactions, products } = useInventory();
    const { isAdminLike, slowMovingDays, salesmen, attendanceLogs } = useAuth();
    const { repairJobs } = useRepairs();
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 30));
    const defaultEndDate = new Date();
    // ── Date Range State (shared calendar component) ──
    const [dateSelection, setDateSelection] = useState([
        {
            startDate: defaultStartDate,
            endDate: defaultEndDate,
            key: 'selection'
        }
    ]);
    const [repairDateFilter, setRepairDateFilter] = useState({
        startDate: toInputDateString(defaultStartDate),
        endDate: toInputDateString(defaultEndDate),
    });
    const [peakHourMode, setPeakHourMode] = useState('today'); // 'today' or '7d'

    // ── Helper: Calculate Business Metrics ──
    const analytics = useMemo(() => {
        const now = new Date();
        const lastWeekCutoff = new Date();
        const twoWeeksAgoCutoff = new Date();

        // 1. Time Range Logic — driven by dateSelection from calendar
        const rangeStart = safeDate(dateSelection[0].startDate) || new Date();
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = safeDate(dateSelection[0].endDate) || new Date();
        rangeEnd.setHours(23, 59, 59, 999);

        // Sales Growth Logic (Last 7 Days vs Previous 7 Days)
        lastWeekCutoff.setDate(now.getDate() - 7);
        twoWeeksAgoCutoff.setDate(now.getDate() - 14);

        let currentWeekSales = 0;
        let lastWeekSales = 0;

        const productById = products.reduce((acc, p) => {
            if (p?.id !== undefined && p?.id !== null) {
                acc[String(p.id)] = p;
            }
            return acc;
        }, {});

        const extractCategoryLevel1 = (rawCategory) => {
            if (!rawCategory) return '';
            if (typeof rawCategory === 'string') return safeText(rawCategory);
            if (typeof rawCategory === 'object') {
                return safeText(rawCategory.level1 || rawCategory.name || '');
            }
            return '';
        };

        const resolveCategoryName = (txn) => {
            const directCategory =
                extractCategoryLevel1(txn?.category)
                || extractCategoryLevel1(txn?.categorySnapshot)
                || extractCategoryLevel1(txn?.productSnapshot?.category);
            if (directCategory) return directCategory;

            if (Array.isArray(txn?.categoryPath) && txn.categoryPath[0]) return safeText(txn.categoryPath[0]);
            if (Array.isArray(txn?.productSnapshot?.categoryPath) && txn.productSnapshot.categoryPath[0]) return safeText(txn.productSnapshot.categoryPath[0]);

            if (txn?.productId !== undefined && txn?.productId !== null) {
                const linkedProduct = productById[String(txn.productId)];
                const linkedCategory = extractCategoryLevel1(linkedProduct?.category);
                if (linkedCategory) return linkedCategory;
            }

            return 'General Sales';
        };

        const resolveSalesmanName = (txn) => {
            const workerId = safeText(txn?.workerId || txn?.userId || '');
            if (workerId) {
                const matched = (salesmen || []).find(s => String(s?.id) === workerId);
                const matchedName = safeText(matched?.name);
                if (matchedName) return matchedName;
            }

            const byFields =
                safeText(txn?.salesmanName)
                || safeText(txn?.userName)
                || safeText(txn?.soldBy)
                || safeText(txn?.staffName);
            return byFields || 'Unknown';
        };

        const filteredTxns = transactions.filter(t => {
            const tDate = safeDate(t.timestamp);
            if (!tDate) return false;
            const amount = parseFloat(t.amount) || 0;

            // For Growth calc
            if (t.type === 'income') {
                if (tDate >= lastWeekCutoff) currentWeekSales += amount;
                else if (tDate >= twoWeeksAgoCutoff && tDate < lastWeekCutoff) lastWeekSales += amount;
            }

            // Main Filter — only income transactions (no fixed expenses in sales data)
            return tDate >= rangeStart && tDate <= rangeEnd && t.type === 'income';
        });

        // Sales Growth %
        const salesGrowth = lastWeekSales > 0
            ? ((currentWeekSales - lastWeekSales) / lastWeekSales) * 100
            : currentWeekSales > 0 ? 100 : 0;

        // 2. Aggregate Totals
        let totalSales = 0;
        let totalProfit = 0; // Total Gross Profit (Product + Service)
        let productProfit = 0;
        let totalCOGS = 0; // For Inventory Turnover

        // Calculate fixed expenses separately (for admin-only Final Profit card)
        const totalFixedExpenses = transactions
            .filter(t => {
                if (!t.timestamp || !t.isFixedExpense) return false;
                const tDate = safeDate(t.timestamp);
                if (!tDate) return false;
                return tDate >= rangeStart && tDate <= rangeEnd;
            })
            .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        const dailyData = {};
        const supplierStats = {};
        const categoryStats = {}; // { name, profit, sales }
        const productStats = {}; // { id, name, qty }
        const salesmanStats = {}; // { name, sales, marginSum, count, totalDiscount }

        // Pre-fill every date in selected range so the chart is always accurate and continuous.
        for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
            const key = toLocalDateKey(cursor);
            if (key) dailyData[key] = { date: key, sales: 0, profit: 0 };
        }

        filteredTxns.forEach(t => {
            const txnDate = safeDate(t.timestamp);
            if (!txnDate) return;
            const product = t.productId !== undefined && t.productId !== null
                ? productById[String(t.productId)]
                : null;
            const categoryName = resolveCategoryName(t);

            const saleAmount = parseFloat(t.amount) || 0;
            const buyAmount = (parseFloat(t.purchasePriceAtTime) || 0) * (parseInt(t.quantity) || 1);

            // Gross Profit: Selling - Purchase (no tax deduction)
            let grossProfit = 0;

            // If it's a repair service, we'll calculate service profit separately later, 
            // but keep it in total sales and total profit if we want a combined view.
            // Let's identify if it's a product or service.
            if (t.source === 'repair' || categoryName === 'Repair Service') {
                // The transaction notes might contain 'Parts Cost: €X'
                let partsCost = 0;
                if (t.notes && t.notes.includes('Parts Cost: €')) {
                    const match = t.notes.match(/Parts Cost: €([\d.]+)/);
                    if (match && match[1]) partsCost = parseFloat(match[1]);
                }
                grossProfit = saleAmount - partsCost; // Service Profit = Final Amount - Parts Cost

                // We don't add repair parts cost to COGS here because COGS is for product turnover.
                // We'll manage service profit in a dedicated variable later, but for total metrics:
            } else {
                grossProfit = saleAmount - buyAmount; // Product Profit
                productProfit += grossProfit;
                totalCOGS += buyAmount;
            }

            totalSales += saleAmount;
            totalProfit += grossProfit;

            // ── Product Aggregation (Best Sellers) ──
            if (t.productId) {
                const productKey = String(t.productId);
                if (!productStats[productKey]) productStats[productKey] = { name: t.name || t.desc || product?.name || 'Unknown', qty: 0, profit: 0 };
                productStats[productKey].qty += (parseInt(t.quantity) || 1);
                productStats[productKey].profit += grossProfit;
            }

            // ── Category Aggregation ──
            if (!categoryStats[categoryName]) categoryStats[categoryName] = { name: categoryName, value: 0 };
            categoryStats[categoryName].value += grossProfit;

            // ── Daily Aggregation ──
            const dateKey = toLocalDateKey(txnDate);
            if (!dailyData[dateKey]) dailyData[dateKey] = { date: dateKey, sales: 0, profit: 0 };
            dailyData[dateKey].sales += saleAmount;
            dailyData[dateKey].profit += grossProfit;

            // ── Supplier Aggregation ──
            let supplierName = safeText(t.purchaseFrom) || safeText(product?.purchaseFrom) || 'Local/Unspecified';
            if (product && safeText(product.productUrl)) {
                if (product.productUrl.startsWith('http')) {
                    try {
                        supplierName = new URL(product.productUrl).hostname.replace('www.', '');
                    } catch {
                        supplierName = product.productUrl;
                    }
                } else {
                    supplierName = product.productUrl;
                }
            } else if (!supplierName) {
                supplierName = 'Local/Unspecified';
            }

            if (!supplierStats[supplierName]) supplierStats[supplierName] = { name: supplierName, volume: 0, profit: 0, marginSum: 0, count: 0 };
            supplierStats[supplierName].volume += saleAmount;
            supplierStats[supplierName].profit += grossProfit;

            if (saleAmount > 0) {
                const margin = ((saleAmount - buyAmount) / saleAmount) * 100;
                supplierStats[supplierName].marginSum += margin;
                supplierStats[supplierName].count += 1;
            }

            // ── Salesman Aggregation (shop sales only) ──
            if (String(t.source || 'shop').toLowerCase() !== 'repair') {
                const salesman = resolveSalesmanName(t);
                if (!salesmanStats[salesman]) salesmanStats[salesman] = { name: salesman, sales: 0, marginSum: 0, count: 0, totalDiscount: 0, profit: 0 };

                salesmanStats[salesman].sales += saleAmount;
                salesmanStats[salesman].profit += grossProfit;
                if (saleAmount > 0) {
                    const margin = ((saleAmount - buyAmount) / saleAmount) * 100;
                    salesmanStats[salesman].marginSum += margin;
                    salesmanStats[salesman].count += 1;
                }
                salesmanStats[salesman].totalDiscount += parseFloat(t.discount || 0);
            }
        });

        // 3. Process Chart Data (actuals only, no future points mixed into selected range)
        const chartData = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
        const processedChartData = chartData.map((day, index, array) => {
            const start = Math.max(0, index - 6);
            const subset = array.slice(start, index + 1);
            const sum = subset.reduce((acc, curr) => acc + curr.sales, 0);
            return { ...day, ma7: subset.length ? (sum / subset.length) : 0 };
        });

        // 4. Process Supplier Data
        const supplierData = Object.values(supplierStats)
            .map(s => ({ ...s, avgMargin: s.count ? (s.marginSum / s.count) : 0 }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 10);

        // 5. Category Data (Top 5 profitable categories only)
        const categoryData = Object.values(categoryStats)
            .map(c => ({ ...c, value: parseFloat((c.value || 0).toFixed(2)) }))
            .filter(c => c.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        // 6. Best Sellers (Top 5 by Qty)
        const bestSellers = Object.values(productStats)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);

        // 6.5 Salesman Leaderboard
        const salesmanData = Object.values(salesmanStats)
            .map(s => ({
                ...s,
                avgMargin: s.count > 0 ? (s.marginSum / s.count) : 0,
                avgDiscount: s.count > 0 ? (s.totalDiscount / s.count) : 0
            }))
            .sort((a, b) => b.sales - a.sales);

        // 7. Inventory Turnover Ratio = COGS / Average Inventory Value
        // Approx: COGS / Current Stock Value
        const currentStockValue = products.reduce((acc, p) => acc + ((parseFloat(p.purchasePrice) || 0) * (parseInt(p.stock) || 0)), 0);
        const turnoverRatio = currentStockValue > 0 ? (totalCOGS / currentStockValue) : 0;

        // 8. Inventory Health (Stock Aging + Value)
        const nowMs = new Date().getTime();
        let slowMovingCount = 0;
        let fastMovingCount = 0;
        let slowMovingValue = 0;

        products.forEach(p => {
            if (p.timestamp) {
                const diffDays = (nowMs - new Date(p.timestamp).getTime()) / (1000 * 3600 * 24);
                if (diffDays > slowMovingDays) {
                    slowMovingCount++;
                    slowMovingValue += ((parseFloat(p.purchasePrice) || 0) * (parseInt(p.stock) || 0));
                } else {
                    fastMovingCount++;
                }
            }
        });

        const avgMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
        const serviceProfit = totalProfit - productProfit;

        return {
            totalSales,
            totalProfit,
            productProfit,
            serviceProfit,
            totalFixedExpenses,
            finalProfit: totalProfit - totalFixedExpenses,
            avgMargin,
            salesGrowth,
            turnoverRatio,
            chartData: processedChartData,
            supplierData,
            categoryData,
            bestSellers,
            salesmanData,
            inventoryHealth: [
                { name: `Fast Moving (<${slowMovingDays}d)`, value: fastMovingCount },
                { name: `Slow Moving (>${slowMovingDays}d)`, value: slowMovingCount }
            ],
            slowMovingValue
        };
    }, [transactions, products, dateSelection, salesmen, slowMovingDays]);

    // ── Peak Hours Analysis ──
    const peakData = useMemo(() => {
        const hourlyCounts = new Array(15).fill(0); // 09:00 to 23:00 (15 slots)
        const offset = 9; // Start at 9 AM

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);

        transactions.forEach(t => {
            if (!t.timestamp || t.type !== 'income') return;
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
    }, [transactions, dateSelection]);

    // ── Repairs Analytics ──
    const repairsData = useMemo(() => {
        let rangeStart = safeDate(`${repairDateFilter.startDate}T00:00:00`) || new Date();
        rangeStart.setHours(0, 0, 0, 0);
        let rangeEnd = safeDate(`${repairDateFilter.endDate}T23:59:59.999`) || new Date();
        rangeEnd.setHours(23, 59, 59, 999);
        if (rangeStart > rangeEnd) {
            const tmp = rangeStart;
            rangeStart = rangeEnd;
            rangeEnd = tmp;
        }

        const filtered = repairJobs.filter(j => {
            if (!j.createdAt) return false;
            const d = safeDate(j.createdAt);
            if (!d) return false;
            return d >= rangeStart && d <= rangeEnd;
        });

        const pending = filtered.filter(j => j.status === 'pending').length;
        const inProgress = filtered.filter(j => j.status === 'in_progress').length;
        const completed = filtered.filter(j => j.status === 'completed');
        const completedRevenue = completed.reduce((sum, j) => sum + (parseFloat(j.finalAmount) || parseFloat(j.estimatedCost) || 0), 0);
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
    }, [repairJobs, repairDateFilter]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-10 max-w-[1500px] mx-auto">
            {/* ── Header ── */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Business Intelligence</h1>
                    <p className="text-slate-500 text-sm font-medium">Financial KPIs, Market Trends, and Inventory Analytics.</p>
                </div>

                <DateRangeFilter dateSelection={dateSelection} setDateSelection={setDateSelection} />
            </div>

            {/* ── 1. Financial KPIs (The Big Picture) ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
                {isAdminLike && (
                    <div className="min-w-0">
                        <MetricCard
                            title="Final Profit (Net-Net)"
                            value={priceTag(analytics.finalProfit)}
                            icon={<DollarSign size={24} />}
                            color="emerald"
                            trend={analytics.salesGrowth > 0 ? `+${analytics.salesGrowth.toFixed(1)}%` : null}
                        />
                    </div>
                )}
                {isAdminLike && (
                    <div className="min-w-0">
                        <MetricCard
                            title="Total Fixed Expenses"
                            value={priceTag(analytics.totalFixedExpenses)}
                            icon={<Activity size={24} />}
                            color="red"
                            subtext="Rent, Salary, etc."
                        />
                    </div>
                )}
                <div className="min-w-0">
                    <MetricCard
                        title="Gross Net Profit"
                        value={priceTag(analytics.totalProfit)}
                        icon={<TrendingUp size={24} />}
                        color="blue"
                        subtext={`Prod: ${priceTag(analytics.productProfit)} | Serv: ${priceTag(analytics.serviceProfit)}`}
                    />
                </div>
                <div className="min-w-0">
                    <MetricCard
                        title="Sales Growth (Weekly)"
                        value={`${analytics.salesGrowth > 0 ? '+' : ''}${analytics.salesGrowth.toFixed(1)}%`}
                        icon={<TrendingUp size={24} />}
                        color={analytics.salesGrowth >= 0 ? 'purple' : 'red'}
                        subtext="vs Previous 7 Days"
                    />
                </div>
            </div>

            {/* ── 2. Team Performance (Salesman Leaderboard) ── */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-800 p-4 md:p-6 rounded-[2rem] shadow-xl border border-indigo-800 text-white">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-300"><Users size={20} /></div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold">Salesman Leaderboard 🏆</h3>
                        <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider">Top Performers by Revenue & Margin</p>
                    </div>
                </div>
                <div className="md:hidden space-y-2">
                    {analytics.salesmanData.length === 0 ? (
                        <div className="py-6 text-center text-sm text-indigo-300 rounded-xl border border-indigo-500/20">
                            No sales data found.
                        </div>
                    ) : analytics.salesmanData.map((staff, idx) => (
                        <div key={`mobile-leader-${idx}`} className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-700 text-white'}`}>
                                        {idx + 1}
                                    </span>
                                    <p className="font-bold text-sm truncate">{staff.name}</p>
                                </div>
                                <p className="font-black text-emerald-400">{priceTag(staff.sales)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]">
                                <div className="rounded-lg bg-white/10 px-2 py-1">
                                    <p className="text-indigo-300 uppercase text-[9px] font-bold">Avg Margin</p>
                                    <p className="font-bold text-blue-300">{staff.avgMargin.toFixed(1)}%</p>
                                </div>
                                <div className="rounded-lg bg-white/10 px-2 py-1">
                                    <p className="text-indigo-300 uppercase text-[9px] font-bold">Avg Discount</p>
                                    <p className="font-bold text-red-300">€{staff.avgDiscount.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-indigo-500/30">
                                <th className="py-3 px-4 text-[10px] font-black text-indigo-300 uppercase tracking-widest">Rank/Name</th>
                                <th className="py-3 px-4 text-[10px] font-black text-indigo-300 uppercase tracking-widest text-center">Gross Sales</th>
                                <th className="py-3 px-4 text-[10px] font-black text-indigo-300 uppercase tracking-widest text-center">Avg Margin</th>
                                <th className="py-3 px-4 text-[10px] font-black text-indigo-300 uppercase tracking-widest text-center">Avg Discount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-500/20">
                            {analytics.salesmanData.map((staff, idx) => (
                                <tr key={idx} className="hover:bg-indigo-500/10 transition-colors">
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-400 text-yellow-900' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-400 text-orange-900' : 'bg-slate-700 text-white'}`}>
                                                {idx + 1}
                                            </span>
                                            <span className="font-bold text-sm">{staff.name}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center font-black text-emerald-400">{priceTag(staff.sales)}</td>
                                    <td className="py-3 px-4 text-center text-sm font-bold text-blue-300">{staff.avgMargin.toFixed(1)}%</td>
                                    <td className="py-3 px-4 text-center text-sm font-bold text-red-300">€{staff.avgDiscount.toFixed(2)}</td>
                                </tr>
                            ))}
                            {analytics.salesmanData.length === 0 && (
                                <tr><td colSpan="4" className="py-6 text-center text-sm text-indigo-300">No sales data found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── 3. Advanced Visualizations ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-6 items-stretch">

                {/* Sales vs Time (Line Chart) */}
                <div className="lg:col-span-2 xl:col-span-7 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Sales vs. Time</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Daily Performance & Trends</p>
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
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => { const d = new Date(val); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value, name) => [name === 'ma7' ? `€${(Number(value) || 0).toFixed(2)}` : priceTag(Number(value) || 0), name === 'ma7' ? '7-Day Trend' : 'Daily Sales']} labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                                <Legend iconType="circle" />
                                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                                <Line type="monotone" dataKey="ma7" stroke="#fbbf24" strokeWidth={3} dot={false} name="7-Day Trend" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Peak Hours Analysis */}
                <div className="xl:col-span-5 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Peak Hours</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">When is the rush?</p>
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
                <div className="xl:col-span-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Category Profitability</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Which categories are Cash Cows?</p>
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

                {/* Service vs Product Margin (Pie Chart) */}
                <div className="lg:col-span-2 xl:col-span-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Profit Margins Breakdown</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-6">Service vs Product Revenue Mix</p>
                    <div className="flex-1 w-full min-h-[250px] relative">
                        <ResponsiveContainer width="99%" height="100%" minWidth={1} minHeight={1}>
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Service Profit', value: Math.max(0, analytics.serviceProfit) || 0 }, // fallback to 0 if negative or null
                                        { name: 'Product Profit', value: Math.max(0, analytics.productProfit) || 0 }
                                    ]}
                                    cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                                >
                                    <Cell fill="#8b5cf6" /> {/* Purple for Service */}
                                    <Cell fill="#0ea5e9" /> {/* Blue for Product */}
                                </Pie>
                                <Tooltip formatter={(value) => priceTag(value)} contentStyle={{ borderRadius: '12px' }} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center Text displaying total */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total</span>
                            <span className="text-xl font-black text-slate-800">{priceTag(analytics.serviceProfit + analytics.productProfit)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 4. Data Science Insights ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-6 items-start">

                {/* Top 5 Best Sellers */}
                <div className="xl:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-500"><Zap size={20} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Top 5 Best Sellers</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Fastest Moving Products</p>
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
                <div className="xl:col-span-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-50 rounded-xl text-blue-500"><Package size={20} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Supplier Performance</h3>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Profit Leaders (Domain vs Local)</p>
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
                <div className="space-y-6 lg:col-span-2 xl:col-span-4">
                    {/* Turnover Ratio */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
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
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-red-50 rounded-xl text-red-500"><AlertCircle size={20} /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Stock Aging</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Risk Analysis ({'>'}30 Days)</p>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-start">

                    {/* Salary Analytics */}
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-500"><DollarSign size={20} /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Salary Report</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Per-Salesman Breakdown</p>
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
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-red-50 rounded-xl text-red-500"><Activity size={20} /></div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Expense Breakdown</h3>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">By Category</p>
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
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full lg:col-span-2 xl:col-span-1">
                        <div className="flex flex-col gap-3 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-purple-50 rounded-xl text-purple-500"><Wrench size={20} /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">Repairs Report</h3>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Service Performance</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 min-w-[170px] flex-1 sm:flex-none">
                                    <Calendar size={14} className="text-slate-400" />
                                    <input
                                        type="date"
                                        value={repairDateFilter.startDate}
                                        onChange={(e) => setRepairDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
                                        className="text-xs font-semibold text-slate-700 bg-transparent outline-none w-full"
                                    />
                                </div>
                                <span className="text-xs font-bold text-slate-400">to</span>
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 min-w-[170px] flex-1 sm:flex-none">
                                    <Calendar size={14} className="text-slate-400" />
                                    <input
                                        type="date"
                                        value={repairDateFilter.endDate}
                                        onChange={(e) => setRepairDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
                                        className="text-xs font-semibold text-slate-700 bg-transparent outline-none w-full"
                                    />
                                </div>
                                <button
                                    onClick={() => setRepairDateFilter({ startDate: toInputDateString(defaultStartDate), endDate: toInputDateString(defaultEndDate) })}
                                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition-colors"
                                >
                                    Last 30d
                                </button>
                                <button
                                    onClick={() => {
                                        const today = toInputDateString(new Date());
                                        setRepairDateFilter({ startDate: today, endDate: today });
                                    }}
                                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-xs font-bold text-blue-600 transition-colors"
                                >
                                    Today
                                </button>
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

function MetricCard({ title, value, icon, color, trend, subtext }) {
    const colorStyles = {
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        purple: 'bg-purple-50 text-purple-600 border-purple-100',
        red: 'bg-red-50 text-red-600 border-red-100',
    };

    return (
        <div className={`p-4 xl:p-6 rounded-3xl border shadow-sm flex items-start justify-between bg-white border-slate-100 md:hover:border-blue-300 md:hover:shadow-md transition-all group`}>
            <div>
                <p className="text-[10px] xl:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 xl:mb-2">{title}</p>
                <h3 className="text-xl xl:text-3xl font-black text-slate-800 tracking-tight whitespace-nowrap">{value}</h3>
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




