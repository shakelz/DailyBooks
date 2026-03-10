import { useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const TEXT_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];
const ORIGINAL_TEXT_BY_NODE = new WeakMap();

const GERMAN_TEXT_MAP = {
    'dashboard': 'Dashboard',
    'inventory': 'Lager',
    'repairs': 'Reparaturen',
    'expenses': 'Ausgaben',
    'add product': 'Produkt hinzufuegen',
    'product name': 'Produktname',
    'barcode / sku': 'Barcode / SKU',
    'scan barcode...': 'Barcode scannen...',
    'e.g. iphone 13 pro max': 'z. B. iPhone 13 Pro Max',
    'photo': 'Foto',
    'qty': 'Menge',
    'quantity': 'Menge',
    'red': 'Rot',
    'yel': 'Gelb',
    'purchase price': 'Einkaufspreis',
    'selling price': 'Verkaufspreis',
    'purchase from': 'Bezugsquelle',
    'payment mode': 'Zahlungsart',
    'payment method': 'Zahlungsart',
    'category': 'Kategorie',
    'sub category': 'Unterkategorie',
    'notes': 'Notizen',
    'save': 'Speichern',
    'cancel': 'Abbrechen',
    'close': 'Schliessen',
    'details': 'Details',
    'sell': 'Verkaufen',
    'print label': 'Etikett drucken',
    'save changes': 'Aenderungen speichern',
    'update': 'Aktualisieren',
    'mobile inventory': 'Handybestand',
    'other inventory': 'Sonstiger Bestand',
    'quick sales transaction': 'Schnellverkauf',
    'search mobile inventory...': 'Handybestand durchsuchen...',
    'search other inventory...': 'Sonstigen Bestand durchsuchen...',
    'search by name / barcode...': 'Nach Name / Barcode suchen...',
    'search repair invoice / customer / phone...': 'Nach Reparatur, Kunde oder Telefon suchen...',
    'search barcode / name': 'Barcode / Name suchen',
    'search': 'Suchen',
    'uncategorized': 'Ohne Kategorie',
    'no barcode': 'Kein Barcode',
    'stock': 'Bestand',
    'type': 'Typ',
    'salesman no': 'Verkaeufer-Nr.',
    'transaction details': 'Transaktionsdetails',
    'delete transaction': 'Transaktion loeschen',
    'toggle tax lines in printed bill': 'Steuerzeilen im Beleg umschalten',
    'save online order': 'Online-Bestellung speichern',
    'new online order': 'Neue Online-Bestellung',
    'platform': 'Plattform',
    'item name': 'Artikelname',
    'color': 'Farbe',
    'custom color': 'Sonderfarbe',
    'total cost': 'Gesamtkosten',
    'advance amount': 'Anzahlung',
    'order date': 'Bestelldatum',
    'expected delivery date': 'Voraussichtliches Lieferdatum',
    'payment status': 'Zahlungsstatus',
    'please fill all required fields highlighted in red.': 'Bitte fuellen Sie alle rot markierten Pflichtfelder aus.',
    'screen locked': 'Bildschirm gesperrt',
    'enter your pin to unlock': 'PIN zum Entsperren eingeben',
    'pin / password': 'PIN / Passwort',
    'incorrect pin': 'Falsche PIN',
    'unlock': 'Entsperren',
    'sale completed': 'Verkauf abgeschlossen',
    'product added successfully': 'Produkt erfolgreich hinzugefuegt',
    'failed to add product': 'Produkt konnte nicht hinzugefuegt werden',
    'please punch in first': 'Bitte zuerst einstempeln',
    'please fix form errors': 'Bitte korrigieren Sie die Formularfehler',
    'select a valid date': 'Bitte ein gueltiges Datum waehlen',
    'select payment mode': 'Bitte Zahlungsart waehlen',
    'select category': 'Bitte Kategorie waehlen',
    'qty must be at least 1': 'Menge muss mindestens 1 sein',
    'enter valid amount': 'Bitte einen gueltigen Betrag eingeben',
    'sales saved': 'Verkauf gespeichert',
    'expense saved': 'Ausgabe gespeichert',
    'transaction deleted (undo available)': 'Transaktion geloescht (Rueckgaengig moeglich)',
    'transaction restored': 'Transaktion wiederhergestellt',
    'failed to delete transaction': 'Transaktion konnte nicht geloescht werden',
    'failed to restore transaction': 'Transaktion konnte nicht wiederhergestellt werden',
    'transaction updated': 'Transaktion aktualisiert',
    'failed to update transaction': 'Transaktion konnte nicht aktualisiert werden',
    'failed to save product': 'Produkt konnte nicht gespeichert werden',
    'failed to save repair job': 'Reparaturauftrag konnte nicht gespeichert werden',
    'purchase transactions history': 'Einkaufsverlauf',
    'sales transactions history': 'Verkaufsverlauf',
    'income kpi breakdown': 'Einnahmen-KPI-Aufschluesselung',
    'revenue kpi breakdown': 'Umsatz-KPI-Aufschluesselung',
    'expense kpi breakdown': 'Ausgaben-KPI-Aufschluesselung',
    'expense/purchase': 'Ausgabe/Einkauf',
    'sales': 'Verkauf',
    'purchase': 'Einkauf',
    'revenue': 'Umsatz',
    'profit': 'Gewinn',
    'cash': 'Bar',
    'bank transfer': 'Bankueberweisung',
    'online orders': 'Online-Bestellungen',
    'today': 'Heute',
    'month': 'Monat',
    'week': 'Woche',
    'pending repairs': 'Offene Reparaturen',
    'pending orders': 'Offene Bestellungen',
    'search products...': 'Produkte suchen...',
    'search inventory...': 'Bestand durchsuchen...',
    'add at least one item to complete sale': 'Bitte mindestens einen Artikel zum Abschliessen des Verkaufs hinzufuegen',
    'product name and amount are required': 'Produktname und Betrag sind erforderlich',
    'save & print': 'Speichern & Drucken',
    'save & print receipt': 'Speichern & Drucken',
    'sumup': 'SumUp',
    'visa': 'Visa',
    'online': 'Online',
    'category manager': 'Kategorienverwaltung',
    'manage categories': 'Kategorien verwalten',
    'warranty': 'Garantie',
    'variant': 'Variante',
    'supplier url': 'Lieferanten-URL',
    'ram': 'RAM',
    'storage': 'Speicher',
    'battery health': 'Batteriezustand',
    'network type': 'Netztyp',
    'packaging condition': 'Verpackungszustand',
    'edit': 'Bearbeiten',
    'delete': 'Loeschen',
    'print': 'Drucken',
    'status': 'Status',
    'phone': 'Telefon',
    'customer name': 'Kundenname',
    'device model': 'Geraetemodell',
    'problem description': 'Fehlerbeschreibung',
};

const PATTERN_TRANSLATIONS = [
    {
        pattern: /\bAuto-lock\b/gi,
        replace: 'Automatische Sperre',
    },
];

function normalizeText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function getStoredAttributeName(attribute) {
    return `data-i18n-original-${attribute.replace(/[^a-z0-9]/gi, '-')}`;
}

function translateText(value = '', language = 'en') {
    const original = String(value || '');
    if (!original || language === 'en') return original;

    const exact = GERMAN_TEXT_MAP[normalizeText(original).toLowerCase()];
    if (exact) return exact;

    return PATTERN_TRANSLATIONS.reduce((next, entry) => (
        next.replace(entry.pattern, entry.replace)
    ), original);
}

function shouldSkipNode(node) {
    const parent = node?.parentElement;
    if (!parent) return true;
    const tagName = String(parent.tagName || '').toLowerCase();
    return tagName === 'script' || tagName === 'style' || tagName === 'noscript';
}

export function useTranslatedTextTree(rootRef) {
    const { language } = useLanguage();

    useEffect(() => {
        const root = rootRef?.current;
        if (!root || typeof MutationObserver === 'undefined') return undefined;

        let frameId = 0;

        const applyTranslations = () => {
            const activeRoot = rootRef?.current;
            if (!activeRoot) return;

            const treeWalker = document.createTreeWalker(activeRoot, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (treeWalker.nextNode()) {
                textNodes.push(treeWalker.currentNode);
            }

            textNodes.forEach((node) => {
                if (shouldSkipNode(node)) return;
                const currentText = node.textContent || '';
                if (!ORIGINAL_TEXT_BY_NODE.has(node)) {
                    ORIGINAL_TEXT_BY_NODE.set(node, currentText);
                }
                const storedOriginal = ORIGINAL_TEXT_BY_NODE.get(node) || '';
                const translatedStoredOriginal = translateText(storedOriginal, language);
                if (currentText !== storedOriginal && currentText !== translatedStoredOriginal) {
                    ORIGINAL_TEXT_BY_NODE.set(node, currentText);
                }
                const original = ORIGINAL_TEXT_BY_NODE.get(node) || currentText;
                if (!normalizeText(original)) return;
                const translated = translateText(original, language);
                if (node.textContent !== translated) {
                    node.textContent = translated;
                }
            });

            const elements = [activeRoot, ...activeRoot.querySelectorAll('*')];
            elements.forEach((element) => {
                TEXT_ATTRIBUTES.forEach((attribute) => {
                    const currentValue = element.getAttribute(attribute);
                    if (currentValue === null) return;
                    const storedAttribute = getStoredAttributeName(attribute);
                    if (!element.hasAttribute(storedAttribute)) {
                        element.setAttribute(storedAttribute, currentValue);
                    }
                    const storedOriginal = element.getAttribute(storedAttribute) || currentValue;
                    const translatedStoredOriginal = translateText(storedOriginal, language);
                    if (currentValue !== storedOriginal && currentValue !== translatedStoredOriginal) {
                        element.setAttribute(storedAttribute, currentValue);
                    }
                    const original = element.getAttribute(storedAttribute) || currentValue;
                    const translated = translateText(original, language);
                    if (element.getAttribute(attribute) !== translated) {
                        element.setAttribute(attribute, translated);
                    }
                });
            });
        };

        const scheduleApply = () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
            frameId = window.requestAnimationFrame(() => {
                frameId = 0;
                applyTranslations();
            });
        };

        applyTranslations();

        const observer = new MutationObserver(() => {
            scheduleApply();
        });

        observer.observe(root, {
            childList: true,
            characterData: true,
            subtree: true,
            attributes: true,
            attributeFilter: TEXT_ATTRIBUTES,
        });

        return () => {
            observer.disconnect();
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [language, rootRef]);
}
