import { useState, useRef, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';

export default function CategoryManagerModal({ isOpen, onClose }) {
    const { getLevel1Categories, getLevel2Categories, addLevel1Category, addLevel2Category } = useInventory();

    // Tabs: 'add' | 'update'
    const [activeTab, setActiveTab] = useState('add');

    // ── ADD CATEGORY STATE ──
    const [level, setLevel] = useState('1'); // '1' or '2'
    const [parentCategory, setParentCategory] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    // ── UPDATE CATEGORY STATE ──
    const [selectedUpdateL1, setSelectedUpdateL1] = useState('');
    const [selectedUpdateL2, setSelectedUpdateL2] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [updateName, setUpdateName] = useState('');
    const [updateImagePreview, setUpdateImagePreview] = useState(null);
    const updateFileInputRef = useRef(null);

    const l1Categories = getLevel1Categories();
    const l2Categories = parentCategory ? getLevel2Categories(parentCategory) : [];
    const updateL2Categories = selectedUpdateL1 ? getLevel2Categories(selectedUpdateL1) : [];

    // Reset when tab changes
    useEffect(() => {
        setLevel('1');
        setParentCategory('');
        setNewCategoryName('');
        setImagePreview(null);
        setSelectedUpdateL1('');
        setSelectedUpdateL2('');
        setEditingCategory(null);
    }, [activeTab, isOpen]);

    if (!isOpen) return null;

    const handleImageChange = (e, setPreview) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!newCategoryName.trim()) return alert("Name required!");

        if (level === '1') {
            addLevel1Category(newCategoryName.trim(), imagePreview);
        } else {
            if (!parentCategory) return alert("Select a parent category!");
            addLevel2Category(parentCategory, newCategoryName.trim(), imagePreview);
        }

        setNewCategoryName('');
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
            addLevel1Category(updateName.trim(), updateImagePreview);
        } else {
            addLevel2Category(selectedUpdateL1, updateName.trim(), updateImagePreview);
        }
        setEditingCategory(null);
        alert("Category Updated!");
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
                        <form onSubmit={handleAddSubmit} className="space-y-5">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Level</label>
                                <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button type="button" onClick={() => setLevel('1')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${level === '1' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                        Main Category (L1)
                                    </button>
                                    <button type="button" onClick={() => setLevel('2')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${level === '2' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                                        Sub Category (L2)
                                    </button>
                                </div>
                            </div>

                            {level === '2' && (
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Select Parent Category</label>
                                    <select value={parentCategory} onChange={e => setParentCategory(e.target.value)} required
                                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:outline-none focus:border-emerald-400">
                                        <option value="">-- Choose Main Category --</option>
                                        {l1Categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Category Name</label>
                                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} required
                                    placeholder={level === '1' ? "e.g. Mobiles" : "e.g. iPhone"}
                                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:outline-none focus:border-emerald-400" />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Image / Icon (Optional)</label>
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
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">1. Select Main Category</label>
                                        <div className="flex flex-wrap gap-2">
                                            {l1Categories.map(c => {
                                                const name = typeof c === 'object' ? c.name : c;
                                                const isActive = selectedUpdateL1 === name;
                                                return (
                                                    <div key={name} className="flex items-center gap-1">
                                                        <button onClick={() => { setSelectedUpdateL1(name); setSelectedUpdateL2(''); }}
                                                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${isActive ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                            {name}
                                                        </button>
                                                        {isActive && (
                                                            <button onClick={() => startEditing(c, true)} className="p-2 rounded-lg text-blue-500 hover:bg-blue-100 transition-all ml-1">✏️</button>
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
                                                                <button onClick={() => startEditing(c, false)} className="px-3 py-1.5 bg-slate-50 hover:bg-blue-100 text-blue-500 border-l border-slate-200 transition-all">
                                                                    ✏️
                                                                </button>
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
