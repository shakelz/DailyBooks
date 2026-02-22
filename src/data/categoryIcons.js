/**
 * DailyBooks — Default Category Icons
 * High-quality SVG Data URLs for main categories.
 * Using Lucide-inspired minimalist styles.
 */

const createSvg = (path, bgColor) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${bgColor}"/><g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(4,4) scale(0.66)">${path}</g></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const DEFAULT_CATEGORY_ICONS = {
    'Mobile': createSvg('<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/>', '#2563eb'), // Blue 600
    'Accessories': createSvg('<path d="M3 18h18v-2a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2z"/><path d="M12 14V7"/><rect x="9" y="3" width="6" height="4" rx="1"/>', '#059669'), // Emerald 600
    'Repairs': createSvg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', '#d97706'), // Amber 600
    'Recharge': createSvg('<path d="M11 2v3"/><path d="m19 6.4-2.1 2.1"/><path d="M22 13h-3"/><path d="m19 19.6-2.1-2.1"/><path d="M11 24v-3"/><path d="m5 19.6 2.1-2.1"/><path d="M2 13h3"/><path d="m5 6.4 2.1 2.1"/><path d="M8 13a4 4 0 1 1 8 0 4 4 0 0 1-8 0z"/>', '#7c3aed'), // Violet 600
    'SIM Cards': createSvg('<path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v18z"/><path d="M14 2v6h6"/><path d="M8 10h4"/><path d="M8 14h8"/><path d="M8 18h8"/>', '#db2777'), // Pink 600
    'Tablets': createSvg('<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12" y2="18"/>', '#0891b2'), // Cyan 600
    'Laptops': createSvg('<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="20" x2="22" y2="20"/>', '#4b5563'), // Slate 600
    'Smart Watches': createSvg('<circle cx="12" cy="12" r="7"/><polyline points="12 9 12 12 13.5 13.5"/><path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.84a2 2 0 0 1-2-1.82l-.35-3.83"/><path d="M16.51 6.65l-.35-3.83a2 2 0 0 0-2-1.82H9.84a2 2 0 0 0-2 1.82l-.35 3.83"/>', '#ea580c'), // Orange 600
    'Shop Expenses': createSvg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0"/><path d="M2 9.5h20"/><path d="M12 15h0"/><path d="M17 15h0"/>', '#dc2626'), // Red 600
};
