import { useState, useRef, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';

export default function CategoryManagerModal({ isOpen, onClose }) {
    const { getLevel1Categories, getLevel2Categories, addLevel1Category, addLevel2Category, deleteCategory } = useInventory();

    // Tabs: 'add' | 'update'
    const [activeTab, setActiveTab] = useState('add');

    // ── ADD CATEGORY STATE ──
    const [addScope, setAddScope] = useState('sales');
    const [mainCatSelect, setMainCatSelect] = useState('');
    const [newMainCatStr, setNewMainCatStr] = useState('');
    const [subCatSelect, setSubCatSelect] = useState('');
    const [newSubCatStr, setNewSubCatStr] = useState('');
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    // ── UPDATE CATEGORY STATE ──
    const [updateScope, setUpdateScope] = useState('sales');
    const [selectedUpdateL1, setSelectedUpdateL1] = useState('');
    const [selectedUpdateL2, setSelectedUpdateL2] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [updateName, setUpdateName] = useState('');
    const [updateImagePreview, setUpdateImagePreview] = useState(null);
    const updateFileInputRef = useRef(null);

    const addL1Categories = getLevel1Categories(addScope);
    const l2Categories = mainCatSelect && mainCatSelect !== 'NEW_ADD' ? getLevel2Categories(mainCatSelect, addScope) : [];
    const updateL1Categories = getLevel1Categories(updateScope);
    const updateL2Categories = selectedUpdateL1 ? getLevel2Categories(selectedUpdateL1, updateScope) : [];

    // Reset when tab changes
    useEffect(() => {
        setMainCatSelect('');
        setNewMainCatStr('');
        setSubCatSelect('');
        setNewSubCatStr('');
        setImagePreview(null);
        setAddScope('sales');
        setSelectedUpdateL1('');
        setSelectedUpdateL2('');
        setEditingCategory(null);
        setUpdateScope('sales');
    }, [activeTab, isOpen]);

    useEffect(() => {
        setMainCatSelect('');
        setSubCatSelect('');
    }, [addScope]);

    useEffect(() => {
        setSelectedUpdateL1('');
        setSelectedUpdateL2('');
        setEditingCategory(null);
    }, [updateScope]);

    if (!isOpen) return null;

    const handleImageChange = (e, setPreview) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();

        let finalMainCat = mainCatSelect;

        if (mainCatSelect === 'NEW_ADD') {
            finalMainCat = newMainCatStr.trim();
            if (!finalMainCat) return alert("Main Category name required!");

            const exists = addL1Categories.some(c => (typeof c === 'object' ? c.name : c).toLowerCase() === finalMainCat.toLowerCase());
            if (exists) return alert("This Main Category already exists!");

            await addLevel1Category(finalMainCat, subCatSelect === 'NEW_ADD' ? null : imagePreview, addScope);
        } else if (!finalMainCat) {
            return alert("Please select or add a Main Category!");
        }

        if (subCatSelect === 'NEW_ADD') {
            const finalSubCat = newSubCatStr.trim();
            if (!finalSubCat) return alert("Sub Category name required!");

            const existingL2s = getLevel2Categories(finalMainCat, addScope) || [];
            const exists = existingL2s.some(c => (typeof c === 'object' ? c.name : c).toLowerCase() === finalSubCat.toLowerCase());
            if (exists) return alert("This Sub Category already exists under the selected Main Category!");

            await addLevel2Category(finalMainCat, finalSubCat, imagePreview, addScope);
        } else if (mainCatSelect !== 'NEW_ADD') {
            return alert("Select ➕ Add New... to create a new category. To update existing categories, use the Update tab.");
        }

        setMainCatSelect('');
        setNewMainCatStr('');
        setSubCatSelect('');
        setNewSubCatStr('');
        setImagePreview(null);
        alert("Category Added Successfully!");
    };

    const startEditing = (cat, isL1) => {
        const nameData = typeof cat === 'object' ? cat.name : cat;
        const imgData = typeof cat === 'object' ? cat.image : null;
        setEditingCategory({ originalName: nameData, isL1, originalRecord: cat });
        setUpdateName(nameData);
        setUpdateImagePreview(imgData);
    };

    const handleUpdateSubmit = (e) => {
        e.preventDefault();
        if (!updateName.trim()) return;

        // Since update logic isn't fully implemented in InventoryContext for renaming,
        // we'll at least overwrite the image or re-add it (which acts like an upsert).
        if (editingCategory.isL1) {
            addLevel1Category(updateName.trim(), updateImagePreview, updateScope);
        } else {
            addLevel2Category(selectedUpdateL1, updateName.trim(), null, updateScope);
        }
        setEditingCategory(null);
        alert("Category Updated!");
    };

    const handleDelete = async (cat, isL1) => {
        const nameData = typeof cat === 'object' ? cat.name : cat;
        if (!window.confirm(`Are you sure you want to delete the ${isL1 ? 'Main' : 'Sub'} Category "${nameData}"?`)) return;

        if (isL1) {
            if (selectedUpdateL1 === nameData) setSelectedUpdateL1('');
            await deleteCategory(1, nameData);
        } else {
            await deleteCategory(2, nameData, selectedUpdateL1);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/30">
                            <span className="text-xl">📂</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Category Manager</h2>
                            <p className="text-[11px] text-emerald-600">Add & Update Product Categories</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-emerald-100 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button onClick={() => setActiveTab('add')}
                        className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'add' ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50' : 'text-slate-400 hover:bg-slate-50'}`}>
                        ➕ Add Category
                    </button>
                    <button onClick={() => setActiveTab('update')}
                        className={`flex-1 py-3 text-sm font-bold transition-all ${activeTab === 'update' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-slate-400 hover:bg-slate-50'}`}>
                        ✏️ Update Category
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* ═══ ADD TAB ═══ */}
                    {activeTab === 'add' && (
                        <form onSubmit={handleAddSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Category Type</label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setAddScope('sales')}
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${addScope === 'sales' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-300'}`}
                                    >
                                        Sales
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddScope('revenue')}
                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${addScope === 'revenue' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                    >
                                        Revenue / Purchase
                                    </button>
                                </div>
                            </div>

                            {/* Main Category */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Main Category</label>
                                <select
                                    value={mainCatSelect}
                                    onChange={e => {
                                        setMainCatSelect(e.target.value);
                                        setSubCatSelect('');
                                    }}
                                    required
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:outline-none focus:border-emerald-400 cursor-pointer"
                                >
                                    <option value="">-- Select Main Category --</option>
                                    {addL1Categories.map(c => {
                                        const name = typeof c === 'object' ? c.name : c;
                                        return <option key={name} value={name}>{name}</option>;
                                    })}
                                    <option value="NEW_ADD" className="font-bold text-emerald-600">➕ Add New Main Category...</option>
                                </select>

                                {mainCatSelect === 'NEW_ADD' && (
                                    <input
                                        value={newMainCatStr}
                                        onChange={e => setNewMainCatStr(e.target.value)}
                                        placeholder="Enter new Main Category name..."
                                        required
                                        autoFocus
                                        className="w-full mt-2 px-4 py-2.5 rounded-xl bg-white border border-emerald-200 text-sm font-bold focus:outline-none focus:border-emerald-500 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200"
                                    />
                                )}
                            </div>

                            {/* Sub Category */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Sub Category (Optional)</label>
                                <select
                                    value={subCatSelect}
                                    onChange={e => setSubCatSelect(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:outline-none focus:border-emerald-400 cursor-pointer"
                                >
                                    <option value="">-- No Sub Category --</option>
                                    {mainCatSelect && mainCatSelect !== 'NEW_ADD' && (
                                        (getLevel2Categories(mainCatSelect, addScope) || []).map(c => {
                                            const name = typeof c === 'object' ? c.name : c;
                                            return <option key={name} value={name}>{name}</option>;
                                        })
                                    )}
                                    <option value="NEW_ADD" className="font-bold text-emerald-600">➕ Add New Sub Category...</option>
                                </select>

                                {subCatSelect === 'NEW_ADD' && (
                                    <input
                                        value={newSubCatStr}
                                        onChange={e => setNewSubCatStr(e.target.value)}
                                        placeholder="Enter new Sub Category name..."
                                        required
                                        autoFocus
                                        className="w-full mt-2 px-4 py-2.5 rounded-xl bg-white border border-emerald-200 text-sm font-bold focus:outline-none focus:border-emerald-500 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200"
                                    />
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block mt-2">Image / Icon (Optional)</label>
                                <div onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 hover:border-emerald-400 transition-all overflow-hidden relative">
                                    {imagePreview ? (
                                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <span className="text-2xl mb-1">📷</span>
                                            <span className="text-[10px] font-bold text-slate-400">Upload</span>
                                        </>
                                    )}
                                    <input type="file" ref={fileInputRef} onChange={e => handleImageChange(e, setImagePreview)} className="hidden" accept="image/*" />
                                </div>
                            </div>

                            <button type="submit" className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/30">
                                Save Category
                            </button>
                        </form>
                    )}

                    {/* ═══ UPDATE TAB ═══ */}
                    {activeTab === 'update' && (
                        <div className="space-y-6">
                            {!editingCategory ? (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Category Type</label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setUpdateScope('sales')}
                                                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${updateScope === 'sales' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300 hover:border-blue-300'}`}
                                            >
                                                Sales
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setUpdateScope('revenue')}
                                                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${updateScope === 'revenue' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-slate-700 border-slate-300 hover:border-rose-300'}`}
                                            >
                                                Revenue / Purchase
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">1. Select Main Category</label>
                                        <div className="flex flex-wrap gap-2">
                                            {updateL1Categories.map(c => {
                                                const name = typeof c === 'object' ? c.name : c;
                                                const isActive = selectedUpdateL1 === name;
                                                return (
                                                    <div key={name} className="flex items-center gap-1">
                                                        <button onClick={() => { setSelectedUpdateL1(name); setSelectedUpdateL2(''); }}
                                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${isActive ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                            {name}
                                                        </button>
                                                        {isActive && (
                                                            <div className="flex border border-slate-200 rounded-lg overflow-hidden ml-1 shadow-sm">
                                                                <button onClick={() => startEditing(c, true)} className="px-2.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all border-r border-slate-200">✏️</button>
                                                                <button onClick={() => handleDelete(c, true)} className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 transition-all">🗑️</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {selectedUpdateL1 && (
                                        <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/30">
                                            <label className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 block">2. Select Sub Category</label>
                                            {updateL2Categories.length === 0 ? (
                                                <p className="text-sm text-slate-400 italic">No sub-categories yet.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {updateL2Categories.map(c => {
                                                        const name = typeof c === 'object' ? c.name : c;
                                                        return (
                                                            <div key={name} className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                                <span className="px-3 py-1.5 text-sm font-bold text-slate-600">{name}</span>
                                                                <div className="flex border-l border-slate-200">
                                                                    <button onClick={() => startEditing(c, false)} className="px-2.5 py-1.5 bg-slate-50 hover:bg-blue-100 text-blue-500 border-r border-slate-200 transition-all">
                                                                        ✏️
                                                                    </button>
                                                                    <button onClick={() => handleDelete(c, false)} className="px-2.5 py-1.5 bg-slate-50 hover:bg-red-100 text-red-500 transition-all">
                                                                        🗑️
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <form onSubmit={handleUpdateSubmit} className="space-y-4 animate-in fade-in zoom-in duration-200 p-5 border border-blue-200 rounded-2xl bg-blue-50/20">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-bold text-blue-800">Edit: {editingCategory.originalName}</h3>
                                        <button type="button" onClick={() => setEditingCategory(null)} className="text-slate-400 hover:text-slate-600 text-sm">Cancel</button>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Name</label>
                                        <input value={updateName} onChange={e => setUpdateName(e.target.value)} required
                                            className="w-full px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-400" />
                                        {/* Name updates require deeper context changes, for now just image upload works perfectly as an upsert */}
                                        <p className="text-[10px] text-slate-400 mt-1">Note: Please focus on updating images. Name updates will create a new entry.</p>
                                    </div>

                                    {editingCategory.isL1 && (
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Image</label>
                                            <div onClick={() => updateFileInputRef.current?.click()}
                                                className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-white hover:border-blue-400 transition-all overflow-hidden relative bg-white">
                                                {updateImagePreview ? (
                                                    <img src={updateImagePreview} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-xl">📷</span>
                                                )}
                                                <input type="file" ref={updateFileInputRef} onChange={e => handleImageChange(e, setUpdateImagePreview)} className="hidden" accept="image/*" />
                                            </div>
                                        </div>
                                    )}

                                    <button type="submit" className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-md">
                                        Save Changes
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
