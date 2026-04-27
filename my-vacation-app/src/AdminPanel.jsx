import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import Pagination, { PAGE_SIZE, SortableTh } from './Pagination'
import { useColumnFilters, FilterToolbar, FilterRow } from './ColumnFilters'

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  const base = 'fixed bottom-6 right-6 z-[10000] rounded-lg px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-2'
  const colours = type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'

  return createPortal(
    <div className={`${base} ${colours}`}>
      {type === 'success' ? '✓' : '!'} {message}
    </div>,
    document.body
  )
}

// ─── Manager multi-select dropdown (Portal-based to escape table stacking) ───

function ManagerDropdown({ managers, selected, userEmail, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos]   = useState({ top: 0, left: 0, width: 0 })
  const triggerRef      = useRef(null)
  const panelRef        = useRef(null)   // ← ref for the portal panel

  // Recalculate portal position whenever the dropdown opens
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({
      top:   r.bottom + window.scrollY,
      left:  r.left   + window.scrollX,
      width: r.width,
    })
  }, [open])

  // Close on outside click — must exclude BOTH the trigger AND the portal panel.
  // Without checking panelRef, any mousedown inside the portal looks "outside"
  // because it lives on document.body, so the dropdown was closing before the
  // checkbox onChange could fire.
  useEffect(() => {
    if (!open) return
    function onMouseDown(e) {
      if (
        !triggerRef.current?.contains(e.target) &&
        !panelRef.current?.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function toggle(email) {
    const next = selected.includes(email)
      ? selected.filter((e) => e !== email)
      : [...selected, email]
    onChange(next)
  }

  const selectedNames = managers
    .filter((m) => selected.includes(m.email) && m.email !== userEmail)
    .map((m) => m.name)

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[160px] max-w-[220px] w-full"
      >
        <span className="truncate text-left text-gray-800">
          {selectedNames.length > 0
            ? selectedNames.join(', ')
            : <span className="text-gray-400 italic">None</span>}
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel rendered via Portal so the table's overflow/stacking never clips it */}
      {open && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top:      pos.top + 4,
            left:     pos.left,
            minWidth: Math.max(pos.width, 200),
            zIndex:   9999,
          }}
          className="rounded-md border border-gray-200 bg-white shadow-lg py-1"
        >
          {managers.filter((m) => m.email !== userEmail).length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No admins or approvers yet</p>
          ) : (
            managers.filter((m) => m.email !== userEmail).map((m) => {
              const checked = selected.includes(m.email)
              return (
                <label
                  key={m.email}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none ${
                    checked ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.email)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span className={`text-xs ${checked ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                    {m.name}
                  </span>
                </label>
              )
            })
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Column filter config ─────────────────────────────────────────────────────

const USER_COLS = [
  { filter: { type: 'text', key: 'name'  } },
  { filter: { type: 'text', key: 'email' } },
  { filter: { type: 'select', key: 'role', options: [
    { value: '',           label: 'All Roles'  },
    { value: 'USER',       label: 'User'       },
    { value: 'APPROVER',   label: 'Approver'   },
    { value: 'ACCOUNTANT', label: 'Accountant' },
    { value: 'ADMIN',      label: 'Admin'      },
  ]}},
  { filter: null },
  { filter: null },
  { filter: { type: 'select', key: 'team', options: [
    { value: '',    label: 'All Teams' },
    { value: 'OPR', label: 'OPR'      },
    { value: 'DEV', label: 'DEV'      },
  ]}},
  { filter: null },
]

const USER_INITIAL = { name: '', email: '', role: '', team: '' }

// ─── Admin panel ──────────────────────────────────────────────────────────────

export default function AdminPanel({
  allUsers,
  usersLoading,
  onSaveRole,
  onSaveApprovers,
  onSaveBalance,
  onSaveTeam,
  onRefreshUsers,
}) {
  // rowEdits: { [userId]: { role?, approverEmails?, entitled?, startingBalanceAdjustment?, team? } }
  const [rowEdits, setRowEdits]     = useState({})
  const [saving, setSaving]         = useState({})
  const [saveError, setSaveError]   = useState({})
  const [toast, setToast]           = useState(null)
  const [approverWarn, setApproverWarn] = useState(null)
  const [page, setPage]             = useState(1)
  const [userSort, setUserSort]     = useState({ key: 'name', dir: 'asc' })

  const cf = useColumnFilters(USER_INITIAL)
  useEffect(() => { setPage(1) }, [cf.raw])

  // Managers dropdown always uses the full unfiltered list so role changes
  // in pending edits still appear as approver options immediately.
  const managers = allUsers.filter((u) => {
    const effectiveRole = rowEdits[u.id]?.role ?? u.role ?? 'USER'
    return effectiveRole === 'ADMIN' || effectiveRole === 'APPROVER'
  })

  // Client-side filtering keeps the manager dropdown working on the full set.
  const filteredUsers = useMemo(() => {
    const { name, email, role, team } = cf.raw
    let result = allUsers

    if (name) {
      const lc = name.toLowerCase()
      result = result.filter(u => (u.name ?? '').toLowerCase().includes(lc))
    }
    if (email) {
      const lc = email.toLowerCase()
      result = result.filter(u => (u.email ?? '').toLowerCase().includes(lc))
    }
    if (role) {
      result = result.filter(u => (u.role ?? '') === role)
    }
    if (team) {
      result = result.filter(u => (u.team ?? '') === team)
    }
    return result
  }, [allUsers, cf.raw])

  // Users sorted by chosen column; paginated
  const sortedUsers = useMemo(() => {
    const { key, dir } = userSort
    return [...filteredUsers].sort((a, b) => {
      let cmp
      if (key === 'entitled') {
        cmp = Number(a.annualLeave?.entitled ?? a.entitledDays ?? 0) - Number(b.annualLeave?.entitled ?? b.entitledDays ?? 0)
      } else if (key === 'team') {
        cmp = String(a.team ?? '').localeCompare(String(b.team ?? ''))
      } else {
        cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [filteredUsers, userSort])
  const pagedUsers = sortedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleUserSort(key) {
    setUserSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
    setPage(1)
  }

  function get(userId, field, fallback) {
    return rowEdits[userId]?.[field] ?? fallback
  }

  function set(userId, field, value) {
    setRowEdits((prev) => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [field]: value },
    }))
    // Clear any prior save error for this row when the user edits again
    setSaveError((prev) => { const next = { ...prev }; delete next[userId]; return next })
  }

  function isDirty(userId) {
    const e = rowEdits[userId]
    return e !== undefined && Object.keys(e).length > 0
  }

  // True if this user is being demoted FROM Approver and currently manages others
  function wouldOrphanUsers(u) {
    const pendingRole = rowEdits[u.id]?.role
    if (!pendingRole || pendingRole === u.role) return false
    if (u.role !== 'APPROVER') return false
    return allUsers.some(
      (other) => other.id !== u.id && other.approverEmails?.includes(u.email)
    )
  }

  // Called when Save is clicked — may show a warning first
  function handleSaveClick(u) {
    if (wouldOrphanUsers(u)) {
      setApproverWarn(u.id)
      return
    }
    doSave(u)
  }

  async function doSave(u) {
    setApproverWarn(null)
    const edits = rowEdits[u.id]
    if (!edits) return

    setSaving((prev) => ({ ...prev, [u.id]: true }))
    setSaveError((prev) => { const next = { ...prev }; delete next[u.id]; return next })

    try {
      const hasBalanceEdit = 'entitled' in edits || 'startingBalanceAdjustment' in edits
      await Promise.all([
        'role'           in edits ? onSaveRole(u.id, edits.role)                : null,
        'approverEmails' in edits ? onSaveApprovers(u.id, edits.approverEmails) : null,
        'team'           in edits ? onSaveTeam(u.id, edits.team)               : null,
        hasBalanceEdit
          ? onSaveBalance(
              u.id,
              Math.round(edits.entitled               ?? (u.annualLeave?.entitled               ?? u.entitledDays ?? 0)),
              Math.round(edits.startingBalanceAdjustment ?? (u.annualLeave?.startingBalanceAdjustment ?? 0))
            )
          : null,
      ].filter(Boolean))

      // Only clear local edits after every save succeeded
      setRowEdits((prev) => {
        const next = { ...prev }
        delete next[u.id]
        return next
      })
      setToast({ message: `${u.name} saved.`, type: 'success' })
      onRefreshUsers?.()
    } catch (err) {
      const detail = err.response?.data?.message ?? err.response?.data ?? err.message ?? null
      const msg = typeof detail === 'string' && detail.length < 200
        ? `Save failed: ${detail}`
        : 'Save failed — please try again.'
      setSaveError((prev) => ({ ...prev, [u.id]: msg }))
    } finally {
      setSaving((prev) => ({ ...prev, [u.id]: false }))
    }
  }

  return (
    <div id="user-management">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      <FilterToolbar
        open={cf.open}
        onToggle={() => cf.setOpen(o => !o)}
        hasActive={cf.hasActive}
        activeCount={cf.activeCount}
        onClear={cf.clear}
      />

      {usersLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading users…</p>
      ) : filteredUsers.length === 0 && cf.hasActive ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No users match your filters.</p>
          <button type="button" onClick={cf.clear}
            className="mt-2 text-sm font-medium text-blue-600 hover:underline">
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-700">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <SortableTh label="Name"          colKey="name"         sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Email"         colKey="email"        sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Role"          colKey="role"         sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <th scope="col" className="py-3 pr-4 font-medium">Managers</th>
                <SortableTh label="Balance" colKey="entitled" sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Team"    colKey="team"     sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <th scope="col" className="py-3 font-medium"><span className="sr-only">Save</span></th>
              </tr>
              {cf.open && <FilterRow columns={USER_COLS} filters={cf.raw} onUpdate={cf.update} />}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedUsers.map((u) => {
                const dirty            = isDirty(u.id)
                const isSaving         = saving[u.id] ?? false
                const error            = saveError[u.id]
                const currentRole      = get(u.id, 'role', u.role ?? 'USER')
                const currentApprovers = get(u.id, 'approverEmails', u.approverEmails ?? [])
                const currentEntitled  = get(u.id, 'entitled', u.annualLeave?.entitled ?? u.entitledDays ?? 0)
                const currentAdj       = get(u.id, 'startingBalanceAdjustment', u.annualLeave?.startingBalanceAdjustment ?? 0)
                const transferred      = u.annualLeave?.transferred ?? 0
                const currentTeam      = get(u.id, 'team', u.team ?? '')
                const showWarn         = approverWarn === u.id

                // key must be on Fragment — not on an inner <tr> — so React can
                // properly track multi-row groups in a list.
                return (
                  <Fragment key={u.id}>
                    <tr className="hover:bg-gray-50 transition-colors">

                      {/* Name */}
                      <td className="py-3 pr-4 font-medium whitespace-nowrap">{u.name}</td>

                      {/* Email */}
                      <td className="py-3 pr-4 text-xs text-gray-500">{u.email}</td>

                      {/* Role — controlled select */}
                      <td className="py-3 pr-4">
                        <select
                          value={currentRole}
                          onChange={(e) => set(u.id, 'role', e.target.value)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        >
                          <option value="USER">User</option>
                          <option value="APPROVER">Approver</option>
                          <option value="ACCOUNTANT">Accountant</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>

                      {/* Managers — controlled multi-select dropdown */}
                      <td className="py-3 pr-4">
                        <ManagerDropdown
                          managers={managers}
                          selected={currentApprovers}
                          userEmail={u.email}
                          onChange={(emails) => set(u.id, 'approverEmails', emails)}
                        />
                      </td>

                      {/* Balance: entitled + adjustment inputs, carried-over display */}
                      <td className="py-3 pr-4">
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <label className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-20 shrink-0">Entitled</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={currentEntitled}
                              onChange={(e) => set(u.id, 'entitled', Number(e.target.value))}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className="w-20 shrink-0">Adjustment</span>
                            <input
                              type="number"
                              step="1"
                              value={currentAdj}
                              onChange={(e) => set(u.id, 'startingBalanceAdjustment', Number(e.target.value))}
                              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </label>
                          {transferred !== 0 && (
                            <span className="text-xs text-cyan-600">
                              +{transferred} carried over
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Team */}
                      <td className="py-3 pr-4">
                        <select
                          value={currentTeam}
                          onChange={(e) => set(u.id, 'team', e.target.value || null)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        >
                          <option value="">—</option>
                          <option value="OPR">OPR</option>
                          <option value="DEV">DEV</option>
                        </select>
                      </td>

                      {/* Save — disabled unless this specific row has unsaved changes */}
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => handleSaveClick(u)}
                          disabled={!dirty || isSaving}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>

                    {/* Approver-demotion warning row */}
                    {showWarn && (
                      <tr className="bg-amber-50">
                        <td colSpan={7} className="py-2 px-3 text-xs text-amber-800">
                          <span className="font-medium">Warning:</span>{' '}
                          {u.name} is currently a manager for other users. Removing their
                          Approver role will not automatically reassign those users.{' '}
                          <button
                            type="button"
                            onClick={() => doSave(u)}
                            className="underline font-medium text-amber-900 hover:text-amber-700"
                          >
                            Save anyway
                          </button>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => setApproverWarn(null)}
                            className="underline text-amber-700 hover:text-amber-500"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    )}

                    {/* Inline error row — only rendered on save failure */}
                    {error && (
                      <tr className="bg-red-50">
                        <td colSpan={7} className="py-1.5 px-3 text-xs text-red-600">{error}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          <Pagination
            page={page}
            total={sortedUsers.length}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
