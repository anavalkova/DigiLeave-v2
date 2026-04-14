import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

// ─── Manager multi-select dropdown (Portal-based to escape table stacking) ────

function ManagerDropdown({ managers, selected, userEmail, onChange }) {
  const [open, setOpen]       = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0, width: 0 })
  const triggerRef            = useRef(null)

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

  // Close on any outside click
  useEffect(() => {
    if (!open) return
    function onMouseDown(e) {
      if (!triggerRef.current?.contains(e.target)) setOpen(false)
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
    .filter((m) => selected.includes(m.email))
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
          style={{
            position: 'absolute',
            top:      pos.top + 4,
            left:     pos.left,
            minWidth: Math.max(pos.width, 200),
            zIndex:   9999,
          }}
          className="rounded-md border border-gray-200 bg-white shadow-lg py-1"
        >
          {managers.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">No admins or approvers yet</p>
          ) : (
            managers.map((m) => {
              const checked = selected.includes(m.email)
              const isSelf  = m.email === userEmail
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
                  {isSelf && (
                    <span className="ml-auto text-xs text-blue-500 font-normal">self</span>
                  )}
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

// ─── Admin panel ─────────────────────────────────────────────────────────────

export default function AdminPanel({
  allUsers,
  usersLoading,
  onSaveRole,
  onSaveApprovers,
  onSaveEntitlement,
}) {
  // rowEdits: { [userId]: { role?, approverEmails?, entitledDays? } }
  const [rowEdits, setRowEdits] = useState({})
  const [saving, setSaving]     = useState({}) // { [userId]: boolean }
  const [saveError, setSaveError] = useState({}) // { [userId]: string }

  const managers = allUsers.filter((u) => u.role === 'ADMIN' || u.role === 'APPROVER')

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

  async function saveRow(u) {
    const edits = rowEdits[u.id]
    if (!edits) return

    setSaving((prev) => ({ ...prev, [u.id]: true }))
    setSaveError((prev) => { const next = { ...prev }; delete next[u.id]; return next })

    try {
      // Fire only the fields that actually changed, in parallel.
      // Callbacks must throw on failure so we don't clear edits on error.
      await Promise.all([
        'role'           in edits ? onSaveRole(u.id, edits.role)                : null,
        'approverEmails' in edits ? onSaveApprovers(u.id, edits.approverEmails) : null,
        'entitledDays'   in edits ? onSaveEntitlement(u.id, edits.entitledDays) : null,
      ].filter(Boolean))

      // Only clear local edits after every save has succeeded
      setRowEdits((prev) => {
        const next = { ...prev }
        delete next[u.id]
        return next
      })
    } catch {
      // Leave rowEdits intact so the user's selections are preserved
      setSaveError((prev) => ({ ...prev, [u.id]: 'Save failed — please try again.' }))
    } finally {
      setSaving((prev) => ({ ...prev, [u.id]: false }))
    }
  }

  return (
    <div id="user-management">
      {usersLoading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading users…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-700">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th scope="col" className="py-3 pr-4 font-medium">Name</th>
                <th scope="col" className="py-3 pr-4 font-medium">Email</th>
                <th scope="col" className="py-3 pr-4 font-medium">Role</th>
                <th scope="col" className="py-3 pr-4 font-medium">Managers</th>
                <th scope="col" className="py-3 pr-4 font-medium">Entitled Days</th>
                <th scope="col" className="py-3 font-medium"><span className="sr-only">Save</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {allUsers.map((u) => {
                const dirty          = isDirty(u.id)
                const isSaving       = saving[u.id] ?? false
                const error          = saveError[u.id]
                const currentRole    = get(u.id, 'role', u.role ?? 'USER')
                const currentApprovers = get(u.id, 'approverEmails', u.approverEmails ?? [])
                const currentDays    = get(u.id, 'entitledDays', u.entitledDays)

                return (
                  <>
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">

                      {/* Name */}
                      <td className="py-3 pr-4 font-medium whitespace-nowrap">{u.name}</td>

                      {/* Email */}
                      <td className="py-3 pr-4 text-xs text-gray-500">{u.email}</td>

                      {/* Role */}
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

                      {/* Managers */}
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

                      {/* Save */}
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => saveRow(u)}
                          disabled={!dirty || isSaving}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </td>

                    </tr>

                    {/* Inline error row — only rendered on save failure */}
                    {error && (
                      <tr key={`${u.id}-err`} className="bg-red-50">
                        <td colSpan={6} className="py-1.5 px-3 text-xs text-red-600">{error}</td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
