import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

function resolveRepairStatus(ticket = '') {
  const normalized = String(ticket || '').trim().toUpperCase()
  if (!normalized) return null

  const hash = normalized.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const states = [
    { label: 'Received', note: 'Device received and diagnosis started.' },
    { label: 'In Progress', note: 'Repair is in progress at Carefone Berlin.' },
    { label: 'Ready for Pickup', note: 'Repair complete. Please visit the store.' },
  ]
  return states[hash % states.length]
}

export default function LandingPage() {
  const [ticketId, setTicketId] = useState('')
  const status = useMemo(() => resolveRepairStatus(ticketId), [ticketId])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-blue-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-blue-200">Carefone Berlin</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-black">Professional Mobile & Laptop Repair Center</h1>
              <p className="mt-3 text-sm sm:text-base text-blue-100 max-w-2xl">
                Fast diagnostics, transparent pricing, and trusted same-day repair support for Berlin customers.
              </p>
            </div>
            <Link
              to="/management-portal-v1"
              className="ml-4 mt-1 flex-shrink-0 flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/20 hover:text-white transition-colors backdrop-blur-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zM19 21v-1a7 7 0 00-14 0v1" />
              </svg>
              Admin Login
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black text-slate-800">Display & Touch Repair</h2>
            <p className="mt-2 text-xs text-slate-600">Cracked screens, dead pixels, touch issues, and glass replacement with quality-tested parts.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black text-slate-800">Battery & Charging</h2>
            <p className="mt-2 text-xs text-slate-600">Battery health replacement, charging port repair, and power diagnostics for daily reliability.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-black text-slate-800">Board-Level Diagnostics</h2>
            <p className="mt-2 text-xs text-slate-600">Liquid damage assessment, board repair, and detailed fault tracing by experienced technicians.</p>
          </article>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800">Repair Status Tracker</h3>
            <p className="mt-1 text-xs text-slate-500">Enter your repair ticket or invoice ID.</p>
            <input
              value={ticketId}
              onChange={(event) => setTicketId(event.target.value)}
              placeholder="e.g. RPR-24031"
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 min-h-16">
              {!ticketId.trim() ? (
                <p className="text-xs text-slate-500">Status will appear here after entering a valid ticket ID.</p>
              ) : status ? (
                <>
                  <p className="text-sm font-bold text-slate-800">{status.label}</p>
                  <p className="text-xs text-slate-600 mt-1">{status.note}</p>
                </>
              ) : (
                <p className="text-xs text-rose-600">Ticket not found. Please verify and try again.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800">Contact</h3>
            <div className="mt-3 space-y-2 text-xs text-slate-700">
              <p><span className="font-bold">Address:</span> Carefone Berlin, Berlin, Germany</p>
              <p><span className="font-bold">Phone:</span> +49 30 0000 0000</p>
              <p><span className="font-bold">Email:</span> support@carefone.de</p>
              <p><span className="font-bold">Hours:</span> Mon - Sat, 10:00 - 19:00</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
