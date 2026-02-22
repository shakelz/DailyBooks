import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BarcodeScanner from '../components/BarcodeScanner';
import { useInventory } from '../context/InventoryContext';

// ── Severity color config ──
const SEVERITY = {
    green: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500', label: 'In Stock' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500', label: 'Low' },
    red: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', label: 'Critical!' },
};

export default function InventoryManager() {
    const navigate = useNavigate();
    const { role, addLowStockAlert, lowStockAlerts, clearAlert, clearAllAlerts } = useAuth();
    const isAdmin = role === 'admin';

    // Shared Inventory Context
    const {
        lookupBarcode, sanitizeBarcode, getStockSeverity,
        getAllProducts, getLowStockProducts, updateStock, addProduct, searchProducts,
        deleteProduct
    } = useInventory();

    // ── Scanner State ──
    const [scanInput, setScanInput] = useState('');
    const [scannedProduct, setScannedProduct] = useState(null);
    const [scanError, setScanError] = useState('');
    const [showManualForm, setShowManualForm] = useState(false);
    const scanRef = useRef(null);
    const lastKeyTime = useRef(0);
    const scanBuffer = useRef('');

    // ── Inventory List State ──
    const [products, setProducts] = useState(() => getAllProducts());
    const [searchQuery, setSearchQuery] = useState('');
    const [filterSeverity, setFilterSeverity] = useState('all');

    // ── Manual Form State ──
    const [manualForm, setManualForm] = useState({
        barcode: '', name: '', brand: '', price: '', costPrice: '', stock: '',
        category1: '', category2: '', category3: '',
    });

    // ── Alert Panel ──
    const [showAlerts, setShowAlerts] = useState(false);

    // Auto-refresh products list
    const refreshProducts = useCallback(() => {
        setProducts(getAllProducts());
    }, [getAllProducts]);

    // ── Scanner Detection: rapid keystrokes → barcode ──
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Only process when scanner input is focused or no input focused
            if (document.activeElement && document.activeElement.tagName === 'INPUT' &&
                document.activeElement !== scanRef.current) return;

            const now = Date.now();
            const timeDiff = now - lastKeyTime.current;

            if (e.key === 'Enter') {
                // Process buffered barcode
                const barcode = scanBuffer.current.trim();
                if (barcode.length >= 8) {
                    handleBarcodeScan(barcode);
                }
                scanBuffer.current = '';
                return;
            }

            // If gap < 80ms → scanner input (rapid)
            if (timeDiff > 300) {
                scanBuffer.current = ''; // Reset if too slow (human typing)
            }

            if (/^[0-9]$/.test(e.key)) {
                scanBuffer.current += e.key;
            }

            lastKeyTime.current = now;
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ── Handle Barcode Scan ──
    const handleBarcodeScan = (rawBarcode) => {
        const sanitized = sanitizeBarcode(rawBarcode);
        if (!sanitized) {
            setScanError('❌ Invalid barcode! Sirf 8-13 digits allowed hain.');
            setScannedProduct(null);
            setTimeout(() => setScanError(''), 3000);
            return;
        }

        const product = lookupBarcode(sanitized);
        if (product) {
            setScannedProduct(product);
            setScanInput(sanitized);
            setScanError('');
            setShowManualForm(false);

            // Check stock severity → trigger admin alert if red
            if (product.stock < 3) {
                addLowStockAlert(product);
            }
        } else {
            setScannedProduct(null);
            setScanInput(sanitized);
            setScanError(`⚠️ Barcode "${sanitized}" database mein nahi mila!`);
            setShowManualForm(true); // Show manual form
            setManualForm((prev) => ({ ...prev, barcode: sanitized }));
        }
    };

    // ── Manual Input Submit ──
    const handleManualScan = () => {
        const barcode = scanInput.trim();
        if (!barcode) return;
        handleBarcodeScan(barcode);
    };

    // ── Stock Update ──
    const handleStockChange = async (barcode, delta) => {
        const product = lookupBarcode(barcode);
        if (!product) return;
        const newStock = Math.max(0, product.stock + delta);
        try {
            const updated = await updateStock(barcode, newStock);
            if (updated) {
                setScannedProduct({ ...updated });
                refreshProducts();

                // Check if entering red zone
                if (updated.stock < 3) {
                    addLowStockAlert(updated);
                }
            }
        } catch (error) {
            setScanError(`❌ Stock update failed: ${error?.message || 'Please try again.'}`);
            setTimeout(() => setScanError(''), 3000);
        }
    };

    // ── Add New Product (Manual Form) ──
    const handleAddProduct = async () => {
        const { barcode, name, brand, price, costPrice, stock, category1, category2, category3 } = manualForm;
        if (!barcode || !name || !price) {
            setScanError('❌ Barcode, Name, aur Price required hain!');
            setTimeout(() => setScanError(''), 3000);
            return;
        }

        const newProduct = {
            barcode,
            name,
            brand: brand || 'Unknown',
            categoryPath: [category1 || 'Uncategorized', category2 || 'General', category3 || name],
            price: parseFloat(price),
            costPrice: parseFloat(costPrice) || 0,
            stock: parseInt(stock) || 0,
        };

        try {
            const savedProduct = await addProduct(newProduct);
            setShowManualForm(false);
            setScanError('');
            setScannedProduct(savedProduct || newProduct);
            refreshProducts();
            setManualForm({ barcode: '', name: '', brand: '', price: '', costPrice: '', stock: '', category1: '', category2: '', category3: '' });
        } catch (error) {
            setScanError(`❌ Product save failed: ${error?.message || 'Please try again.'}`);
            setTimeout(() => setScanError(''), 3000);
        }
    };

    // ── Filtered Products ──
    const filteredProducts = searchProducts(searchQuery).filter((p) => {
        if (filterSeverity === 'all') return true;
        return getStockSeverity(p.stock) === filterSeverity;
    });

    const lowStockCount = getLowStockProducts().length;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── Header ── */}
            <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
                <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/dashboard')} className="p-2 rounded-lg hover:bg-slate-100 transition-all cursor-pointer" title="Back to Dashboard">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800">📦 Inventory Manager</h1>
                            <p className="text-[11px] text-slate-400">{products.length} products in database</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Low Stock Alert Badge (Admin Only) */}
                        {isAdmin && lowStockAlerts.length > 0 && (
                            <button
                                onClick={() => setShowAlerts(!showAlerts)}
                                id="low-stock-alert-btn"
                                className="relative p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all cursor-pointer"
                                title="Low Stock Alerts"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                    {lowStockAlerts.length}
                                </span>
                            </button>
                        )}

                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${isAdmin ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                            {isAdmin ? 'Admin' : 'Salesman'}
                        </span>
                    </div>
                </div>

                {/* Admin Alert Panel (dropdown) */}
                {isAdmin && showAlerts && lowStockAlerts.length > 0 && (
                    <div className="absolute right-4 top-full mt-1 w-80 bg-white rounded-2xl shadow-2xl border border-red-200 z-50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-100">
                            <span className="text-sm font-bold text-red-700">🚨 Low Stock Alerts</span>
                            <button onClick={clearAllAlerts} className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer">
                                Clear All
                            </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {lowStockAlerts.map((alert) => (
                                <div key={alert.barcode} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 hover:bg-red-50/50">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate">{alert.name}</p>
                                        <p className="text-[10px] text-slate-400">{alert.brand} • Stock: <span className="text-red-600 font-bold">{alert.stock}</span> • {alert.alertTime}</p>
                                    </div>
                                    <button onClick={() => clearAlert(alert.barcode)} className="ml-2 p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 cursor-pointer">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* ══ SCANNER SECTION ══ */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50">
                        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                                </svg>
                            </span>
                            Smart Barcode Scanner
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 ml-10">Camera scan, barcode scanner, ya manually type karo</p>
                    </div>

                    <div className="px-5 py-4">
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <input
                                    ref={scanRef}
                                    type="text"
                                    placeholder="Barcode scan karo ya type karo... (8-13 digits)"
                                    value={scanInput}
                                    onChange={(e) => setScanInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleManualScan()}
                                    id="barcode-input"
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700 placeholder-slate-400 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 focus:bg-white transition-all"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <button
                                onClick={handleManualScan}
                                id="scan-btn"
                                className="px-5 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all cursor-pointer shadow-sm shadow-blue-500/25"
                            >
                                🔍 Scan
                            </button>
                        </div>

                        {/* ── Camera Scanner Section ── */}
                        <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">📷 Camera Scan</span>
                                <span className="text-[10px] text-slate-400">— Phone camera se barcode scan karo</span>
                            </div>
                            <BarcodeScanner
                                onScanSuccess={(barcode) => {
                                    setScanInput(barcode);
                                    handleBarcodeScan(barcode);
                                }}
                                onScanError={(err) => {
                                    setScanError(`📷 Camera Error: ${err}`);
                                    setTimeout(() => setScanError(''), 3000);
                                }}
                            />
                        </div>

                        {/* Error Message */}
                        {scanError && (
                            <div className="mt-3 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600 font-medium">
                                {scanError}
                            </div>
                        )}

                        {/* Scanned Product Card */}
                        {scannedProduct && (
                            <div className="mt-4 p-4 rounded-2xl border-2 border-blue-200 bg-blue-50/30">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-lg font-bold text-slate-800">{scannedProduct.name}</h3>
                                            {/* Severity Badge */}
                                            {(() => {
                                                const sev = getStockSeverity(scannedProduct.stock);
                                                const s = SEVERITY[sev];
                                                return (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text} ${s.border} border`}>
                                                        <span className={`w-2 h-2 rounded-full ${s.dot} ${sev === 'red' ? 'animate-pulse' : ''}`} />
                                                        {s.label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <p className="text-sm text-slate-500">{scannedProduct.brand}</p>
                                        <p className="text-xs text-slate-400 font-mono mt-0.5">Barcode: {scannedProduct.barcode}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            Category: {scannedProduct.categoryPath?.join(' → ')}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-slate-800">₹{scannedProduct.price?.toLocaleString('en-IN')}</p>
                                        <p className="text-[10px] text-slate-400">Cost: ₹{scannedProduct.costPrice?.toLocaleString('en-IN')}</p>
                                    </div>
                                </div>

                                {/* Stock Control */}
                                <div className="mt-4 flex items-center justify-between p-3 rounded-xl bg-white border border-slate-100">
                                    <span className="text-sm font-medium text-slate-600">Stock:</span>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => handleStockChange(scannedProduct.barcode, -1)}
                                            className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 active:scale-90 transition-all cursor-pointer font-bold text-lg"
                                        >−</button>
                                        <span className={`text-xl font-bold px-3 min-w-[3rem] text-center ${getStockSeverity(scannedProduct.stock) === 'red' ? 'text-red-600' :
                                            getStockSeverity(scannedProduct.stock) === 'yellow' ? 'text-yellow-600' : 'text-green-600'
                                            }`}>
                                            {scannedProduct.stock}
                                        </span>
                                        <button
                                            onClick={() => handleStockChange(scannedProduct.barcode, 1)}
                                            className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-100 active:scale-90 transition-all cursor-pointer font-bold text-lg"
                                        >+</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Manual Entry Form (appears when barcode not found) */}
                        {showManualForm && !scannedProduct && (
                            <div className="mt-4 p-5 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/30">
                                <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                                    ✏️ Manual Entry — Naya Product Add Karo
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Barcode *</label>
                                        <input type="text" value={manualForm.barcode} onChange={(e) => setManualForm({ ...manualForm, barcode: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Product Name *</label>
                                        <input type="text" value={manualForm.name} onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Brand</label>
                                        <input type="text" value={manualForm.brand} onChange={(e) => setManualForm({ ...manualForm, brand: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Sell Price *</label>
                                        <input type="number" value={manualForm.price} onChange={(e) => setManualForm({ ...manualForm, price: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Cost Price</label>
                                        <input type="number" value={manualForm.costPrice} onChange={(e) => setManualForm({ ...manualForm, costPrice: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Initial Stock</label>
                                        <input type="number" value={manualForm.stock} onChange={(e) => setManualForm({ ...manualForm, stock: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
                                    </div>
                                    {/* Category Hierarchy */}
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Main Category</label>
                                        <select value={manualForm.category1} onChange={(e) => setManualForm({ ...manualForm, category1: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 cursor-pointer">
                                            <option value="">Select...</option>
                                            <option value="Mobile Phones">Mobile Phones</option>
                                            <option value="Accessories">Accessories</option>
                                            <option value="Repairs">Repairs</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Sub Category</label>
                                        <input type="text" value={manualForm.category2} onChange={(e) => setManualForm({ ...manualForm, category2: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" placeholder="e.g., Samsung" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Detail</label>
                                        <input type="text" value={manualForm.category3} onChange={(e) => setManualForm({ ...manualForm, category3: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" placeholder="e.g., Galaxy S24" />
                                    </div>
                                </div>
                                <div className="flex gap-2 mt-4">
                                    <button onClick={handleAddProduct} className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 active:scale-95 transition-all cursor-pointer">
                                        ✅ Save Product
                                    </button>
                                    <button onClick={() => { setShowManualForm(false); setScanError(''); }} className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-all cursor-pointer">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ══ INVENTORY TABLE ══ */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <h2 className="text-base font-bold text-slate-800">📋 All Products</h2>
                        <div className="flex items-center gap-2">
                            {/* Search */}
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search name / brand..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-8 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:bg-white"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            {/* Severity Filter */}
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                                {['all', 'green', 'yellow', 'red'].map((sev) => (
                                    <button
                                        key={sev}
                                        onClick={() => setFilterSeverity(sev)}
                                        className={`px-3 py-2 text-[11px] font-semibold transition-all cursor-pointer ${filterSeverity === sev
                                            ? sev === 'all' ? 'bg-slate-800 text-white'
                                                : sev === 'green' ? 'bg-green-500 text-white'
                                                    : sev === 'yellow' ? 'bg-yellow-500 text-white'
                                                        : 'bg-red-500 text-white'
                                            : 'bg-white text-slate-500 hover:bg-slate-50'
                                            }`}
                                    >
                                        {sev === 'all' ? 'All' : sev === 'green' ? '🟢' : sev === 'yellow' ? '🟡' : '🔴'}
                                    </button>
                                ))}
                            </div>
                            <span className="text-xs text-slate-400">{filteredProducts.length} items</span>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Product</th>
                                    <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">Barcode</th>
                                    <th className="text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Category</th>
                                    <th className="text-right px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                                    <th className="text-center px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stock</th>
                                    <th className="text-center px-5 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredProducts.map((product) => {
                                    const sev = getStockSeverity(product.stock);
                                    const s = SEVERITY[sev];
                                    return (
                                        <tr key={product.barcode} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-slate-700">{product.name}</p>
                                                <p className="text-[11px] text-slate-400">{product.brand}</p>
                                            </td>
                                            <td className="px-3 py-3 font-mono text-xs text-slate-500 hidden md:table-cell">{product.barcode}</td>
                                            <td className="px-3 py-3 text-xs text-slate-400 hidden lg:table-cell">{product.categoryPath?.join(' → ')}</td>
                                            <td className="px-3 py-3 text-right font-semibold text-slate-700">₹{product.price?.toLocaleString('en-IN')}</td>
                                            <td className="px-3 py-3 text-center">
                                                <span className={`inline-block min-w-[2rem] text-center font-bold ${sev === 'red' ? 'text-red-600' : sev === 'yellow' ? 'text-yellow-600' : 'text-green-600'
                                                    }`}>
                                                    {product.stock}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text} border ${s.border}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${sev === 'red' ? 'animate-pulse' : ''}`} />
                                                    {s.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {filteredProducts.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-sm text-slate-400">Koi product nahi mila 🔍</p>
                        </div>
                    )}

                    {/* Low Stock Summary Footer */}
                    {lowStockCount > 0 && (
                        <div className="px-5 py-3 bg-red-50/50 border-t border-red-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-medium text-red-600">{lowStockCount} products in critical stock (&lt; 3 items)</span>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
