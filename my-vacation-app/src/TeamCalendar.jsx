import { useState, useEffect, useMemo, useRef } from 'react'
import axios from 'axios'
import { HOLIDAYS } from './LeaveCalendar'

// ─── Color palette (deterministic per userId) ─────────────────────────────────

const PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f97316', // orange
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#84cc16', // lime
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
]

/** Home Office is always this muted slate — distinct from all personal colours. */
const HOME_OFFICE_COLOR = '#94a3b8'

function userColor(userId) {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function eventColor(ev) {
  return ev.type === 'home_office' ? HOME_OFFICE_COLOR : userColor(ev.userId)
}

// ─── Initials with collision detection ───────────────────────────────────────

/**
 * Given a flat list of calendar events, returns a map of userId → initials.
 * Default: "Jane Doe" → "JD" (2 chars).
 * Collision: two people share the same 2-char initials → expand to 3 chars
 *   using the first 2 letters of the first name + first letter of the last name.
 */
function buildInitialsMap(events) {
  const userNames = {}
  events.forEach(e => { if (!userNames[e.userId]) userNames[e.userId] = e.userName })
  const users = Object.entries(userNames).map(([userId, userName]) => ({ userId, userName }))

  const firstPass = {}
  users.forEach(({ userId, userName }) => {
    const parts = userName.trim().split(/\s+/).filter(Boolean)
    firstPass[userId] = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  })

  const counts = {}
  Object.values(firstPass).forEach(i => { counts[i] = (counts[i] || 0) + 1 })

  const result = {}
  users.forEach(({ userId, userName }) => {
    const ini = firstPass[userId]
    if (counts[ini] > 1) {
      const parts = userName.trim().split(/\s+/).filter(Boolean)
      result[userId] = parts.length >= 2
        ? (parts[0].slice(0, 2) + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 3).toUpperCase()
    } else {
      result[userId] = ini
    }
  })
  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su']

function isoOf(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Monday-first offset (0 = Mon, 6 = Sun). */
function firstDayOffset(year, month) {
  const raw = new Date(year, month, 1).getDay()
  return raw === 0 ? 6 : raw - 1
}

// ─── Event chip ───────────────────────────────────────────────────────────────

function EventChip({ label, color, title, faded }) {
  return (
    <span
      title={title}
      style={{ backgroundColor: color, opacity: faded ? 0.55 : 1 }}
      className="flex items-center justify-center rounded px-1 text-[10px] font-bold text-white leading-[14px] truncate cursor-default select-none"
    >
      {label}
    </span>
  )
}

// ─── Day cell with overflow popover ──────────────────────────────────────────

const MAX_VISIBLE = 3

function DayCell({ iso, dayNum, isToday, isWeekend, holiday, events, initialsMap }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const visible  = events.slice(0, MAX_VISIBLE)
  const overflow = events.length - MAX_VISIBLE

  return (
    <div
      className={[
        'relative border-t border-gray-100 p-1 min-h-[76px]',
        isWeekend || holiday ? 'bg-gray-50' : 'bg-white',
        isToday ? 'ring-1 ring-inset ring-blue-400' : '',
      ].join(' ')}
    >
      {/* Day number */}
      <p className={[
        'text-[11px] font-semibold mb-0.5 leading-none',
        isToday     ? 'text-blue-600' :
        holiday     ? 'text-amber-600' :
        isWeekend   ? 'text-gray-300' :
                      'text-gray-500',
      ].join(' ')}>
        {dayNum}
        {holiday && <span className="ml-0.5 text-amber-400" title={holiday}>●</span>}
      </p>

      {/* Chips */}
      <div className="flex flex-col gap-0.5">
        {visible.map(ev => (
          <EventChip
            key={ev.id}
            label={initialsMap[ev.userId] ?? ev.userName.slice(0, 2).toUpperCase()}
            color={eventColor(ev)}
            title={`${ev.userName} · ${ev.type.replace('_', ' ')}${ev.status === 'PENDING' ? ' (pending)' : ''}`}
            faded={ev.status === 'PENDING'}
          />
        ))}

        {overflow > 0 && (
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="text-[10px] font-medium text-blue-600 hover:underline leading-[14px] text-left"
            >
              +{overflow} more
            </button>

            {open && (
              <div className="absolute z-40 top-full left-0 mt-1 w-48 rounded-lg bg-white shadow-lg border border-gray-200 p-2 space-y-1">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-1">
                  All absent — {iso}
                </p>
                {events.map(ev => (
                  <div key={ev.id} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: eventColor(ev), opacity: ev.status === 'PENDING' ? 0.55 : 1 }}
                    />
                    <span className="text-gray-700 truncate">{ev.userName}</span>
                    {ev.status === 'PENDING' && (
                      <span className="text-gray-400 flex-shrink-0 text-[10px]">(pending)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TeamCalendar({ userId, api }) {
  const today    = useMemo(() => new Date(), [])
  const todayIso = isoOf(today.getFullYear(), today.getMonth(), today.getDate())

  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [events,    setEvents]    = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

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

  const initialsMap = useMemo(() => buildInitialsMap(events), [events])

  /** Expand each event across every day it covers → day-keyed lookup. */
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

  // Legend: unique users who appear this month
  const legendUsers = useMemo(() => {
    const seen = {}
    events.forEach(e => { if (!seen[e.userId]) seen[e.userId] = e.userName })
    return Object.entries(seen).map(([id, name]) => ({ id, name }))
  }, [events])

  const hasHomeOffice = events.some(e => e.type === 'home_office')

  return (
    <div className="space-y-4">

      {/* ── Month navigation ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 text-lg leading-none"
        >‹</button>
        <h3 className="w-44 text-center text-sm font-semibold text-gray-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 text-lg leading-none"
        >›</button>
        {loading && <span className="text-xs text-gray-400 ml-1">Loading…</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {DAY_LABELS.map((d, i) => (
            <div
              key={d}
              className={`py-2 text-center text-xs font-medium ${i >= 5 ? 'text-gray-300' : 'text-gray-500'}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {/* Leading blank cells */}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`b${i}`} className="border-t border-gray-100 bg-gray-50 min-h-[76px]" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day     = i + 1
            const iso     = isoOf(viewYear, viewMonth, day)
            const dow     = new Date(viewYear, viewMonth, day).getDay()
            const weekend = dow === 0 || dow === 6
            return (
              <DayCell
                key={iso}
                iso={iso}
                dayNum={day}
                isToday={iso === todayIso}
                isWeekend={weekend}
                holiday={HOLIDAYS[iso] ?? null}
                events={eventsByDay[iso] ?? []}
                initialsMap={initialsMap}
              />
            )
          })}
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────── */}
      {legendUsers.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600 pt-1">
          {legendUsers.map(u => (
            <span key={u.id} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: userColor(u.id) }} />
              {u.name}
            </span>
          ))}
          {hasHomeOffice && (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: HOME_OFFICE_COLOR }} />
              Home Office
            </span>
          )}
          <span className="flex items-center gap-1.5 text-amber-600">
            <span className="text-amber-400">●</span>
            Public Holiday
          </span>
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="w-3 h-3 rounded-sm bg-blue-400 opacity-55" />
            Pending
          </span>
        </div>
      ) : !loading && (
        <p className="text-sm text-gray-400 text-center py-4">
          No approved leave in {MONTH_NAMES[viewMonth]} {viewYear} for your team.
        </p>
      )}
    </div>
  )
}
