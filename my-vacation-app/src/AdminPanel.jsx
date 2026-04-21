import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import Pagination, { PAGE_SIZE, SortableTh } from './Pagination'

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

// ─── Admin panel ──────────────────────────────────────────────────────────────

export default function AdminPanel({
  allUsers,
  usersLoading,
  onSaveRole,
  onSaveApprovers,
  onSaveEntitlement,
}) {
  // rowEdits: { [userId]: { role?, approverEmails?, entitledDays? } }
  const [rowEdits, setRowEdits]     = useState({})
  const [saving, setSaving]         = useState({})
  const [saveError, setSaveError]   = useState({})
  const [toast, setToast]           = useState(null)       // { message, type }
  const [approverWarn, setApproverWarn] = useState(null)   // userId pending confirmation
  const [page, setPage]             = useState(1)
  const [userSort, setUserSort]     = useState({ key: 'name', dir: 'asc' })

  // ── Derived: managers list reflects pending role changes, not just saved state ──
  // When you change a user's role to APPROVER in the dropdown (before saving),
  // they immediately appear as an option in other rows' manager dropdowns.
  const managers = allUsers.filter((u) => {
    const effectiveRole = rowEdits[u.id]?.role ?? u.role ?? 'USER'
    return effectiveRole === 'ADMIN' || effectiveRole === 'APPROVER'
  })

  // Users sorted by chosen column; paginated
  const sortedUsers = useMemo(() => {
    const { key, dir } = userSort
    return [...allUsers].sort((a, b) => {
      let cmp
      if (key === 'entitledDays') {
        cmp = Number(a[key] ?? 0) - Number(b[key] ?? 0)
      } else {
        cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [allUsers, userSort])
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
      await Promise.all([
        'role'           in edits ? onSaveRole(u.id, edits.role)                : null,
        'approverEmails' in edits ? onSaveApprovers(u.id, edits.approverEmails) : null,
        'entitledDays'   in edits ? onSaveEntitlement(u.id, edits.entitledDays) : null,
      ].filter(Boolean))

      // Only clear local edits after every save succeeded
      setRowEdits((prev) => {
        const next = { ...prev }
        delete next[u.id]
        return next
      })
      setToast({ message: `${u.name} saved.`, type: 'success' })
    } catch {
      setSaveError((prev) => ({ ...prev, [u.id]: 'Save failed — please try again.' }))
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

      {usersLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading users…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-700">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <SortableTh label="Name"          colKey="name"         sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Email"         colKey="email"        sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Role"          colKey="role"         sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <th scope="col" className="py-3 pr-4 font-medium">Managers</th>
                <SortableTh label="Entitled Days" colKey="entitledDays" sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <th scope="col" className="py-3 font-medium"><span className="sr-only">Save</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedUsers.map((u) => {
                const dirty            = isDirty(u.id)
                const isSaving         = saving[u.id] ?? false
                const error            = saveError[u.id]
                const currentRole      = get(u.id, 'role', u.role ?? 'USER')
                const currentApprovers = get(u.id, 'approverEmails', u.approverEmails ?? [])
                const currentDays      = get(u.id, 'entitledDays', u.entitledDays)
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

                      {/* Entitled days */}
                      <td className="py-3 pr-4">
                        <input
                          type="number"
                          min="0"
                          value={currentDays}
                          onChange={(e) => set(u.id, 'entitledDays', Number(e.target.value))}
                          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
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
                        <td colSpan={6} className="py-2 px-3 text-xs text-amber-800">
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
                        <td colSpan={6} className="py-1.5 px-3 text-xs text-red-600">{error}</td>
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
