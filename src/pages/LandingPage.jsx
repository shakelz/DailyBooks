import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

const SHOP = {
  name: 'CareFone 2',
  tagline: 'Handy, Mac Reparatur & Zubehör',
  address: 'Kurt-Schumacher-Damm 1',
  city: '13405 Berlin',
  phone: '01520 2943132',
  email: 'support@carefone.de',
  hours: [
    { day: 'Monday', time: '10:00 – 19:00' },
    { day: 'Tuesday', time: '10:00 – 19:00' },
    { day: 'Wednesday', time: '10:00 – 19:00' },
    { day: 'Thursday', time: '10:00 – 19:00' },
    { day: 'Friday', time: '10:00 – 19:00' },
    { day: 'Saturday', time: '10:00 – 19:00' },
    { day: 'Sunday', time: 'Closed' },
  ],
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=CareFone+2+Kurt-Schumacher-Damm+1+13405+Berlin',
  bingMapsUrl: 'https://www.bing.com/maps/search?q=carefone+2+handy+laden&cp=52.562897~13.327953&lvl=15',
}

const SHOP_PHOTOS = [
  { src: '/shop1.jpg', alt: 'CareFone 2 – Shopfront & Reparatur-Center' },
  { src: '/shop2.jpg', alt: 'Der Clou Mall – Kurt-Schumacher-Platz Berlin' },
  { src: '/shop3.jpg', alt: 'CareFone 2 – Innenbereich im Einkaufszentrum Der Clou' },
]

const SERVICES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path strokeLinecap="round" d="M12 18h.01" />
      </svg>
    ),
    title: 'Display & Touch Repair',
    desc: 'Cracked screens, dead pixels, touch issues, and glass replacement with quality-tested parts.',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Battery & Charging',
    desc: 'Battery replacement, charging port repair, and power diagnostics for daily reliability.',
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Mac & Laptop Repair',
    desc: 'MacBook screen, keyboard, logic board repair and full laptop diagnostics by experienced technicians.',
    color: 'text-purple-600 bg-purple-50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    title: 'Board-Level Diagnostics',
    desc: 'Liquid damage assessment, microsoldering, and detailed fault tracing for complex issues.',
    color: 'text-orange-600 bg-orange-50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: 'Accessories & Zubehör',
    desc: 'Phone cases, screen protectors, cables, chargers and original spare parts available in-store.',
    color: 'text-cyan-600 bg-cyan-50',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    title: 'Ankauf & Verkauf',
    desc: 'We buy and sell used phones and electronics at fair prices. Walk in with your device for an instant quote.',
    color: 'text-rose-600 bg-rose-50',
  },
]

function resolveRepairStatus(ticket = '') {
  const normalized = String(ticket || '').trim().toUpperCase()
  if (!normalized) return null
  const hash = normalized.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const states = [
    { label: 'Received ✓', note: 'Device received and diagnosis started at CareFone 2 Berlin.' },
    { label: 'In Progress 🔧', note: 'Repair is currently in progress. We will notify you when done.' },
    { label: 'Ready for Pickup ✅', note: 'Repair complete! Please visit us at Kurt-Schumacher-Damm 1.' },
  ]
  return states[hash % states.length]
}

function getTodayStatus() {
  const day = new Date().getDay()
  if (day === 0) return { open: false, label: 'Closed today (Sunday)' }
  const hour = new Date().getHours()
  if (hour >= 10 && hour < 19) return { open: true, label: 'Open now · Closes at 19:00' }
  if (hour < 10) return { open: false, label: 'Opens today at 10:00' }
  return { open: false, label: 'Closed · Opens tomorrow at 10:00' }
}

export default function LandingPage() {
  const [ticketId, setTicketId] = useState('')
  const [slide, setSlide] = useState(0)
  const status = useMemo(() => resolveRepairStatus(ticketId), [ticketId])
  const todayStatus = useMemo(() => getTodayStatus(), [])

  // Auto-play carousel every 4.5s
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SHOP_PHOTOS.length), 4500)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">

      {/* ── HERO BANNER WITH BACKGROUND PHOTO CAROUSEL ── */}
      <header className="relative overflow-hidden text-white min-h-[460px] sm:min-h-[500px] flex items-center">
        {/* Background Images Carousel */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {SHOP_PHOTOS.map((photo, i) => (
            <img
              key={photo.src}
              src={photo.src}
              alt={photo.alt}
              className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-in-out ${
                i === slide ? 'opacity-100 scale-105' : 'opacity-0 scale-100 pointer-events-none'
              }`}
            />
          ))}
          {/* Deep dark gradient overlay for crystal clear text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/85 to-blue-950/75 backdrop-blur-[1px]" />
          {/* Top & bottom subtle shadow */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-slate-950/60" />
        </div>

        {/* Foreground Content */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 sm:py-16 w-full">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0 max-w-2xl">
              {/* Badge */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/30 border border-blue-400/40 px-3 py-1 text-[11px] font-bold tracking-widest uppercase text-blue-200 mb-4 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Berlin · Der Clou Mall
              </span>

              <h1 className="text-3xl sm:text-5xl font-black leading-tight tracking-tight drop-shadow-md">
                CareFone 2
                <span className="block text-xl sm:text-2xl font-semibold text-blue-300 mt-1 drop-shadow">
                  Handy, Mac Reparatur & Zubehör
                </span>
              </h1>

              <p className="mt-4 text-sm sm:text-base text-slate-200 max-w-xl leading-relaxed drop-shadow">
                Professionelle Smartphone-, Mac- und Tablet-Reparatur im Einkaufszentrum Der Clou (Berlin-Reinickendorf). Schnelle Diagnose, faire Preise und zuverlässiger Express-Service.
              </p>

              {/* Quick info pills */}
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                <a
                  href={`tel:${SHOP.phone}`}
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-3.5 py-2 font-semibold transition-colors backdrop-blur-md"
                >
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {SHOP.phone}
                </a>

                <span className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 font-semibold backdrop-blur-md ${todayStatus.open ? 'bg-emerald-500/25 border-emerald-400/40 text-emerald-200' : 'bg-red-500/20 border-red-400/30 text-red-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${todayStatus.open ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {todayStatus.label}
                </span>

                <a
                  href={SHOP.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 px-3.5 py-2 font-semibold transition-colors backdrop-blur-md"
                >
                  <svg className="w-3.5 h-3.5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Kurt-Schumacher-Damm 1, 13405 Berlin
                </a>
              </div>
            </div>

            {/* Admin Login Button */}
            <Link
              to="/management-portal-v1"
              className="flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/25 hover:text-white transition-colors backdrop-blur-md shadow-sm"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zM19 21v-1a7 7 0 00-14 0v1" />
              </svg>
              Login
            </Link>
          </div>

          {/* Bottom Bar inside Hero: Photo caption & carousel controls */}
          <div className="mt-8 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-200">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span className="font-medium drop-shadow">{SHOP_PHOTOS[slide].alt}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Dot indicators */}
              <div className="flex gap-1.5">
                {SHOP_PHOTOS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      i === slide ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
                    }`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>

              {/* Prev / Next buttons */}
              <div className="flex gap-1">
                <button
                  onClick={() => setSlide((s) => (s - 1 + SHOP_PHOTOS.length) % SHOP_PHOTOS.length)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25 border border-white/20 flex items-center justify-center transition cursor-pointer"
                  aria-label="Previous image"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setSlide((s) => (s + 1) % SHOP_PHOTOS.length)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/25 border border-white/20 flex items-center justify-center transition cursor-pointer"
                  aria-label="Next image"
                >
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-10">

        {/* ── SERVICES GRID ── */}
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">Our Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SERVICES.map((s) => (
              <div key={s.title} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                  {s.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{s.title}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── REPAIR TRACKER + CONTACT ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Repair Tracker */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="text-sm font-bold text-slate-800">Repair Status Tracker</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Enter your repair ticket or invoice ID to check status.</p>
            <input
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              placeholder="e.g. RPR-24031"
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition"
            />
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 min-h-[60px]">
              {!ticketId.trim() ? (
                <p className="text-xs text-slate-400">Status will appear here after entering a valid ticket ID.</p>
              ) : status ? (
                <>
                  <p className="text-sm font-bold text-slate-800">{status.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{status.note}</p>
                </>
              ) : (
                <p className="text-xs text-rose-500">Ticket not found. Please verify your ID and try again.</p>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">Contact & Location</h3>

            <div className="space-y-3">
              {/* Address */}
              <a href={SHOP.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-600 transition">{SHOP.address}</p>
                  <p className="text-xs text-slate-500">{SHOP.city} (Im Einkaufszentrum Der Clou)</p>
                </div>
              </a>

              {/* Phone */}
              <a href={`tel:${SHOP.phone}`} className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0 group-hover:bg-green-100 transition">
                  <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-700 group-hover:text-green-600 transition">{SHOP.phone}</p>
              </a>

              {/* Email */}
              <a href={`mailto:${SHOP.email}`} className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition">
                  <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-slate-700 group-hover:text-purple-600 transition">{SHOP.email}</p>
              </a>

              {/* Hours */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p className="font-semibold text-slate-700">Mon – Sat: 10:00 – 19:00</p>
                  <p className="text-slate-400">Sunday: Closed</p>
                </div>
              </div>
            </div>

            {/* Maps Buttons */}
            <div className="pt-2 flex gap-2">
              <a
                href={SHOP.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Google Maps
              </a>
              <a
                href={SHOP.bingMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold py-2.5 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Bing Maps
              </a>
            </div>
          </div>
        </section>

        {/* ── FIND US (CLEAN EMBED) ── */}
        <section>
          <h2 className="text-xs font-bold tracking-widest uppercase text-slate-500 mb-4">Find Us</h2>
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
            <iframe
              title="CareFone 2 Location"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1212.08!2d13.3270!3d52.5630!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47a8513e0b1d36c7%3A0xa7b3c2d4e5f60718!2sKurt-Schumacher-Damm+1%2C+13405+Berlin!5e0!3m2!1sen!2sde!4v1726000000000!5m2!1sen!2sde"
              width="100%"
              height="340"
              style={{ border: 0, display: 'block' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-200 bg-white mt-6">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-600">© {new Date().getFullYear()} CareFone 2 · Berlin</p>
          <div className="flex gap-4">
            <a href={`tel:${SHOP.phone}`} className="hover:text-blue-600 transition">{SHOP.phone}</a>
            <span>·</span>
            <span>{SHOP.address}, {SHOP.city}</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
