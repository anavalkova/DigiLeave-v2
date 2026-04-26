import { useState, useMemo } from 'react'
import Pagination, { PAGE_SIZE, SortableTh } from './Pagination'

/**
 * Read-only users table shown to APPROVERs.
 * Displays their direct reports with name, email, and current leave balance.
 */
export default function ApproverUsersView({ users, loading }) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })

  function handleSort(key) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
    setPage(1)
  }

  function getBalanceField(u, field) {
    if (field === 'entitled')   return u.annualLeave?.entitled   ?? u.entitledDays ?? 0
    if (field === 'used')       return u.annualLeave?.used       ?? u.usedDays     ?? 0
    if (field === 'available')  {
      const bal = u.annualLeave
      return bal
        ? bal.entitled + bal.transferred + bal.startingBalanceAdjustment - bal.used
        : (u.remainingDays ?? 0)
    }
    return null
  }

  const sorted = useMemo(() => {
    const { key, dir } = sort
    return [...users].sort((a, b) => {
      let cmp
      if (key === 'entitled' || key === 'used' || key === 'available') {
        cmp = getBalanceField(a, key) - getBalanceField(b, key)
      } else if (key === 'team') {
        cmp = String(a.team ?? '').localeCompare(String(b.team ?? ''))
      } else {
        cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [users, sort])

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const th = (label, colKey) => (
    <SortableTh
      label={label}
      colKey={colKey}
      sortKey={sort.key}
      sortDir={sort.dir}
      onSort={handleSort}
    />
  )

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading team members…</p>
  }

  if (users.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium text-gray-600">No team members assigned to you yet.</p>
        <p className="text-xs text-gray-400 mt-1">Contact your administrator to assign team members.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-700">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              {th('Name',       'name')}
              {th('Email',      'email')}
              {th('Team',       'team')}
              {th('Entitled',   'entitled')}
              {th('Used',       'used')}
              {th('Available',  'available')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 pr-4 font-medium text-gray-800 whitespace-nowrap">{u.name}</td>
                <td className="py-3 pr-4 text-xs text-gray-500">{u.email}</td>
                <td className="py-3 pr-4 text-center">
                  {u.team
                    ? <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">{u.team}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-3 pr-4 tabular-nums text-center">{getBalanceField(u, 'entitled')}</td>
                <td className="py-3 pr-4 tabular-nums text-center text-violet-600">{getBalanceField(u, 'used')}</td>
                <td className="py-3 pr-4 tabular-nums text-center">
                  {(() => {
                    const avail = getBalanceField(u, 'available')
                    return (
                      <span className={avail <= 0 ? 'text-red-500 font-medium' : 'text-emerald-600 font-medium'}>
                        {avail}
                      </span>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} total={sorted.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}
