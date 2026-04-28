import { useState, useEffect, useMemo } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import api from './api'
import { setAccessToken, clearAccessToken, plainAxios } from './api'
import AdminPanel from './AdminPanel'
import ApproverView from './ApproverView'
import ApproverUsersView from './ApproverUsersView'
import AuditLog from './AuditLog'
import LeaveCalendar, { isoOf, HOLIDAYS } from './LeaveCalendar'
import StatusBadge from './StatusBadge'
import TeamCalendar from './TeamCalendar'
import BaseTable from './BaseTable'
import { PAGE_SIZE, sortRequests } from './Pagination'
import { useColumnFilters } from './ColumnFilters'
import {
  LEAVE_TYPE_OPTIONS, LEAVE_STATUS, ROLES,
  formatLeaveType, normalizeLeaveType,
} from './constants'
import { useLeaveRequests }    from './useLeaveRequests'
import { useApproverRequests } from './useApproverRequests'
import { useUserManagement }   from './useUserManagement'
import './App.css'

const API = import.meta.env.VITE_API_BASE_URL

// ─── My Requests column + filter config ──────────────────────────────────────

const HIST_COLS = [
  { label: 'Requested', colKey: 'requestDate', filter: { type: 'daterange', fromKey: 'requestDateFrom', toKey: 'requestDateTo' } },
  { label: 'Start',     colKey: 'startDate',   filter: { type: 'daterange', fromKey: 'startDateFrom',   toKey: 'startDateTo'   } },
  { label: 'End',       colKey: 'endDate',     filter: null },
  { label: 'Days',      colKey: 'totalDays',   filter: null },
  { label: 'Type',      colKey: 'type',        filter: { type: 'select', key: 'type', options: [
    { value: '', label: 'All Types' },
    ...LEAVE_TYPE_OPTIONS,
  ]}},
  { label: 'Status',    colKey: 'status',      filter: { type: 'select', key: 'status', options: [
    { value: '',                              label: 'All Statuses' },
    { value: LEAVE_STATUS.PENDING.toLowerCase(),   label: 'Pending'   },
    { value: LEAVE_STATUS.APPROVED.toLowerCase(),  label: 'Approved'  },
    { value: LEAVE_STATUS.REJECTED.toLowerCase(),  label: 'Rejected'  },
    { value: LEAVE_STATUS.CANCELLED.toLowerCase(), label: 'Cancelled' },
  ]}},
  { label: '', colKey: null, filter: null },
]

const HIST_INITIAL = {
  requestDateFrom: '', requestDateTo: '',
  startDateFrom:   '', startDateTo:   '',
  type: '', status: '',
}

// Holiday set kept in LeaveCalendar.jsx (single source of truth for frontend).

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format an ISO date string (YYYY-MM-DD) as "3 Feb 2026" without timezone drift. */
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Return initials from a full name, e.g. "Jane Doe" → "JD". */
function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

/**
 * Count working days between two ISO date strings (inclusive),
 * excluding weekends and Bulgarian public holidays.
 * When halfDayOnEnd is true the last date contributes 0.5 instead of 1.
 * Returns null if either date is missing or end < start.
 */
function countWorkdays(start, end, halfDayOnEnd = false) {
  if (!start || !end || end < start) return null
  let count = 0
  const cur  = new Date(start + 'T00:00:00')
  const last = new Date(end   + 'T00:00:00')
  while (cur <= last) {
    const dow = cur.getDay() // 0=Sun, 6=Sat
    const iso = isoOf(cur)
    if (dow !== 0 && dow !== 6 && !HOLIDAYS[iso]) {
      const isLastDay = iso === end
      count += (halfDayOnEnd && isLastDay) ? 0.5 : 1
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ─── Sub-components ──────────────────────────────────────────────────────────
// StatusBadge is imported from StatusBadge.jsx (shared with ApproverView)

/** Format a number: whole numbers show without decimals, halves show one decimal place. */
function fmtDays(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * Compact balance summary strip replacing the old 5-card grid.
 *
 * Available = (Entitled + CarriedOver + Adj) − (Used + Pending)
 *
 * The backend's summary.available only subtracts Used, not Pending.
 * We recompute displayAvailable here so we never double-count.
 *
 * Progress bar: the grey track is split into two zones —
 *   • light grey  = entitled days (this year's allocation)
 *   • cyan-100    = transferred / carried-over days (answers the "different shade" question)
 * The foreground segments (emerald = used, amber = pending) overlay the track;
 * whatever is uncovered shows which pool of days is still available.
 */
function BalanceSummary({ summary }) {
  const entitled    = summary?.entitled                    ?? 0
  const transferred = summary?.transferred                 ?? 0
  const adj         = summary?.startingBalanceAdjustment   ?? 0
  const used        = summary?.used                        ?? 0
  const pending     = summary?.pending                     ?? 0

  const totalBudget       = entitled + transferred + adj
  const committed         = used + pending
  const displayAvail      = totalBudget - committed   // correct: subtracts both used + pending
  const overBudget        = committed > totalBudget
  const halfDayRemaining  = !overBudget && displayAvail > 0 && displayAvail % 1 === 0.5

  // Bar segment widths as percentages of totalBudget
  const usedPct        = totalBudget > 0 ? Math.min(100, used    / totalBudget * 100) : 0
  const pendingPct     = totalBudget > 0 ? Math.min(100 - usedPct, pending / totalBudget * 100) : 0
  // Boundary between entitled and transferred zones (for track colouring)
  const entitledZonePct = totalBudget > 0 ? (entitled + adj) / totalBudget * 100 : 100

  return (
    <div
      role="region"
      aria-label="Leave balance summary"
      className="rounded-xl border border-gray-200 bg-white overflow-hidden"
    >
      {/* ── Metric strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

        {/* ── Quota ── */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Quota</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-gray-800">{fmtDays(totalBudget)}</span>
            <span className="text-xs text-gray-400">days</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-snug">
            <span className="font-semibold text-blue-600">{fmtDays(entitled)}</span>
            <span className="text-gray-400">entitled</span>
            {transferred > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="font-semibold text-cyan-600">+{fmtDays(transferred)}</span>
                <span className="text-gray-400">carried over</span>
              </>
            )}
            {adj !== 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className={`font-semibold ${adj > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {adj > 0 ? '+' : ''}{fmtDays(adj)}
                </span>
                <span className="text-gray-400">adj.</span>
              </>
            )}
          </div>
        </div>

        {/* ── Booked ── */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Booked</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span>
              <span className="text-2xl font-bold text-violet-600">{fmtDays(used)}</span>
              <span className="ml-0.5 text-xs text-gray-400">used</span>
            </span>
            {pending > 0 && (
              <span>
                <span className="text-2xl font-bold text-amber-500">{fmtDays(pending)}</span>
                <span className="ml-0.5 text-xs text-gray-400">pending</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {fmtDays(committed)} days booked total
          </p>
        </div>

        {/* ── Remaining — spans full width on mobile ── */}
        <div className="col-span-2 sm:col-span-1 px-5 py-4 bg-gray-50 sm:bg-white">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Remaining</p>
          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <span className={`text-2xl font-bold ${
              overBudget           ? 'text-red-500'   :
              displayAvail <= 2    ? 'text-amber-500' :
                                     'text-emerald-600'
            }`}>
              {overBudget ? `−${fmtDays(committed - totalBudget)}` : fmtDays(displayAvail)}
            </span>
            <span className="text-xs text-gray-400">days</span>
            {overBudget && (
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">over budget</span>
            )}
          </div>
          {adj !== 0 && (
            <p className="mt-1 text-xs text-gray-400">
              incl. {adj > 0 ? '+' : ''}{fmtDays(adj)} day adj.
            </p>
          )}
          {halfDayRemaining && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 ring-1 ring-inset ring-blue-500/20">
              ½ 1 half-day available
            </span>
          )}
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
      {totalBudget > 0 && (
        <div className="px-5 pb-4 pt-3 border-t border-gray-100">
          {/* Track — two-zone background shows entitled (grey) vs carried-over (cyan) */}
          <div
            role="img"
            aria-label={`${fmtDays(used)} days used, ${fmtDays(pending)} pending, ${fmtDays(Math.max(0, displayAvail))} remaining`}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100"
          >
            {/* Carried-over zone (visible only in the uncovered / available area) */}
            {transferred > 0 && (
              <div
                className="absolute inset-y-0 bg-cyan-100"
                style={{ left: `${entitledZonePct}%`, width: `${transferred / totalBudget * 100}%` }}
              />
            )}
            {/* Used — emerald, from left */}
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-500 ease-out"
              style={{ width: `${usedPct}%` }}
            />
            {/* Pending — amber, immediately right of used */}
            {pendingPct > 0 && (
              <div
                className="absolute inset-y-0 bg-amber-400 transition-all duration-500 ease-out"
                style={{ left: `${usedPct}%`, width: `${pendingPct}%` }}
              />
            )}
          </div>

          {/* Legend */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 shrink-0 rounded-full bg-emerald-500" />
              Used ({fmtDays(used)})
            </span>
            {pending > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-3 shrink-0 rounded-full bg-amber-400" />
                Pending ({fmtDays(pending)})
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-3 shrink-0 rounded-full bg-gray-200" />
              Remaining ({fmtDays(Math.max(0, displayAvail))})
            </span>
            {transferred > 0 && (
              <span className="flex items-center gap-1.5 ml-auto">
                <span className="h-1.5 w-3 shrink-0 rounded-full bg-cyan-200" />
                {fmtDays(transferred)} carried over
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Landing page helpers ─────────────────────────────────────────────────────

function CalendarMockup() {
  const days  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const dates = ['4',   '5',   '6',   '7',   '8'  ]
  const rows  = [
    { init: 'AP', bg: 'bg-blue-100 text-blue-700',    active: [0,1,2],    bar: 'bg-emerald-100 border-emerald-200 text-emerald-700', label: 'Annual Leave'  },
    { init: 'MT', bg: 'bg-purple-100 text-purple-700', active: [],         bar: null,                                                  label: null            },
    { init: 'JK', bg: 'bg-teal-100 text-teal-700',    active: [2,3],      bar: 'bg-cyan-100 border-cyan-200 text-cyan-700',          label: 'Home Office'   },
    { init: 'SR', bg: 'bg-amber-100 text-amber-700',  active: [1,2,3,4],  bar: 'bg-amber-50 border-amber-200 text-amber-700',        label: 'Pending…'      },
  ]

  return (
    <div className="relative w-full max-w-md select-none pointer-events-none">
      <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 blur-2xl opacity-70" />
      <div className="relative rounded-2xl overflow-hidden bg-white border border-gray-200/60 shadow-2xl">

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-white/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-semibold text-white">Team Calendar</span>
          </div>
          <span className="text-xs text-white/60 font-medium">May 2026</span>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-[40px_repeat(5,1fr)] mb-2">
            <div />
            {days.map((d, i) => (
              <div key={d} className="text-center">
                <div className="text-[10px] font-medium text-gray-400">{d}</div>
                <div className="text-[11px] font-semibold text-gray-600">{dates[i]}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {rows.map((row, ri) => (
              <div key={ri} className="grid grid-cols-[40px_repeat(5,1fr)] items-center gap-0.5">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold ${row.bg}`}>
                  {row.init}
                </div>
                {[0,1,2,3,4].map(di => {
                  const on      = row.active.includes(di)
                  const hasPrev = row.active.includes(di - 1)
                  const hasNext = row.active.includes(di + 1)
                  const isFirst = on && !hasPrev
                  return (
                    <div
                      key={di}
                      className={[
                        'h-7 flex items-center text-[9px] font-medium border',
                        on
                          ? `${row.bar} ${!hasPrev ? 'rounded-l-md' : 'rounded-l-none border-l-0'} ${!hasNext ? 'rounded-r-md' : 'rounded-r-none'}`
                          : 'bg-gray-50 border-transparent rounded-md',
                      ].join(' ')}
                    >
                      {isFirst && row.label && (
                        <span className="px-1.5 truncate leading-none">{row.label}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 px-5 py-2.5 flex flex-wrap gap-3">
          {[
            { c: 'bg-emerald-400', l: 'Approved'    },
            { c: 'bg-cyan-400',    l: 'Home Office'  },
            { c: 'bg-amber-400',   l: 'Pending'      },
          ].map(({ c, l }) => (
            <span key={l} className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className={`h-2 w-2 rounded-full ${c}`} />
              {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-4 hover:shadow-md transition-shadow">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

// ─── Auth / landing page ──────────────────────────────────────────────────────

function AuthSection({ onSuccess, onError, error, loading }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex flex-col">

      {/* Nav bar — logo only */}
      <div className="px-6 lg:px-8 py-4 bg-white/70 backdrop-blur-sm border-b border-white/60">
        <span className="text-xl font-extrabold tracking-tight text-blue-600 select-none">
          Digileave
        </span>
      </div>

      {/* Hero — split screen */}
      <div className="flex-1 flex items-center">
        <div className="w-full max-w-7xl mx-auto px-6 lg:px-12 py-12">
          <div className="grid sm:grid-cols-2 gap-8 sm:gap-12 items-center">

            {/* Left — headline */}
            <div className="space-y-5">
              <h1 className="text-5xl font-extrabold tracking-tight leading-tight text-gray-900">
                Empowering<br />
                <span className="text-blue-600">your time off</span>
              </h1>
              <p className="text-lg text-gray-500 leading-relaxed max-w-md">
                From requesting leave to team-wide visibility and instant approvals —
                Digileave keeps everyone in sync without the email chains.
              </p>
            </div>

            {/* Right — login card */}
            <div id="auth-card" className="w-full max-w-md lg:max-w-full mx-auto
              rounded-2xl overflow-hidden
              bg-white/80 backdrop-blur-md
              border border-gray-200/70
              shadow-2xl shadow-gray-200/60
              ring-1 ring-gray-900/5">

              {/* Card header accent */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-blue-200 mb-1">
                  Get started
                </p>
                <h2 className="text-xl font-bold text-white">Sign in to Digileave</h2>
              </div>

              {/* Card body */}
              <div className="px-8 py-7 space-y-5">
                <p className="text-sm text-gray-500">
                  Use your company Google account to access your leave dashboard.
                </p>

                {error && (
                  <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {loading ? (
                  <p className="text-sm text-gray-500">Signing you in…</p>
                ) : (
                  <GoogleLogin
                    onSuccess={onSuccess}
                    onError={onError}
                    useOneTap
                    text="signin_with"
                    shape="rectangular"
                    logo_alignment="left"
                  />
                )}

                <p className="text-xs text-gray-400 pt-1">
                  Secure sign-in · Company accounts only
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Feature grid */}
      <section aria-label="Features" className="max-w-7xl mx-auto w-full px-6 lg:px-12 pb-16">
        <div className="grid sm:grid-cols-3 gap-5">
          <FeatureCard
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
            title="Real-time Balances"
            description="See exactly how many days you have left, including pending requests and year-end carry-over — always up to date."
          />
          <FeatureCard
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
              </svg>
            }
            title="Shared Team Calendar"
            description="Spot who's off at a glance. Plan around your colleagues without a single back-and-forth email."
          />
          <FeatureCard
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            }
            title="Automated Notifications"
            description="Managers are notified the moment a request comes in. Employees hear back as soon as a decision is made."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-5 px-6 text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} Digileave. All rights reserved.
      </footer>
    </div>
  )
}

// ─── Nav icons ───────────────────────────────────────────────────────────────

const mkIcon = (d) => ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)

const IconTeamCalendar = mkIcon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z')
const IconRequestLeave = mkIcon('M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z')
const IconMyRequests   = mkIcon('M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01')
const IconApprovals    = mkIcon('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z')
const IconUsers        = mkIcon('M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z')
const IconLogs         = mkIcon('M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z')
const IconMenu         = mkIcon('M4 6h16M4 12h16M4 18h16')
const IconChevronLeft  = mkIcon('M15 19l-7-7 7-7')
const IconChevronRight = mkIcon('M9 5l7 7-7 7')
const IconLogout       = mkIcon('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1')

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ navItems, activeTab, onSelect, user, onSignOut, isOpen, onClose, collapsed, onToggleCollapse }) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-30 flex flex-col bg-gray-50 border-r border-gray-200
          transition-all duration-200 ease-in-out
          ${collapsed ? 'w-16' : 'w-64'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Brand row */}
        <div className="flex h-14 shrink-0 items-center border-b border-gray-200 px-3">
          {!collapsed && (
            <span className="flex-1 truncate text-lg font-extrabold tracking-tight text-blue-600">
              Digileave
            </span>
          )}
          {collapsed && (
            <span className="flex-1 text-center text-lg font-extrabold tracking-tight text-blue-600">
              D
            </span>
          )}
          {/* Collapse toggle — desktop only */}
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapse}
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {collapsed
              ? <IconChevronRight className="h-4 w-4" />
              : <IconChevronLeft  className="h-4 w-4" />
            }
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {navItems.map(item => {
            const active = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                onClick={() => { onSelect(item.id); onClose() }}
                className={`mb-0.5 flex w-full items-center rounded-lg border-l-[3px] px-2.5 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                  ${collapsed ? 'justify-center gap-0' : 'gap-3'}
                  ${active
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
              >
                <div className="relative shrink-0">
                  <item.icon className="h-5 w-5" />
                  {/* Badge dot in collapsed mode */}
                  {collapsed && item.badge > 0 && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </div>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="ml-auto inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* User block */}
        <div className={`shrink-0 border-t border-gray-200 p-3 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
          {collapsed ? (
            <>
              {user.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {initials(user.name)}
                </span>
              )}
              <button
                type="button"
                title="Sign out"
                onClick={onSignOut}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <IconLogout className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-3">
                {user.picture ? (
                  <img src={user.picture} alt="" referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {initials(user.name)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">{user.name}</p>
                  <p className="truncate text-xs text-gray-400 capitalize">{user.role?.toLowerCase()}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('digileave_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })
  // true while we attempt a silent token refresh on page load
  const [initializing, setInitializing] = useState(
    () => !!localStorage.getItem('digileave_user')
  )
  const [authError, setAuthError]     = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Active tab: 'team' | 'request' | 'history' | 'approvals' | 'users' | 'logs'
  const [activeTab, setActiveTab] = useState('team')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }
  const [historyPage, setHistoryPage] = useState(1)
  const [historySort, setHistorySort] = useState({ key: 'requestDate', dir: 'desc' })
  const histCf = useColumnFilters(HIST_INITIAL)

  // Form fields
  const [dateRange, setDateRange]     = useState({ from: null, to: null })
  const [leaveType, setLeaveType]     = useState('')
  const [halfDaySlot, setHalfDaySlot] = useState('')  // '' | 'MORNING' | 'AFTERNOON'
  const [reason, setReason]           = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting]   = useState(false)

  // ── Domain hooks ──────────────────────────────────────────────────────────

  const leaveHook    = useLeaveRequests(user?.id)
  const approverHook = useApproverRequests(user?.id)
  const userMgmtHook = useUserManagement(user)

  const {
    history, summary, loading: historyLoading, historyError,
    cancelError, setCancelError, fetchSummary, cancelRequest, submitRequest, leaveDateMap,
  } = leaveHook

  const {
    requests: pendingRequests, loading: pendingLoading,
    pendingCount, fetchRequests: fetchPendingRequests,
    approveRequest, rejectRequest,
  } = approverHook

  const {
    allUsers, managedUsers, usersLoading, managedUsersLoading,
    fetchAllUsers, fetchManagedUsers,
    updateRole: handleRoleUpdate,
    updateBalance: handleBalanceUpdate,
    updateApprovers: handleApproverSave,
    updateTeam: handleTeamUpdate,
  } = userMgmtHook

  // ── Auth handlers ──────────────────────────────────────────────────────────

  async function handleLoginSuccess(credentialResponse) {
    setAuthError('')
    setAuthLoading(true)
    try {
      const { data } = await api.post(`${API}/api/auth/google`, {
        idToken: credentialResponse.credential,
      })
      const { accessToken, user: loggedInUser } = data
      setAccessToken(accessToken)
      localStorage.setItem('digileave_user', JSON.stringify(loggedInUser))
      setUser(loggedInUser)
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setAuthError('Cannot reach the server. Please check your connection and try again.')
      } else {
        setAuthError(err.response?.data?.message ?? 'Sign-in failed. Please try again.')
      }
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLoginError() {
    setAuthError('Google sign-in was cancelled or failed. Please try again.')
  }

  function doSignOut() {
    clearAccessToken()
    googleLogout()
    localStorage.removeItem('digileave_user')
    setUser(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function handleSignOut() {
    api.post(`${API}/api/auth/logout`).catch(() => {})
    doSignOut()
  }

  // Listen for the auth-expired event dispatched by the api.js interceptor
  useEffect(() => {
    window.addEventListener('auth-expired', doSignOut)
    return () => window.removeEventListener('auth-expired', doSignOut)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Token + profile refresh on page load ──────────────────────────────────
  // On every page load we attempt a silent token refresh using the HttpOnly
  // refresh cookie.  If it fails the session has expired → force re-login.
  // On success we also pull the latest profile so role changes take effect.
  useEffect(() => {
    if (!initializing) return
    plainAxios.post(`${API}/api/auth/refresh`)
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        return api.get(`${API}/api/users/${user.id}`)
      })
      .then(({ data }) => {
        const refreshed = {
          ...user,
          role:           data.role,
          approverEmails: data.approverEmails,
          annualLeave:    data.annualLeave,
        }
        if (JSON.stringify(refreshed) !== JSON.stringify(user)) {
          localStorage.setItem('digileave_user', JSON.stringify(refreshed))
          setUser(refreshed)
        }
      })
      .catch(() => {
        clearAccessToken()
        localStorage.removeItem('digileave_user')
        setUser(null)
      })
      .finally(() => setInitializing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Side effects for data loading ─────────────────────────────────────────

  useEffect(() => {
    if (user?.role === ROLES.ADMIN) fetchAllUsers()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.id && user?.role === ROLES.APPROVER && activeTab === 'users') {
      fetchManagedUsers()
    }
  }, [user?.id, user?.role, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user?.id && (user?.role === ROLES.ADMIN || user?.role === ROLES.APPROVER)) {
      fetchPendingRequests()
    }
  }, [user?.id, user?.role, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset My Requests sort + filter every time the tab is opened
  useEffect(() => {
    if (activeTab === 'history') {
      setHistorySort({ key: 'requestDate', dir: 'desc' })
      setHistoryPage(1)
      histCf.clear()
      histCf.setOpen(false)
    }
  }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setHistoryPage(1) }, [histCf.raw])

  // ── Approval callbacks ─────────────────────────────────────────────────────

  function handleApprovalFilterChange(filterParams) {
    if (user?.id && canApprove) fetchPendingRequests(filterParams)
  }

  async function handleApprove(requestId) {
    await approveRequest(requestId)
    fetchSummary()
  }

  async function handleReject(requestId, reason) {
    await rejectRequest(requestId, reason)
    fetchSummary()
  }

  // ── Form handlers ──────────────────────────────────────────────────────────

  function handleClear() {
    setDateRange({ from: null, to: null })
    setLeaveType('')
    setHalfDaySlot('')
    setReason('')
    setSubmitError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!dateRange?.from || !dateRange?.to || !leaveType) return

    setSubmitError('')
    setSubmitting(true)
    try {
      await submitRequest({
        startDate:   isoOf(dateRange.from),
        endDate:     isoOf(dateRange.to),
        type:        leaveType,
        halfDaySlot: halfDaySlot || null,
      })
      handleClear()
      setHistoryPage(1)
      setActiveTab('history')
    } catch (err) {
      const data = err.response?.data
      setSubmitError(data?.message ?? (typeof data === 'string' ? data : null)
        ?? 'Could not submit your request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const startISO         = dateRange?.from ? isoOf(dateRange.from) : ''
  const endISO           = dateRange?.to   ? isoOf(dateRange.to)   : ''
  const isHalfDay        = halfDaySlot !== ''
  const previewDays      = countWorkdays(startISO, endISO, isHalfDay)
  // Available for NEW requests = total budget − used − pending − this preview request
  // summary.available only subtracts used; subtract pending separately to avoid double-count.
  const formAvailable    = summary != null
    ? (summary.entitled ?? 0) + (summary.transferred ?? 0) + (summary.startingBalanceAdjustment ?? 0)
      - (summary.used ?? 0) - (summary.pending ?? 0)
    : 0
  // Only annual leave affects the balance — never show balance impact for other types
  const remainingAfter   = leaveType === 'annual' && summary != null && previewDays != null
    ? formAvailable - previewDays
    : null

  // Slot conflict: warn if the user already has an active request with the same slot
  // on the selected end date (the day where the slot applies).
  const slotConflict = useMemo(() => {
    if (!halfDaySlot || !endISO) return null
    const conflict = history.find(row => {
      if (row.status === 'cancelled' || row.status === 'rejected') return false
      // A conflict exists when an existing request covers the end date AND has the same slot
      const rowSlot = row.halfDaySlot ?? 'NONE'
      if (rowSlot !== halfDaySlot) return false
      // The slot applies to the last day of the existing request
      return row.endDate === endISO
    })
    if (!conflict) return null
    return halfDaySlot === 'MORNING'
      ? 'You already have a morning request on this date.'
      : 'You already have an afternoon request on this date.'
  }, [halfDaySlot, endISO, history])

  // My Requests — filtered client-side, sorted, then paginated
  const filteredHistory = useMemo(() => {
    const f = histCf.raw
    let result = history
    if (f.type)   result = result.filter(r => normalizeLeaveType(r.type) === f.type)
    if (f.status) result = result.filter(r => (r.status ?? '').toLowerCase() === f.status)
    if (f.requestDateFrom) result = result.filter(r => r.requestDate >= f.requestDateFrom)
    if (f.requestDateTo)   result = result.filter(r => r.requestDate <= f.requestDateTo)
    if (f.startDateFrom)   result = result.filter(r => r.startDate   >= f.startDateFrom)
    if (f.startDateTo)     result = result.filter(r => r.startDate   <= f.startDateTo)
    return result
  }, [history, histCf.raw])

  const totalDaysAccounted = filteredHistory
    .filter((row) => row.status !== 'rejected' && row.status !== 'cancelled')
    .reduce((sum, row) => sum + row.totalDays, 0)

  const sortedHistory = useMemo(
    () => sortRequests(filteredHistory, historySort.key, historySort.dir),
    [filteredHistory, historySort]
  )
  const pagedHistory = sortedHistory.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE)

  function handleHistorySort(key) {
    setHistorySort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    )
    setHistoryPage(1)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthSection
        onSuccess={handleLoginSuccess}
        onError={handleLoginError}
        error={authError}
        loading={authLoading}
      />
    )
  }

  const canApprove = user.role === ROLES.ADMIN || user.role === ROLES.APPROVER

  const navItems = [
    { id: 'team',      label: 'Team Calendar',  icon: IconTeamCalendar },
    { id: 'request',   label: 'Request Leave',   icon: IconRequestLeave },
    { id: 'history',   label: 'My Requests',     icon: IconMyRequests   },
    ...(canApprove ? [{ id: 'approvals', label: 'Approvals', icon: IconApprovals, badge: pendingCount }] : []),
    ...(canApprove ? [{ id: 'users',     label: 'Users',     icon: IconUsers }] : []),
    ...(user.role === ROLES.ADMIN ? [{ id: 'logs', label: 'System Logs', icon: IconLogs }] : []),
  ]

  return (
    <div id="app" className="flex h-screen overflow-hidden bg-gray-100">

      <Sidebar
        navItems={navItems}
        activeTab={activeTab}
        onSelect={setActiveTab}
        user={user}
        onSignOut={handleSignOut}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {/* ── Content shell ──────────────────────────────────────────────── */}
      <div className={`flex flex-1 flex-col overflow-hidden transition-all duration-200 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>

        {/* Mobile top bar — hamburger only, hidden on desktop */}
        <header
          role="banner"
          className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden"
        >
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <span className="text-base font-extrabold tracking-tight text-blue-600">Digileave</span>
        </header>

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">

            {/* Balance summary strip */}
            <section id="entitlement-overview" aria-labelledby="entitlement-heading">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 id="entitlement-heading" className="text-base font-semibold text-gray-800">
                  My Leave Balance
                </h2>
                <p className="text-xs text-gray-400">
                  <time dateTime="2026-01-01/2026-12-31">1 Jan – 31 Dec 2026</time>
                </p>
              </div>
              <BalanceSummary summary={summary} />
            </section>

            {/* Panel container */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          {/* ── Request Leave tab ──────────────────────────────────────── */}
          {activeTab === 'request' && (
            <div
              id="tabpanel-request"
              role="tabpanel"
              aria-labelledby="tab-request"
              className="p-6"
            >
              <form method="post" action="#" noValidate aria-label="Leave request form" onSubmit={handleSubmit}>

                {/* Inline calendar */}
                <div className="mb-6">
                  <div className="mb-3 flex items-baseline gap-3">
                    <span className="text-sm font-medium text-gray-700">
                      Select dates <abbr title="required" className="text-red-500 no-underline">*</abbr>
                    </span>
                    {dateRange.from && (
                      <span className="text-xs text-gray-400">
                        {dateRange.to
                          ? <>{fmtDate(isoOf(dateRange.from))} → {fmtDate(isoOf(dateRange.to))}</>
                          : <>Start: {fmtDate(isoOf(dateRange.from))} — now pick an end date</>
                        }
                      </span>
                    )}
                  </div>
                  <LeaveCalendar range={dateRange} onRangeChange={setDateRange} leaveDates={leaveDateMap} />
                </div>

                {/* Half-day controls — shown as soon as a start date is picked */}
                {dateRange.from && (
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        id="half-day-toggle"
                        type="checkbox"
                        checked={isHalfDay}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setHalfDaySlot(checked ? 'MORNING' : '')
                          // If no end date yet, auto-set it to the start date so the
                          // user gets a single-day half-day without a second calendar click
                          if (checked && !dateRange.to) {
                            setDateRange(prev => ({ ...prev, to: prev.from }))
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <label htmlFor="half-day-toggle" className="text-sm text-gray-700 select-none cursor-pointer">
                        {dateRange.to ? 'Half day on last date' : 'Half day'}
                      </label>
                      {!dateRange.to && !isHalfDay && (
                        <span className="text-xs text-gray-400">— or click a second date for a range</span>
                      )}
                    </div>

                    {/* MORNING / AFTERNOON slot picker */}
                    {isHalfDay && (
                      <div className="flex items-center gap-4 pl-6">
                        <span className="text-xs text-gray-500 shrink-0">Slot:</span>
                        {['MORNING', 'AFTERNOON'].map(slot => (
                          <label key={slot} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="radio"
                              name="half-day-slot"
                              value={slot}
                              checked={halfDaySlot === slot}
                              onChange={() => setHalfDaySlot(slot)}
                              className="h-3.5 w-3.5 border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                            />
                            <span className="text-sm text-gray-700">
                              {slot === 'MORNING' ? '☀ Morning' : '🌙 Afternoon'}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Slot conflict warning */}
                    {slotConflict && (
                      <p role="alert" className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                        {slotConflict}
                      </p>
                    )}
                  </div>
                )}

                {/* Live workday preview */}
                {previewDays !== null && (
                  previewDays === 0 ? (
                    <div className="mb-5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                      The selected range contains no working days — weekends and public holidays are excluded.
                    </div>
                  ) : (
                    <div className="mb-5 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 flex items-center justify-between gap-4 flex-wrap">
                      <span>
                        This request will use{' '}
                        <strong>{previewDays} working day{previewDays !== 1 ? 's' : ''}</strong>.
                        {isHalfDay && (
                          <span className="ml-1 text-blue-600">
                            ({halfDaySlot === 'MORNING' ? 'morning' : 'afternoon'} on last date)
                          </span>
                        )}
                      </span>
                      {remainingAfter !== null && (
                        <span className={`font-medium ${remainingAfter < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                          {remainingAfter < 0
                            ? `Exceeds balance by ${Math.abs(remainingAfter)} day${Math.abs(remainingAfter) !== 1 ? 's' : ''}`
                            : `${remainingAfter} day${remainingAfter !== 1 ? 's' : ''} remaining after`}
                        </span>
                      )}
                    </div>
                  )
                )}

                <fieldset className="space-y-4">
                  <legend className="sr-only">Leave Details</legend>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Leave type */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="leave-type" className="text-sm font-medium text-gray-700">
                        Leave Type <abbr title="required" className="text-red-500 no-underline">*</abbr>
                      </label>
                      <select
                        id="leave-type"
                        name="leave_type"
                        required
                        aria-required="true"
                        value={leaveType}
                        onChange={(e) => setLeaveType(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="" disabled>Select a leave type</option>
                        <option value="annual">Annual Leave</option>
                        <option value="sick">Sick Leave</option>
                        <option value="unpaid">Unpaid Leave</option>
                        <option value="maternity">Maternity / Paternity</option>
                        <option value="home_office">Home Office</option>
                      </select>
                    </div>

                    {/* Reason */}
                    <div className="flex flex-col gap-1">
                      <label htmlFor="leave-reason" className="text-sm font-medium text-gray-700">
                        Reason / Notes
                      </label>
                      <textarea
                        id="leave-reason"
                        name="leave_reason"
                        rows="2"
                        maxLength="500"
                        placeholder="Optional — any context for your manager."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>
                </fieldset>

                {submitError && (
                  <p role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {submitError}
                  </p>
                )}

                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting || !dateRange?.from || !dateRange?.to || !leaveType || !!slotConflict}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting…' : 'Submit Request'}
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── My Requests tab ────────────────────────────────────────── */}
          {activeTab === 'history' && (
            <div
              id="tabpanel-history"
              role="tabpanel"
              aria-labelledby="tab-history"
              className="p-6"
            >
              {historyError ? (
                <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {historyError}
                </p>
              ) : (
                <>
                  {cancelError && (
                    <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {cancelError}
                    </p>
                  )}
                  <BaseTable
                    columns={HIST_COLS}
                    sort={historySort}
                    onSort={handleHistorySort}
                    filters={histCf.raw}
                    onFilterUpdate={histCf.update}
                    filterOpen={histCf.open}
                    onFilterToggle={() => histCf.setOpen(o => !o)}
                    hasActiveFilters={histCf.hasActive}
                    activeFilterCount={histCf.activeCount}
                    onFilterClear={histCf.clear}
                    page={historyPage}
                    total={sortedHistory.length}
                    onPageChange={setHistoryPage}
                    loading={historyLoading}
                    isEmpty={history.length === 0}
                    emptyMessage="No requests yet."
                    emptyHint={
                      <button
                        type="button"
                        onClick={() => setActiveTab('request')}
                        className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                      >
                        Submit your first request →
                      </button>
                    }
                    footer={
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                          <td colSpan="3" className="py-3 pr-4">Total days accounted</td>
                          <td colSpan="4" className="py-3 tabular-nums">{totalDaysAccounted}</td>
                        </tr>
                      </tfoot>
                    }
                  >
                    {pagedHistory.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 pr-4 whitespace-nowrap"><time dateTime={row.requestDate}>{fmtDate(row.requestDate)}</time></td>
                        <td className="py-3 pr-4 whitespace-nowrap"><time dateTime={row.startDate}>{fmtDate(row.startDate)}</time></td>
                        <td className="py-3 pr-4 whitespace-nowrap"><time dateTime={row.endDate}>{fmtDate(row.endDate)}</time></td>
                        <td className="py-3 pr-4 tabular-nums">{row.totalDays}</td>
                        <td className="py-3 pr-4">{formatLeaveType(row.type)}</td>
                        <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                        <td className="py-3">
                          {(row.status === 'pending' ||
                            (row.status === 'approved' &&
                             new Date(row.startDate + 'T00:00:00') > new Date())) && (
                            <button
                              type="button"
                              onClick={() => cancelRequest(row.id)}
                              aria-label={`Cancel request dated ${fmtDate(row.requestDate)}`}
                              className="text-red-500 hover:underline text-xs font-medium"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </BaseTable>
                </>
              )}
            </div>
          )}

          {/* ── Team Calendar tab ──────────────────────────────────────── */}
          {activeTab === 'team' && (
            <div
              id="tabpanel-team"
              role="tabpanel"
              aria-labelledby="tab-team"
              className="p-6"
            >
              <TeamCalendar userId={user.id} />
            </div>
          )}

          {/* ── Approvals tab (ADMIN + APPROVER) ───────────────────────── */}
          {activeTab === 'approvals' && canApprove && (
            <div
              id="tabpanel-approvals"
              role="tabpanel"
              aria-labelledby="tab-approvals"
              className="p-6"
            >
              <ApproverView
                requests={pendingRequests}
                loading={pendingLoading}
                onApprove={handleApprove}
                onReject={handleReject}
                onFetchRequests={handleApprovalFilterChange}
              />
            </div>
          )}

          {/* ── Users tab (ADMIN = full edit; APPROVER = read-only) ────── */}
          {activeTab === 'users' && canApprove && (
            <div
              id="tabpanel-users"
              role="tabpanel"
              aria-labelledby="tab-users"
              className="p-6"
            >
              {user.role === ROLES.ADMIN ? (
                <AdminPanel
                  allUsers={allUsers}
                  usersLoading={usersLoading}
                  onSaveRole={handleRoleUpdate}
                  onSaveBalance={handleBalanceUpdate}
                  onSaveApprovers={handleApproverSave}
                  onSaveTeam={handleTeamUpdate}
                  onRefreshUsers={fetchAllUsers}
                />
              ) : (
                <ApproverUsersView
                  users={managedUsers}
                  loading={managedUsersLoading}
                />
              )}
            </div>
          )}

          {/* ── System Logs tab (ADMIN only) ────────────────────────────── */}
          {activeTab === 'logs' && user.role === ROLES.ADMIN && (
            <div
              id="tabpanel-logs"
              role="tabpanel"
              aria-labelledby="tab-logs"
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">System Audit Log</h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Read-only record of balance changes and leave status transitions.
                </p>
              </div>
              <AuditLog />
            </div>
          )}

            </div>

            <footer role="contentinfo" className="py-4 text-center text-xs text-gray-400">
              &copy; <time dateTime="2026">2026</time> Digileave. All rights reserved.
            </footer>

          </div>
        </main>
      </div>
    </div>
  )
}

export default App
