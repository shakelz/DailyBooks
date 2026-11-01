import { supabase } from '../supabaseClient';

const DEFAULT_SHOP_TEMPLATE_CATEGORIES = [
    // ── SALES CATEGORIES ──
    {
        name: 'Handy',
        scope: 'sales',
        level: 1,
        subCategories: ['Apple', 'Samsung', 'Xiaomi', 'Google Pixel', 'Sonstige Handys']
    },
    {
        name: 'Zubehör',
        scope: 'sales',
        level: 1,
        subCategories: ['Schutzhüllen', 'Ladekabel & Adapter', 'Kopfhörer & Audio', 'Powerbanks', 'Halterungen']
    },
    {
        name: 'Panzerglas',
        scope: 'sales',
        level: 1,
        subCategories: ['iPhone Panzerglas', 'Samsung Panzerglas', 'Universal Panzerglas']
    },
    {
        name: 'Reparatur',
        scope: 'sales',
        level: 1,
        subCategories: ['Display-Reparatur', 'Akku-Tausch', 'Ladebuchse', 'Kamera & Glas', 'Software & Entsperren']
    },
    {
        name: 'Guthaben & SIM',
        scope: 'sales',
        level: 1,
        subCategories: ['Prepaid-Karten', 'Guthaben-Aufladung', 'Mobilfunkverträge']
    },
    {
        name: 'Sonstiges',
        scope: 'sales',
        level: 1,
        subCategories: ['Dienstleistungen', 'Gebrauchtgeräte', 'Verschiedenes']
    },

    // ── EXPENSE CATEGORIES ──
    {
        name: 'Wareneinkauf',
        scope: 'expense',
        level: 1,
        subCategories: ['Geräte-Einkauf', 'Ersatzteile & Displays', 'Zubehör-Einkauf']
    },
    {
        name: 'Miete & Nebenkosten',
        scope: 'expense',
        level: 1,
        subCategories: ['Ladenmiete', 'Strom & Heizung', 'Internet & Festnetz']
    },
    {
        name: 'Gehalt & Löhne',
        scope: 'expense',
        level: 1,
        subCategories: ['Mitarbeitergehalt', 'Aushilfen', 'Prämien']
    },
    {
        name: 'Ladenbedarf & Werkzeug',
        scope: 'expense',
        level: 1,
        subCategories: ['Reparaturwerkzeuge', 'Verpackung & Tüten', 'Büromaterial']
    },
    {
        name: 'Steuer & Gebühren',
        scope: 'expense',
        level: 1,
        subCategories: ['Kartenterminal-Gebühren', 'Steuerberater', 'Bankgebühren']
    },
    {
        name: 'Sonstige Ausgaben',
        scope: 'expense',
        level: 1,
        subCategories: ['Werbung & Marketing', 'Versicherungen', 'Verschiedenes']
    }
];

/**
 * Ensures a newly created or existing shop inherits all categories,
 * Excluded Categories rules, and dashboard settings from an existing shop.
 */
export async function seedOrCloneShopCategoriesAndFeatures(targetShopId, preferredSourceShopId = null) {
    const targetSid = String(targetShopId || '').trim();
    if (!targetSid) return { success: false, reason: 'Missing targetShopId' };

    try {
        // Step 1: Check if target shop already has categories
        const { data: existingCategories } = await supabase
            .from('categories')
            .select('category_id, id')
            .eq('shop_id', targetSid)
            .limit(5);

        if (Array.isArray(existingCategories) && existingCategories.length > 0) {
            return { success: true, alreadyInitialized: true, count: existingCategories.length };
        }

        // Step 2: Determine best source shop to clone from
        let sourceSid = String(preferredSourceShopId || '').trim();
        if (!sourceSid || sourceSid === targetSid) {
            const { data: sampleCategories } = await supabase
                .from('categories')
                .select('shop_id')
                .neq('shop_id', targetSid)
                .limit(200);

            if (Array.isArray(sampleCategories) && sampleCategories.length > 0) {
                const countByShop = {};
                sampleCategories.forEach((row) => {
                    const sid = String(row?.shop_id || '').trim();
                    if (sid && sid !== targetSid) {
                        countByShop[sid] = (countByShop[sid] || 0) + 1;
                    }
                });
                const sorted = Object.entries(countByShop).sort((a, b) => b[1] - a[1]);
                if (sorted.length > 0) {
                    sourceSid = sorted[0][0];
                }
            }
        }

        let clonedCount = 0;

        // Step 3: Clone from source shop if available
        if (sourceSid && sourceSid !== targetSid) {
            const { data: sourceRows, error: srcError } = await supabase
                .from('categories')
                .select('*')
                .eq('shop_id', sourceSid);

            if (!srcError && Array.isArray(sourceRows) && sourceRows.length > 0) {
                // Separate L1 and L2
                const l1Rows = sourceRows.filter((r) => {
                    const hasParent = Boolean(r?.parent_category_id || r?.parent_id || r?.parent);
                    const lvl = Number(r?.level || 1);
                    return lvl === 1 || !hasParent;
                });

                const l2Rows = sourceRows.filter((r) => {
                    const hasParent = Boolean(r?.parent_category_id || r?.parent_id || r?.parent);
                    const lvl = Number(r?.level || 1);
                    return lvl === 2 || hasParent;
                });

                const oldToNewParentMap = new Map();
                const parentNameToNewIdMap = new Map();

                // Insert L1 categories
                for (const l1 of l1Rows) {
                    const catName = String(l1?.category_name || l1?.name || '').trim();
                    if (!catName) continue;
                    const scope = String(l1?.category_purpose || l1?.scope || 'sales').trim().toLowerCase();
                    const isHidden = Boolean(l1?.is_hidden || l1?.isHidden);

                    const { data: insertedL1 } = await supabase
                        .from('categories')
                        .insert([{
                            shop_id: targetSid,
                            category_name: catName,
                            category_purpose: scope,
                            level: 1,
                            is_hidden: isHidden,
                            parent_category_id: null,
                        }])
                        .select('category_id, id')
                        .maybeSingle();

                    const newL1Id = String(insertedL1?.category_id || insertedL1?.id || '');
                    const oldL1Id = String(l1?.category_id || l1?.id || '');
                    if (oldL1Id && newL1Id) {
                        oldToNewParentMap.set(oldL1Id, newL1Id);
                    }
                    if (catName && newL1Id) {
                        parentNameToNewIdMap.set(`${scope}|${catName.toLowerCase()}`, newL1Id);
                    }
                    clonedCount += 1;
                }

                // Insert L2 categories
                for (const l2 of l2Rows) {
                    const subName = String(l2?.category_name || l2?.name || '').trim();
                    if (!subName) continue;
                    const scope = String(l2?.category_purpose || l2?.scope || 'sales').trim().toLowerCase();
                    const isHidden = Boolean(l2?.is_hidden || l2?.isHidden);
                    const oldParentId = String(l2?.parent_category_id || l2?.parent_id || '');
                    const parentName = String(l2?.parent || '').trim().toLowerCase();

                    const resolvedParentId = oldToNewParentMap.get(oldParentId)
                        || parentNameToNewIdMap.get(`${scope}|${parentName}`)
                        || null;

                    await supabase
                        .from('categories')
                        .insert([{
                            shop_id: targetSid,
                            category_name: subName,
                            category_purpose: scope,
                            level: 2,
                            is_hidden: isHidden,
                            parent_category_id: resolvedParentId,
                        }]);
                    clonedCount += 1;
                }

                // Clone Excluded Categories (kpi_profit_category_settings)
                try {
                    const { data: srcKpi } = await supabase
                        .from('kpi_profit_category_settings')
                        .select('*')
                        .eq('shop_id', sourceSid);

                    if (Array.isArray(srcKpi) && srcKpi.length > 0) {
                        const now = new Date().toISOString();
                        const newKpiRows = srcKpi.map((row) => ({
                            shop_id: targetSid,
                            kpi_scope: row?.kpi_scope || 'sales',
                            category_name: row?.category_name,
                            sub_category_name: row?.sub_category_name || 'EMPTY',
                            contribution_mode: row?.contribution_mode || (row?.kpi_scope === 'expense' ? 'excluded' : 'sales'),
                            created_at: now,
                            updated_at: now,
                        }));
                        await supabase.from('kpi_profit_category_settings').insert(newKpiRows);
                    }
                } catch (_) {
                    // KPI settings table might be optional
                }

                // Duplicate local cache/storage maps for immediate offline access
                try {
                    const srcHidden = localStorage.getItem(`dailybooks_category_hidden_${sourceSid}`);
                    if (srcHidden) localStorage.setItem(`dailybooks_category_hidden_${targetSid}`, srcHidden);
                    const srcScope = localStorage.getItem(`dailybooks_category_scope_${sourceSid}`);
                    if (srcScope) localStorage.setItem(`dailybooks_category_scope_${targetSid}`, srcScope);
                } catch (_) {}

                return { success: true, clonedFrom: sourceSid, count: clonedCount };
            }
        }

        // Step 4: Fallback to complete standard template categories if no source shop found
        for (const template of DEFAULT_SHOP_TEMPLATE_CATEGORIES) {
            const { data: insertedL1 } = await supabase
                .from('categories')
                .insert([{
                    shop_id: targetSid,
                    category_name: template.name,
                    category_purpose: template.scope,
                    level: 1,
                    is_hidden: false,
                    parent_category_id: null,
                }])
                .select('category_id, id')
                .maybeSingle();

            const parentId = String(insertedL1?.category_id || insertedL1?.id || '');
            clonedCount += 1;

            if (Array.isArray(template.subCategories)) {
                for (const sub of template.subCategories) {
                    await supabase
                        .from('categories')
                        .insert([{
                            shop_id: targetSid,
                            category_name: sub,
                            category_purpose: template.scope,
                            level: 2,
                            is_hidden: false,
                            parent_category_id: parentId || null,
                        }]);
                    clonedCount += 1;
                }
            }

            // Also seed default Excluded Categories KPI mode
            try {
                const defaultMode = template.scope === 'expense' ? 'excluded' : 'sales';
                await supabase.from('kpi_profit_category_settings').insert([{
                    shop_id: targetSid,
                    kpi_scope: template.scope,
                    category_name: template.name.toLowerCase(),
                    sub_category_name: 'EMPTY',
                    contribution_mode: defaultMode,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }]);
            } catch (_) {}
        }

        return { success: true, seededDefaultTemplate: true, count: clonedCount };
    } catch (err) {
        console.warn('seedOrCloneShopCategoriesAndFeatures encountered error:', err);
        return { success: false, error: err };
    }
}
