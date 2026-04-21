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

  const sorted = useMemo(() => {
    const { key, dir } = sort
    return [...users].sort((a, b) => {
      let cmp
      if (key === 'entitledDays' || key === 'usedDays' || key === 'remainingDays') {
        cmp = Number(a[key] ?? 0) - Number(b[key] ?? 0)
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
              {th('Entitled',   'entitledDays')}
              {th('Used',       'usedDays')}
              {th('Remaining',  'remainingDays')}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 pr-4 font-medium text-gray-800 whitespace-nowrap">{u.name}</td>
                <td className="py-3 pr-4 text-xs text-gray-500">{u.email}</td>
                <td className="py-3 pr-4 tabular-nums text-center">{u.entitledDays}</td>
                <td className="py-3 pr-4 tabular-nums text-center text-violet-600">{u.usedDays}</td>
                <td className="py-3 pr-4 tabular-nums text-center">
                  <span className={u.remainingDays === 0 ? 'text-red-500 font-medium' : 'text-emerald-600 font-medium'}>
                    {u.remainingDays}
                  </span>
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
