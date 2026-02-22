import { useState, useRef, useMemo, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import { CURRENCY_CONFIG } from '../utils/currency';

// ══════════════════════════════════════════════════════════
// SmartCategoryForm — Universal Dynamic Inventory Entry
// 3-Level Hierarchy + 14 Chips + Custom Chips + Stock Alert
// ══════════════════════════════════════════════════════════

// ── Built-in Chip Library ──
const CHIP_LIBRARY = [
    { key: 'imei', label: 'IMEI', icon: '📱', type: 'text', placeholder: '15-digit IMEI number' },
    { key: 'color', label: 'Color', icon: '🎨', type: 'text', placeholder: 'e.g. Black, Blue, Silver' },
    { key: 'condition', label: 'Condition', icon: '✅', type: 'select', options: ['New', 'Used', 'Refurbished', 'Damaged'] },
    { key: 'warranty', label: 'Warranty', icon: '🛡️', type: 'select', options: ['No Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years'] },
    { key: 'variant', label: 'Variant', icon: '📦', type: 'text', placeholder: 'e.g. 8GB/256GB, Pro Max' },
    { key: 'compatibility', label: 'Compatibility', icon: '🔗', type: 'text', placeholder: 'e.g. iPhone 15, Samsung S24' },
    { key: 'supplierUrl', label: 'Supplier URL', icon: '🌐', type: 'url', placeholder: 'https://supplier-link.com' },
    { key: 'quality', label: 'Quality', icon: '⭐', type: 'select', options: ['Original', 'OEM', 'Copy/Clone', 'Refurbished OEM'] },
    { key: 'brand', label: 'Brand', icon: '🏷️', type: 'text', placeholder: 'e.g. Samsung, Apple, Xiaomi' },
    { key: 'ram', label: 'RAM', icon: '🧠', type: 'select', options: ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB'] },
    { key: 'storage', label: 'Storage', icon: '💾', type: 'select', options: ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB'] },
    { key: 'batteryHealth', label: 'Battery Health', icon: '🔋', type: 'select', options: ['100%', '90-99%', '80-89%', '70-79%', 'Below 70%'] },
    { key: 'networkType', label: 'Network Type', icon: '📡', type: 'select', options: ['4G LTE', '5G', '3G', 'WiFi Only'] },
    { key: 'packagingCond', label: 'Packaging Condition', icon: '📦', type: 'select', options: ['Sealed Box', 'Open Box', 'No Box', 'Damaged Box'] },
];

export default function SmartCategoryForm({ isOpen, onClose, onSubmit, initialData = null }) {
    const {
        lookupBarcode, addProduct, updateProduct,
        getLevel1Categories, getLevel2Categories,
        addLevel1Category, addLevel2Category,
        generateId
    } = useInventory();

    // ── Reset or Populate on Open ──
    // Moved below states for safety

    // ── 3-Level Hierarchy ──
    const [level1, setLevel1] = useState('');
    const [level2, setLevel2] = useState('');
    const [level3Model, setLevel3Model] = useState('');
    const [customL1, setCustomL1] = useState('');
    const [customL2, setCustomL2] = useState('');
    const [showCustomL1, setShowCustomL1] = useState(false);
    const [showCustomL2, setShowCustomL2] = useState(false);

    // ── Standard Fields ──
    const [name, setName] = useState('');
    const [barcode, setBarcode] = useState('');
    const [purchasePrice, setPurchasePrice] = useState('');
    const [sellingPrice, setSellingPrice] = useState('');
    const [purchaseFrom, setPurchaseFrom] = useState('');
    const [productUrl, setProductUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [stock, setStock] = useState('1');
    const [minStock, setMinStock] = useState('5');

    // ── Stock Alert Counts ──
    const [stockRed, setStockRed] = useState('');
    const [stockYellow, setStockYellow] = useState('');
    const [stockGreen, setStockGreen] = useState('');
    const [stockAvailable, setStockAvailable] = useState('');

    // ── Dynamic Chips ──
    const [activeChips, setActiveChips] = useState([]);
    const [dynamicFields, setDynamicFields] = useState({});

    // ── Custom Chips ──
    const [customChips, setCustomChips] = useState([]);
    const [showCustomChipInput, setShowCustomChipInput] = useState(false);
    const [newChipName, setNewChipName] = useState('');

    // ── Images ──
    const [imagePreview, setImagePreview] = useState(null); // Product Image
    const [catImagePreview, setCatImagePreview] = useState(null); // Category Image
    const fileInputRef = useRef(null);
    const catFileInputRef = useRef(null);

    // ── Validation ──
    const [errors, setErrors] = useState({});
    const [submitted, setSubmitted] = useState(false);

    // ── Reset or Populate on Open ──
    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                // ── Edit Mode: Populate Fields ──
                setName(initialData.name || '');
                setBarcode(initialData.barcode || '');

                // Category
                if (typeof initialData.category === 'object' && initialData.category !== null) {
                    setLevel1(initialData.category.level1 || '');
                    setLevel2(initialData.category.level2 || '');
                    setLevel3Model(initialData.category.level3 || '');
                } else if (typeof initialData.category === 'string') {
                    setLevel1(initialData.category);
                    setLevel2('');
                    setLevel3Model('');
                }

                // Prices & Stock
                setPurchasePrice(initialData.purchasePrice || '');
                setSellingPrice(initialData.sellingPrice || '');
                setPurchaseFrom(initialData.purchaseFrom || '');
                setStock(initialData.stock || '0');
                // minStock fallback if not present
                // setMinStock(initialData.minStock || '5'); 

                // Stock Alerts
                if (initialData.stockAlert) {
                    setStockRed(initialData.stockAlert.red || '');
                    setStockYellow(initialData.stockAlert.yellow || '');
                    setStockGreen(initialData.stockAlert.green || '');
                }

                // Meta
                setProductUrl(initialData.productUrl || '');
                setNotes(initialData.notes || '');
                if (initialData.image) setImagePreview(initialData.image);

                // Chips & Attributes
                if (initialData.attributes) {
                    const attrs = initialData.attributes;
                    setDynamicFields(attrs);

                    const libraryKeys = CHIP_LIBRARY.map(c => c.key);
                    const existingKeys = Object.keys(attrs);

                    // Identify custom keys (those not in built-in library)
                    const customKeys = existingKeys.filter(k => !libraryKeys.includes(k));
                    if (customKeys.length > 0) {
                        const restoredCustomChips = customKeys.map(k => ({
                            key: k,
                            label: k.startsWith('custom_') ? k.replace('custom_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : k,
                            icon: '🔧',
                            type: 'text',
                            placeholder: `Enter ${k}...`
                        }));
                        setCustomChips(restoredCustomChips);
                    } else {
                        setCustomChips([]);
                    }

                    setActiveChips(existingKeys);
                } else {
                    setActiveChips([]);
                    setCustomChips([]);
                    setDynamicFields({});
                }

            } else {
                // ── Add Mode: Reset Fields ──
                setLevel1(''); setLevel2(''); setLevel3Model('');
                setName(''); setBarcode('');
                setPurchasePrice(''); setSellingPrice('');
                setPurchaseFrom('');
                setStock('1'); setMinStock('5');
                setStockRed(''); setStockYellow(''); setStockGreen(''); setStockAvailable('');
                setActiveChips([]); setDynamicFields({});
                setProductUrl(''); setNotes('');
                setImagePreview(null);
                setCatImagePreview(null); // Will be set by category logic
                setErrors({}); setSubmitted(false);
                setCustomChips([]);
            }
        }
    }, [isOpen, initialData]);

    const { getCategoryImage } = useInventory();

    // ── Auto-update Category Image on Selection ──
    useEffect(() => {
        if (isOpen && level1) {
            const img = getCategoryImage(level1, level2);
            setCatImagePreview(img);
        }
    }, [level1, level2, isOpen, getCategoryImage]);

    // ── Computed ──
    const l1Categories = getLevel1Categories();
    const l2Categories = level1 ? getLevel2Categories(level1) : [];
    const allChips = [...CHIP_LIBRARY, ...customChips];
    const profit = (parseFloat(sellingPrice) || 0) - (parseFloat(purchasePrice) || 0);

    // ── Chip Toggle ──
    const toggleChip = (chipKey) => {
        if (activeChips.includes(chipKey)) {
            setActiveChips(prev => prev.filter(k => k !== chipKey));
            setDynamicFields(prev => { const c = { ...prev }; delete c[chipKey]; return c; });
        } else {
            setActiveChips(prev => [...prev, chipKey]);
        }
    };

    // ── Custom Chip Creator ──
    const addCustomChip = () => {
        if (!newChipName.trim()) return;
        const key = 'custom_' + newChipName.trim().toLowerCase().replace(/\s+/g, '_');
        if (allChips.find(c => c.key === key)) return;
        const newChip = { key, label: newChipName.trim(), icon: '🔧', type: 'text', placeholder: `Enter ${newChipName.trim()}...` };
        setCustomChips(prev => [...prev, newChip]);
        setActiveChips(prev => [...prev, key]); // auto-activate
        setNewChipName('');
        setShowCustomChipInput(false);
    };

    // ── Custom L1 Add ──
    const handleAddCustomL1 = () => {
        if (!customL1.trim()) return;
        addLevel1Category(customL1.trim());
        setLevel1(customL1.trim());
        setCustomL1(''); setShowCustomL1(false);
    };

    // ── Custom L2 Add ──
    const handleAddCustomL2 = () => {
        if (!customL2.trim() || !level1) return;
        addLevel2Category(level1, customL2.trim());
        setLevel2(customL2.trim());
        setCustomL2(''); setShowCustomL2(false);
    };

    // ── Image Handlers ──
    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleCategoryImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setCatImagePreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    // ── Validation ──
    const validate = () => {
        const errs = {};

        // 1. Category check (either select or custom)
        if (!level1 && !customL1) errs.level1 = 'Category required';

        // 2. Pricing checks
        if (!sellingPrice || parseFloat(sellingPrice) <= 0) errs.sellingPrice = 'Selling price required';
        if (!purchasePrice || parseFloat(purchasePrice) <= 0) errs.purchasePrice = 'Purchase price required';

        // 3. Name fallback check (must have Name or Model)
        if (!name.trim() && !level3Model.trim()) {
            errs.name = 'Name or Model required';
        }

        // 4. Barcode duplicate check
        if (barcode && barcode.trim()) {
            const existing = lookupBarcode(barcode.trim());
            if (existing && (!initialData || existing.id !== initialData.id)) {
                errs.barcode = `Duplicate used by: ${existing.name}`;
            }
        }

        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    // ── Submit ──
    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setSubmitted(true);
        if (!validate()) return;

        const productData = {
            id: (initialData && initialData.id) ? initialData.id : generateId('PRD'),
            model: level3Model.trim() || '',
            name: name.trim() || level3Model.trim() || `${level1} ${level2}`.trim(),
            desc: name.trim() || level3Model.trim() || `${level1} ${level2}`.trim(),
            barcode: barcode ? barcode.trim() : null,
            category: {
                level1: customL1 || level1,
                level2: customL2 || level2,
                level3: level3Model.trim() || null
            },
            purchasePrice: parseFloat(purchasePrice) || 0,
            sellingPrice: parseFloat(sellingPrice) || 0,
            purchaseFrom: purchaseFrom.trim(),
            stock: parseInt(stock) || 0,
            stockAlert: {
                red: parseInt(stockRed) || 0,
                yellow: parseInt(stockYellow) || 0,
                green: parseInt(stockGreen) || 0,
            },
            attributes: { ...dynamicFields },
            productUrl: productUrl.trim() || null,
            notes: notes.trim(),
            image: imagePreview || null,
        };

        try {
            if (initialData && initialData.id) {
                // ── UPDATE EXISTING ──
                await updateProduct(initialData.id, productData);
            } else {
                // ── ADD NEW ──
                await addProduct(productData);
            }

            // Call parent prop if provided
            if (onSubmit) onSubmit(productData);

            // Save Custom Categories or Update Images
            if (level1 || customL1) {
                addLevel1Category(customL1 || level1, catImagePreview);
            }
            if (level2 || customL2) {
                addLevel2Category(level1 || customL1, customL2 || level2, catImagePreview);
            }

            // Reset
            setLevel1(''); setLevel2(''); setLevel3Model('');
            setName(''); setBarcode('');
            setPurchasePrice(''); setSellingPrice('');
            setPurchaseFrom('');
            setStock('1');
            setStockRed(''); setStockYellow(''); setStockGreen('');
            setActiveChips([]); setDynamicFields({});
            setProductUrl(''); setNotes('');
            setImagePreview(null); setCatImagePreview(null); setErrors({}); setSubmitted(false);
            setCustomChips([]);

            setTimeout(() => {
                onClose();
            }, 500);
        } catch (error) {
            console.error('Product save failed:', error);
            setErrors(prev => ({ ...prev, submit: error?.message || 'Failed to save product. Please try again.' }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl mx-4 bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/30">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Add Product</h2>
                            <p className="text-[11px] text-blue-500">Universal Dynamic Inventory Entry</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-blue-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* ── 1. Basic Info (Name & Barcode) ── */}
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                            <div className="flex gap-4">
                                {/* Image Upload */}
                                <div onClick={() => fileInputRef.current?.click()}
                                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-white hover:border-blue-400 transition-all overflow-hidden relative group bg-white shadow-sm">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Product" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <span className="text-xl">📦</span>
                                            <span className="text-[7px] font-bold text-slate-400 uppercase">Photo</span>
                                        </>
                                    )}
                                    <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />
                                </div>

                                <div className="flex-1 space-y-3">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Product Name <span className="text-red-500">*</span></label>
                                        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. iPhone 13 Pro Max"
                                            className={`w-full px-4 py-2 rounded-xl bg-white border text-sm font-bold focus:outline-none focus:ring-2 transition-all ${errors.name ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-400/30'}`} />
                                        {errors.name && <p className="text-[10px] text-red-500 mt-1 font-bold">{errors.name}</p>}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Barcode / SKU</label>
                                        <div className="relative">
                                            <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Scan Barcode..."
                                                className={`w-full pl-8 pr-3 py-2 rounded-xl bg-white border text-sm font-mono focus:outline-none focus:ring-2 transition-all ${errors.barcode ? 'border-red-300 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-400/30'}`} />
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">║</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2 border-t border-slate-200 pt-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Qty</label>
                                    <input type="number" value={stock} onChange={e => setStock(e.target.value)}
                                        className="w-full px-2 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-400/30" />
                                </div>
                                <div className="col-span-3 flex gap-2">
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1 block">Red</label>
                                        <input type="number" value={stockRed} onChange={e => setStockRed(e.target.value)} placeholder="0"
                                            className="w-full px-2 py-2 rounded-xl bg-red-50 border border-red-100 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-red-400/30" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 block">Yel</label>
                                        <input type="number" value={stockYellow} onChange={e => setStockYellow(e.target.value)} placeholder="0"
                                            className="w-full px-2 py-2 rounded-xl bg-amber-50 border border-amber-100 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400/30" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1 block">Grn</label>
                                        <input type="number" value={stockGreen} onChange={e => setStockGreen(e.target.value)} placeholder="0"
                                            className="w-full px-2 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400/30" />
                                    </div>
                                </div>
                            </div>
                        </div>


                        {/* ── 2. Pricing ── */}
                        <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
                            <div>
                                <label className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mb-1 block">Buying Price <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">{CURRENCY_CONFIG.symbol}</span>
                                    <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="0"
                                        className={`w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border text-sm font-bold text-blue-900 focus:outline-none focus:ring-2 transition-all ${errors.purchasePrice ? 'border-red-300 focus:ring-red-200' : 'border-blue-200 focus:ring-blue-400/30'}`} />
                                </div>
                                {errors.purchasePrice && <p className="text-[10px] text-red-500 mt-1 font-bold">{errors.purchasePrice}</p>}
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1 block">Selling Price <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">{CURRENCY_CONFIG.symbol}</span>
                                    <input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} placeholder="0"
                                        className={`w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border text-sm font-bold text-emerald-900 focus:outline-none focus:ring-2 transition-all ${errors.sellingPrice ? 'border-red-300 focus:ring-red-200' : 'border-emerald-200 focus:ring-emerald-400/30'}`} />
                                </div>
                                {errors.sellingPrice && <p className="text-[10px] text-red-500 mt-1 font-bold">{errors.sellingPrice}</p>}
                            </div>
                        </div>

                        {/* ── 3. Category Hierarchy ── */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Category Hierarchy</label>
                            <div className="grid grid-cols-3 gap-3">
                                {/* Level 1 */}
                                <div>
                                    <select value={showCustomL1 ? 'custom' : level1} onChange={(e) => {
                                        if (e.target.value === 'custom') { setShowCustomL1(true); setLevel1(''); }
                                        else { setLevel1(e.target.value); setShowCustomL1(false); }
                                    }} className={`w-full px-3 py-2.5 rounded-xl bg-slate-50 border text-xs font-semibold focus:outline-none focus:ring-2 ${errors.level1 ? 'border-red-300' : 'border-slate-200'}`}>
                                        <option value="">Main Category...</option>
                                        {getLevel1Categories().map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        <option value="custom" className="font-bold text-blue-600">+ Add New</option>
                                    </select>
                                    {showCustomL1 && <input value={customL1} onChange={e => setCustomL1(e.target.value)} placeholder="Enter Name" className="mt-2 w-full px-3 py-2 rounded-xl bg-white border border-blue-200 text-xs focus:ring-2 focus:ring-blue-400/30" autoFocus />}
                                </div>
                                {/* Level 2 */}
                                <div>
                                    <select value={showCustomL2 ? 'custom' : level2} onChange={(e) => {
                                        if (e.target.value === 'custom') { setShowCustomL2(true); setLevel2(''); }
                                        else { setLevel2(e.target.value); setShowCustomL2(false); }
                                    }} disabled={!level1 && !customL1} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2">
                                        <option value="">Sub Category...</option>
                                        {l2Categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                        <option value="custom" className="font-bold text-blue-600">+ Add New</option>
                                    </select>
                                    {showCustomL2 && <input value={customL2} onChange={e => setCustomL2(e.target.value)} placeholder="Enter Name" className="mt-2 w-full px-3 py-2 rounded-xl bg-white border border-blue-200 text-xs focus:ring-2 focus:ring-blue-400/30" autoFocus />}
                                </div>
                                {/* Level 3 (Model) */}
                                <div>
                                    <input value={level3Model} onChange={e => setLevel3Model(e.target.value)} placeholder="Series / Model"
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2" />
                                </div>
                            </div>
                        </div>

                        {/* ── 4. Specs Chips ── */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Specifications & Details</label>
                            <div className="flex flex-wrap gap-2">
                                {/* Built-in + Custom Chips */}
                                {[...CHIP_LIBRARY, ...customChips].map(chip => (
                                    <div key={chip.key} className="relative group">
                                        <div className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${dynamicFields[chip.key] ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                                            <span>{chip.icon}</span>
                                            {chip.type === 'select' ? (
                                                <div className="relative">
                                                    <select className="bg-transparent border-none outline-none appearance-none cursor-pointer pr-4 w-full"
                                                        value={dynamicFields[chip.key] || ''}
                                                        onChange={(e) => setDynamicFields(prev => ({ ...prev, [chip.key]: e.target.value }))}>
                                                        <option value="">{chip.label}</option>
                                                        {chip.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                            ) : (
                                                <input className="bg-transparent border-none outline-none min-w-[80px] max-w-[120px] placeholder-slate-400"
                                                    placeholder={chip.label}
                                                    value={dynamicFields[chip.key] || ''}
                                                    onChange={(e) => setDynamicFields(prev => ({ ...prev, [chip.key]: e.target.value }))} />
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* Add Custom Chip Button */}
                                {showCustomChipInput ? (
                                    <div className="flex items-center gap-1 bg-white border border-blue-300 rounded-lg px-2 py-1 shadow-sm animate-in fade-in zoom-in duration-200">
                                        <input
                                            value={newChipName}
                                            onChange={e => setNewChipName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomChip())}
                                            placeholder="Spec Name..."
                                            className="text-xs border-none outline-none w-24"
                                            autoFocus
                                        />
                                        <button onClick={addCustomChip} className="text-blue-600 hover:text-blue-800 font-bold px-1">+</button>
                                        <button onClick={() => setShowCustomChipInput(false)} className="text-slate-400 hover:text-red-500 px-1">✕</button>
                                    </div>
                                ) : (
                                    <button onClick={() => setShowCustomChipInput(true)}
                                        className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-400 text-xs font-medium hover:border-blue-400 hover:text-blue-500 hover:bg-slate-50 transition-all flex items-center gap-1">
                                        <span>➕</span> Add Spec
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── 5. Standard Fields ── */}
                        <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">📋 Standard Fields</p>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sold By / Purchase From</label>
                                <input
                                    type="text"
                                    value={purchaseFrom}
                                    onChange={e => setPurchaseFrom(e.target.value)}
                                    placeholder="e.g. Local Market, ABC Traders, John Doe"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source / Product URL</label>
                                <input type="text" value={productUrl} onChange={e => setProductUrl(e.target.value)}
                                    placeholder="https://link.com or 'Local Market'"
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</label>
                                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                                    placeholder="Additional notes..."
                                    rows={2}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all resize-none" />
                            </div>
                        </div>

                        {/* ── Actions ── */}
                        {errors.submit && (
                            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                {errors.submit}
                            </p>
                        )}
                        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition-colors">Cancel</button>
                            <button type="submit" className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 active:scale-95 transition-all">
                                Save Product
                            </button>
                        </div>
                    </form>
                </div>
            </div >
        </div >
    );
}
