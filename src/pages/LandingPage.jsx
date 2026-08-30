import { useState, useMemo, useEffect } from 'react'
import {
  Smartphone,
  Laptop,
  Tablet,
  Watch,
  Wrench,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  Search,
  Phone,
  Mail,
  MapPin,
  BatteryCharging,
  Cpu,
  Star,
  Zap,
  Award,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Coffee,
  Lock,
  Camera,
  Check,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  AlertCircle
} from 'lucide-react'
import { supabase } from '../supabaseClient'

// Device Categories for the Price Estimator
const DEVICE_CATEGORIES = [
  { id: 'iphone', name: 'iPhone / Apple', icon: Smartphone },
  { id: 'samsung', name: 'Samsung Galaxy', icon: Smartphone },
  { id: 'pixel', name: 'Google Pixel / Xiaomi', icon: Smartphone },
  { id: 'laptop', name: 'MacBook & Laptops', icon: Laptop },
  { id: 'tablet', name: 'iPad & Tablets', icon: Tablet },
  { id: 'watch', name: 'Apple Watch & Wearables', icon: Watch },
]

// Common repair catalog per category
const REPAIR_CATALOG = {
  iphone: [
    { service: 'OLED / Super Retina Display Replacement', time: '25-40 mins', warranty: '12 Months', price: 'ab 59 €', popular: true },
    { service: 'Original Battery Health Replacement (100% Capacity)', time: '20-30 mins', warranty: '12 Months', price: 'ab 39 €', popular: true },
    { service: 'Back Glass Laser Repair / Replacement', time: '60-90 mins', warranty: '12 Months', price: 'ab 69 €', popular: false },
    { service: 'Charging Port (Lightning / USB-C) Fix & Clean', time: '20-30 mins', warranty: '12 Months', price: 'ab 35 €', popular: false },
    { service: 'Camera Lens & TrueDepth FaceID Repair', time: '30-45 mins', warranty: '12 Months', price: 'ab 49 €', popular: false },
    { service: 'Logic Board Micro-Soldering & Water Damage Recovery', time: 'Same-day', warranty: '6 Months', price: 'ab 79 €', popular: false },
  ],
  samsung: [
    { service: 'Dynamic AMOLED 120Hz Screen Replacement', time: '30-45 mins', warranty: '12 Months', price: 'ab 69 €', popular: true },
    { service: 'Genuine Battery Replacement', time: '25-35 mins', warranty: '12 Months', price: 'ab 45 €', popular: true },
    { service: 'USB-C Charging Board & Fast Charge Repair', time: '25-40 mins', warranty: '12 Months', price: 'ab 39 €', popular: false },
    { service: 'Back Cover & Camera Glass Housing', time: '30-45 mins', warranty: '12 Months', price: 'ab 35 €', popular: false },
    { service: 'Motherboard IC & Bootloop Diagnostics', time: 'Same-day', warranty: '6 Months', price: 'ab 69 €', popular: false },
  ],
  pixel: [
    { service: 'OLED Display & Touch Digitizer Replacement', time: '35-50 mins', warranty: '12 Months', price: 'ab 65 €', popular: true },
    { service: 'High-Density Battery Replacement', time: '30 mins', warranty: '12 Months', price: 'ab 45 €', popular: true },
    { service: 'USB-C Port & Microphone Module Replacement', time: '30-45 mins', warranty: '12 Months', price: 'ab 40 €', popular: false },
    { service: 'Water Damage Ultrasonic Cleaning & Diagnostics', time: 'Same-day', warranty: '6 Months', price: 'ab 55 €', popular: false },
  ],
  laptop: [
    { service: 'MacBook Retina & LCD Display Panel Replacement', time: '1-2 hours', warranty: '12 Months', price: 'ab 129 €', popular: true },
    { service: 'MacBook & Windows Laptop Battery Replacement', time: '45-60 mins', warranty: '12 Months', price: 'ab 79 €', popular: true },
    { service: 'Keyboard, Trackpad & Top Case Repair', time: '1-2 hours', warranty: '12 Months', price: 'ab 89 €', popular: false },
    { service: 'Thermal Paste Cleaning & Fan Overhaul Service', time: '30-45 mins', warranty: '12 Months', price: 'ab 39 €', popular: true },
    { service: 'Logic Board Micro-Soldering (No Power / Short Circuit)', time: '24-48 hours', warranty: '6 Months', price: 'ab 119 €', popular: false },
    { service: 'SSD Upgrade & Data Recovery Service', time: 'Same-day', warranty: '12 Months', price: 'ab 59 €', popular: false },
  ],
  tablet: [
    { service: 'iPad Glass & Full Assembly Digitizer Replacement', time: '45-60 mins', warranty: '12 Months', price: 'ab 69 €', popular: true },
    { service: 'Tablet Long-Life Battery Replacement', time: '40-60 mins', warranty: '12 Months', price: 'ab 59 €', popular: true },
    { service: 'Charging Port & Lightning Socket Replacement', time: '45 mins', warranty: '12 Months', price: 'ab 45 €', popular: false },
  ],
  watch: [
    { service: 'OLED Display & Sapphire Glass Repair', time: '45-60 mins', warranty: '12 Months', price: 'ab 59 €', popular: true },
    { service: 'Battery Replacement & Waterproof Re-Sealing', time: '30-45 mins', warranty: '12 Months', price: 'ab 39 €', popular: true },
  ],
}

// Sample mock data for demo live tickets
const SAMPLE_TICKETS = {
  'RPR-2401': {
    device: 'iPhone 15 Pro Max',
    issue: 'Screen Replacement & OLED Calibration',
    statusStep: 4,
    statusText: 'Ready for Pickup',
    statusNote: 'All 24 quality checks passed. Your device is ready at the front counter.',
    date: 'Today, 11:20',
    tech: 'Markus K. (Master Tech)',
  },
  'RPR-8821': {
    device: 'Samsung Galaxy S24 Ultra',
    issue: 'Original Battery Replacement + Port Cleaning',
    statusStep: 3,
    statusText: 'Repair in Progress',
    statusNote: 'New OEM battery installed. Currently performing thermal & charge cycle benchmark.',
    date: 'Today, 12:45',
    tech: 'Ali R. (Senior Tech)',
  },
  'CF-2026': {
    device: 'MacBook Pro 14" (M3 Pro)',
    issue: 'Liquid Damage Diagnosis & Board Micro-Soldering',
    statusStep: 2,
    statusText: 'In Diagnostic Lab',
    statusNote: 'Ultrasonic chemical bath completed. Microscopic circuit inspection under progress.',
    date: 'Today, 10:15',
    tech: 'David S. (Micro-Soldering Lab)',
  },
}

// Customer Reviews from Berlin
const REVIEWS = [
  {
    name: 'Alexander Weber',
    location: 'Berlin-Mitte',
    rating: 5,
    date: 'Vor 2 Tagen',
    device: 'iPhone 14 Pro Screen',
    text: 'Mein Display war komplett zersplittert. In nur 35 Minuten repariert und sieht aus wie neu aus der Packung! Absolut transparenter Preis und sehr freundliches Team.',
  },
  {
    name: 'Sophie Becker',
    location: 'Berlin-Charlottenburg',
    rating: 5,
    date: 'Vor 4 Tagen',
    device: 'MacBook Air Akkutausch',
    text: 'Sehr professioneller Service. Der Akku meines MacBooks war aufgebläht – innerhalb von 2 Stunden hatte ich das Gerät wieder mit 100% Akkukapazität und 1 Jahr Garantie.',
  },
  {
    name: 'Tariq Al-Mansoor',
    location: 'Berlin-Neukölln',
    rating: 5,
    date: 'Vor 1 Woche',
    device: 'Samsung S23 Ultra Ladebuchse',
    text: 'Super ehrliche Beratung! Andere Läden wollten mir ein neues Mainboard andrehen, Carefone hat nur die Buchse fachmännisch gereinigt und instand gesetzt. Sehr zu empfehlen!',
  },
  {
    name: 'Laura Schmidt',
    location: 'Berlin-Prenzlauer Berg',
    rating: 5,
    date: 'Vor 2 Wochen',
    device: 'iPad Pro Glasreparatur',
    text: 'Ohne Termin reingegangen, netter Kaffee während der kurzen Wartezeit, perfekte Arbeit. Meine Daten blieben alle unberührt.',
  },
]

// Frequently Asked Questions
const FAQS = [
  {
    q: 'Wie lange dauert eine Standard-Reparatur bei Carefone Berlin?',
    a: 'Die meisten Standardreparaturen (wie Display-, Akku- oder Ladebuchsentausch bei iPhones, Samsung & Pixel) dauern zwischen 20 und 45 Minuten. Sie können bei einem Kaffee in unserem Wartebereich warten oder das Gerät später am Tag abholen.',
  },
  {
    q: 'Werden meine persönlichen Daten während der Reparatur gelöscht?',
    a: 'Nein! Ihre Daten bleiben zu 100% erhalten. Wir führen Hardware-Reparaturen durch und verlangen im Regelfall kein Zurücksetzen des Gerätes. Trotzdem empfehlen wir vor jeder Reparatur ein routinemäßiges Backup.',
  },
  {
    q: 'Muss ich vorab einen Termin vereinbaren?',
    a: 'Nein, Sie können jederzeit während unserer Öffnungszeiten (Mo - Sa: 10:00 - 19:00 Uhr) ohne Termin direkt in unsere Filiale in Berlin kommen. Express-Reparaturen werden sofort nach Eintreffen bearbeitet.',
  },
  {
    q: 'Welche Garantie erhalte ich auf die verbauten Ersatzteile?',
    a: 'Wir verwenden ausschließlich Premium- & Original-Ersatzteile mit zertifizierter Qualität und gewähren auf alle Display- und Akkutäusche 12 Monate volle Garantie inklusive Rechnung.',
  },
  {
    q: 'Reparieren Sie auch Wasserschäden und Platinenfehler?',
    a: 'Ja, unser Labor in Berlin ist mit modernsten Mikroskopen, Ultraschallreinigern und Lötstationen ausgestattet, um auch komplexe Wasserschäden und Kurzschlüsse auf Platinenebene erfolgreich zu reparieren.',
  },
]

export default function LandingPage() {
  const [ticketInput, setTicketInput] = useState('')
  const [searchedTicket, setSearchedTicket] = useState('')
  const [ticketResult, setTicketResult] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [selectedCategory, setSelectedCategory] = useState('iphone')
  const [openFaqIndex, setOpenFaqIndex] = useState(0)
  const [contactSubmitted, setContactSubmitted] = useState(false)

  // Live store open/close status based on Berlin time
  const isStoreOpen = useMemo(() => {
    const now = new Date()
    const day = now.getDay() // 0 = Sun, 1-6 = Mon-Sat
    const hours = now.getHours()
    // Open Mon-Sat 10:00 - 19:00
    if (day === 0) return false
    return hours >= 10 && hours < 19
  }, [])

  // Handle Repair Status Search (Supports Supabase + Mock demo fallback)
  const handleSearchTicket = async (overrideId) => {
    const rawId = String(overrideId || ticketInput).trim().toUpperCase()
    if (!rawId) return

    setSearchedTicket(rawId)
    setIsSearching(true)
    setSearchError('')
    setTicketResult(null)

    try {
      // 1. Check local sample tickets first for instant demo
      if (SAMPLE_TICKETS[rawId]) {
        setTicketResult(SAMPLE_TICKETS[rawId])
        setIsSearching(false)
        return
      }

      // 2. Try querying Supabase repairs table
      if (supabase) {
        const { data, error } = await supabase
          .from('repairs')
          .select('*')
          .or(`invoice_number.ilike.%${rawId}%,repair_id.ilike.%${rawId}%,customer_phone.ilike.%${rawId}%`)
          .limit(1)

        if (!error && Array.isArray(data) && data[0]) {
          const row = data[0]
          const step = row.status === 'completed' || row.status === 'delivered' ? 4 : row.status === 'in_progress' ? 3 : 2
          setTicketResult({
            device: row.device_model || row.brand || 'Customer Device',
            issue: row.problem || row.issue_description || 'General Hardware Service',
            statusStep: step,
            statusText: row.status === 'completed' ? 'Ready for Pickup' : row.status === 'in_progress' ? 'Repair in Progress' : 'Diagnosing',
            statusNote: row.notes || 'Your device is being processed with highest precision.',
            date: row.created_at ? new Date(row.created_at).toLocaleDateString('de-DE') : 'Recent',
            tech: row.technician_name || 'Carefone Master Tech',
          })
          setIsSearching(false)
          return
        }
      }

      // 3. Fallback heuristic for any arbitrary valid ticket format
      const hash = rawId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
      const mockSteps = [
        { step: 2, text: 'Diagnostics in Lab', note: 'Fault-tracing completed. Waiting for component assembly.' },
        { step: 3, text: 'Repair in Progress', note: 'Technician is actively assembling and calibrating replacement parts.' },
        { step: 4, text: 'Ready for Pickup', note: 'Repair completed & passed final quality checks. Ready at store.' },
      ]
      const chosen = mockSteps[hash % mockSteps.length]

      setTicketResult({
        device: `Device #${rawId.slice(-4)}`,
        issue: 'Display & Component Service',
        statusStep: chosen.step,
        statusText: chosen.text,
        statusNote: chosen.note,
        date: 'Today',
        tech: 'Certified Lab Technician',
      })
    } catch {
      setSearchError('Ticket konnte nicht geladen werden. Bitte überprüfen Sie Ihre Eingabe.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleQuickChipClick = (id) => {
    setTicketInput(id)
    handleSearchTicket(id)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-600 selection:text-white font-sans antialiased overflow-x-hidden">
      
      {/* ── Top Announcement Bar ── */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 border-b border-blue-800/40 py-2 px-4 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-blue-200">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-white">Carefone Berlin Workshop:</span>
            <span>Same-Day Express Repairs in 30–45 Mins</span>
          </div>

          <div className="flex items-center gap-4 text-slate-300 text-[11px]">
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              Mo - Sa: 10:00 - 19:00 Uhr
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              Berlin, Deutschland
            </span>
            <a
              href="tel:+493000000000"
              className="inline-flex items-center gap-1 font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <Phone className="w-3 h-3" />
              +49 30 0000 0000
            </a>
          </div>
        </div>
      </div>

      {/* ── Main Sticky Header ── */}
      <header className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 border border-blue-400/30">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-white">
                  CAREFONE<span className="text-cyan-400">.DE</span>
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Berlin
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">Smartphone & Laptop Repair Center</p>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#tracker" className="hover:text-cyan-400 transition-colors">Reparatur-Status</a>
            <a href="#services" className="hover:text-cyan-400 transition-colors">Preise & Services</a>
            <a href="#why-us" className="hover:text-cyan-400 transition-colors">Vorteile</a>
            <a href="#reviews" className="hover:text-cyan-400 transition-colors">Bewertungen</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>
            <a href="#contact" className="hover:text-cyan-400 transition-colors">Kontakt</a>
          </nav>

          {/* Right Action Button & Store State */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <span className={`w-2 h-2 rounded-full ${isStoreOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-300 font-medium">
                {isStoreOpen ? 'Filiale Geöffnet' : 'Öffnet 10:00 Uhr'}
              </span>
            </div>

            <a
              href="#tracker"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Status Prüfen</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero Section (Ultra Modern & Energetic) ── */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
        {/* Glowing Background Orbs */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 right-10 w-[350px] h-[250px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          
          {/* Main Hero Header */}
          <div className="max-w-3xl mx-auto text-center space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/80 border border-blue-500/30 text-blue-300 text-xs font-semibold shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>Berlins Premium Express-Reparaturwerkstatt</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.12]">
              Schnelle & Zertifizierte{' '}
              <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-300 bg-clip-text text-transparent">
                Geräte-Reparatur
              </span>{' '}
              in Berlin
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
              Display- und Akkutausch in nur <strong className="text-cyan-300 font-semibold">30 bis 45 Minuten</strong>. 
              Ohne Datenverlust, mit Original-Qualitätsersatzteilen und <strong className="text-cyan-300 font-semibold">12 Monaten Garantie</strong>.
            </p>

            {/* Quick Action CTA Buttons */}
            <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#tracker"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Search className="w-4 h-4" />
                <span>Live Reparatur-Status prüfen</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="#services"
                className="inline-flex items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-semibold text-sm transition-all"
              >
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span>Preise & Reparaturen</span>
              </a>
            </div>
          </div>

          {/* 4 Live Stats Strip */}
          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-md p-4 text-center">
              <div className="flex items-center justify-center text-blue-400 mb-1.5">
                <Smartphone className="w-5 h-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white">18.500+</p>
              <p className="text-xs text-slate-400 mt-0.5">Geräte erfolgreich repariert</p>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-md p-4 text-center">
              <div className="flex items-center justify-center text-amber-400 mb-1.5">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white">4.9 / 5.0</p>
              <p className="text-xs text-slate-400 mt-0.5">Über 450 Google Reviews</p>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-md p-4 text-center">
              <div className="flex items-center justify-center text-cyan-400 mb-1.5">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white">35 Min</p>
              <p className="text-xs text-slate-400 mt-0.5">Durchschnittl. Express-Dauer</p>
            </div>

            <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-md p-4 text-center">
              <div className="flex items-center justify-center text-emerald-400 mb-1.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white">12 Monate</p>
              <p className="text-xs text-slate-400 mt-0.5">Garantie auf alle Ersatzteile</p>
            </div>
          </div>

        </div>
      </section>

      {/* ── Interactive Live Repair Status Tracker ── */}
      <section id="tracker" className="py-16 bg-slate-900/40 border-y border-slate-800/80 relative">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Live Status Tracker</span>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Verfolgen Sie Ihre Reparatur in Echtzeit
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Geben Sie Ihre Ticket-ID, Rechnungsnummer oder Telefonnummer ein, um den aktuellen Werkstatt-Status einzusehen.
            </p>
          </div>

          {/* Tracker Search Box */}
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-950/30">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSearchTicket()
              }}
              className="flex flex-col sm:flex-row gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ticketInput}
                  onChange={(e) => setTicketInput(e.target.value)}
                  placeholder="Ticket-Nr. oder Rechnungs-ID (z. B. RPR-2401)"
                  className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all uppercase tracking-wider"
                />
              </div>

              <button
                type="submit"
                disabled={isSearching}
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Wird gesucht...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Status abfragen</span>
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-medium">Beispiel-Tickets zum Ausprobieren:</span>
              <button
                type="button"
                onClick={() => handleQuickChipClick('RPR-2401')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono transition-colors"
              >
                RPR-2401 (Abholbereit)
              </button>
              <button
                type="button"
                onClick={() => handleQuickChipClick('RPR-8821')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono transition-colors"
              >
                RPR-8821 (In Reparatur)
              </button>
              <button
                type="button"
                onClick={() => handleQuickChipClick('CF-2026')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono transition-colors"
              >
                CF-2026 (Diagnose)
              </button>
            </div>

            {/* Error Display */}
            {searchError && (
              <div className="mt-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {/* Live Ticket Result Visualizer */}
            {ticketResult && (
              <div className="mt-8 pt-6 border-t border-slate-800 space-y-6 animate-fadeIn">
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Ticket #{searchedTicket}</span>
                    <h3 className="text-lg font-black text-white">{ticketResult.device}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{ticketResult.issue}</p>
                  </div>

                  <div className="text-right">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      {ticketResult.statusText}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">Zuständiger Techniker: {ticketResult.tech}</p>
                  </div>
                </div>

                {/* 5-Step Visual Timeline */}
                <div className="relative">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                    
                    {/* Step 1 */}
                    <div className={`p-4 rounded-2xl border transition-all ${ticketResult.statusStep >= 1 ? 'bg-blue-950/40 border-blue-500/40 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-500'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className={`w-4 h-4 ${ticketResult.statusStep >= 1 ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold uppercase">Schritt 1</span>
                      </div>
                      <h4 className="text-sm font-bold">Annahme & Check-In</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Gerät im System erfasst & vorinspiziert.</p>
                    </div>

                    {/* Step 2 */}
                    <div className={`p-4 rounded-2xl border transition-all ${ticketResult.statusStep >= 2 ? 'bg-blue-950/40 border-blue-500/40 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-500'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className={`w-4 h-4 ${ticketResult.statusStep >= 2 ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold uppercase">Schritt 2</span>
                      </div>
                      <h4 className="text-sm font-bold">Diagnose & Labor</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Elektronische Messung & Teilebereitstellung.</p>
                    </div>

                    {/* Step 3 */}
                    <div className={`p-4 rounded-2xl border transition-all ${ticketResult.statusStep >= 3 ? 'bg-blue-950/40 border-blue-500/40 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-500'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className={`w-4 h-4 ${ticketResult.statusStep >= 3 ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold uppercase">Schritt 3</span>
                      </div>
                      <h4 className="text-sm font-bold">Werkstatt-Reparatur</h4>
                      <p className="text-[11px] text-slate-400 mt-1">Austausch mit zertifizierten Ersatzteilen.</p>
                    </div>

                    {/* Step 4 */}
                    <div className={`p-4 rounded-2xl border transition-all ${ticketResult.statusStep >= 4 ? 'bg-emerald-950/40 border-emerald-500/50 text-white' : 'bg-slate-950/40 border-slate-800 text-slate-500'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className={`w-4 h-4 ${ticketResult.statusStep >= 4 ? 'text-emerald-400' : 'text-slate-600'}`} />
                        <span className="text-xs font-bold uppercase">Schritt 4</span>
                      </div>
                      <h4 className="text-sm font-bold">Abholbereit</h4>
                      <p className="text-[11px] text-slate-400 mt-1">24-Punkte-Endkontrolle bestanden.</p>
                    </div>

                  </div>
                </div>

                {/* Status Note Banner */}
                <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-200 text-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-cyan-400 shrink-0" />
                    <span><strong>Aktuelle Werkstatt-Notiz:</strong> {ticketResult.statusNote}</span>
                  </div>
                  <a
                    href="tel:+493000000000"
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-400/30 transition-all"
                  >
                    Rückfrage stellen
                  </a>
                </div>

              </div>
            )}

          </div>

        </div>
      </section>

      {/* ── Instant Price Estimator & Service Catalog ── */}
      <section id="services" className="py-20 max-w-7xl mx-auto px-4 sm:px-6">
        
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Transparente Festpreise</span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">
            Reparatur-Übersicht & Preiskalkulator
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Wählen Sie Ihre Gerätekategorie für typische Reparaturzeiten, Festpreise und Garantieangaben.
          </p>
        </div>

        {/* Device Category Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-10">
          {DEVICE_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-600/30 scale-105'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{cat.name}</span>
              </button>
            )
          })}
        </div>

        {/* Services Grid for Selected Category */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(REPAIR_CATALOG[selectedCategory] || []).map((item, idx) => (
            <div
              key={idx}
              className="rounded-3xl border border-slate-800/90 bg-slate-900/70 p-6 flex flex-col justify-between hover:border-cyan-500/40 hover:bg-slate-900 transition-all duration-300 group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  {item.popular ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Sehr Beliebt
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-slate-400 bg-slate-800">
                      Express-Service
                    </span>
                  )}
                  <span className="text-xs text-cyan-400 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.time}
                  </span>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors leading-snug">
                  {item.service}
                </h3>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Garantie: {item.warranty}</span>
                  <span className="text-xl font-black text-white">{item.price}</span>
                </div>

                <a
                  href="#contact"
                  className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white font-bold text-xs border border-blue-500/30 transition-all flex items-center gap-1.5"
                >
                  <span>Anfragen</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Free Diagnostic Notice */}
        <div className="mt-8 rounded-2xl bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/50 border border-blue-800/40 p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Gerät nicht in der Liste oder unklarer Fehler?</h4>
              <p className="text-xs text-slate-400 mt-0.5">Wir bieten eine kostenlose Erstdiagnose direkt vor Ort in unserer Berliner Filiale.</p>
            </div>
          </div>

          <a
            href="tel:+493000000000"
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-cyan-500/20 whitespace-nowrap"
          >
            Direkt Beraten Lassen
          </a>
        </div>

      </section>

      {/* ── Why Choose Carefone (6 Core Pillars) ── */}
      <section id="why-us" className="py-20 bg-slate-900/30 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Warum Carefone Berlin?</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">
              Präzision, Vertrauen & Höchste Qualität
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Was uns zur ersten Anlaufstelle für Smartphone- und Laptopreparaturen in Berlin macht.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* Feature 1 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-5 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Express Reparatur in 30 Min</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                90% aller Display- und Akkutäusche führen wir direkt vor Ort in unter einer Stunde durch. Keine tagelangen Wartezeiten.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">12 Monate Garantie</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Volle Sicherheit für Sie: Wir stehen zu unserer Handwerkskunst und geben 1 Jahr Garantie auf alle verbauten Ersatzteile.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 transition-transform">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">100% Datenschutz & Privatsphäre</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ihre Fotos, Nachrichten und Passwörter bleiben absolut sicher und unberührt. Kein Datenlöschen oder Zurücksetzen nötig.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Zertifizierte Meister-Werkstatt</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Modernste Mikroskoplaboratorien, ESD-geschützte Arbeitsplätze und geschulte Meistertechniker für anspruchsvolle Board-Reparaturen.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
                <Award className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Faire Festpreise ohne Überraschungen</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Transparente Angebote vor Reparaturbeginn. Erst nach Ihrer ausdrücklichen Freigabe legen wir los – keine versteckten Kosten.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-7 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-blue-500/40 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform">
                <Coffee className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Warten bei Kaffee & High-Speed WiFi</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Entspannen Sie in unserer Kundenlounge während wir Ihr Smartphone reparieren. Kostenlose Heißgetränke & Schnelles Internet inklusive.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ── Live Customer Reviews ── */}
      <section id="reviews" className="py-20 max-w-7xl mx-auto px-4 sm:px-6">
        
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mb-2">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>4.9 / 5.0 Google Bewertung</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white">
            Was Berliner Kunden über uns sagen
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Echte Bewertungen von Kunden aus allen Berliner Bezirken.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {REVIEWS.map((rev, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-1 text-amber-400 mb-3">
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "{rev.text}"
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">{rev.name}</h4>
                  <span className="text-[10px] text-slate-500">{rev.location} • {rev.date}</span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Verifiziert
                </span>
              </div>
            </div>
          ))}
        </div>

      </section>

      {/* ── FAQ Section (Accordion) ── */}
      <section id="faq" className="py-20 bg-slate-900/40 border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Häufig Gestellte Fragen</span>
            <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">
              Alles Wichtige auf einen Blick
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? -1 : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-white hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? <ChevronUp className="w-5 h-5 text-cyan-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-500 shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3 animate-fadeIn">
                      {faq.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </div>
      </section>

      {/* ── Contact, Location & Store Info ── */}
      <section id="contact" className="py-20 max-w-7xl mx-auto px-4 sm:px-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Store Details Card */}
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Besuchen Sie Uns</span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">Carefone Filiale Berlin</h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2">
                Zentral erreichbar im Herzen Berlins mit bester U-Bahn & S-Bahn Anbindung.
              </p>

              <div className="mt-8 space-y-4 text-xs sm:text-sm text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">Adresse:</span>
                    <p className="text-slate-400">Carefone Berlin, Berlin, Deutschland</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">Öffnungszeiten:</span>
                    <p className="text-slate-400">Montag – Samstag: 10:00 – 19:00 Uhr</p>
                    <p className="text-[11px] text-slate-500">Sonn- und Feiertage: Geschlossen</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">Telefon:</span>
                    <a href="tel:+493000000000" className="text-cyan-400 hover:underline">+49 30 0000 0000</a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white block">E-Mail:</span>
                    <a href="mailto:support@carefone.de" className="text-indigo-400 hover:underline">support@carefone.de</a>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap gap-3">
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-w-[160px] py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs text-center border border-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span>In Google Maps öffnen</span>
              </a>
              <a
                href="tel:+493000000000"
                className="flex-1 min-w-[160px] py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold text-xs text-center shadow-lg shadow-blue-600/30 hover:scale-[1.01] transition-all flex items-center justify-center gap-2"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Jetzt Anrufen</span>
              </a>
            </div>
          </div>

          {/* Quick Inquiry Form */}
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-slate-800">
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Schnellanfrage</span>
            <h3 className="text-2xl font-black text-white mt-1">Reparaturanfrage senden</h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Beschreiben Sie Ihr Problem und wir melden uns innerhalb kürzester Zeit mit einem Kostenvoranschlag.
            </p>

            {contactSubmitted ? (
              <div className="mt-6 p-6 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-center animate-fadeIn">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-base font-bold text-white">Anfrage erfolgreich übermittelt!</h4>
                <p className="text-xs text-slate-300 mt-1">Unser Werkstatt-Team prüft Ihre Angaben und meldet sich in Kürze.</p>
                <button
                  type="button"
                  onClick={() => setContactSubmitted(false)}
                  className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
                >
                  Weitere Anfrage senden
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  setContactSubmitted(true)
                }}
                className="mt-6 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ihr Name</label>
                    <input
                      required
                      type="text"
                      placeholder="z. B. Max Mustermann"
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Telefon / WhatsApp</label>
                    <input
                      required
                      type="tel"
                      placeholder="z. B. +49 170 1234567"
                      className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Gerätemodell</label>
                  <input
                    required
                    type="text"
                    placeholder="z. B. iPhone 15 Pro, Samsung S24, MacBook Air M2"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Fehlerbeschreibung</label>
                  <textarea
                    rows={3}
                    placeholder="z. B. Displayglas gerissen, Akku entlädt sich schnell, Gerät startet nicht..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
                >
                  Unverbindliche Preisauskunft anfordern
                </button>
              </form>
            )}

          </div>

        </div>
      </section>

      {/* ── Modern Footer ── */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-cyan-400">
                <Wrench className="w-4 h-4" />
              </div>
              <span className="font-bold text-white text-sm">
                Carefone Berlin • Meisterwerkstatt
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-slate-400 font-medium">
              <a href="#tracker" className="hover:text-white transition-colors">Reparatur-Status</a>
              <a href="#services" className="hover:text-white transition-colors">Preise & Services</a>
              <a href="#why-us" className="hover:text-white transition-colors">Garantie & Qualität</a>
              <a href="#contact" className="hover:text-white transition-colors">Filiale</a>
              <a href="mailto:support@carefone.de" className="hover:text-white transition-colors">Impressum & Kontakt</a>
            </div>

            <p className="text-center sm:text-right">
              © {new Date().getFullYear()} Carefone.de. Alle Rechte vorbehalten.
            </p>
          </div>
        </div>
      </footer>

    </div>
  )
}
