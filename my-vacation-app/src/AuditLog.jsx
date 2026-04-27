import { useState, useEffect } from 'react'
import api from './api'
import { useColumnFilters, FilterToolbar, FilterRow } from './ColumnFilters'

const ACTION_LABELS = {
  LEAVE_APPROVED:   'Leave Approved',
  LEAVE_REJECTED:   'Leave Rejected',
  LEAVE_CANCELLED:  'Leave Cancelled',
  BALANCE_ADJUSTED: 'Balance Adjusted',
}

const COLS = [
  { filter: { type: 'daterange', fromKey: 'timestampFrom', toKey: 'timestampTo' } },
  { filter: { type: 'select', key: 'actionType', options: [
    { value: '',                label: 'All Actions'      },
    { value: 'LEAVE_APPROVED',  label: 'Leave Approved'   },
    { value: 'LEAVE_REJECTED',  label: 'Leave Rejected'   },
    { value: 'LEAVE_CANCELLED', label: 'Leave Cancelled'  },
    { value: 'BALANCE_ADJUSTED',label: 'Balance Adjusted' },
  ]}},
  { filter: { type: 'text', key: 'actorId'      } },
  { filter: { type: 'text', key: 'targetUserId' } },
  { filter: null },
]

const INITIAL = { timestampFrom: '', timestampTo: '', actionType: '', actorId: '', targetUserId: '' }

function fmtTs(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AuditLog() {
  const [logs, setLogs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [expanded, setExpanded] = useState(null)

  const cf = useColumnFilters(INITIAL)

  useEffect(() => {
    setLoading(true)
    setError('')
    setExpanded(null)

    const params = {}
    if (cf.debounced.actorId)       params.actorId       = cf.debounced.actorId
    if (cf.debounced.targetUserId)  params.targetUserId  = cf.debounced.targetUserId
    if (cf.debounced.actionType)    params.actionType    = cf.debounced.actionType
    if (cf.debounced.timestampFrom) params.timestampFrom = cf.debounced.timestampFrom
    if (cf.debounced.timestampTo)   params.timestampTo   = cf.debounced.timestampTo

    api.get('/api/admin/audit-logs', { params })
      .then(({ data }) => setLogs(data))
      .catch(() => setError('Could not load audit logs.'))
      .finally(() => setLoading(false))
  }, [cf.debounced])

  if (error) return <p className="p-6 text-sm text-red-500">{error}</p>

  return (
    <div className="p-6">
      <FilterToolbar
        open={cf.open}
        onToggle={() => cf.setOpen(o => !o)}
        hasActive={cf.hasActive}
        activeCount={cf.activeCount}
        onClear={cf.clear}
      />

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-400">
            {cf.hasActive ? 'No entries match your filters.' : 'No audit entries yet.'}
          </p>
          {cf.hasActive && (
            <button
              type="button"
              onClick={cf.clear}
              className="mt-2 text-sm font-medium text-blue-600 hover:underline"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Timestamp', 'Action', 'Actor ID', 'Target User', 'Details'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
              {cf.open && <FilterRow columns={COLS} filters={cf.raw} onUpdate={cf.update} />}
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {logs.map(log => (
                <>
                  <tr key={log.id} className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtTs(log.timestamp)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {ACTION_LABELS[log.actionType] ?? log.actionType}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.actorId}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{log.targetUserId}</td>
                    <td className="px-4 py-3 text-blue-500 text-xs select-none">
                      {expanded === log.id ? 'Hide ▲' : 'Show ▼'}
                    </td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-detail`} className="bg-gray-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                          <div>
                            <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">Before</p>
                            <pre className="whitespace-pre-wrap break-all text-gray-700">
                              {JSON.stringify(log.before, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-gray-500 uppercase tracking-wide">After</p>
                            <pre className="whitespace-pre-wrap break-all text-gray-700">
                              {JSON.stringify(log.after, null, 2)}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
