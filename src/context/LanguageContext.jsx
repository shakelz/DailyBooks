import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const LANGUAGE_STORAGE_KEY = 'dailybooks_language_v1';
const SUPPORTED_LANGUAGES = new Set(['en', 'de']);

const DICTIONARY = {
    en: {
        'profile.fallbackName': 'Salesman',
        'profile.roleSubtitle': 'Sales Executive • DailyBooks',
        'profile.punchedInAt': 'Punched In at',
        'profile.currentlyOffline': 'Currently Offline',
        'profile.punchIn': 'Punch IN',
        'profile.punchOut': 'Punch OUT',
        'profile.switchUser': 'Switch User',
        'profile.newDashboard': 'New Dashboard',
        'profile.oldDashboard': 'Old Dashboard',
        'profile.logout': 'Logout',
        'profile.closeMenu': 'Close Menu',
        'profile.photoUpload': 'Upload Photo',
        'profile.photoUpdate': 'Update Photo',
        'profile.photoUploading': 'Updating photo...',
        'profile.photoUpdated': 'Profile photo updated.',
        'profile.photoTypeError': 'Please choose an image file.',
        'profile.photoSizeError': 'Please choose an image smaller than 5 MB.',
        'profile.photoSaveError': 'Failed to update profile photo.',
        'profile.language': 'Translate Dashboard',
        'profile.languageHint': 'Switch dashboard labels between English and German.',
        'profile.english': 'English',
        'profile.german': 'Deutsch',
        'profile.punchOutBeforeLogout': 'Please Punch OUT before logout.',
        'profile.punchOutBeforeSwitch': 'Please Punch OUT before switching user.',

        'repair.title': 'New Repair Job',
        'repair.subtitle': 'Fill in repair details below',
        'repair.customerName': 'Customer Name *',
        'repair.phone': 'Phone *',
        'repair.deviceModel': 'Device Model *',
        'repair.imeiOptional': 'IMEI (optional)',
        'repair.problemDescription': 'Problem Description *',
        'repair.problemPlaceholder': 'Describe the issue... e.g. Screen broken, battery replacement, water damage...',
        'repair.advance': 'Advance (EUR)',
        'repair.totalCost': 'Total Cost (EUR)',
        'repair.expectedDelivery': 'Expected Delivery',
        'repair.savePrint': 'Save & Print',
        'repair.customerNameRequired': 'Customer name is required',
        'repair.phoneRequired': 'Phone is required',
        'repair.deviceModelRequired': 'Device model is required',
        'repair.problemRequired': 'Problem description is required',
        'repair.invalidSaveResponse': 'Repair job save response is invalid.',
        'repair.savedInvoice': 'Repair saved successfully. Invoice Number:',
        'repair.saveFailed': 'Failed to save repair job.',
        'repair.popupBlocked': 'Popup blocked. Please allow popups to print.',
        'repair.receiptTotalCost': 'Total Cost:',
    },
    de: {
        'profile.fallbackName': 'Verkaeufer',
        'profile.roleSubtitle': 'Verkauf • DailyBooks',
        'profile.punchedInAt': 'Eingestempelt um',
        'profile.currentlyOffline': 'Aktuell offline',
        'profile.punchIn': 'Einstempeln',
        'profile.punchOut': 'Ausstempeln',
        'profile.switchUser': 'Benutzer wechseln',
        'profile.newDashboard': 'Neues Dashboard',
        'profile.oldDashboard': 'Altes Dashboard',
        'profile.logout': 'Abmelden',
        'profile.closeMenu': 'Menue schliessen',
        'profile.photoUpload': 'Foto hochladen',
        'profile.photoUpdate': 'Foto aktualisieren',
        'profile.photoUploading': 'Foto wird aktualisiert...',
        'profile.photoUpdated': 'Profilfoto wurde aktualisiert.',
        'profile.photoTypeError': 'Bitte waehlen Sie eine Bilddatei aus.',
        'profile.photoSizeError': 'Bitte waehlen Sie ein Bild kleiner als 5 MB aus.',
        'profile.photoSaveError': 'Profilfoto konnte nicht aktualisiert werden.',
        'profile.language': 'Dashboard uebersetzen',
        'profile.languageHint': 'Schalten Sie Dashboard-Texte zwischen Englisch und Deutsch um.',
        'profile.english': 'English',
        'profile.german': 'Deutsch',
        'profile.punchOutBeforeLogout': 'Bitte zuerst ausstempeln, bevor Sie sich abmelden.',
        'profile.punchOutBeforeSwitch': 'Bitte zuerst ausstempeln, bevor Sie den Benutzer wechseln.',

        'repair.title': 'Neuer Reparaturauftrag',
        'repair.subtitle': 'Reparaturdaten unten eintragen',
        'repair.customerName': 'Kundenname *',
        'repair.phone': 'Telefon *',
        'repair.deviceModel': 'Geraetemodell *',
        'repair.imeiOptional': 'IMEI (optional)',
        'repair.problemDescription': 'Fehlerbeschreibung *',
        'repair.problemPlaceholder': 'Beschreiben Sie das Problem... z. B. Display kaputt, Akkuwechsel, Wasserschaden...',
        'repair.advance': 'Anzahlung (EUR)',
        'repair.totalCost': 'Gesamtkosten (EUR)',
        'repair.expectedDelivery': 'Voraussichtliche Abholung',
        'repair.savePrint': 'Speichern & Drucken',
        'repair.customerNameRequired': 'Kundenname ist erforderlich',
        'repair.phoneRequired': 'Telefon ist erforderlich',
        'repair.deviceModelRequired': 'Geraetemodell ist erforderlich',
        'repair.problemRequired': 'Fehlerbeschreibung ist erforderlich',
        'repair.invalidSaveResponse': 'Antwort zum Speichern des Reparaturauftrags ist ungueltig.',
        'repair.savedInvoice': 'Reparatur erfolgreich gespeichert. Rechnungsnummer:',
        'repair.saveFailed': 'Reparaturauftrag konnte nicht gespeichert werden.',
        'repair.popupBlocked': 'Popup blockiert. Bitte Popups zum Drucken erlauben.',
        'repair.receiptTotalCost': 'Gesamtkosten:',
    },
};

const LanguageContext = createContext(null);

function normalizeLanguage(value = '') {
    const next = String(value || '').trim().toLowerCase();
    return SUPPORTED_LANGUAGES.has(next) ? next : 'en';
}

export function LanguageProvider({ children }) {
    const [language, setLanguageState] = useState(() => {
        if (typeof window === 'undefined') return 'en';
        return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
        document.documentElement.lang = language;
    }, [language]);

    const setLanguage = (nextLanguage) => {
        setLanguageState(normalizeLanguage(nextLanguage));
    };

    const value = useMemo(() => ({
        language,
        setLanguage,
        t(key, fallback = '') {
            return DICTIONARY[language]?.[key] || DICTIONARY.en[key] || fallback || key;
        },
    }), [language]);

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within LanguageProvider');
    }
    return context;
}
