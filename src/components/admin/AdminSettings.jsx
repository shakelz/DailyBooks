import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, Users, Key, Plus, Trash2, Eye, EyeOff, Edit2, X, Save, Clock, Lock, Store, MapPin, Mail, UserPlus, Hash, Phone } from 'lucide-react';

export default function AdminSettings() {
    const {
        isAdminLike, isSuperAdmin, activeShopId, shops, refreshShops, createShop, updateShop, deleteShop,
        updateAdminPassword,
        salesmen, addSalesman, deleteSalesman, updateSalesman,
        activeShop, billShowTax, setBillShowTax,
        slowMovingDays, setSlowMovingDays,
        autoLockEnabled, setAutoLockEnabled,
        autoLockTimeout, setAutoLockTimeout
    } = useAuth();

    // ── Password State ──
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [passMsg, setPassMsg] = useState('');

    // ── Salesman State ──
    const [showAddSalesman, setShowAddSalesman] = useState(false);
    const [salesmanName, setSalesmanName] = useState('');
    const [salesmanPin, setSalesmanPin] = useState('');
    const [salesmanNumber, setSalesmanNumber] = useState('');
    const [salesmanCanEditTransactions, setSalesmanCanEditTransactions] = useState(false);
    const [salesmanCanBulkEdit, setSalesmanCanBulkEdit] = useState(false);
    const [salesmanRate, setSalesmanRate] = useState('12.50');
    const [salesmanError, setSalesmanError] = useState('');

    // ── Edit State ──
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editPin, setEditPin] = useState('');
    const [editPhoto, setEditPhoto] = useState('');
    const [editSalesmanNumber, setEditSalesmanNumber] = useState('');
    const [editCanEditTransactions, setEditCanEditTransactions] = useState(false);
    const [editCanBulkEdit, setEditCanBulkEdit] = useState(false);
    const [editRate, setEditRate] = useState('');

    // ── Shops State ──
    const [shopName, setShopName] = useState('');
    const [shopAddress, setShopAddress] = useState('');
    const [shopTelephone, setShopTelephone] = useState('');
    const [shopOwnerEmail, setShopOwnerEmail] = useState('');
    const [shopError, setShopError] = useState('');
    const [shopMessage, setShopMessage] = useState('');
    const [createdManager, setCreatedManager] = useState(null);
    const [isCreatingShop, setIsCreatingShop] = useState(false);
    const [editingShopId, setEditingShopId] = useState('');
    const [editingShopName, setEditingShopName] = useState('');
    const [editingShopAddress, setEditingShopAddress] = useState('');
    const [editingShopTelephone, setEditingShopTelephone] = useState('');
    const [editingShopOwnerEmail, setEditingShopOwnerEmail] = useState('');
    const [editingShopOwnerPassword, setEditingShopOwnerPassword] = useState('');
    const [showEditingShopOwnerPassword, setShowEditingShopOwnerPassword] = useState(false);
    const [isSavingShop, setIsSavingShop] = useState(false);
    const [deletingShopId, setDeletingShopId] = useState('');
    const [visibleShopPasswords, setVisibleShopPasswords] = useState({});

    useEffect(() => {
        if (isAdminLike) {
            refreshShops();
        }
    }, [isAdminLike, refreshShops]);

    // ── Handlers ──
    const handlePasswordUpdate = (e) => {
        e.preventDefault();
        if (newPass.length < 4) {
            setPassMsg('❌ Password too short!');
            return;
        }
        if (newPass !== confirmPass) {
            setPassMsg('❌ Passwords do not match!');
            return;
        }
        updateAdminPassword(newPass);
        setPassMsg('✅ Password updated successfully!');
        setNewPass(''); setConfirmPass('');
        setTimeout(() => setPassMsg(''), 2000);
    };

    const handleAddSalesman = async (e) => {
        e.preventDefault();
        if (!salesmanName.trim() || salesmanPin.length !== 4) {
            setSalesmanError('Name and 4-digit PIN required.');
            return;
        }
        // Check PIN uniqueness
        if (salesmen.some(s => s.pin === salesmanPin)) {
            setSalesmanError('PIN already in use!');
            return;
        }

        const created = await addSalesman(salesmanName, salesmanPin, {
            salesmanNumber: parseInt(salesmanNumber, 10) || 0,
            canEditTransactions: salesmanCanEditTransactions,
            canBulkEdit: salesmanCanBulkEdit
        });
        if (created?.id) {
            await updateSalesman(created.id, { hourlyRate: parseFloat(salesmanRate) || 12.50 });
        }
        setSalesmanName(''); setSalesmanPin(''); setSalesmanRate('12.50');
        setSalesmanNumber('');
        setSalesmanCanEditTransactions(false);
        setSalesmanCanBulkEdit(false);
        setShowAddSalesman(false);
        setSalesmanError('');
    };

    const startEdit = (s) => {
        setEditingId(s.id);
        setEditName(s.name);
        setEditPin(s.pin);
        setEditPhoto(s.photo || '');
        setEditRate(String(s.hourlyRate || 12.50));
        setEditSalesmanNumber(String(s.salesmanNumber || ''));
        setEditCanEditTransactions(Boolean(s.canEditTransactions));
        setEditCanBulkEdit(Boolean(s.canBulkEdit));
        setShowAddSalesman(false); // Close add form if open
    };

    const handleSaveEdit = (e) => {
        e.preventDefault();
        if (!editName.trim() || editPin.length !== 4) {
            alert('Name and 4-digit PIN required.');
            return;
        }
        // Check PIN uniqueness (excluding self)
        if (salesmen.some(s => s.pin === editPin && s.id !== editingId)) {
            alert('PIN already in use!');
            return;
        }

        updateSalesman(editingId, {
            name: editName,
            pin: editPin,
            photo: editPhoto,
            hourlyRate: parseFloat(editRate) || 12.50,
            salesmanNumber: parseInt(editSalesmanNumber, 10) || 0,
            canEditTransactions: editCanEditTransactions,
            canBulkEdit: editCanBulkEdit
        });
        setEditingId(null);
    };

    const handleCreateShop = async (e) => {
        e.preventDefault();
        setShopError('');
        setShopMessage('');
        setCreatedManager(null);

        if (!shopName.trim()) {
            setShopError('Shop name is required.');
            return;
        }
        if (!shopOwnerEmail.trim()) {
            setShopError('Owner email is required.');
            return;
        }

        setIsCreatingShop(true);
        try {
            const result = await createShop({
                shopName,
                location: shopAddress,
                address: shopAddress,
                ownerEmail: shopOwnerEmail,
                telephone: shopTelephone
            });
            setShopName('');
            setShopAddress('');
            setShopTelephone('');
            setShopOwnerEmail('');
            setCreatedManager(result?.credentials || null);
            setEditingShopId('');
            setShopMessage(`Shop "${result?.shop?.name || shopName}" created successfully.`);
            await refreshShops(result?.shop?.id || activeShopId);
        } catch (error) {
            setShopError(error?.message || 'Failed to create shop.');
        } finally {
            setIsCreatingShop(false);
        }
    };

    const startShopEdit = (shop) => {
        setShopError('');
        setShopMessage('');
        setCreatedManager(null);
        setEditingShopId(shop.id);
        setEditingShopName(shop.name || '');
        setEditingShopAddress(shop.address || shop.location || '');
        setEditingShopTelephone(
            shop.telephone
            || shop.phone
            || shop.shop_phone
            || shop.telephone_number
            || shop.phone_number
            || shop.contact_number
            || shop.mobile
            || shop.telefon
            || shop.tel
            || ''
        );
        setEditingShopOwnerEmail(shop.owner_email || '');
        setEditingShopOwnerPassword('');
        setShowEditingShopOwnerPassword(false);
    };

    const cancelShopEdit = () => {
        setEditingShopId('');
        setEditingShopName('');
        setEditingShopAddress('');
        setEditingShopTelephone('');
        setEditingShopOwnerEmail('');
        setEditingShopOwnerPassword('');
        setShowEditingShopOwnerPassword(false);
    };

    const handleSaveShop = async () => {
        if (!editingShopId) return;
        if (!editingShopName.trim()) {
            setShopError('Shop name is required.');
            return;
        }

        setShopError('');
        setShopMessage('');
        setIsSavingShop(true);
        try {
            const payload = {
                name: editingShopName,
                location: editingShopAddress,
                address: editingShopAddress,
                telephone: editingShopTelephone,
                ownerEmail: editingShopOwnerEmail
            };
            if (editingShopOwnerPassword.trim()) {
                payload.ownerPassword = editingShopOwnerPassword.trim();
            }

            const updated = await updateShop(editingShopId, {
                ...payload
            });
            setShopMessage(`Shop "${updated?.name || editingShopName}" updated successfully.`);
            cancelShopEdit();
            await refreshShops(updated?.id || activeShopId);
        } catch (error) {
            setShopError(error?.message || 'Failed to update shop.');
        } finally {
            setIsSavingShop(false);
        }
    };

    const handleDeleteShop = async (shop) => {
        if (!shop?.id) return;

        const confirmDelete = window.confirm(
            `Delete shop "${shop.name}"?\n\nThis will remove shop users, inventory, repairs, attendance and transactions for this shop.`
        );
        if (!confirmDelete) return;

        setShopError('');
        setShopMessage('');
        setDeletingShopId(shop.id);
        try {
            await deleteShop(shop.id);
            if (editingShopId === shop.id) {
                cancelShopEdit();
            }
            setShopMessage(`Shop "${shop.name}" deleted successfully.`);
            await refreshShops();
        } catch (error) {
            setShopError(error?.message || 'Failed to delete shop.');
        } finally {
            setDeletingShopId('');
        }
    };

    const toggleShopPassword = (shopId) => {
        setVisibleShopPasswords((prev) => ({
            ...prev,
            [shopId]: !prev[shopId],
        }));
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">System Settings</h1>
                <p className="text-slate-500 text-sm">Manage security, users, and shop-level access.</p>
            </div>

            {/* ── Admin: Manage Shops ── */}
            {isAdminLike && activeShop && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Bill Settings</h2>
                            <p className="text-xs text-slate-400">
                                Shop: {activeShop.name} ({activeShop.address || activeShop.location || 'No address'})
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setBillShowTax(!billShowTax)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${billShowTax ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title="Enable tax lines on bills"
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${billShowTax ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <p className="text-sm text-slate-600 mt-3">
                        Tax lines on bills are currently <span className="font-bold">{billShowTax ? 'Enabled' : 'Disabled'}</span>.
                    </p>
                </div>
            )}

            {isSuperAdmin && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                            <Store size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Manage Shops</h2>
                            <p className="text-xs text-slate-400">Create and manage tenant shops.</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateShop} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Shop Name</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Store size={14} className="text-slate-400" />
                                <input
                                    value={shopName}
                                    onChange={(e) => setShopName(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="e.g. DailyBooks Berlin"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Address</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <MapPin size={14} className="text-slate-400" />
                                <input
                                    value={shopAddress}
                                    onChange={(e) => setShopAddress(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="Street, postal code, city"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telephone</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Phone size={14} className="text-slate-400" />
                                <input
                                    type="tel"
                                    value={shopTelephone}
                                    onChange={(e) => setShopTelephone(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="+49 30 1234567"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Owner Email</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Mail size={14} className="text-slate-400" />
                                <input
                                    type="email"
                                    value={shopOwnerEmail}
                                    onChange={(e) => setShopOwnerEmail(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="owner@shop.com"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isCreatingShop}
                            className="md:col-span-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            <UserPlus size={16} />
                            {isCreatingShop ? 'Creating...' : 'Create Shop'}
                        </button>
                    </form>

                    {shopError && <p className="text-sm font-medium text-red-500">{shopError}</p>}
                    {shopMessage && <p className="text-sm font-medium text-emerald-600">{shopMessage}</p>}

                    {createdManager && (
                        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                            <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2">Admin Credentials</p>
                            <div className={`grid grid-cols-1 gap-3 text-sm ${createdManager.pin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                                <div><span className="text-slate-500">Email:</span> <span className="font-bold text-slate-800">{createdManager.email}</span></div>
                                {createdManager.pin && <div><span className="text-slate-500">PIN:</span> <span className="font-bold text-slate-800">{createdManager.pin}</span></div>}
                                <div><span className="text-slate-500">Password:</span> <span className="font-bold text-slate-800">{createdManager.password}</span></div>
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Registered Shops ({shops.length})</h3>
                        <div className="space-y-2">
                            {shops.length === 0 ? (
                                <p className="text-sm text-slate-400">No shops found.</p>
                            ) : (
                                shops.map((shop) => (
                                    <div key={shop.id} className="px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
                                        {editingShopId === shop.id ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Shop Name</label>
                                                    <input
                                                        value={editingShopName}
                                                        onChange={(e) => setEditingShopName(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Address</label>
                                                    <input
                                                        value={editingShopAddress}
                                                        onChange={(e) => setEditingShopAddress(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Telephone</label>
                                                    <input
                                                        type="tel"
                                                        value={editingShopTelephone}
                                                        onChange={(e) => setEditingShopTelephone(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                        placeholder="+49 30 1234567"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Owner Email</label>
                                                    <input
                                                        type="email"
                                                        value={editingShopOwnerEmail}
                                                        onChange={(e) => setEditingShopOwnerEmail(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                        placeholder="owner@shop.com"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Owner Password</label>
                                                    <div className="relative">
                                                        <input
                                                            type={showEditingShopOwnerPassword ? 'text' : 'password'}
                                                            value={editingShopOwnerPassword}
                                                            onChange={(e) => setEditingShopOwnerPassword(e.target.value)}
                                                            className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                            placeholder="Leave blank to keep current"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowEditingShopOwnerPassword((prev) => !prev)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                                                            title={showEditingShopOwnerPassword ? 'Hide Password' : 'Show Password'}
                                                        >
                                                            {showEditingShopOwnerPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleSaveShop}
                                                        disabled={isSavingShop}
                                                        className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-1"
                                                    >
                                                        <Save size={14} />
                                                        {isSavingShop ? 'Saving...' : 'Update'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelShopEdit}
                                                        className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 flex items-center gap-1"
                                                    >
                                                        <X size={14} />
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{shop.name}</p>
                                                    <p className="text-xs text-slate-500">{shop.address || 'Address not set'}</p>
                                                    <p className="text-xs text-slate-500">{
                                                        shop.telephone
                                                        || shop.phone
                                                        || shop.shop_phone
                                                        || shop.telephone_number
                                                        || shop.phone_number
                                                        || shop.contact_number
                                                        || shop.mobile
                                                        || shop.telefon
                                                        || shop.tel
                                                        || 'Telephone not set'
                                                    }</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <div className="text-xs text-slate-500 font-mono">{shop.owner_email || 'No owner email'}</div>
                                                        <div className="text-xs text-slate-500 font-mono flex items-center justify-end gap-1 mt-1">
                                                            <span>Password:</span>
                                                            <span className="font-semibold text-slate-700">
                                                                {shop.owner_password
                                                                    ? (visibleShopPasswords[shop.id] ? shop.owner_password : '••••••••')
                                                                    : 'N/A'}
                                                            </span>
                                                            {shop.owner_password && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleShopPassword(shop.id)}
                                                                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                                                                    title={visibleShopPasswords[shop.id] ? 'Hide Password' : 'Show Password'}
                                                                >
                                                                    {visibleShopPasswords[shop.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => startShopEdit(shop)}
                                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Edit Shop"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteShop(shop)}
                                                        disabled={deletingShopId === shop.id}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60"
                                                        title="Delete Shop"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Admin Security Section ── */}
            {isSuperAdmin && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Admin Security</h2>
                        <p className="text-xs text-slate-400">Update your login credentials</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">New Password</label>
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={newPass}
                                onChange={(e) => setNewPass(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                placeholder="Enter new password"
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500">
                                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPass}
                            onChange={(e) => setConfirmPass(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Confirm new password"
                        />
                    </div>
                    {passMsg && <p className={`text-sm font-medium ${passMsg.includes('✅') ? 'text-emerald-500' : 'text-red-500'}`}>{passMsg}</p>}
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
                        Update Password
                    </button>
                </form>
            </div>
            )}

            {/* ── Salesman Management Section ── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Salesman Accounts</h2>
                            <p className="text-xs text-slate-400">Manage access for your team</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setShowAddSalesman(!showAddSalesman); setEditingId(null); }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-medium text-sm"
                    >
                        {showAddSalesman ? <X size={16} /> : <Plus size={16} />}
                        {showAddSalesman ? 'Cancel' : 'Add Salesman'}
                    </button>
                </div>

                {/* Add Salesman Form */}
                {showAddSalesman && !editingId && (
                    <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Add New Salesman</h3>
                        <form onSubmit={handleAddSalesman} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                <input
                                    value={salesmanName}
                                    onChange={(e) => setSalesmanName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    placeholder="e.g. Ali"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">4-Digit PIN</label>
                                <input
                                    value={salesmanPin}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setSalesmanPin(val);
                                    }}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-center tracking-widest font-mono"
                                    placeholder="0000"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Salesman No.</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={salesmanNumber}
                                    onChange={(e) => setSalesmanNumber(e.target.value.replace(/[^\d]/g, ''))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-center font-mono"
                                    placeholder="Auto"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">€/Hour</label>
                                <input
                                    type="number"
                                    step="0.50"
                                    min="0"
                                    value={salesmanRate}
                                    onChange={(e) => setSalesmanRate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-center font-mono"
                                    placeholder="12.50"
                                />
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Special Authorities</p>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Edit transaction history</span>
                                    <input
                                        type="checkbox"
                                        checked={salesmanCanEditTransactions}
                                        onChange={(e) => setSalesmanCanEditTransactions(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Bulk edit option</span>
                                    <input
                                        type="checkbox"
                                        checked={salesmanCanBulkEdit}
                                        onChange={(e) => setSalesmanCanBulkEdit(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                            </div>
                            <button type="submit" className="md:col-span-6 w-full md:w-auto px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                                Add User
                            </button>
                        </form>
                        {salesmanError && <p className="text-red-500 text-xs mt-2 font-medium">{salesmanError}</p>}
                    </div>
                )}

                {/* Edit Salesman Form */}
                {editingId && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-blue-700">Edit Salesman</h3>
                            <button onClick={() => setEditingId(null)} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                                <X size={12} /> Cancel
                            </button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                <input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PIN</label>
                                <input
                                    value={editPin}
                                    onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">€/Hour</label>
                                <input
                                    type="number"
                                    step="0.50"
                                    min="0"
                                    value={editRate}
                                    onChange={(e) => setEditRate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Salesman No.</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={editSalesmanNumber}
                                    onChange={(e) => setEditSalesmanNumber(e.target.value.replace(/[^\d]/g, ''))}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                                    placeholder="Auto"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Photo URL</label>
                                <input
                                    value={editPhoto}
                                    onChange={(e) => setEditPhoto(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-blue-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Special Authorities</p>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Edit transaction history</span>
                                    <input
                                        type="checkbox"
                                        checked={editCanEditTransactions}
                                        onChange={(e) => setEditCanEditTransactions(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Bulk edit option</span>
                                    <input
                                        type="checkbox"
                                        checked={editCanBulkEdit}
                                        onChange={(e) => setEditCanBulkEdit(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                            </div>
                            <div className="md:col-span-6">
                                <button type="submit" className="w-full px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                    <Save size={16} /> Update Salesman
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Salesman List */}
                <div className="space-y-3">
                    {salesmen.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-4">No active salesmen.</p>
                    ) : (
                        salesmen.map((s) => (
                            <div key={s.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors group ${editingId === s.id ? 'bg-blue-50/50 border-blue-200' : 'bg-slate-50 border-slate-100 hover:border-emerald-200'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-lg shadow-sm overflow-hidden">
                                        {s.photo ? (
                                            <img src={s.photo} alt={s.name} className="w-full h-full object-cover" />
                                        ) : (
                                            '👤'
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-800">{s.name}</p>
                                        <div className="flex items-center gap-3 text-xs text-slate-400">
                                            <span className="flex items-center gap-1 font-mono"><Key size={12} /> PIN: {s.pin}</span>
                                            <span className="flex items-center gap-1 font-mono text-blue-600"><Hash size={12} /> No: {s.salesmanNumber || '-'}</span>
                                            <span className="flex items-center gap-1 font-mono text-emerald-500"><Clock size={12} /> {s.hourlyRate || 12.50} €/hr</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateSalesman(s.id, { canEditTransactions: !s.canEditTransactions })}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${s.canEditTransactions ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                        title="Allow transaction history editing"
                                    >
                                        Edit Txn: {s.canEditTransactions ? 'On' : 'Off'}
                                    </button>
                                    <button
                                        onClick={() => updateSalesman(s.id, { canBulkEdit: !s.canBulkEdit })}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${s.canBulkEdit ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                        title="Allow bulk edit option"
                                    >
                                        Bulk: {s.canBulkEdit ? 'On' : 'Off'}
                                    </button>
                                    <button
                                        onClick={() => startEdit(s)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit"
                                        disabled={editingId === s.id}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(`Remove ${s.name}?`)) deleteSalesman(s.id);
                                        }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── Salesman Display Security ── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Salesman Display Security</h2>
                        <p className="text-xs text-slate-400">Auto-lock salesman screen after inactivity</p>
                    </div>
                </div>
                <div className="space-y-4 max-w-md">
                    {/* Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-700">Enable Auto-Lock</p>
                            <p className="text-xs text-slate-400">Blur & lock screen when idle</p>
                        </div>
                        <button
                            onClick={() => setAutoLockEnabled(!autoLockEnabled)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${autoLockEnabled ? 'bg-violet-500' : 'bg-slate-300'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoLockEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Timeout */}
                    {autoLockEnabled && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lock Timeout</label>
                            <p className="text-xs text-slate-400 mb-2">Screen locks after this many seconds of inactivity.</p>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="3600"
                                    value={autoLockTimeout}
                                    onChange={(e) => setAutoLockTimeout(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-24 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-center font-mono font-bold text-lg"
                                />
                                <span className="text-sm text-slate-500 font-medium">seconds</span>
                                <span className="text-xs text-slate-400">({(autoLockTimeout / 60).toFixed(1)} min)</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Inventory Settings ── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                        <Clock size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Inventory Settings</h2>
                        <p className="text-xs text-slate-400">Configure stock analysis thresholds</p>
                    </div>
                </div>
                <div className="max-w-md">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Slow Moving Threshold (Days)</label>
                    <p className="text-xs text-slate-400 mb-2">Products older than this will be tagged as "Slow Moving".</p>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={slowMovingDays}
                            onChange={(e) => setSlowMovingDays(Math.max(1, parseInt(e.target.value) || 30))}
                            className="w-24 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center font-mono font-bold text-lg"
                        />
                        <span className="text-sm text-slate-500 font-medium">days</span>
                    </div>
                </div>
            </div>

        </div>
    );
}

