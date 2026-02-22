/**
 * DailyBooks — Currency Configuration
 * Central point for managing currency symbols and formatting.
 */

export const CURRENCY_CONFIG = {
    symbol: '€',
    code: 'EUR',
    locale: 'de-DE', // German locale for Euro formatting (1.000,00 €)
};

/**
 * Global currency formatter
 * @param {number} amount 
 * @param {boolean} includeSymbol 
 * @returns {string}
 */
export const formatCurrency = (amount, includeSymbol = true) => {
    const val = parseFloat(amount) || 0;

    // Using Intl.NumberFormat for professional formatting
    const formatter = new Intl.NumberFormat(CURRENCY_CONFIG.locale, {
        style: includeSymbol ? 'currency' : 'decimal',
        currency: CURRENCY_CONFIG.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    return formatter.format(val);
};

// Shorthand with symbol
export const priceTag = (amount) => formatCurrency(amount, true);
