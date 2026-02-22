import { useInventory } from '../../context/InventoryContext';
import { priceTag, CURRENCY_CONFIG } from '../../utils/currency';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { TrendingUp, DollarSign, Package, AlertCircle } from 'lucide-react';

export default function AdminInsights() {
    // We can pull real data for some stats, but for charts we might need to mock 
    // history if we don't have a transaction log with dates yet.
    // InventoryContext has 'transactions' but maybe not fully populated in this demo.
    const { getAllProducts, transactions } = useInventory();

    // ── Metric Cards Data ──
    const products = getAllProducts();
    const totalStockValue = products.reduce((acc, p) => acc + (parseFloat(p.purchasePrice || 0) * parseFloat(p.stock || 0)), 0);
    const potentialRevenue = products.reduce((acc, p) => acc + (parseFloat(p.sellingPrice || 0) * parseFloat(p.stock || 0)), 0);
    const lowStockCount = products.filter(p => !p.stock || parseInt(p.stock) < 3).length;

    // ── Mock Chart Data (since we might not have enough history yet) ──
    const salesData = [
        { name: 'Mon', sales: 4000, profit: 2400 },
        { name: 'Tue', sales: 3000, profit: 1398 },
        { name: 'Wed', sales: 2000, profit: 9800 },
        { name: 'Thu', sales: 2780, profit: 3908 },
        { name: 'Fri', sales: 1890, profit: 4800 },
        { name: 'Sat', sales: 2390, profit: 3800 },
        { name: 'Sun', sales: 3490, profit: 4300 },
    ];

    // Calculate Category Distribution from Real Data
    const categoryDataMap = products.reduce((acc, p) => {
        const cat = p.category?.level1 || 'Uncategorized';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
    }, {});

    const categoryData = Object.keys(categoryDataMap).map(key => ({
        name: key,
        value: categoryDataMap[key]
    })).sort((a, b) => b.value - a.value).slice(0, 5); // Top 5

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Business Insights</h1>
                <p className="text-slate-500 text-sm">Analyze performance, trends, and inventory health.</p>
            </div>

            {/* ── Key Metrics ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <DollarSign size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase font-bold">Stock Value (Cost)</p>
                        <p className="text-lg font-bold text-slate-800">{priceTag(totalStockValue)}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase font-bold">Potential Revenue</p>
                        <p className="text-lg font-bold text-slate-800">{priceTag(potentialRevenue)}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Package size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase font-bold">Total Products</p>
                        <p className="text-lg font-bold text-slate-800">{products.length}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase font-bold">Low Stock Items</p>
                        <p className="text-lg font-bold text-slate-800">{lowStockCount}</p>
                    </div>
                </div>
            </div>

            {/* ── Charts Section ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Sales Trend */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Weekly Sales Trend</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${CURRENCY_CONFIG.symbol}${val}`} />
                                <RechartsTooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                                <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Distribution */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Inventory by Category</h3>
                    <div className="h-64 w-full flex items-center justify-center">
                        {categoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="text-slate-400 text-sm">Add products to see category distribution</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
