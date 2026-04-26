import { useState, useEffect, useMemo } from 'react'
import { GoogleLogin, googleLogout } from '@react-oauth/google'
import axios from 'axios'
import AdminPanel from './AdminPanel'
import ApproverView from './ApproverView'
import ApproverUsersView from './ApproverUsersView'
import LeaveCalendar, { isoOf, HOLIDAYS } from './LeaveCalendar'
import StatusBadge from './StatusBadge'
import TeamCalendar from './TeamCalendar'
import Pagination, { PAGE_SIZE, SortableTh, sortRequests } from './Pagination'
import './App.css'

// ─── API base URL ─────────────────────────────────────────────────────────────
// Dev:  .env.development → http://localhost:8080
// Prod: .env.production  → Cloud Run URL (written by deploy.sh)
const API = import.meta.env.VITE_API_BASE_URL

// ─── Static data ─────────────────────────────────────────────────────────────

const LEAVE_TYPE_LABELS = {
  annual:      'Annual Leave',
  sick:        'Sick Leave',
  unpaid:      'Unpaid Leave',
  maternity:   'Maternity / Paternity',
  home_office: 'Home Office',
}

// Legacy label → canonical key map (for records stored before the key-based format)
const LEGACY_TYPE_MAP = {
  'annual leave':          'annual',
  'sick leave':            'sick',
  'unpaid leave':          'unpaid',
  'maternity / paternity': 'maternity',
  'home office':           'home_office',
}

/**
 * Normalise a leave type string to its canonical key (e.g. "Annual Leave" → "annual").
 * Handles both the current key format and legacy label format transparently.
 */
function normalizeType(type) {
  if (!type) return ''
  const lower = type.toLowerCase().trim()
  return LEGACY_TYPE_MAP[lower] ?? lower
}

/** Return a human-readable label for any type string, regardless of storage format. */
function formatLeaveType(type) {
  const key = normalizeType(type)
  return LEAVE_TYPE_LABELS[key] ?? type ?? '—'
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

// ─── Auth / landing page ─────────────────────────────────────────────────────

function AuthSection({ onSuccess, onError, error, loading }) {
  return (
    <section
      id="auth-section"
      aria-labelledby="auth-heading"
      className="min-h-screen bg-gray-50 flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1
            id="auth-heading"
            className="text-4xl font-extrabold text-blue-600 tracking-tight"
          >
            Digileave
          </h1>
          <p className="mt-1 text-gray-500 text-sm">Vacation Leave Management</p>
        </header>

        <div
          id="auth-card"
          role="main"
          className="bg-white rounded-2xl shadow-lg p-8 space-y-6"
        >
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold text-gray-800">Sign in to your account</h2>
            <p className="text-sm text-gray-500">
              Use your company Google account to access your leave dashboard.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center">
              {error}
            </p>
          )}

          <div className="flex justify-center">
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
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({ tabs, activeTab, onSelect }) {
  return (
    <div className="border-b border-gray-200" role="tablist" aria-label="Dashboard sections">
      <div className="flex gap-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`tabpanel-${id}`}
            onClick={() => onSelect(id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              activeTab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
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
  const [authError, setAuthError]     = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [history, setHistory]         = useState([])
  const [historyLoading, setHistoryLoading] = useState(
    () => !!localStorage.getItem('digileave_user')
  )
  const [historyError, setHistoryError] = useState('')
  const [summary, setSummary]           = useState(null)

  // Active tab: 'team' | 'request' | 'history' | 'approvals' | 'users'
  const [activeTab, setActiveTab] = useState('team')
  const [historyPage, setHistoryPage] = useState(1)
  const [historySort, setHistorySort] = useState({ key: 'requestDate', dir: 'desc' })

  // Admin state
  const [allUsers, setAllUsers]         = useState([])
  const [usersLoading, setUsersLoading] = useState(false)

  // Approver — read-only team members list
  const [managedUsers, setManagedUsers]           = useState([])
  const [managedUsersLoading, setManagedUsersLoading] = useState(false)

  // Approver/admin state
  const [pendingRequests, setPendingRequests] = useState([])
  const [pendingLoading, setPendingLoading]   = useState(false)

  // Form fields
  const [dateRange, setDateRange]     = useState({ from: null, to: null })
  const [leaveType, setLeaveType]     = useState('')
  // '' = no half-day, 'MORNING' or 'AFTERNOON' = specific slot
  const [halfDaySlot, setHalfDaySlot] = useState('')
  const [reason, setReason]           = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [cancelError, setCancelError] = useState('')

  // ── Auth handlers ──────────────────────────────────────────────────────────

  async function handleLoginSuccess(credentialResponse) {
    setAuthError('')
    setAuthLoading(true)
    try {
      const { data } = await axios.post(`${API}/api/auth/google`, {
        idToken: credentialResponse.credential,
      })
      setHistoryLoading(true)
      localStorage.setItem('digileave_user', JSON.stringify(data))
      setUser(data)
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

  function handleSignOut() {
    googleLogout()
    localStorage.removeItem('digileave_user')
    setUser(null)
    setHistory([])
    setSummary(null)
    setAllUsers([])
    setPendingRequests([])
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  // ── Leave history & summary fetch ──────────────────────────────────────────

  async function fetchUserRequests(userId) {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const { data } = await axios.get(`${API}/api/leave/user/${userId}`)
      setHistory(data.map((item) => ({ ...item, status: item.status.toLowerCase() })))
      setHistoryPage(1)
    } catch (err) {
      if (err.response) {
        setHistoryError('Could not load your leave history. Please refresh to try again.')
      }
    } finally {
      setHistoryLoading(false)
    }
  }

  async function fetchSummary(userId) {
    try {
      const { data } = await axios.get(`${API}/api/leave/summary/${userId}`)
      setSummary(data)
    } catch {
      // non-critical — cards will show 0 until next successful fetch
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchUserRequests(user.id)
      fetchSummary(user.id)
    }
  }, [user?.id])

  // ── Silent profile refresh ─────────────────────────────────────────────────
  // Runs once on mount. If an admin changed this user's role since their last
  // login, the updated role is pulled from the DB and written back to state +
  // localStorage — no logout required.
  useEffect(() => {
    if (!user?.id) return
    axios.get(`${API}/api/users/${user.id}`)
      .then(({ data }) => {
        const refreshed = {
          ...user,
          role:          data.role,
          entitledDays:  data.entitledDays,
          remainingDays: data.remainingDays,
          usedDays:      data.usedDays,
          approverEmails: data.approverEmails,
        }
        // Only update state (and trigger a re-render) if something actually changed
        if (JSON.stringify(refreshed) !== JSON.stringify(user)) {
          localStorage.setItem('digileave_user', JSON.stringify(refreshed))
          setUser(refreshed)
        }
      })
      .catch(() => { /* keep the cached profile — backend may be starting up */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin functions ────────────────────────────────────────────────────────

  async function fetchAllUsers() {
    setUsersLoading(true)
    try {
      const { data } = await axios.get(`${API}/api/users`)
      setAllUsers(data)
    } catch {
      // non-critical
    } finally {
      setUsersLoading(false)
    }
  }

  async function fetchManagedUsers(userId) {
    setManagedUsersLoading(true)
    try {
      const { data } = await axios.get(`${API}/api/users/managed?requesterId=${userId}`)
      setManagedUsers(data)
    } catch {
      // non-critical
    } finally {
      setManagedUsersLoading(false)
    }
  }

  async function handleRoleUpdate(userId, role) {
    // Let the error propagate — AdminPanel.saveRow only clears edits on success
    const { data } = await axios.patch(`${API}/api/users/${userId}/role`, { role })
    setAllUsers((prev) => prev.map((u) => u.id === userId ? data : u))
  }

  async function handleBalanceUpdate(userId, entitled, startingBalanceAdjustment) {
    const { data } = await axios.patch(`${API}/api/users/${userId}/balance`, { entitled, startingBalanceAdjustment })
    setAllUsers((prev) => prev.map((u) => u.id === userId ? data : u))
  }

  async function handleApproverSave(userId, approverEmails) {
    const { data } = await axios.patch(`${API}/api/users/${userId}/approver`, { approverEmails })
    setAllUsers((prev) => prev.map((u) => u.id === userId ? data : u))
  }

  async function handleTeamUpdate(userId, team) {
    const { data } = await axios.patch(`${API}/api/users/${userId}/team`, { team: team || null })
    setAllUsers((prev) => prev.map((u) => u.id === userId ? data : u))
  }

  useEffect(() => {
    if (user?.role === 'ADMIN') fetchAllUsers()
  }, [user?.id])

  useEffect(() => {
    if (user?.id && user?.role === 'APPROVER' && activeTab === 'users') {
      fetchManagedUsers(user.id)
    }
  }, [user?.id, user?.role, activeTab])

  async function fetchPendingRequests(userId) {
    setPendingLoading(true)
    try {
      const { data } = await axios.get(`${API}/api/leave/pending?userId=${userId}`)
      setPendingRequests(data)
    } catch {
      // non-critical
    } finally {
      setPendingLoading(false)
    }
  }

  async function handleApprove(requestId) {
    try {
      await axios.patch(`${API}/api/leave/${requestId}/status`, { status: 'APPROVED' })
      // Re-fetch so the approvals table and balance cards reflect the DB truth
      fetchPendingRequests(user.id)
      fetchSummary(user.id)
    } catch {
      // silently ignore — table re-fetches on next tab visit
    }
  }

  async function handleReject(requestId) {
    try {
      await axios.patch(`${API}/api/leave/${requestId}/status`, { status: 'REJECTED' })
      fetchPendingRequests(user.id)
      fetchSummary(user.id)
    } catch {
      // silently ignore
    }
  }

  async function handleCancel(requestId) {
    setCancelError('')
    try {
      await axios.patch(`${API}/api/leave/${requestId}/cancel?userId=${user.id}`)
      // Re-fetch My Requests and balance from DB — don't patch state locally
      fetchUserRequests(user.id)
      fetchSummary(user.id)
      // Point 4 — reactive approver view: remove the cancelled request immediately
      // so the Approvals tab reflects the change without a manual refresh.
      setPendingRequests(prev => prev.filter(r => r.id !== requestId))
    } catch (err) {
      const data = err.response?.data
      const msg = typeof data === 'string'
        ? data
        : data?.message || `Request failed (HTTP ${err.response?.status ?? 'network error'})`
      setCancelError(msg)
    }
  }

  useEffect(() => {
    if (user?.id && (user?.role === 'ADMIN' || user?.role === 'APPROVER')) {
      fetchPendingRequests(user.id)
    }
  }, [user?.id, user?.role, activeTab])

  // Reset My Requests sort to "Requested ↓" every time the tab is opened
  useEffect(() => {
    if (activeTab === 'history') {
      setHistorySort({ key: 'requestDate', dir: 'desc' })
      setHistoryPage(1)
    }
  }, [activeTab])

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

    const startDate = isoOf(dateRange.from)
    const endDate   = isoOf(dateRange.to)

    setSubmitError('')
    setSubmitting(true)
    try {
      const { data } = await axios.post(`${API}/api/leave/request`, {
        userId: user.id,
        startDate,
        endDate,
        type:        leaveType,           // send the canonical key (e.g. "annual", "home_office")
        halfDaySlot: halfDaySlot || null, // null → NONE (full day) on the backend
      })
      setHistory((prev) => [{ ...data, status: data.status.toLowerCase() }, ...prev])
      fetchSummary(user.id)
      handleClear()
      setHistoryPage(1)
      setActiveTab('history')
    } catch (err) {
      const msg = err.response?.status === 422
        ? err.response.data
        : 'Could not submit your request. Please try again.'
      setSubmitError(msg)
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

  const totalDaysAccounted = history
    .filter((row) => row.status !== 'rejected' && row.status !== 'cancelled')
    .reduce((sum, row) => sum + row.totalDays, 0)

  // My Requests — sorted by chosen column, then paginated
  const sortedHistory = useMemo(
    () => sortRequests(history, historySort.key, historySort.dir),
    [history, historySort]
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

  // Map of ISO date → 'approved' | 'pending' for marking existing leave on the calendar
  const leaveDateMap = useMemo(() => {
    const map = {}
    history.forEach(req => {
      if (req.status === 'rejected' || req.status === 'cancelled') return
      const cur = new Date(req.startDate + 'T00:00:00')
      const end = new Date(req.endDate   + 'T00:00:00')
      while (cur <= end) {
        const iso = isoOf(cur)
        // Approved takes precedence if the same date appears in two requests
        if (!map[iso] || map[iso] === 'pending') map[iso] = req.status
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [history])

  // ── Render ─────────────────────────────────────────────────────────────────

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

  // ── Debug: verify the env var is reaching the component ──────────────────
  console.log('Client ID loaded:', import.meta.env.VITE_GOOGLE_CLIENT_ID)

  const canApprove = user.role === 'ADMIN' || user.role === 'APPROVER'
  const pendingCount = pendingRequests.filter((r) => r.status === 'PENDING').length

  const tabs = [
    { id: 'team',     label: 'Team Calendar' },
    { id: 'request',  label: 'Request Leave' },
    { id: 'history',  label: 'My Requests' },
    ...(canApprove ? [{ id: 'approvals', label: pendingCount > 0 ? `Approvals (${pendingCount})` : 'Approvals' }] : []),
    ...(canApprove ? [{ id: 'users', label: 'Users' }] : []),
  ]

  return (
    <div id="app" className="min-h-screen bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        id="site-header"
        role="banner"
        className="bg-white border-b border-gray-200 sticky top-0 z-10"
      >
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <h1 className="text-xl font-extrabold text-blue-600 tracking-tight shrink-0">
            Digileave
          </h1>

          <div id="user-info" aria-label="Signed-in user" className="flex items-center gap-3">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold select-none"
              >
                {initials(user.name)}
              </span>
            )}

            <span className="hidden sm:inline text-sm font-medium text-gray-700">
              {user.name}
            </span>

            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main id="main-content" className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Balance summary strip — always visible */}
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

        {/* Tab container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

          <TabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

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
              {historyLoading ? (
                <p className="text-sm text-gray-500 py-8 text-center">Loading your leave requests…</p>
              ) : historyError ? (
                <p role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">No requests yet.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('request')}
                    className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                  >
                    Submit your first request →
                  </button>
                </div>
              ) : (
                <div role="region" aria-label="Leave request history" tabIndex="0" className="overflow-x-auto">
                  {cancelError && (
                    <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {cancelError}
                    </p>
                  )}
                  <table className="w-full text-sm text-left text-gray-700">
                    <caption className="sr-only">
                      All leave requests submitted during the current leave year.
                    </caption>
                    <thead>
                      <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                        <SortableTh label="Requested" colKey="requestDate" sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <SortableTh label="Start"     colKey="startDate"   sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <SortableTh label="End"       colKey="endDate"     sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <SortableTh label="Days"      colKey="totalDays"   sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <SortableTh label="Type"      colKey="type"        sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <SortableTh label="Status"    colKey="status"      sortKey={historySort.key} sortDir={historySort.dir} onSort={handleHistorySort} />
                        <th scope="col" className="py-3 font-medium"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
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
                                onClick={() => handleCancel(row.id)}
                                aria-label={`Cancel request dated ${fmtDate(row.requestDate)}`}
                                className="text-red-500 hover:underline text-xs font-medium"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                        <td colSpan="3" className="py-3 pr-4">Total days accounted</td>
                        <td colSpan="4" className="py-3 tabular-nums">{totalDaysAccounted}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <Pagination
                    page={historyPage}
                    total={sortedHistory.length}
                    pageSize={PAGE_SIZE}
                    onChange={setHistoryPage}
                  />
                </div>
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
              <TeamCalendar userId={user.id} api={API} />
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
              {user.role === 'ADMIN' ? (
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

        </div>

      </main>

      <footer
        id="site-footer"
        role="contentinfo"
        className="border-t border-gray-200 mt-8 py-5 text-center text-xs text-gray-400"
      >
        <p>&copy; <time dateTime="2026">2026</time> Digileave. All rights reserved.</p>
      </footer>

    </div>
  )
}

export default App
