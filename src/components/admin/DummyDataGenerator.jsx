import { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { generateId } from '../../data/inventoryStore';

const DUMMY_PRODUCTS = [
    // Phones
    { id: 'p1', name: 'iPhone 15 Pro Max 256GB', category: { level1: 'Phones', level2: 'Apple' }, sellingPrice: 1199, purchasePrice: 950, stock: 15, sku: 'APL-15PM-256' },
    { id: 'p2', name: 'iPhone 14 128GB', category: { level1: 'Phones', level2: 'Apple' }, sellingPrice: 799, purchasePrice: 600, stock: 22, sku: 'APL-14-128' },
    { id: 'p3', name: 'Samsung S24 Ultra 512GB', category: { level1: 'Phones', level2: 'Samsung' }, sellingPrice: 1299, purchasePrice: 900, stock: 8, sku: 'SAM-S24U-512' },
    { id: 'p4', name: 'Google Pixel 8 128GB', category: { level1: 'Phones', level2: 'Google' }, sellingPrice: 699, purchasePrice: 500, stock: 12, sku: 'GOO-PX8-128' },
    // Accessories
    { id: 'p5', name: 'MagSafe Clear Case', category: { level1: 'Accessories', level2: 'Cases' }, sellingPrice: 49, purchasePrice: 15, stock: 45, sku: 'ACC-MGS-CLR' },
    { id: 'p6', name: 'USB-C to Lightning Cable (2m)', category: { level1: 'Accessories', level2: 'Cables' }, sellingPrice: 25, purchasePrice: 5, stock: 80, sku: 'ACC-USBC-2M' },
    { id: 'p7', name: 'Privacy Screen Protector', category: { level1: 'Accessories', level2: 'Protection' }, sellingPrice: 30, purchasePrice: 3, stock: 150, sku: 'ACC-SCR-PRO' },
    { id: 'p8', name: '20W Fast Charger', category: { level1: 'Accessories', level2: 'Chargers' }, sellingPrice: 35, purchasePrice: 8, stock: 60, sku: 'ACC-CHG-20W' },
    // Repairs
    { id: 'p9', name: 'iPhone 13 Screen Replacement', category: { level1: 'Repairs', level2: 'Screens' }, sellingPrice: 150, purchasePrice: 50, stock: 999, sku: 'REP-SCR-IP13' },
    { id: 'p10', name: 'Battery Replacement (Generic)', category: { level1: 'Repairs', level2: 'Batteries' }, sellingPrice: 60, purchasePrice: 15, stock: 999, sku: 'REP-BAT-GEN' },
];

const DUMMY_SALESMEN = [
    { id: 1001, name: 'Ali', role: 'salesman', active: true, pin: '1111' },
    { id: 1002, name: 'Sarah', role: 'salesman', active: true, pin: '2222' },
    { id: 1003, name: 'Mike', role: 'salesman', active: true, pin: '3333' },
];

export default function DummyDataGenerator() {
    const { setTransactions, setProducts } = useInventory();
    const [generating, setGenerating] = useState(false);
    const [status, setStatus] = useState('');

    const handleFactoryReset = () => {
        if (!window.confirm('WARNING: This will WIPE ALL DATA and reset to a clean state with 3 MONTHS of complete shop dummy data. Are you sure?')) return;

        setGenerating(true);
        setStatus('Wiping old database...');

        // 1. Seed Inventory
        setStatus('Seeding Inventory...');
        setProducts(DUMMY_PRODUCTS);

        // 2. Seed Categories
        setStatus('Seeding Categories...');
        // Categories are now DB-driven via InventoryContext.

        // 3. Seed Staff
        setStatus('Seeding Staff...');
        // Staff is now DB-driven via AuthContext.

        // 4. Generate Transactions and Attendance Logs (Last 90 Days)
        setStatus('Generating 3 Months History...');
        const generatedTxns = [];
        const generatedLogs = [];
        const now = new Date();
        const startDate = new Date();
        startDate.setDate(now.getDate() - 90);

        // Intial Purchase Transaction to simulate buying stock at the start
        const totalInitCost = DUMMY_PRODUCTS.reduce((acc, p) => acc + (p.purchasePrice * p.stock), 0);
        generatedTxns.push({
            id: generateId(),
            type: 'expense',
            isFixedExpense: false,
            desc: `Initial Inventory Stock Purchase`,
            category: 'Purchase',
            amount: totalInitCost,
            timestamp: new Date(startDate.setHours(8, 0)).toISOString(),
            date: startDate.toLocaleDateString('en-GB'),
            time: '08:00 AM'
        });

        for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
            // --- Generate Attendance Logs ---
            DUMMY_SALESMEN.forEach(staff => {
                if (Math.random() < 0.8) { // 80% chance of working today
                    const inTime = new Date(d);
                    inTime.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60)); // 8-10am
                    const outTime = new Date(d);
                    outTime.setHours(17 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60)); // 5-8pm

                    generatedLogs.push({
                        id: generateId(),
                        userId: staff.id,
                        userName: staff.name,
                        type: 'IN',
                        timestamp: inTime.toISOString(),
                        date: inTime.toLocaleDateString('en-PK'),
                        time: inTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                    });

                    generatedLogs.push({
                        id: generateId(),
                        userId: staff.id,
                        userName: staff.name,
                        type: 'OUT',
                        timestamp: outTime.toISOString(),
                        date: outTime.toLocaleDateString('en-PK'),
                        time: outTime.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
                    });
                }
            });

            // Random daily sales volume (3 to 15 sales a day)
            const dailySalesCount = Math.floor(Math.random() * 13) + 3;

            // --- Generate Sales ---
            for (let i = 0; i < dailySalesCount; i++) {
                const product = DUMMY_PRODUCTS[Math.floor(Math.random() * DUMMY_PRODUCTS.length)];

                // Assign a salesman. Ali sells the most, Mike gives the most discounts.
                const randSalesman = Math.random();
                let salesman;
                if (randSalesman < 0.5) salesman = DUMMY_SALESMEN[0]; // Ali (50%)
                else if (randSalesman < 0.8) salesman = DUMMY_SALESMEN[1]; // Sarah (30%)
                else salesman = DUMMY_SALESMEN[2]; // Mike (20%)

                const qty = Math.floor(Math.random() * 2) + 1; // 1 or 2 items

                // Discount logic (Mike gives discounts 40% of the time, others 10%)
                let discount = 0;
                if ((salesman.name === 'Mike' && Math.random() < 0.4) || Math.random() < 0.1) {
                    discount = Math.floor(Math.random() * 15) + 5; // 5 to 20 EUR discount
                }

                const date = new Date(d);
                date.setHours(9 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60)); // 9am - 8pm

                const baseSaleAmount = product.sellingPrice * qty;
                const saleAmount = Math.max(0, baseSaleAmount - discount);
                const buyAmount = product.purchasePrice * qty;

                // Skip if making a massive loss just from RNG
                if (saleAmount < buyAmount * 0.8) continue;

                generatedTxns.push({
                    id: generateId(),
                    type: 'income',
                    desc: `Sold ${qty}x ${product.name}`,
                    productId: product.id,
                    name: product.name,
                    category: product.category?.level1 || product.category,
                    quantity: qty,
                    unitPrice: product.sellingPrice,
                    discount: discount,
                    amount: saleAmount,
                    purchasePriceAtTime: product.purchasePrice,
                    timestamp: date.toISOString(),
                    date: date.toLocaleDateString('en-GB'),
                    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    userId: salesman.id,
                    userName: salesman.name,
                    paymentMethod: Math.random() > 0.4 ? 'cash' : 'card',
                    notes: discount > 0 ? 'Discount granted by staff' : ''
                });
            }

            // --- Generate Fixed Expenses ---
            // Fix Expenses on the 1st of the month
            if (d.getDate() === 1) {
                generatedTxns.push({
                    id: generateId(), type: 'expense', isFixedExpense: true,
                    desc: `Monthly Shop Rent (${d.toLocaleString('default', { month: 'short' })})`,
                    category: 'Rent', amount: 2500,
                    timestamp: new Date(d.setHours(10, 0)).toISOString(), date: d.toLocaleDateString('en-GB'), time: '10:00 AM'
                });
                generatedTxns.push({
                    id: generateId(), type: 'expense', isFixedExpense: true,
                    desc: `Staff Salaries (${d.toLocaleString('default', { month: 'short' })})`,
                    category: 'Salary', amount: 4500,
                    timestamp: new Date(d.setHours(10, 5)).toISOString(), date: d.toLocaleDateString('en-GB'), time: '10:05 AM'
                });
                generatedTxns.push({
                    id: generateId(), type: 'expense', isFixedExpense: true,
                    desc: `Electricity Bill`,
                    category: 'Electricity', amount: 350,
                    timestamp: new Date(d.setHours(10, 10)).toISOString(), date: d.toLocaleDateString('en-GB'), time: '10:10 AM'
                });
                generatedTxns.push({
                    id: generateId(), type: 'expense', isFixedExpense: true,
                    desc: `Telekom Internet`,
                    category: 'Internet', amount: 60,
                    timestamp: new Date(d.setHours(10, 15)).toISOString(), date: d.toLocaleDateString('en-GB'), time: '10:15 AM'
                });
            }

            // Random daily operational expenses
            if (Math.random() < 0.15) { // 15% chance per day for an ad-hoc expense
                const date = new Date(d);
                date.setHours(14, Math.floor(Math.random() * 60));
                generatedTxns.push({
                    id: generateId(),
                    type: 'expense',
                    isFixedExpense: false,
                    desc: 'Lunch for team / Office Supplies',
                    category: 'Operations',
                    amount: Math.floor(Math.random() * 40) + 10,
                    timestamp: date.toISOString(),
                    date: date.toLocaleDateString('en-GB'),
                    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }

            // Random Restocking Purchase transactions
            if (Math.random() < 0.1) { // 10% chance per day to restock
                const product = DUMMY_PRODUCTS[Math.floor(Math.random() * DUMMY_PRODUCTS.length)];
                const buyQty = Math.floor(Math.random() * 10) + 5;
                const buyAmount = product.purchasePrice * buyQty;
                const date = new Date(d);
                date.setHours(11, Math.floor(Math.random() * 60));

                generatedTxns.push({
                    id: generateId(),
                    type: 'expense',
                    isFixedExpense: false,
                    desc: `Stock Received: ${buyQty}x ${product.name}`,
                    category: 'Purchase',
                    amount: buyAmount,
                    timestamp: date.toISOString(),
                    date: date.toLocaleDateString('en-GB'),
                    time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        }

        setTransactions(generatedTxns);

        setStatus('Database populated! Reloading...');
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    };

    return (
        <div className="p-6 border rounded-2xl bg-slate-900 border-slate-800 text-white mt-8 shadow-xl">
            <h3 className="font-bold text-lg mb-2">🔥 Database Developer Tools</h3>
            <p className="text-xs text-slate-400 mb-6">Wipe the entire system and inject a comprehensive 3-month dataset. This includes ~1000 sales across 3 salesmen, dynamic discounts, fixed monthly expenses (Rent, Salaries, etc.), peak hour distributions, full attendance logs, layered categories, and restocking purchases.</p>

            <button
                onClick={handleFactoryReset}
                disabled={generating}
                className="px-6 py-3 bg-rose-600 text-white rounded-xl text-sm font-bold hover:bg-rose-500 disabled:opacity-50 w-full active:scale-95 transition-all shadow-lg shadow-rose-900/50 flex items-center justify-center gap-2"
            >
                {generating ? <span className="animate-pulse">{status}</span> : '⚠ Factory Reset & Inject 3-Month Dataset'}
            </button>
        </div>
    );
}
