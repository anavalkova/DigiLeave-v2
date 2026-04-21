import { useState, useEffect, useMemo } from 'react' // useEffect used by main component
import axios from 'axios'
import { HOLIDAYS } from './LeaveCalendar'

// ─── Type-based colour palette ────────────────────────────────────────────────

const TYPE_COLORS = {
  annual:      '#3b82f6', // blue  — annual leave
  home_office: '#94a3b8', // slate — home office
  sick:        '#ef4444', // red   — sick leave
  maternity:   '#ec4899', // pink  — maternity / paternity
  unpaid:      '#f59e0b', // amber — unpaid
}
const FALLBACK_COLOR = '#6b7280'

const TYPE_LABELS = {
  annual:      'Annual Leave',
  home_office: 'Home Office',
  sick:        'Sick Leave',
  maternity:   'Maternity / Paternity',
  unpaid:      'Unpaid Leave',
}

function typeColor(type) {
  return TYPE_COLORS[type?.toLowerCase()] ?? FALLBACK_COLOR
}

function typeLabel(type) {
  return TYPE_LABELS[type?.toLowerCase()] ?? type ?? '—'
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_LABELS  = ['Mo','Tu','We','Th','Fr','Sa','Su']

function isoOf(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtShort(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function firstDayOffset(year, month) {
  const raw = new Date(year, month, 1).getDay()
  return raw === 0 ? 6 : raw - 1
}

// ─── Day-detail inline section ────────────────────────────────────────────────

function DayDetail({ iso, events, onClose }) {
  const holiday = HOLIDAYS[iso]

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-800">{fmtDate(iso)}</h3>
          {holiday && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              {holiday}
            </span>
          )}
          {events.length > 0 && (
            <span className="text-xs text-gray-400">
              {events.length} {events.length === 1 ? 'person' : 'people'} away
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selection"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Clear ✕
        </button>
      </div>

      {/* Body */}
      {events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-500">
          No leave requests on this day.{holiday ? ' This is a public holiday.' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Name</th>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Type</th>
                <th scope="col" className="px-5 py-2.5 text-left font-medium whitespace-nowrap">Start</th>
                <th scope="col" className="px-5 py-2.5 text-left font-medium whitespace-nowrap">End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map(ev => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: typeColor(ev.type) }} />
                      <span className="font-medium text-gray-800">{ev.userName}</span>
                      {ev.status === 'PENDING' && (
                        <span className="text-[10px] font-medium text-amber-600">(pending)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: typeColor(ev.type), opacity: ev.status === 'PENDING' ? 0.7 : 1 }}
                    >
                      {typeLabel(ev.type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">{fmtShort(ev.start)}</td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">{fmtShort(ev.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

const MAX_CHIPS = 3

function DayCell({ iso, dayNum, isToday, isWeekend, holiday, events, onClick }) {
  const visible  = events.slice(0, MAX_CHIPS)
  const overflow = events.length - MAX_CHIPS
  const clickable = events.length > 0 || !!holiday

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${iso}, ${events.length} requests${holiday ? ', ' + holiday : ''}` : undefined}
      onClick={clickable ? () => onClick(iso) : undefined}
      onKeyDown={clickable ? e => (e.key === 'Enter' || e.key === ' ') && onClick(iso) : undefined}
      className={[
        'border-t border-gray-100 p-1 min-h-[76px] transition-colors',
        isWeekend || holiday ? 'bg-gray-50' : 'bg-white',
        isToday ? 'ring-1 ring-inset ring-blue-400' : '',
        clickable ? 'cursor-pointer hover:bg-blue-50' : '',
      ].join(' ')}
    >
      {/* Day number */}
      <p className={[
        'text-[11px] font-semibold mb-0.5 leading-none select-none',
        isToday   ? 'text-blue-600' :
        holiday   ? 'text-amber-600' :
        isWeekend ? 'text-gray-300' :
                    'text-gray-500',
      ].join(' ')}>
        {dayNum}
        {holiday && <span className="ml-0.5 text-amber-400" title={holiday}>●</span>}
      </p>

      {/* Event chips — colour by type */}
      <div className="flex flex-col gap-0.5">
        {visible.map(ev => (
          <span
            key={ev.id}
            title={`${ev.userName} · ${typeLabel(ev.type)}`}
            style={{
              backgroundColor: typeColor(ev.type),
              opacity: ev.status === 'PENDING' ? 0.55 : 1,
            }}
            className="block truncate rounded px-1 text-[10px] font-medium text-white leading-[14px] select-none"
          >
            {ev.userName.split(' ')[0]}
          </span>
        ))}

        {overflow > 0 && (
          <span className="text-[10px] font-medium text-blue-600 leading-[14px] select-none">
            +{overflow} more
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const universalItems = [
    { key: 'annual',      label: 'Annual Leave' },
    { key: 'home_office', label: 'Home Office' },
    { key: 'sick',        label: 'Sick Leave' },
    { key: 'maternity',   label: 'Maternity / Paternity' },
    { key: 'unpaid',      label: 'Unpaid Leave' },
  ]

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600 pt-1">
      {universalItems
        .map(item => (
          <span key={item.key} className="flex items-center gap-1.5">
            <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ backgroundColor: TYPE_COLORS[item.key] }} />
            {item.label}
          </span>
        ))
      }
      <span className="flex items-center gap-1.5 text-amber-600">
        <span className="text-amber-400">●</span>
        Public Holiday
      </span>
      <span className="flex items-center gap-1.5 text-gray-400">
        <span className="h-3 w-3 flex-shrink-0 rounded-sm bg-blue-400 opacity-55" />
        Pending
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamCalendar({ userId, api }) {
  const today    = useMemo(() => new Date(), [])
  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate())

  const [viewYear,     setViewYear]     = useState(today.getFullYear())
  const [viewMonth,    setViewMonth]    = useState(today.getMonth())
  const [events,       setEvents]       = useState([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [selectedDay,  setSelectedDay]  = useState(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    setError('')
    axios
      .get(`${api}/api/leave/calendar`, {
        params: { viewerId: userId, year: viewYear, month: viewMonth + 1 },
      })
      .then(({ data }) => setEvents(data))
      .catch(() => setError('Could not load team calendar. Please try again.'))
      .finally(() => setLoading(false))
  }, [userId, viewYear, viewMonth, api])

  /** Expand each event across every day it covers → iso → [events] */
  const eventsByDay = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      const [sy, sm, sd] = ev.start.split('-').map(Number)
      const [ey, em, ed] = ev.end.split('-').map(Number)
      const cur  = new Date(sy, sm - 1, sd)
      const last = new Date(ey, em - 1, ed)
      while (cur <= last) {
        const iso = isoOf(cur.getFullYear(), cur.getMonth(), cur.getDate())
        if (!map[iso]) map[iso] = []
        map[iso].push(ev)
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [events])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const offset      = firstDayOffset(viewYear, viewMonth)

  const selectedDayEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : []

  return (
    <div className="space-y-4">

      {/* ── Month navigation ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={prevMonth} aria-label="Previous month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 text-lg leading-none">
          ‹
        </button>
        <h3 className="w-44 text-center text-sm font-semibold text-gray-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button type="button" onClick={nextMonth} aria-label="Next month"
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 text-lg leading-none">
          ›
        </button>
        {loading && <span className="ml-1 text-xs text-gray-400">Loading…</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAY_LABELS.map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-medium ${i >= 5 ? 'text-gray-300' : 'text-gray-500'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`b${i}`} className="min-h-[76px] border-t border-gray-100 bg-gray-50" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day     = i + 1
            const iso     = isoOf(viewYear, viewMonth, day)
            const dow     = new Date(viewYear, viewMonth, day).getDay()
            return (
              <DayCell
                key={iso}
                iso={iso}
                dayNum={day}
                isToday={iso === todayIso}
                isWeekend={dow === 0 || dow === 6}
                holiday={HOLIDAYS[iso] ?? null}
                events={eventsByDay[iso] ?? []}
                onClick={setSelectedDay}
              />
            )
          })}
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────── */}
      {!loading && <Legend />}

      {/* ── Day-detail slide-over ─────────────────────────────────── */}
      {selectedDay && (
        <DayDetail
          iso={selectedDay}
          events={selectedDayEvents}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}
