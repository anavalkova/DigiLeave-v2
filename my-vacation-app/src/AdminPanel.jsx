import { useState, useEffect, useMemo, useRef } from 'react'
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
  const panelRef        = useRef(null)

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({
      top:   r.bottom + window.scrollY,
      left:  r.left   + window.scrollX,
      width: r.width,
    })
  }, [open])

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
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
      >
        <span className="truncate text-left text-gray-800">
          {selectedNames.length > 0
            ? selectedNames.join(', ')
            : <span className="text-gray-400 italic">None</span>}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

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
                  <span className={`text-sm ${checked ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
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

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const map = {
    ADMIN:      'bg-red-100 text-red-700',
    APPROVER:   'bg-purple-100 text-purple-700',
    ACCOUNTANT: 'bg-amber-100 text-amber-700',
  }
  const cls   = map[role] ?? 'bg-gray-100 text-gray-600'
  const label = role ? role.charAt(0) + role.slice(1).toLowerCase() : 'User'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

// ─── Column filter config ─────────────────────────────────────────────────────

const USER_COLS = [
  { filter: { type: 'text', key: 'name' } },
  { filter: { type: 'text', key: 'email' } },
  { filter: { type: 'select', key: 'role', options: [
    { value: '',           label: 'All Roles'  },
    { value: 'USER',       label: 'User'       },
    { value: 'APPROVER',   label: 'Approver'   },
    { value: 'ACCOUNTANT', label: 'Accountant' },
    { value: 'ADMIN',      label: 'Admin'      },
  ]}},
  { filter: null },
]

const USER_INITIAL = { name: '', email: '', role: '' }

// ─── Field helpers ────────────────────────────────────────────────────────────

const fieldLabel = 'block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5'
const fieldInput = (disabled) =>
  `w-full rounded-lg border px-3 py-2 text-sm text-gray-800 transition-colors
   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
   ${disabled
     ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
     : 'border-gray-300 bg-white hover:border-gray-400'}`

// ─── User Edit Drawer ─────────────────────────────────────────────────────────

function UserEditDrawer({ open, user: u, managers, isAdmin, onSave, onClose, saving, error, demotionWarn }) {
  const orig = useMemo(() => ({
    role:                      u.role ?? 'USER',
    approverEmails:            u.approverEmails ?? [],
    entitled:                  u.annualLeave?.entitled ?? u.entitledDays ?? 0,
    startingBalanceAdjustment: u.annualLeave?.startingBalanceAdjustment ?? 0,
    team:                      u.team ?? '',
  }), [u])

  const [edits, setEdits] = useState(orig)

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function field(key, value) {
    setEdits(prev => ({ ...prev, [key]: value }))
  }

  const approversChanged =
    JSON.stringify([...edits.approverEmails].sort()) !==
    JSON.stringify([...orig.approverEmails].sort())

  const isDirty =
    edits.role !== orig.role ||
    edits.entitled !== orig.entitled ||
    edits.startingBalanceAdjustment !== orig.startingBalanceAdjustment ||
    edits.team !== orig.team ||
    approversChanged

  const transferred = u.annualLeave?.transferred ?? 0

  return createPortal(
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>

      {/* Backdrop */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${u.name}`}
        className={`absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl
          flex flex-col transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">{u.name}</h2>
            <p className="mt-0.5 text-sm text-gray-400 truncate">{u.email}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable form body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Role */}
          <div>
            <label className={fieldLabel}>Role</label>
            <select
              value={edits.role}
              onChange={e => field('role', e.target.value)}
              disabled={!isAdmin}
              className={fieldInput(!isAdmin)}
            >
              <option value="USER">User</option>
              <option value="APPROVER">Approver</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>

          {/* Entitled Days */}
          <div>
            <label className={fieldLabel}>Entitled Days</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={edits.entitled}
              onChange={e => field('entitled', e.target.value === '' ? 0 : parseFloat(e.target.value))}
              disabled={!isAdmin}
              className={fieldInput(!isAdmin)}
            />
          </div>

          {/* Starting Balance — leave requests are deducted from this */}
          <div>
            <label className={fieldLabel}>Starting Balance</label>
            <input
              type="number"
              step="0.5"
              value={edits.startingBalanceAdjustment}
              onChange={e => field('startingBalanceAdjustment', e.target.value === '' ? 0 : parseFloat(e.target.value))}
              disabled={!isAdmin}
              className={fieldInput(!isAdmin)}
            />
            {transferred !== 0 && (
              <p className="mt-1 text-xs text-cyan-600">+{transferred} carried over from previous year</p>
            )}
          </div>

          {/* Legal Entity — Phase 4 placeholder */}
          <div>
            <label className={fieldLabel}>Legal Entity</label>
            <select
              disabled
              value=""
              onChange={() => {}}
              className={fieldInput(true)}
            >
              <option value="">— Available in Phase 4 —</option>
            </select>
          </div>

          {/* Managers */}
          <div>
            <label className={fieldLabel}>Managers</label>
            {isAdmin ? (
              <ManagerDropdown
                managers={managers}
                selected={edits.approverEmails}
                userEmail={u.email}
                onChange={v => field('approverEmails', v)}
              />
            ) : (
              <p className={`text-sm ${managers.filter(m => (u.approverEmails ?? []).includes(m.email)).length ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                {managers.filter(m => (u.approverEmails ?? []).includes(m.email)).map(m => m.name).join(', ') || 'None'}
              </p>
            )}
          </div>

          {/* Team */}
          <div>
            <label className={fieldLabel}>Team</label>
            <select
              value={edits.team}
              onChange={e => field('team', e.target.value)}
              disabled={!isAdmin}
              className={fieldInput(!isAdmin)}
            >
              <option value="">—</option>
              <option value="OPR">OPR</option>
              <option value="DEV">DEV</option>
            </select>
          </div>

          {/* Demotion warning */}
          {demotionWarn && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">Warning:</span> {u.name} is currently a manager for
              other users. Removing their Approver role will not automatically reassign those users.
            </div>
          )}

          {/* Save error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Cancel
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onSave(edits)}
              disabled={!isDirty || saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {saving ? 'Saving…' : demotionWarn ? 'Save anyway' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Admin panel ──────────────────────────────────────────────────────────────

export default function AdminPanel({
  allUsers,
  usersLoading,
  isAdmin,
  onSaveRole,
  onSaveApprovers,
  onSaveBalance,
  onSaveTeam,
  onRefreshUsers,
}) {
  const [drawerUser, setDrawerUser]   = useState(null)
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerError, setDrawerError] = useState(null)
  const [demotionWarn, setDemotionWarn] = useState(false)
  const [pendingEdits, setPendingEdits] = useState(null)
  const [toast, setToast]             = useState(null)
  const [page, setPage]               = useState(1)
  const [userSort, setUserSort]       = useState({ key: 'name', dir: 'asc' })
  const closeTimer                    = useRef(null)

  // Cleanup timer on unmount
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const cf = useColumnFilters(USER_INITIAL)
  useEffect(() => { setPage(1) }, [cf.raw])

  const managers = allUsers.filter(u => {
    const role = u.role ?? 'USER'
    return role === 'ADMIN' || role === 'APPROVER'
  })

  const filteredUsers = useMemo(() => {
    const { name, email, role } = cf.raw
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
    return result
  }, [allUsers, cf.raw])

  const sortedUsers = useMemo(() => {
    const { key, dir } = userSort
    return [...filteredUsers].sort((a, b) => {
      const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
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

  function openDrawer(u) {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
    setDrawerUser(u)
    setDrawerOpen(true)
    setDrawerError(null)
    setDemotionWarn(false)
    setPendingEdits(null)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    closeTimer.current = setTimeout(() => {
      setDrawerUser(null)
      setDrawerError(null)
      setDemotionWarn(false)
      setPendingEdits(null)
      closeTimer.current = null
    }, 300)
  }

  function wouldOrphan(u, newRole) {
    if (!newRole || newRole === u.role || u.role !== 'APPROVER') return false
    return allUsers.some(other => other.id !== u.id && (other.approverEmails ?? []).includes(u.email))
  }

  async function handleDrawerSave(edits) {
    const u = drawerUser
    if (!u) return

    if (wouldOrphan(u, edits.role) && !demotionWarn) {
      setDemotionWarn(true)
      setPendingEdits(edits)
      return
    }

    const saveEdits = pendingEdits ?? edits
    setDrawerSaving(true)
    setDrawerError(null)

    try {
      const orig = {
        role:                      u.role ?? 'USER',
        approverEmails:            u.approverEmails ?? [],
        entitled:                  u.annualLeave?.entitled ?? u.entitledDays ?? 0,
        startingBalanceAdjustment: u.annualLeave?.startingBalanceAdjustment ?? 0,
        team:                      u.team ?? '',
      }

      const hasBalanceEdit =
        saveEdits.entitled !== orig.entitled ||
        saveEdits.startingBalanceAdjustment !== orig.startingBalanceAdjustment

      const approversChanged =
        JSON.stringify([...saveEdits.approverEmails].sort()) !==
        JSON.stringify([...orig.approverEmails].sort())

      await Promise.all([
        saveEdits.role !== orig.role
          ? onSaveRole(u.id, saveEdits.role) : null,
        approversChanged
          ? onSaveApprovers(u.id, saveEdits.approverEmails) : null,
        saveEdits.team !== orig.team
          ? onSaveTeam(u.id, saveEdits.team || null) : null,
        hasBalanceEdit
          ? onSaveBalance(u.id, saveEdits.entitled || 0, saveEdits.startingBalanceAdjustment || 0)
          : null,
      ].filter(Boolean))

      setToast({ message: `${u.name} saved.`, type: 'success' })
      onRefreshUsers?.()
      closeDrawer()
    } catch (err) {
      const detail = err.response?.data?.message ?? err.response?.data ?? err.message ?? null
      const msg = typeof detail === 'string' && detail.length < 200
        ? `Save failed: ${detail}`
        : 'Save failed — please try again.'
      setDrawerError(msg)
    } finally {
      setDrawerSaving(false)
    }
  }

  return (
    <div id="user-management">
      {toast && (
        <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}

      {drawerUser && (
        <UserEditDrawer
          key={drawerUser.id}
          open={drawerOpen}
          user={drawerUser}
          managers={managers}
          isAdmin={isAdmin}
          onSave={handleDrawerSave}
          onClose={closeDrawer}
          saving={drawerSaving}
          error={drawerError}
          demotionWarn={demotionWarn}
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
                <SortableTh label="Name"  colKey="name"  sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Email" colKey="email" sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <SortableTh label="Role"  colKey="role"  sortKey={userSort.key} sortDir={userSort.dir} onSort={handleUserSort} />
                <th scope="col" className="py-3 font-medium"><span className="sr-only">Edit</span></th>
              </tr>
              {cf.open && <FilterRow columns={USER_COLS} filters={cf.raw} onUpdate={cf.update} />}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4 font-medium whitespace-nowrap">{u.name}</td>
                  <td className="py-3 pr-4 text-xs text-gray-500">{u.email}</td>
                  <td className="py-3 pr-4">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => openDrawer(u)}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
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
