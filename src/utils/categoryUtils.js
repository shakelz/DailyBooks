// ══════════════════════════════════════════════════════════
// DailyBooks — Category & Mobile Phone Detection Utilities
// ══════════════════════════════════════════════════════════

export const NON_PHONE_KEYWORDS = [
    'display', 'screen', 'oled', 'lcd', 'incell',
    'zubeh', 'access', 'ersatz', 'spare', 'teil', 'part',
    'reparatur', 'repair', 'dienst', 'service',
    'hülle', 'case', 'cover', 'tasche',
    'glas', 'glass', 'folie', 'panzer',
    'kabel', 'cable', 'charger', 'lade', 'adapter',
    'akku', 'battery',
    'audio', 'kopfhörer', 'headphone', 'earphone', 'airpod', 'buds',
    'watch', 'uhr', 'band', 'strap',
    'tablet', 'ipad', 'laptop', 'macbook', 'pc', 'computer'
];

/**
 * Checks whether the given Level 1 (main) category name represents a Handy/Mobile phone.
 * Strict check: Main category must explicitly denote phones/smartphones and not accessories/parts.
 * 
 * @param {string} categoryName - Name of the level 1 category
 * @returns {boolean}
 */
export function isHandyMainCategory(categoryName) {
    const name = String(categoryName || '').trim().toLowerCase();
    if (!name) return false;

    // Reject non-phone main categories (Display, Zubehör, Ersatzteile, etc.)
    if (NON_PHONE_KEYWORDS.some(kw => name.includes(kw))) {
        return false;
    }

    // Must match phone / smartphone / mobile keywords
    return /^(handy|handys|smartphone|smartphones|mobile|mobiles|phone|phones|telefon)$/i.test(name)
        || /handy|smartphone|mobile|phone|telefon/i.test(name);
}

/**
 * Checks whether a full product object or snapshot represents a real mobile phone (Handy),
 * distinguishing phones from spare parts (displays), accessories, or repairs.
 * 
 * @param {object} product - Product record or snapshot
 * @returns {boolean}
 */
export function isHandyProduct(product) {
    if (!product) return false;

    // Extract category levels and text
    const categoryObj = typeof product.category === 'object' && product.category !== null ? product.category : {};
    const l1 = String(categoryObj.level1 || product.category || '').trim();
    const l2 = String(categoryObj.level2 || product.sub_category || product.subCategory || '').trim();
    const name = String(product.name || '').trim();
    const attrs = product.attributes || {};

    // 1. If Level 1 category is explicitly a Handy main category
    if (isHandyMainCategory(l1)) {
        return true;
    }

    // 2. If it has explicit phone attributes and is not an accessory or display
    const hasPhoneAttrs = Boolean(attrs.phoneCondition || attrs.isKeyboardPhone || attrs.noImeiRequired);
    const combinedText = `${l1} ${l2} ${name}`.toLowerCase();
    const isNonPhone = NON_PHONE_KEYWORDS.some(kw => combinedText.includes(kw));

    if (hasPhoneAttrs && !isNonPhone) {
        return true;
    }

    // 3. If category is undefined/general but IMEI is set and not a display/accessory
    if ((product.imei || attrs.imei) && !isNonPhone) {
        return true;
    }

    return false;
}
