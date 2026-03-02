import { createContext, useContext, useState, useCallback } from 'react';

// ══════════════════════════════════════════════════════════
// DailyBooks — Cart Context (Multi-Item Billing)
// In-memory cart state, supports add/edit/remove/clear
// ══════════════════════════════════════════════════════════

const CartContext = createContext(null);

export function CartProvider({ children }) {
    const [cart, setCart] = useState([]);

    const [editingCartItem, setEditingCartItem] = useState(null); // cartItemId or null

    const addToCart = useCallback((item) => {
        const cartItem = {
            ...item,
            cartItemId: Date.now() + Math.random(), // unique ID
        };
        setCart(prev => [...prev, cartItem]);
        return cartItem;
    }, []);

    const updateCartItem = useCallback((cartItemId, updates) => {
        setCart(prev => prev.map(item =>
            item.cartItemId === cartItemId ? { ...item, ...updates } : item
        ));
    }, []);

    const removeFromCart = useCallback((cartItemId) => {
        setCart(prev => prev.filter(item => item.cartItemId !== cartItemId));
    }, []);

    const clearCart = useCallback(() => {
        setCart([]);
        setEditingCartItem(null);
    }, []);

    // Cart totals
    const cartTotal = cart.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    const cartNetTotal = cartTotal / 1.19;
    const cartTaxTotal = cartTotal - cartNetTotal;

    const value = {
        cart,
        cartTotal,
        cartNetTotal,
        cartTaxTotal,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        editingCartItem,
        setEditingCartItem,
    };

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (!context) throw new Error('useCart must be used within CartProvider');
    return context;
}
