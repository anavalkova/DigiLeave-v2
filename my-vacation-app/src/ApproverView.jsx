import StatusBadge from './StatusBadge'

/** Format ISO date string as "3 Feb 2026" */
function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

/**
 * Audit-log table for admins and approvers.
 * Shows ALL requests (all statuses). Approve/Reject actions only appear on PENDING rows.
 */
export default function ApproverView({ requests, loading, onApprove, onReject }) {
  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading requests…</p>
  }

  if (requests.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm font-medium text-gray-600">No requests yet</p>
        <p className="text-xs text-gray-400 mt-1">Requests submitted by your team will appear here.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-700">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <th scope="col" className="py-3 pr-4 font-medium">Employee</th>
            <th scope="col" className="py-3 pr-4 font-medium whitespace-nowrap">Requested</th>
            <th scope="col" className="py-3 pr-4 font-medium whitespace-nowrap">Start</th>
            <th scope="col" className="py-3 pr-4 font-medium whitespace-nowrap">End</th>
            <th scope="col" className="py-3 pr-4 font-medium">Days</th>
            <th scope="col" className="py-3 pr-4 font-medium">Type</th>
            <th scope="col" className="py-3 pr-4 font-medium">Status</th>
            <th scope="col" className="py-3 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {requests.map((req) => {
            const isPending = req.status === 'PENDING'
            return (
              <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-800">{req.userName}</p>
                  <p className="text-xs text-gray-400">{req.userEmail}</p>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={req.requestDate}>{fmtDate(req.requestDate)}</time>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={req.startDate}>{fmtDate(req.startDate)}</time>
                </td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <time dateTime={req.endDate}>{fmtDate(req.endDate)}</time>
                </td>
                <td className="py-3 pr-4 tabular-nums">{req.totalDays}</td>
                <td className="py-3 pr-4">{req.type}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={req.status.toLowerCase()} />
                </td>
                <td className="py-3">
                  {isPending && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApprove(req.id)}
                        className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(req.id)}
                        className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
