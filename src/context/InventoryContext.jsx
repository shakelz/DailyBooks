import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { buildProductJSON, generateId, getStockSeverity, getLevel1Categories, getLevel2Categories } from '../data/inventoryStore';

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
    // ── Live Products (Local State mirroring Supabase) ──
    const [products, setProducts] = useState([]);
    const [transactions, setTransactions] = useState([]);

    // ── Categories (Supabase Synced) ──
    const [l1Categories, setL1Categories] = useState([]);
    const [l2Map, setL2Map] = useState({});

    // ── Preload Data from Supabase ──
    useEffect(() => {
        const fetchInitialData = async () => {
            const { data: invData, error: invErr } = await supabase.from('inventory').select('*');
            if (!invErr && invData) setProducts(invData);

            const { data: txnData, error: txnErr } = await supabase.from('transactions').select('*').order('timestamp', { ascending: false });
            if (!txnErr && txnData) setTransactions(txnData);

            // Fetch Categories
            const { data: catData, error: catErr } = await supabase.from('categories').select('*');
            if (!catErr && catData) {
                const l1 = catData.filter(c => c.level === 1) || [];
                const l2 = catData.filter(c => c.level === 2) || [];

                setL1Categories(l1);

                const map2 = {};
                l2.forEach(c => {
                    if (!map2[c.parent]) map2[c.parent] = [];
                    map2[c.parent].push(c);
                });
                setL2Map(map2);
            }
        };
        fetchInitialData();

        // Listen for custom stock deductions (e.g., from Repair parts used)
        const handleStockUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail.partsUsed)) {
                e.detail.partsUsed.forEach(part => {
                    adjustStock(part.productId, -part.quantity);
                });
            }
        };
        window.addEventListener('update-inventory-stock', handleStockUpdate);

        // Listen for live updates via Supabase Realtime (Transactions, Inventory, Categories)
        const syncSubscription = supabase.channel('public:unified_sync')
            // TRANSACTIONS
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, (payload) => {
                setTransactions(prev => {
                    if (prev.some(t => String(t.id) === String(payload.new.id))) return prev;
                    return [payload.new, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'transactions' }, (payload) => {
                setTransactions(prev => prev.map(t => String(t.id) === String(payload.new.id) ? { ...t, ...payload.new } : t));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'transactions' }, (payload) => {
                setTransactions(prev => prev.filter(t => String(t.id) !== String(payload.old.id)));
            })
            // INVENTORY (Products)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory' }, (payload) => {
                setProducts(prev => {
                    if (prev.some(p => String(p.id) === String(payload.new.id))) return prev;
                    return [payload.new, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory' }, (payload) => {
                setProducts(prev => prev.map(p => String(p.id) === String(payload.new.id) ? { ...p, ...payload.new } : p));
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'inventory' }, (payload) => {
                setProducts(prev => prev.filter(p => String(p.id) !== String(payload.old.id)));
            })
            // CATEGORIES
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, (payload) => {
                const newCat = payload.new;
                if (newCat.level === 1) {
                    setL1Categories(prev => {
                        if (prev.some(c => (typeof c === 'object' ? c.name : c) === newCat.name)) return prev;
                        return [...prev, newCat];
                    });
                } else if (newCat.level === 2) {
                    setL2Map(prev => {
                        const currentList = prev[newCat.parent] || [];
                        if (currentList.some(c => (typeof c === 'object' ? c.name : c) === newCat.name)) return prev;
                        return { ...prev, [newCat.parent]: [...currentList, newCat] };
                    });
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'categories' }, (payload) => {
                const updated = payload.new;
                if (updated.level === 1) {
                    setL1Categories(prev => prev.map(c => {
                        const cName = typeof c === 'object' ? c.name : c;
                        // For updates, we match by name since UI often treats name as primary key, or use id if we switched to id
                        // Since DB uses ID, let's match by ID securely
                        return (typeof c === 'object' && c.id === updated.id) ? updated : (cName === updated.name ? updated : c);
                    }));
                } else if (updated.level === 2) {
                    setL2Map(prev => {
                        const next = { ...prev };
                        if (next[updated.parent]) {
                            next[updated.parent] = next[updated.parent].map(c =>
                                ((typeof c === 'object' && c.id === updated.id) || (typeof c === 'object' ? c.name : c) === updated.name) ? updated : c
                            );
                        }
                        return next;
                    });
                }
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'categories' }, (payload) => {
                const deletedId = payload.old.id;
                // Deleting from both L1 and L2 since payload only has ID, no level info easily accessible without old row full replica
                setL1Categories(prev => prev.filter(c => typeof c !== 'object' || c.id !== deletedId));
                setL2Map(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(key => {
                        next[key] = next[key].filter(c => typeof c !== 'object' || c.id !== deletedId);
                    });
                    return next;
                });
            })
            // Fallback Broadcasts
            .on('broadcast', { event: 'inventory_sync' }, (payload) => {
                const { action, data } = payload.payload;
                if (action === 'UPDATE') {
                    setProducts(prev => prev.map(p => String(p.id) === String(data.id) ? { ...p, ...data } : p));
                } else if (action === 'INSERT') {
                    setProducts(prev => {
                        if (prev.some(p => String(p.id) === String(data.id))) return prev;
                        return [data, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    });
                } else if (action === 'DELETE') {
                    setProducts(prev => prev.filter(p => String(p.id) !== String(data.id)));
                }
            })
            .on('broadcast', { event: 'transaction_sync' }, (payload) => {
                const { action, data } = payload.payload;
                if (action === 'INSERT') {
                    setTransactions(prev => {
                        if (prev.some(t => String(t.id) === String(data.id))) return prev;
                        return [data, ...prev].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    });
                } else if (action === 'UPDATE') {
                    setTransactions(prev => prev.map(t => String(t.id) === String(data.id) ? { ...t, ...data } : t));
                } else if (action === 'DELETE') {
                    setTransactions(prev => prev.filter(t => String(t.id) !== String(data.id)));
                }
            })
            .subscribe();

        return () => {
            window.removeEventListener('update-inventory-stock', handleStockUpdate);
            supabase.removeChannel(syncSubscription);
        };
    }, []);

    // ── Optimistic CRUD Async Helpers ──

    const addProduct = useCallback(async (product) => {
        const entry = buildProductJSON(product);
        entry.id = String(entry.id); // Supabase ID is TEXT

        // Optimistic UI Update
        setProducts(prev => {
            if (prev.find(p => p.id === entry.id)) return prev;
            return [entry, ...prev];
        });

        // Supabase DB Update
        await supabase.from('inventory').insert([{
            id: entry.id,
            name: entry.name,
            purchasePrice: parseFloat(entry.purchasePrice || 0),
            sellingPrice: parseFloat(entry.sellingPrice || entry.price || 0),
            stock: parseInt(entry.stock || 0),
            category: entry.category?.level1 || entry.category || '',
            barcode: entry.barcode || '',
            productUrl: entry.productUrl || '',
            timestamp: entry.timestamp || new Date().toISOString(),
            attributes: entry.attributes || {},
            stockAlert: entry.stockAlert || { red: 0, yellow: 0, green: 0 },
            image: entry.image || null,
            notes: entry.notes || ''
        }]);

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'INSERT', data: entry }
        }).catch(e => console.error(e));

        return entry;
    }, []);

    const deleteProduct = useCallback(async (id) => {
        const strId = String(id);
        setProducts(prev => prev.filter(p => String(p.id) !== strId));

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'DELETE', data: { id: strId } }
        }).catch(e => console.error(e));

        await supabase.from('inventory').delete().eq('id', strId);
    }, []);

    const updateProduct = useCallback(async (id, updatedData) => {
        const strId = String(id);
        setProducts(prev => prev.map(p => {
            if (String(p.id) === strId) return { ...p, ...updatedData };
            return p;
        }));

        await supabase.from('inventory').update({
            name: updatedData.name,
            purchasePrice: parseFloat(updatedData.purchasePrice || 0),
            sellingPrice: parseFloat(updatedData.sellingPrice || updatedData.price || 0),
            stock: parseInt(updatedData.stock || 0),
            category: updatedData.category?.level1 || updatedData.category || '',
            barcode: updatedData.barcode || '',
            productUrl: updatedData.productUrl || '',
            attributes: updatedData.attributes || {},
            stockAlert: updatedData.stockAlert || { red: 0, yellow: 0, green: 0 },
            image: updatedData.image || null,
            notes: updatedData.notes || ''
        }).eq('id', strId);

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'UPDATE', data: { id: strId, ...updatedData } }
        }).catch(e => console.error(e));
    }, []);

    const updateStock = useCallback(async (productId, newStock) => {
        const strId = String(productId);
        setProducts(prev => prev.map(p => String(p.id) === strId ? { ...p, stock: parseInt(newStock) } : p));

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'inventory_sync',
            payload: { action: 'UPDATE', data: { id: strId, stock: parseInt(newStock) } }
        }).catch(e => console.error(e));

        await supabase.from('inventory').update({ stock: parseInt(newStock) }).eq('id', strId);
    }, []);

    const adjustStock = useCallback(async (productId, delta) => {
        const strId = String(productId);

        setProducts(prev => {
            const product = prev.find(p => String(p.id) === strId);
            if (!product) return prev;

            const updatedStockVal = Math.max(0, (parseInt(product.stock) || 0) + parseInt(delta));

            // Fire off Supabase and Broadcast asynchronously
            supabase.from('inventory').update({ stock: updatedStockVal }).eq('id', strId).then();

            supabase.channel('public:unified_sync').send({
                type: 'broadcast',
                event: 'inventory_sync',
                payload: { action: 'UPDATE', data: { id: strId, stock: updatedStockVal } }
            }).catch(e => console.error(e));

            return prev.map(p => String(p.id) === strId ? { ...p, stock: updatedStockVal } : p);
        });
    }, []);

    // ── Transactions ──

    const addTransaction = useCallback(async (txn) => {
        const formattedTxn = {
            id: String(txn.id || Date.now()),
            desc: txn.desc || txn.name || '',
            amount: parseFloat(txn.amount || 0),
            type: txn.type || '',
            category: txn.category?.level1 || txn.category || '',
            notes: txn.notes || '',
            source: txn.source || 'shop',
            quantity: parseInt(txn.quantity || 1),
            date: txn.date || new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            time: txn.time || new Date().toLocaleTimeString('en-US', { hour12: false }),
            timestamp: txn.timestamp || new Date().toISOString(),
            isFixedExpense: txn.isFixedExpense || false,
            productId: txn.productId ? String(txn.productId) : null,
            workerId: txn.workerId || null,
            salesmanName: txn.userName || txn.salesmanName || ''
        };

        setTransactions(prev => {
            if (prev.length > 0 && prev[0].id === formattedTxn.id) return prev;
            return [formattedTxn, ...prev];
        });

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'INSERT', data: formattedTxn }
        }).catch(e => console.error(e));

        await supabase.from('transactions').insert([formattedTxn]);
    }, []);

    const updateTransaction = useCallback(async (id, updates) => {
        const strId = String(id);
        setTransactions(prev => prev.map(t => String(t.id) === strId ? { ...t, ...updates } : t));

        supabase.channel('public:unified_sync').send({
            type: 'broadcast',
            event: 'transaction_sync',
            payload: { action: 'UPDATE', data: { id: strId, ...updates } }
        }).catch(e => console.error(e));

        await supabase.from('transactions').update(updates).eq('id', strId);
    }, []);

    const deleteTransaction = useCallback(async (id) => {
        const strId = String(id);
        const txnToDelete = transactions.find(t => String(t.id) === strId);

        if (txnToDelete && txnToDelete.productId) {
            const delta = txnToDelete.type === 'income'
                ? (parseInt(txnToDelete.quantity) || 1) // Sale deleted -> add back to stock
                : -(parseInt(txnToDelete.quantity) || 1); // Purchase deleted -> remove from stock
            adjustStock(txnToDelete.productId, delta);
        }

        setTransactions(prev => prev.filter(t => String(t.id) !== strId));
        await supabase.from('transactions').delete().eq('id', strId);
    }, [transactions, adjustStock]);

    const clearTransactions = useCallback(async () => {
        setTransactions([]);
        // For safety, let's not actually TRUNCATE the cloud DB on UI click unless explicitly defined
        // We will just clear local UI if they hit clear (maybe we shouldn't even support clearing all on cloud).
        console.warn("Clear transactions ignored on Cloud DB for safety.");
    }, []);

    const bulkUpdateCategoryPricing = useCallback(async (categoryName, percentage) => {
        let itemsToUpdate = [];
        setProducts(prev => prev.map(p => {
            const pCat = p.category?.level1 || (typeof p.category === 'string' ? p.category : '');
            if (pCat === categoryName) {
                const currentPrice = parseFloat(p.sellingPrice) || 0;
                if (currentPrice > 0) {
                    const newPrice = parseFloat((currentPrice * (1 + (percentage / 100))).toFixed(2));
                    itemsToUpdate.push({ id: String(p.id), sellingPrice: newPrice });
                    return { ...p, sellingPrice: newPrice };
                }
            }
            return p;
        }));

        // Fire parallel updates to cloud
        itemsToUpdate.forEach(async (item) => {
            await supabase.from('inventory').update({ sellingPrice: item.sellingPrice }).eq('id', item.id);
        });
    }, []);

    // ── Standard Synced Helpers ──

    const lookupBarcode = useCallback((barcode) => {
        if (!barcode) return null;
        const search = String(barcode).trim();
        return products.find(p => p && String(p.barcode || '').trim() === search) || null;
    }, [products]);

    const searchProducts = useCallback((query) => {
        if (!query) return [...products];
        const q = String(query).toLowerCase();
        return products.filter(p => {
            if (!p) return false;
            return (
                String(p.name || '').toLowerCase().includes(q) ||
                String(p.model || '').toLowerCase().includes(q) ||
                String(p.barcode || '').toLowerCase().includes(q) ||
                String(p.desc || '').toLowerCase().includes(q)
            );
        });
    }, [products]);

    // Stateful Category Helpers
    const getL1Categories = useCallback(() => l1Categories, [l1Categories]);

    const getL2Categories = useCallback((l1Name) => {
        if (!l1Name) return [];
        return l2Map[l1Name] || getLevel2Categories(l1Name);
    }, [l2Map]);

    const addL1Category = useCallback(async (name, image = null) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setL1Categories(prev => {
            const existing = prev.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) return prev.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { ...c, name: trimmed, image } : c);
                return prev;
            }
            return [...prev, { name: trimmed, image }];
        });

        // Sync to cloud
        const { data: existing } = await supabase.from('categories').select('id').eq('name', trimmed).eq('level', 1).single();
        if (existing) {
            if (image) await supabase.from('categories').update({ image }).eq('id', existing.id);
        } else {
            await supabase.from('categories').insert([{ name: trimmed, image: image || '', level: 1, parent: null }]);
        }
    }, []);

    const addL2Category = useCallback(async (l1Name, name, image = null) => {
        const trimmed = name.trim();
        if (!trimmed || !l1Name) return;
        setL2Map(prev => {
            const currentList = prev[l1Name] || getLevel2Categories(l1Name);
            const existing = currentList.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) {
                    const updatedList = currentList.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { ...c, name: trimmed, image } : c);
                    return { ...prev, [l1Name]: updatedList };
                }
                return prev;
            }
            return { ...prev, [l1Name]: [...currentList, { name: trimmed, image }] };
        });

        // Sync to cloud
        const { data: existing } = await supabase.from('categories').select('id').eq('name', trimmed).eq('parent', l1Name).eq('level', 2).single();
        if (existing) {
            if (image) await supabase.from('categories').update({ image }).eq('id', existing.id);
        } else {
            await supabase.from('categories').insert([{ name: trimmed, parent: l1Name, image: image || '', level: 2 }]);
        }
    }, []);

    const getCatImage = useCallback((l1, l2) => {
        if (l2 && l2Map[l1]) {
            const found = l2Map[l1].find(c => (typeof c === 'object' ? c?.name : c) === l2);
            if (found && typeof found === 'object' && found.image) return found.image;
        }
        const foundL1 = l1Categories.find(c => (typeof c === 'object' ? c?.name : c) === l1);
        if (foundL1 && typeof foundL1 === 'object' && foundL1.image) return foundL1.image;
        return null;
    }, [l1Categories, l2Map]);

    const deleteCategory = useCallback(async (level, name, parentName = null) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        if (level === 1) {
            setL1Categories(prev => prev.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed));
            setL2Map(prev => {
                const next = { ...prev };
                delete next[trimmed];
                return next;
            });
            await supabase.from('categories').delete().eq('name', trimmed).eq('level', 1);
            // Delete associated L2 categories in DB
            await supabase.from('categories').delete().eq('parent', trimmed).eq('level', 2);
        } else if (level === 2 && parentName) {
            setL2Map(prev => {
                const currentList = prev[parentName] || [];
                return { ...prev, [parentName]: currentList.filter(c => (typeof c === 'object' ? c?.name : c) !== trimmed) };
            });
            await supabase.from('categories').delete().eq('name', trimmed).eq('parent', parentName).eq('level', 2);
        }
    }, []);

    const getLowStockProducts = useCallback(() => {
        return products.filter(p => {
            if (typeof p.stock === 'number') return p.stock < 3;
            if (p.stockAlert) {
                const total = (p.stockAlert.red || 0) + (p.stockAlert.yellow || 0) + (p.stockAlert.green || 0);
                return total < 3;
            }
            return false;
        });
    }, [products]);

    const sanitizeBarcode = useCallback((raw) => {
        return String(raw).replace(/[^0-9a-zA-Z]/g, '').trim();
    }, []);

    const value = {
        products,
        transactions,
        addProduct,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        clearTransactions,
        deleteProduct,
        lookupBarcode,
        getProducts: () => [...products],
        getAllProducts: () => [...products],
        searchProducts,
        getLowStockProducts,
        updateStock,
        adjustStock,
        sanitizeBarcode,
        getStockSeverity,
        updateProduct,
        getLevel1Categories: getL1Categories,
        getLevel2Categories: getL2Categories,
        addLevel1Category: addL1Category,
        addLevel2Category: addL2Category,
        deleteCategory,
        getCategoryImage: getCatImage,
        buildProductJSON,
        generateId,
        bulkUpdateCategoryPricing,
    };

    return (
        <InventoryContext.Provider value={value}>
            {children}
        </InventoryContext.Provider>
    );
}

export function useInventory() {
    const ctx = useContext(InventoryContext);
    if (!ctx) throw new Error('useInventory must be used within <InventoryProvider>');
    return ctx;
}
