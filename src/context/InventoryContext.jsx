import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    getLevel1Categories, getLevel2Categories,
    addLevel1Category, addLevel2Category, buildProductJSON,
    getStockSeverity, generateId
} from '../data/inventoryStore';

// ══════════════════════════════════════════════════════════
// InventoryContext — Shared reactive product pool
// All components read/write from this single source of truth
// ══════════════════════════════════════════════════════════

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
    // ── Load from LocalStorage on mount ──
    const [products, setProducts] = useState(() => {
        try {
            const saved = localStorage.getItem('inventory');
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to load inventory:", e);
            return [];
        }
    });

    // ── Auto-save to LocalStorage ──
    useEffect(() => {
        try {
            localStorage.setItem('inventory', JSON.stringify(products));
        } catch (error) {
            console.warn("LocalStorage quota exceeded via standard save. Attempting to save without images...");
            try {
                const minimalData = products.map(p => {
                    if (!p) return null;
                    const { image, ...rest } = p;
                    return rest;
                }).filter(Boolean);
                localStorage.setItem('inventory', JSON.stringify(minimalData));
            } catch (retryError) {
                console.error("Critical: Failed to save inventory to LocalStorage.", retryError);
            }
        }
    }, [products]);

    // ── Storage Event Listener for Cross-Tab Sync ──
    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === 'inventory' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    setProducts(Array.isArray(parsed) ? parsed : []);
                } catch (err) { console.error("Sync error (inventory):", err); }
            }
            if (e.key === 'transactions' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    setTransactions(Array.isArray(parsed) ? parsed : []);
                } catch (err) { console.error("Sync error (transactions):", err); }
            }
            if (e.key === 'categories_l1' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    setL1Categories(Array.isArray(parsed) ? parsed : []);
                } catch (err) { console.error("Sync error (categories_l1):", err); }
            }
            if (e.key === 'categories_l2' && e.newValue) {
                try {
                    const parsed = JSON.parse(e.newValue);
                    setL2Map(parsed || {});
                } catch (err) { console.error("Sync error (categories_l2):", err); }
            }
        };
        window.addEventListener('storage', handleStorageChange);

        // Listen for same-tab transaction updates (e.g. salary auto-save from AuthContext)
        const handleTxnUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail)) {
                setTransactions(e.detail);
            }
        };
        window.addEventListener('transactions-updated', handleTxnUpdate);

        // Listen for custom stock deductions (e.g., from Repair parts used)
        const handleStockUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail.partsUsed)) {
                setProducts(prev => {
                    let updated = [...prev];
                    e.detail.partsUsed.forEach(part => {
                        updated = updated.map(p => {
                            if (p.id === part.productId) {
                                return { ...p, stock: Math.max(0, (parseInt(p.stock) || 0) - part.quantity) };
                            }
                            return p;
                        });
                    });
                    return updated;
                });
            }
        };
        window.addEventListener('update-inventory-stock', handleStockUpdate);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('transactions-updated', handleTxnUpdate);
            window.removeEventListener('update-inventory-stock', handleStockUpdate);
        };
    }, []);

    // ── Add product ──
    const addProduct = useCallback((product) => {
        const entry = buildProductJSON(product);
        setProducts(prev => {
            if (prev.find(p => p.id === entry.id)) return prev;
            return [entry, ...prev];
        });
        return entry;
    }, []);

    // ── Delete product ──
    const deleteProduct = useCallback((id) => {
        setProducts(prev => prev.filter(p => p.id !== id));
    }, []);

    // ── Barcode lookup (String-coerced for reliable match) ──
    const lookupBarcode = useCallback((barcode) => {
        if (!barcode) return null;
        const search = String(barcode).trim();
        return products.find(p => p && String(p.barcode || '').trim() === search) || null;
    }, [products]);

    // ── Get all products ──
    const getProducts = useCallback(() => [...products], [products]);
    const getAllProducts = getProducts; // alias

    // ── Search products ──
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

    // ── Low stock products ──
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

    // ── Update stock (Absolute) ──
    const updateStock = useCallback((productId, newStock) => {
        setProducts(prev => prev.map(p =>
            p.id === productId ? { ...p, stock: parseInt(newStock) } : p
        ));
    }, []);

    // ── Update Full Product (Edit Mode) ──
    const updateProduct = useCallback((id, updatedData) => {
        setProducts(prev => prev.map(p => {
            if (p.id === id) {
                // Merge existing 'p' with 'updatedData'
                // Ensure ID and creation time are preserved unless explicitly needed
                return { ...p, ...updatedData, id: p.id };
            }
            return p;
        }));
    }, []);

    // ── Bulk Update Category Pricing ──
    const bulkUpdateCategoryPricing = useCallback((categoryName, percentage) => {
        setProducts(prev => prev.map(p => {
            // Check if product belongs to the target category (Level 1)
            const pCat = p.category?.level1 || (typeof p.category === 'string' ? p.category : '');
            if (pCat === categoryName) {
                const currentPrice = parseFloat(p.sellingPrice) || 0;
                if (currentPrice > 0) {
                    const newPrice = currentPrice * (1 + (percentage / 100));
                    // Round to 2 decimal places
                    return { ...p, sellingPrice: parseFloat(newPrice.toFixed(2)) };
                }
            }
            return p;
        }));
    }, []);

    // ── Adjust stock (Relative) ──
    const adjustStock = useCallback((productId, delta) => {
        setProducts(prev => prev.map(p =>
            p.id === productId ? { ...p, stock: Math.max(0, (parseInt(p.stock) || 0) + parseInt(delta)) } : p
        ));
    }, []);

    // ── Sanitize barcode ──
    const sanitizeBarcode = useCallback((raw) => {
        return String(raw).replace(/[^0-9a-zA-Z]/g, '').trim();
    }, []);


    // ── Load transactions ──
    const [transactions, setTransactions] = useState(() => {
        try {
            const saved = localStorage.getItem('transactions');
            const parsed = saved ? JSON.parse(saved) : [];
            // Remove exact ID duplicates on load
            const unique = [];
            const seen = new Set();
            parsed.forEach(t => {
                if (t && t.id && !seen.has(t.id)) {
                    seen.add(t.id);
                    unique.push(t);
                } else if (t && !t.id) {
                    unique.push(t); // legacy without ID
                }
            });
            return unique;
        } catch {
            return [];
        }
    });

    // ── Auto-save Transactions ──
    useEffect(() => {
        try {
            localStorage.setItem('transactions', JSON.stringify(transactions));
        } catch (error) {
            console.error("Failed to save transactions:", error);
        }
    }, [transactions]);

    // ── Add Transaction ──
    const addTransaction = useCallback((txn) => {
        setTransactions(prev => {
            if (prev.length > 0 && prev[0].id === txn.id) return prev;
            return [txn, ...prev];
        });
    }, []);

    // ── Update Transaction ──
    const updateTransaction = useCallback((id, updates) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }, []);

    // ── Delete Transaction ──
    const deleteTransaction = useCallback((id) => {
        // 1. Find the transaction first (outside the setter)
        const txnToDelete = transactions.find(t => t.id === id);

        // 2. Adjust stock immediately (if it involves a product)
        if (txnToDelete && txnToDelete.productId) {
            // Reverse stock change
            const delta = txnToDelete.type === 'income'
                ? (parseInt(txnToDelete.quantity) || 1) // Sale deleted -> add back to stock
                : -(parseInt(txnToDelete.quantity) || 1); // Purchase deleted -> remove from stock

            adjustStock(txnToDelete.productId, delta);
        }

        // 3. Remove transaction from state
        setTransactions(prev => prev.filter(t => t.id !== id));
    }, [transactions, adjustStock]);

    // ── Clear All Transactions (Optional - for reset) ──
    const clearTransactions = useCallback(() => {
        setTransactions([]);
    }, []);

    // ── Load Categories from LocalStorage on mount ──
    const [l1Categories, setL1Categories] = useState(() => {
        try {
            const defaults = getLevel1Categories();
            const saved = localStorage.getItem('categories_l1');
            const parsed = saved ? JSON.parse(saved) : null;
            if (!parsed) return defaults;

            // Merge defaults into parsed: If a default cat exists in parsed but has no image, give it the default icon
            return parsed.map(c => {
                const name = typeof c === 'object' ? c?.name : c;
                const d = defaults.find(def => def.name === name);
                if (d && (!c.image)) return { ...c, image: d.image };
                return c;
            });
        } catch {
            return getLevel1Categories();
        }
    });

    const [l2Map, setL2Map] = useState(() => {
        try {
            const saved = localStorage.getItem('categories_l2');
            const parsed = saved ? JSON.parse(saved) : null;
            return parsed || {}; // Fallback to store defaults (handled by store helper)
        } catch {
            return {};
        }
    });

    // ── Auto-save Categories ──
    useEffect(() => {
        try {
            localStorage.setItem('categories_l1', JSON.stringify(l1Categories));
            localStorage.setItem('categories_l2', JSON.stringify(l2Map));
        } catch (e) {
            console.warn("Failed to save categories to LocalStorage:", e);
        }
    }, [l1Categories, l2Map]);

    // ── Category Stateful Helpers ──
    const getL1Categories = useCallback(() => l1Categories, [l1Categories]);

    const getL2Categories = useCallback((l1Name) => {
        if (!l1Name) return [];
        return l2Map[l1Name] || getLevel2Categories(l1Name);
    }, [l2Map]);

    const addL1Category = useCallback((name, image = null) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        setL1Categories(prev => {
            const existing = prev.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) return prev.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { name: trimmed, image } : c);
                return prev;
            }
            return [...prev, { name: trimmed, image }];
        });
    }, []);

    const addL2Category = useCallback((l1Name, name, image = null) => {
        const trimmed = name.trim();
        if (!trimmed || !l1Name) return;
        setL2Map(prev => {
            const currentList = prev[l1Name] || getLevel2Categories(l1Name);
            const existing = currentList.find(c => (typeof c === 'object' ? c?.name : c) === trimmed);
            if (existing) {
                if (image) {
                    const updatedList = currentList.map(c => (typeof c === 'object' ? c?.name : c) === trimmed ? { name: trimmed, image } : c);
                    return { ...prev, [l1Name]: updatedList };
                }
                return prev;
            }
            return { ...prev, [l1Name]: [...currentList, { name: trimmed, image }] };
        });
    }, []);

    const getCatImage = useCallback((l1, l2) => {
        // Try L2 state first
        if (l2 && l2Map[l1]) {
            const found = l2Map[l1].find(c => (typeof c === 'object' ? c?.name : c) === l2);
            if (found && typeof found === 'object' && found.image) return found.image;
        }
        // Then L1 state
        const foundL1 = l1Categories.find(c => (typeof c === 'object' ? c?.name : c) === l1);
        if (foundL1 && typeof foundL1 === 'object' && foundL1.image) return foundL1.image;
        return null;
    }, [l1Categories, l2Map]);

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
        getProducts,
        getAllProducts,
        searchProducts,
        getLowStockProducts,
        updateStock,
        adjustStock,
        sanitizeBarcode,
        getStockSeverity,
        updateProduct,
        // Category helpers (Stateful)
        getLevel1Categories: getL1Categories,
        getLevel2Categories,
        addLevel1Category: addL1Category,
        addLevel2Category: addL2Category,
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
