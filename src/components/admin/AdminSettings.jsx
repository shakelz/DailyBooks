import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { supabase } from '../../supabaseClient';
import { Shield, Users, Key, Plus, Trash2, Eye, EyeOff, Edit2, X, Save, Clock, Lock, Store, MapPin, Mail, UserPlus, Hash, Phone, Upload, RefreshCw } from 'lucide-react';

export default function AdminSettings() {
    const {
        isAdminLike, isSuperAdmin, activeShopId, shops, refreshShops, createShop, updateShop, deleteShop,
        updateAdminPassword,
        salesmen, addSalesman, checkSalesmanPinAvailability, deleteSalesman, updateSalesman,
        activeShop, billShowTax, setBillShowTax,
        slowMovingDays, setSlowMovingDays,
        autoLockEnabled, setAutoLockEnabled,
        autoLockTimeout, setAutoLockTimeout
    } = useAuth();
    const { clearLocalInventoryCache, addTransaction } = useInventory();

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
    const [salesmanSalaryType, setSalesmanSalaryType] = useState('hourly');
    const [salesmanHourlyRate, setSalesmanHourlyRate] = useState('12.50');
    const [salesmanMonthlySalary, setSalesmanMonthlySalary] = useState('');
    const [salesmanPhoto, setSalesmanPhoto] = useState('');
    const [salesmanPhotoFile, setSalesmanPhotoFile] = useState(null);
    const [salesmanError, setSalesmanError] = useState('');
    const [salesmanPinError, setSalesmanPinError] = useState('');
    const [checkingSalesmanPin, setCheckingSalesmanPin] = useState(false);

    // ── Edit State ──
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editPin, setEditPin] = useState('');
    const [editPhoto, setEditPhoto] = useState('');
    const [editPhotoFile, setEditPhotoFile] = useState(null);
    const [editSalesmanNumber, setEditSalesmanNumber] = useState('');
    const [editCanEditTransactions, setEditCanEditTransactions] = useState(false);
    const [editCanBulkEdit, setEditCanBulkEdit] = useState(false);
    const [editSalaryType, setEditSalaryType] = useState('hourly');
    const [editHourlyRate, setEditHourlyRate] = useState('');
    const [editMonthlySalary, setEditMonthlySalary] = useState('');

    // ── Shops State ──
    const [shopName, setShopName] = useState('');
    const [shopAddress, setShopAddress] = useState('');
    const [shopTelephone, setShopTelephone] = useState('');
    const [shopOwnerEmail, setShopOwnerEmail] = useState('');
    const [shopOwnerPassword, setShopOwnerPassword] = useState('');
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
    const [isRefreshingAppData, setIsRefreshingAppData] = useState(false);
    const [appRefreshMsg, setAppRefreshMsg] = useState('');

    useEffect(() => {
        if (isAdminLike) {
            refreshShops();
        }
    }, [isAdminLike, refreshShops]);

    useEffect(() => {
        let cancelled = false;

        const validatePin = async () => {
            const pin = salesmanPin.trim();
            if (!showAddSalesman || editingId) {
                setSalesmanPinError('');
                return;
            }
            if (!pin) {
                setSalesmanPinError('');
                return;
            }
            if (pin.length !== 4) {
                setSalesmanPinError('Die PIN muss genau 4 Ziffern haben.');
                return;
            }

            setCheckingSalesmanPin(true);
            try {
                const result = await checkSalesmanPinAvailability(pin);
                if (cancelled) return;
                setSalesmanPinError(result?.available ? '' : (result?.message || 'PIN wird bereits verwendet.'));
            } catch {
                if (!cancelled) {
                    setSalesmanPinError('PIN kann derzeit nicht geprüft werden.');
                }
            } finally {
                if (!cancelled) setCheckingSalesmanPin(false);
            }
        };

        validatePin();

        return () => {
            cancelled = true;
        };
    }, [salesmanPin, showAddSalesman, editingId, checkSalesmanPinAvailability]);

    // ── Handlers ──
    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (newPass.length < 4) {
            setPassMsg('❌ Passwort ist zu kurz.');
            return;
        }
        if (newPass !== confirmPass) {
            setPassMsg('❌ Passwörter stimmen nicht überein.');
            return;
        }
        try {
            await updateAdminPassword(newPass);
            setPassMsg('Passwort erfolgreich aktualisiert.');
            setNewPass('');
            setConfirmPass('');
            setTimeout(() => setPassMsg(''), 2000);
        } catch (error) {
            setPassMsg(error?.message || 'Passwort konnte nicht aktualisiert werden.');
        }
    };

    const uploadSalesmanPhoto = async (file, salesmanId) => {
        if (!file) return '';
        const safeShopId = String(activeShopId || 'default-shop').trim() || 'default-shop';
        const safeSalesmanId = String(salesmanId || `salesman-${Date.now()}`).trim();
        const extensionFromName = String(file.name || '').split('.').pop()?.toLowerCase();
        const extensionFromType = String(file.type || '').split('/').pop()?.toLowerCase();
        const fileExt = extensionFromName || extensionFromType || 'jpg';
        const safeExt = String(fileExt || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
        const storagePath = `salesmen/${safeShopId}/${safeSalesmanId}-${Date.now()}.${safeExt}`;

        const { error: uploadError } = await supabase.storage
            .from('inventory-images')
            .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });

        if (uploadError) {
            throw new Error(`Photo upload failed. (${uploadError.message})`);
        }

        const { data } = supabase.storage.from('inventory-images').getPublicUrl(storagePath);
        return data?.publicUrl || '';
    };

    const handlePayMonthlySalaries = async () => {
        const monthlyStaff = salesmen.filter(s => (s.salaryType || s.salary_type) === 'monthly' && Number(s.monthlySalary || s.monthly_salary) > 0);
        if (monthlyStaff.length === 0) {
            alert('Keine Mitarbeiter mit hinterlegtem Monatsgehalt gefunden.');
            return;
        }

        const totalToPay = monthlyStaff.reduce((sum, s) => sum + Number(s.monthlySalary || s.monthly_salary), 0);
        if (!window.confirm(`Monatsgehälter für ${monthlyStaff.length} Mitarbeiter mit insgesamt €${totalToPay.toFixed(2)} auszahlen?`)) {
            return;
        }

        let successCount = 0;
        let failCount = 0;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
        const isoString = now.toISOString();

        for (const staff of monthlyStaff) {
            try {
                const amount = Number(staff.monthlySalary || staff.monthly_salary);
                await addTransaction({
                    desc: `Salary: ${staff.name} (Monthly)`,
                    amount,
                    type: 'expense',
                    tx_type: 'fixed_expense',
                    category: 'Salary',
                    paymentMethod: 'Auto',
                    source: 'admin-expense',
                    is_fixed_expense: true,
                    isFixedExpense: true,
                    workerId: staff.id,
                    notes: `salary_monthly | worker_id:${staff.id} | period:${dateStr}`,
                    date: dateStr,
                    time: timeStr,
                    timestamp: isoString,
                });
                successCount++;
            } catch (err) {
                console.error(`Failed to process salary for ${staff.name}:`, err);
                failCount++;
            }
        }

        alert(`Monatsgehälter abgeschlossen.\nErfolgreich: ${successCount}\nFehlgeschlagen: ${failCount}`);
    };

    const handleAddSalesman = async (e) => {
        e.preventDefault();
        if (!salesmanName.trim() || salesmanPin.length !== 4) {
            setSalesmanError('Name und 4-stellige PIN sind erforderlich.');
            return;
        }
        const pinCheckTemporarilyUnavailable = salesmanPinError === 'PIN kann derzeit nicht geprüft werden.';
        if (salesmanPinError && !pinCheckTemporarilyUnavailable) {
            setSalesmanError(salesmanPinError);
            return;
        }
        let uploadedPhotoUrl = '';
        const photoUrlInput = salesmanPhoto.trim();

        try {
            if (salesmanPhotoFile) {
                uploadedPhotoUrl = await uploadSalesmanPhoto(salesmanPhotoFile, `new-${Date.now()}`);
            }

            const parsedNumber = parseInt(salesmanNumber, 10);
            const created = await addSalesman(salesmanName, salesmanPin, {
                salesmanNumber: Number.isFinite(parsedNumber) ? parsedNumber : undefined,
                canEditTransactions: salesmanCanEditTransactions,
                canBulkEdit: salesmanCanBulkEdit
            });
            if (created?.id) {
                const resolvedPhoto = uploadedPhotoUrl || photoUrlInput;
                const finalHourlyRate = parseFloat(salesmanHourlyRate) || 0;
                const finalMonthlySalary = parseFloat(salesmanMonthlySalary) || 0;
                await updateSalesman(created.id, {
                    hourlyRate: salesmanSalaryType === 'hourly' ? (finalHourlyRate || 12.50) : 0,
                    monthlySalary: salesmanSalaryType === 'monthly' ? finalMonthlySalary : 0,
                    salaryType: salesmanSalaryType,
                    ...(resolvedPhoto ? { photo: resolvedPhoto } : {})
                });
            }
            setSalesmanName(''); setSalesmanPin(''); 
            setSalesmanHourlyRate('12.50'); setSalesmanMonthlySalary('');
            setSalesmanSalaryType('hourly');
            setSalesmanNumber('');
            setSalesmanPhoto('');
            setSalesmanPhotoFile(null);
            setSalesmanCanEditTransactions(false);
            setSalesmanCanBulkEdit(false);
            setShowAddSalesman(false);
            setSalesmanError('');
            setSalesmanPinError('');
        } catch (error) {
            setSalesmanError(error?.message || 'Mitarbeiter konnte nicht hinzugefügt werden.');
        }
    };

    const startEdit = (s) => {
        setEditingId(s.id);
        setEditName(s.name);
        setEditPin(s.pin);
        setEditPhoto(s.photo || '');
        setEditPhotoFile(null);
        setEditSalaryType(s.salaryType || s.salary_type || 'hourly');
        setEditHourlyRate(String(s.hourlyRate || '12.50'));
        setEditMonthlySalary(String(s.monthlySalary || s.monthly_salary || ''));
        setEditSalesmanNumber(String(s.salesmanNumber || ''));
        setEditCanEditTransactions(Boolean(s.canEditTransactions));
        setEditCanBulkEdit(Boolean(s.canBulkEdit));
        setShowAddSalesman(false); // Close add form if open
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        const current = salesmen.find((s) => s.id === editingId);
        if (!current) {
            alert('Mitarbeiter nicht gefunden.');
            return;
        }

        const nextName = String(editName || '').trim();
        const nextPin = String(editPin || '').trim();
        const nextHourlyRate = parseFloat(editHourlyRate);
        const nextMonthlySalary = parseFloat(editMonthlySalary);
        const nextNumber = parseInt(editSalesmanNumber, 10) || 0;
        const currentRate = parseFloat(current.hourlyRate) || 12.50;
        const currentNumber = parseInt(current.salesmanNumber, 10) || 0;
        const currentPhoto = String(current.photo || '');
        const nextPhotoInput = String(editPhoto || '').trim();

        const payload = {};

        if (nextName !== String(current.name || '')) {
            if (!nextName) {
                alert('Name darf nicht leer sein.');
                return;
            }
            payload.name = nextName;
        }

        if (nextPin && nextPin !== String(current.pin || '')) {
            if (nextPin.length !== 4) {
                alert('PIN muss 4 Ziffern haben.');
                return;
            }
            if (salesmen.some(s => s.pin === nextPin && s.id !== editingId)) {
                alert('PIN wird bereits verwendet.');
                return;
            }
            payload.pin = nextPin;
        }

        const payloadNextHourly = editSalaryType === 'hourly' ? (nextHourlyRate || 12.50) : 0;
        const payloadNextMonthly = editSalaryType === 'monthly' ? (nextMonthlySalary || 0) : 0;

        if (payloadNextHourly !== parseFloat(current.hourlyRate || 0) || 
            payloadNextMonthly !== parseFloat(current.monthlySalary || current.monthly_salary || 0) || 
            editSalaryType !== current.salaryType) {
            payload.salaryType = editSalaryType;
            payload.hourlyRate = payloadNextHourly;
            payload.monthlySalary = payloadNextMonthly;
        }

        if (nextNumber !== currentNumber) {
            payload.salesmanNumber = nextNumber;
        }

        if (editCanEditTransactions !== Boolean(current.canEditTransactions)) {
            payload.canEditTransactions = editCanEditTransactions;
        }

        if (editCanBulkEdit !== Boolean(current.canBulkEdit)) {
            payload.canBulkEdit = editCanBulkEdit;
        }

        try {
            let uploadedPhotoUrl = '';
            if (editPhotoFile) {
                uploadedPhotoUrl = await uploadSalesmanPhoto(editPhotoFile, editingId || `edit-${Date.now()}`);
            }

            if (uploadedPhotoUrl) {
                payload.photo = uploadedPhotoUrl;
            } else if (nextPhotoInput !== currentPhoto) {
                payload.photo = nextPhotoInput;
            }

            if (Object.keys(payload).length === 0) {
                setEditingId(null);
                return;
            }

            await updateSalesman(editingId, payload);
            setEditingId(null);
        } catch (error) {
            alert(error?.message || 'Mitarbeiter konnte nicht aktualisiert werden.');
        }
    };

    const handleCreateShop = async (e) => {
        e.preventDefault();
        setShopError('');
        setShopMessage('');
        setCreatedManager(null);

        if (!shopName.trim()) {
            setShopError('Shop-Name ist erforderlich.');
            return;
        }
        if (!shopOwnerEmail.trim()) {
            setShopError('Inhaber-E-Mail ist erforderlich.');
            return;
        }
        if (!shopOwnerPassword.trim()) {
            setShopError('Inhaber-Passwort ist erforderlich.');
            return;
        }

        setIsCreatingShop(true);
        try {
            const result = await createShop({
                shopName,
                address: shopAddress,
                ownerEmail: shopOwnerEmail,
                ownerPassword: shopOwnerPassword,
                telephone: shopTelephone
            });
            setShopName('');
            setShopAddress('');
            setShopTelephone('');
            setShopOwnerEmail('');
            setShopOwnerPassword('');
            setCreatedManager(result?.credentials || null);
            setEditingShopId('');
            const baseMessage = `Shop "${result?.shop?.name || shopName}" created successfully.`;
            setShopMessage(baseMessage);
            if (result?.warning) {
                setShopMessage(`${baseMessage} Owner setup warning: ${result.warning}`);
            }
            await refreshShops(result?.shop?.id || activeShopId);
        } catch (error) {
            setShopError(error?.message || 'Shop konnte nicht erstellt werden.');
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
        setEditingShopAddress(shop.address || '');
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
            setShopError('Shop-Name ist erforderlich.');
            return;
        }

        setShopError('');
        setShopMessage('');
        setIsSavingShop(true);
        try {
            const payload = {
                name: editingShopName,
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
            setShopMessage(`Shop "${updated?.name || editingShopName}" wurde erfolgreich aktualisiert.`);
            cancelShopEdit();
            await refreshShops(updated?.id || activeShopId);
        } catch (error) {
            setShopError(error?.message || 'Shop konnte nicht aktualisiert werden.');
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
            setShopMessage(`Shop "${shop.name}" wurde erfolgreich gelöscht.`);
            await refreshShops();
        } catch (error) {
            setShopError(error?.message || 'Shop konnte nicht gelöscht werden.');
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

    const handleForceRefreshAppData = async () => {
        const confirmed = window.confirm('Dadurch wird der lokale DailyBooks-Cache gelöscht und die neuesten Daten aus der Datenbank neu geladen. Fortfahren?');
        if (!confirmed) return;

        setIsRefreshingAppData(true);
        setAppRefreshMsg('Lokaler Cache wird geleert...');

        try {
            Object.keys(localStorage || {}).forEach((key) => {
                if (String(key).startsWith('dailybooks_')) {
                    localStorage.removeItem(key);
                }
            });

            Object.keys(sessionStorage || {}).forEach((key) => {
                if (String(key).startsWith('dailybooks_')) {
                    sessionStorage.removeItem(key);
                }
            });

            if (typeof clearLocalInventoryCache === 'function') {
                clearLocalInventoryCache();
            }

            if ('caches' in window) {
                const cacheKeys = await caches.keys();
                await Promise.all(cacheKeys.map((key) => caches.delete(key)));
            }

            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((registration) => registration.unregister()));
            }

            setAppRefreshMsg('App wird mit aktuellen Daten neu geladen...');
            setTimeout(() => {
                window.location.reload();
            }, 300);
        } catch (error) {
            setAppRefreshMsg(error?.message || 'App-Daten konnten nicht aktualisiert werden. Bitte erneut versuchen.');
            setIsRefreshingAppData(false);
        }
    };

    const handleClearLocalCacheOnly = async () => {
        const confirmed = window.confirm('Lokalen DailyBooks-Cache auf diesem Gerät löschen?');
        if (!confirmed) return;

        setIsRefreshingAppData(true);
        setAppRefreshMsg('Lokaler Cache wird geleert...');
        try {
            Object.keys(localStorage || {}).forEach((key) => {
                if (String(key).startsWith('dailybooks_')) {
                    localStorage.removeItem(key);
                }
            });
            Object.keys(sessionStorage || {}).forEach((key) => {
                if (String(key).startsWith('dailybooks_')) {
                    sessionStorage.removeItem(key);
                }
            });
            if (typeof clearLocalInventoryCache === 'function') {
                clearLocalInventoryCache();
            }
            setAppRefreshMsg('Lokaler Cache wurde geleert.');
        } catch (error) {
            setAppRefreshMsg(error?.message || 'Lokaler Cache konnte nicht geleert werden.');
        } finally {
            setIsRefreshingAppData(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Einstellungen</h1>
                <p className="text-slate-500 text-sm">Sicherheit, Benutzer und Shop-Zugriffe verwalten.</p>
            </div>

            {/* ── Admin: Manage Shops ── */}
            {isAdminLike && activeShop && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Shop-Einstellungen</h2>
                            <p className="text-xs text-slate-400">
                                Shop: {activeShop.name} ({activeShop.address || 'Keine Adresse'})
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setBillShowTax(!billShowTax)}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${billShowTax ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            title="Steuerzeilen auf Belegen aktivieren"
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${billShowTax ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <p className="text-sm text-slate-600 mt-3">
                        Steuerzeilen auf Belegen sind derzeit <span className="font-bold">{billShowTax ? 'aktiviert' : 'deaktiviert'}</span>.
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
                            <h2 className="text-lg font-bold text-slate-800">Shops verwalten</h2>
                            <p className="text-xs text-slate-400">Shops erstellen und verwalten.</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateShop} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Shop-Name</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Store size={14} className="text-slate-400" />
                                <input
                                    value={shopName}
                                    onChange={(e) => setShopName(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="z. B. DailyBooks Berlin"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Adresse</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <MapPin size={14} className="text-slate-400" />
                                <input
                                    value={shopAddress}
                                    onChange={(e) => setShopAddress(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="Straße, Postleitzahl, Stadt"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefon</label>
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
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Inhaber-E-Mail</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Mail size={14} className="text-slate-400" />
                                <input
                                    type="email"
                                    value={shopOwnerEmail}
                                    onChange={(e) => setShopOwnerEmail(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="inhaber@shop.de"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Inhaber-Passwort</label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
                                <Key size={14} className="text-slate-400" />
                                <input
                                    type="password"
                                    value={shopOwnerPassword}
                                    onChange={(e) => setShopOwnerPassword(e.target.value)}
                                    className="w-full bg-transparent outline-none text-sm font-medium"
                                    placeholder="Inhaber-Passwort festlegen"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isCreatingShop}
                            className="md:col-span-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            <UserPlus size={16} />
                            {isCreatingShop ? 'Wird erstellt...' : 'Shop erstellen'}
                        </button>
                    </form>

                    {shopError && <p className="text-sm font-medium text-red-500">{shopError}</p>}
                    {shopMessage && <p className="text-sm font-medium text-emerald-600">{shopMessage}</p>}

                    {createdManager && (
                        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                            <p className="text-xs font-black text-emerald-700 uppercase tracking-wider mb-2">Admin-Zugangsdaten</p>
                            <div className={`grid grid-cols-1 gap-3 text-sm ${createdManager.pin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                                <div><span className="text-slate-500">Email:</span> <span className="font-bold text-slate-800">{createdManager.email}</span></div>
                                {createdManager.pin && <div><span className="text-slate-500">PIN:</span> <span className="font-bold text-slate-800">{createdManager.pin}</span></div>}
                                <div><span className="text-slate-500">Passwort:</span> <span className="font-bold text-slate-800">{createdManager.password}</span></div>
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Registrierte Shops ({shops.length})</h3>
                        <div className="space-y-2">
                            {shops.length === 0 ? (
                                <p className="text-sm text-slate-400">Keine Shops gefunden.</p>
                            ) : (
                                shops.map((shop) => (
                                    <div key={shop.id} className="px-3 py-2 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
                                        {editingShopId === shop.id ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Shop-Name</label>
                                                    <input
                                                        value={editingShopName}
                                                        onChange={(e) => setEditingShopName(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Adresse</label>
                                                    <input
                                                        value={editingShopAddress}
                                                        onChange={(e) => setEditingShopAddress(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Telefon</label>
                                                    <input
                                                        type="tel"
                                                        value={editingShopTelephone}
                                                        onChange={(e) => setEditingShopTelephone(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                        placeholder="+49 30 1234567"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inhaber-E-Mail</label>
                                                    <input
                                                        type="email"
                                                        value={editingShopOwnerEmail}
                                                        onChange={(e) => setEditingShopOwnerEmail(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                        placeholder="inhaber@shop.de"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inhaber-Passwort</label>
                                                    <div className="relative">
                                                        <input
                                                            type={showEditingShopOwnerPassword ? 'text' : 'password'}
                                                            value={editingShopOwnerPassword}
                                                            onChange={(e) => setEditingShopOwnerPassword(e.target.value)}
                                                            className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-violet-500/20"
                                                            placeholder="Leer lassen, um das aktuelle zu behalten"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowEditingShopOwnerPassword((prev) => !prev)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                                                            title={showEditingShopOwnerPassword ? 'Passwort ausblenden' : 'Passwort anzeigen'}
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
                                                        {isSavingShop ? 'Wird gespeichert...' : 'Aktualisieren'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelShopEdit}
                                                        className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 flex items-center gap-1"
                                                    >
                                                        <X size={14} />
                                                        Abbrechen
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{shop.name}</p>
                                                    <p className="text-xs text-slate-500">{shop.address || 'Adresse nicht gesetzt'}</p>
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
                                                        || 'Telefon nicht gesetzt'
                                                    }</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <div className="text-xs text-slate-500 font-mono">{shop.owner_email || 'Keine Inhaber-E-Mail'}</div>
                                                        <div className="text-xs text-slate-500 font-mono flex items-center justify-end gap-1 mt-1">
                                                            <span>Passwort:</span>
                                                            <span className="font-semibold text-slate-700">
                                                                {shop.owner_password
                                                                    ? (visibleShopPasswords[shop.id] ? shop.owner_password : '••••••••')
                                                                    : 'k. A.'}
                                                            </span>
                                                            {shop.owner_password && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleShopPassword(shop.id)}
                                                                    className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                                                                    title={visibleShopPasswords[shop.id] ? 'Passwort ausblenden' : 'Passwort anzeigen'}
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
                                                        title="Shop bearbeiten"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteShop(shop)}
                                                        disabled={deletingShopId === shop.id}
                                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60"
                                                        title="Shop löschen"
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
                        <h2 className="text-lg font-bold text-slate-800">Admin-Sicherheit</h2>
                        <p className="text-xs text-slate-400">Anmeldedaten aktualisieren</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordUpdate} className="space-y-4 max-w-md">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Neues Passwort</label>
                        <div className="relative">
                            <input
                                type={showPass ? 'text' : 'password'}
                                value={newPass}
                                onChange={(e) => setNewPass(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                placeholder="Neues Passwort eingeben"
                            />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500">
                                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Passwort bestätigen</label>
                        <input
                            type="password"
                            value={confirmPass}
                            onChange={(e) => setConfirmPass(e.target.value)}
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            placeholder="Neues Passwort bestätigen"
                        />
                    </div>
                    {passMsg && <p className={`text-sm font-medium ${passMsg.toLowerCase().includes('successfully') ? 'text-emerald-500' : 'text-red-500'}`}>{passMsg}</p>}
                    <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 active:scale-95 transition-all">
                        Passwort aktualisieren
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
                            <h2 className="text-lg font-bold text-slate-800">Mitarbeiterkonten</h2>
                            <p className="text-xs text-slate-400">Zugriffe für dein Team verwalten</p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setShowAddSalesman(!showAddSalesman); setEditingId(null); }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors font-medium text-sm"
                    >
                        {showAddSalesman ? <X size={16} /> : <Plus size={16} />}
                        {showAddSalesman ? 'Abbrechen' : 'Mitarbeiter hinzufügen'}
                    </button>
                </div>

                {/* Add Salesman Form */}
                {showAddSalesman && !editingId && (
                    <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <h3 className="text-sm font-bold text-slate-700 mb-3">Mitarbeiter hinzufügen</h3>
                        <form onSubmit={handleAddSalesman} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Name</label>
                                <input
                                    value={salesmanName}
                                    onChange={(e) => setSalesmanName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    placeholder="z. B. Ali"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">4-stellige PIN</label>
                                <input
                                    value={salesmanPin}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setSalesmanPin(val);
                                    }}
                                    className={`w-full px-3 py-2 rounded-lg border ${salesmanPinError ? 'border-rose-300' : 'border-slate-200'} focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-center tracking-widest font-mono`}
                                    placeholder="0000"
                                />
                                {checkingSalesmanPin && salesmanPin.length === 4 && !salesmanPinError && (
                                    <p className="text-[10px] text-slate-400 mt-1">PIN wird geprüft...</p>
                                )}
                                {salesmanPinError && <p className="text-[10px] text-rose-500 mt-1">{salesmanPinError}</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mitarbeiternr.</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={salesmanNumber}
                                    onChange={(e) => setSalesmanNumber(e.target.value.replace(/[^\d]/g, ''))}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-center font-mono"
                                    placeholder="Auto"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Gehaltstyp
                                </label>
                                
                                {/* Toggle buttons */}
                                <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-2" style={{ width: 'fit-content' }}>
                                    <button
                                        type="button"
                                        onClick={() => setSalesmanSalaryType('hourly')}
                                        className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                            salesmanSalaryType === 'hourly' 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Pro Stunde
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSalesmanSalaryType('monthly')}
                                        className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                            salesmanSalaryType === 'monthly' 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Pro Monat
                                    </button>
                                </div>

                                {/* Conditional input */}
                                {salesmanSalaryType === 'hourly' ? (
                                    <input
                                        type="number"
                                        value={salesmanHourlyRate}
                                        onChange={(e) => setSalesmanHourlyRate(e.target.value)}
                                        placeholder="12.50"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                                    />
                                ) : (
                                    <input
                                        type="number"
                                        value={salesmanMonthlySalary}
                                        onChange={(e) => setSalesmanMonthlySalary(e.target.value)}
                                        placeholder="1800"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                                    />
                                )}
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Foto (Upload oder URL)</p>
                                <input
                                    value={salesmanPhoto}
                                    onChange={(e) => setSalesmanPhoto(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    placeholder="https://..."
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 cursor-pointer">
                                        <Upload size={12} /> Hochladen
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0] || null;
                                                setSalesmanPhotoFile(file);
                                            }}
                                        />
                                    </label>
                                    <span className="text-[10px] text-slate-500 truncate">
                                        {salesmanPhotoFile ? salesmanPhotoFile.name : 'Keine Datei ausgewählt'}
                                    </span>
                                </div>
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Besondere Berechtigungen</p>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Transaktionsverlauf bearbeiten</span>
                                    <input
                                        type="checkbox"
                                        checked={salesmanCanEditTransactions}
                                        onChange={(e) => setSalesmanCanEditTransactions(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Massenbearbeitung</span>
                                    <input
                                        type="checkbox"
                                        checked={salesmanCanBulkEdit}
                                        onChange={(e) => setSalesmanCanBulkEdit(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                            </div>
                            <button type="submit" className="md:col-span-6 w-full md:w-auto px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                                Benutzer hinzufügen
                            </button>
                        </form>
                        {salesmanError && <p className="text-red-500 text-xs mt-2 font-medium">{salesmanError}</p>}
                    </div>
                )}

                {/* Edit Salesman Form */}
                {editingId && (
                    <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-200 animate-in fade-in slide-in-from-top-2">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-blue-700">Mitarbeiter bearbeiten</h3>
                            <button onClick={() => setEditingId(null)} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                                <X size={12} /> Abbrechen
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
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                                    Gehaltstyp
                                </label>
                                
                                {/* Toggle buttons */}
                                <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-2" style={{ width: 'fit-content' }}>
                                    <button
                                        type="button"
                                        onClick={() => setEditSalaryType('hourly')}
                                        className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                            editSalaryType === 'hourly' 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Pro Stunde
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditSalaryType('monthly')}
                                        className={`px-3 py-1.5 text-xs font-bold transition-all ${
                                            editSalaryType === 'monthly' 
                                            ? 'bg-blue-600 text-white' 
                                            : 'bg-white text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        Pro Monat
                                    </button>
                                </div>

                                {/* Conditional input */}
                                {editSalaryType === 'hourly' ? (
                                    <input
                                        type="number"
                                        value={editHourlyRate}
                                        onChange={(e) => setEditHourlyRate(e.target.value)}
                                        placeholder="12.50"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                                    />
                                ) : (
                                    <input
                                        type="number"
                                        value={editMonthlySalary}
                                        onChange={(e) => setEditMonthlySalary(e.target.value)}
                                        placeholder="1800"
                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mitarbeiternr.</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={editSalesmanNumber}
                                    onChange={(e) => setEditSalesmanNumber(e.target.value.replace(/[^\d]/g, ''))}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono"
                                    placeholder="Auto"
                                />
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-blue-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Foto (Upload oder URL)</p>
                                <input
                                    value={editPhoto}
                                    onChange={(e) => setEditPhoto(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="https://..."
                                />
                                <div className="flex items-center justify-between gap-2">
                                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-600 cursor-pointer">
                                        <Upload size={12} /> Hochladen
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0] || null;
                                                setEditPhotoFile(file);
                                            }}
                                        />
                                    </label>
                                    <span className="text-[10px] text-slate-500 truncate">
                                        {editPhotoFile ? editPhotoFile.name : 'Keine Datei ausgewählt'}
                                    </span>
                                </div>
                            </div>
                            <div className="md:col-span-2 rounded-lg border border-blue-200 bg-white p-2 space-y-2">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Besondere Berechtigungen</p>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Transaktionsverlauf bearbeiten</span>
                                    <input
                                        type="checkbox"
                                        checked={editCanEditTransactions}
                                        onChange={(e) => setEditCanEditTransactions(e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-xs text-slate-600">
                                    <span>Massenbearbeitung</span>
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
                                    <Save size={16} /> Mitarbeiter aktualisieren
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Salesman List */}
                <div className="space-y-3">
                    {salesmen.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-4">Keine aktiven Mitarbeiter.</p>
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
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-slate-800">{s.name}</p>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                (s.salaryType || s.salary_type) === 'monthly' 
                                                    ? 'bg-purple-100 text-purple-700' 
                                                    : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {(s.salaryType || s.salary_type) === 'monthly' 
                                                    ? `€${s.monthlySalary || s.monthly_salary}/Monat` 
                                                    : `€${s.hourlyRate}/Std.`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                            <span className="flex items-center gap-1 font-mono"><Key size={12} /> PIN: {s.pin}</span>
                                            <span className="flex items-center gap-1 font-mono text-blue-600"><Hash size={12} /> Nr.: {s.salesmanNumber || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateSalesman(s.id, { canEditTransactions: !s.canEditTransactions })}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${s.canEditTransactions ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                        title="Bearbeitung des Transaktionsverlaufs erlauben"
                                    >
                                        Transaktionen: {s.canEditTransactions ? 'An' : 'Aus'}
                                    </button>
                                    <button
                                        onClick={() => updateSalesman(s.id, { canBulkEdit: !s.canBulkEdit })}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${s.canBulkEdit ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}
                                        title="Massenbearbeitung erlauben"
                                    >
                                        Massenbearb.: {s.canBulkEdit ? 'An' : 'Aus'}
                                    </button>
                                    <button
                                        onClick={() => startEdit(s)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Bearbeiten"
                                        disabled={editingId === s.id}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm(`${s.name} entfernen?`)) deleteSalesman(s.id);
                                        }}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Löschen"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pay Monthly Salaries Button */}
                {salesmen.filter(s => (s.salaryType || s.salary_type) === 'monthly').length > 0 && (
                    <div className="pt-4 mt-6 border-t border-slate-100 flex justify-end">
                        <button
                            onClick={handlePayMonthlySalaries}
                            className="px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-sm hover:bg-emerald-700 transition"
                        >
                            Monatsgehälter auszahlen
                        </button>
                    </div>
                )}
            </div>

            {/* ── Salesman Display Security ── */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                        <Lock size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Mitarbeiterbildschirm-Sicherheit</h2>
                        <p className="text-xs text-slate-400">Bildschirm nach Inaktivität automatisch sperren</p>
                    </div>
                </div>
                <div className="space-y-4 max-w-md">
                    {/* Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-bold text-slate-700">Auto-Sperre aktivieren</p>
                            <p className="text-xs text-slate-400">Bildschirm bei Inaktivität ausblenden und sperren</p>
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
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sperr-Timeout</label>
                            <p className="text-xs text-slate-400 mb-2">Bildschirm sperrt nach so vielen Sekunden Inaktivität.</p>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="3600"
                                    value={autoLockTimeout}
                                    onChange={(e) => setAutoLockTimeout(Math.max(0, parseInt(e.target.value) || 0))}
                                    className="w-24 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 text-center font-mono font-bold text-lg"
                                />
                                <span className="text-sm text-slate-500 font-medium">Sekunden</span>
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
                        <h2 className="text-lg font-bold text-slate-800">Inventar-Einstellungen</h2>
                        <p className="text-xs text-slate-400">Schwellenwerte für Lageranalyse konfigurieren</p>
                    </div>
                </div>
                <div className="max-w-md">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Schwelle Langsamdreher (Tage)</label>
                    <p className="text-xs text-slate-400 mb-2">Produkte älter als dieser Wert werden als „Langsamdreher“ markiert.</p>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min="1"
                            max="365"
                            value={slowMovingDays}
                            onChange={(e) => setSlowMovingDays(Math.max(1, parseInt(e.target.value) || 30))}
                            className="w-24 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center font-mono font-bold text-lg"
                        />
                        <span className="text-sm text-slate-500 font-medium">Tage</span>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                        <RefreshCw size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">App-Daten-Synchronisierung</h2>
                        <p className="text-xs text-slate-400">Aktuellsten App-Status aus der Datenbank neu laden</p>
                    </div>
                </div>
                <div className="max-w-2xl space-y-3">
                    <p className="text-sm text-slate-600">Auf Mitarbeitergeräten verwenden, wenn wegen Browser-Cache oder alter App-Dateien veraltete Daten angezeigt werden.</p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleClearLocalCacheOnly}
                            disabled={isRefreshingAppData}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold transition-colors ${isRefreshingAppData ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-800'}`}
                        >
                            <Trash2 size={16} />
                            Lokalen Cache leeren
                        </button>
                        <button
                            type="button"
                            onClick={handleForceRefreshAppData}
                            disabled={isRefreshingAppData}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-semibold transition-colors ${isRefreshingAppData ? 'bg-slate-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-700'}`}
                        >
                            <RefreshCw size={16} className={isRefreshingAppData ? 'animate-spin' : ''} />
                            {isRefreshingAppData ? 'Aktualisierung...' : 'App-Daten neu laden'}
                        </button>
                    </div>
                    {appRefreshMsg && <p className="text-xs font-medium text-slate-500">{appRefreshMsg}</p>}
                </div>
            </div>

        </div>
    );
}

