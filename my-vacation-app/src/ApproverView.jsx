import { useState, useEffect, useRef, useCallback } from 'react'
import StatusBadge from './StatusBadge'
import BaseTable from './BaseTable'
import { PAGE_SIZE, sortRequests } from './Pagination'
import { useColumnFilters } from './ColumnFilters'
import { LEAVE_TYPE_OPTIONS, formatLeaveType, LEAVE_STATUS } from './constants'
import { fmtDate } from './utils/dateUtils'

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconCheck = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

const IconXMark = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// ── RejectModal ───────────────────────────────────────────────────────────────

function RejectModal({ req, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    onConfirm(req.id, reason)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl ring-1 ring-black/10 p-6">
        <h2 id="reject-modal-title" className="text-base font-semibold text-gray-900 mb-1">
          Reject request
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {req.userName} &mdash; {req.totalDays} day{req.totalDays !== 1 ? 's' : ''} from{' '}
          <time dateTime={req.startDate}>{fmtDate(req.startDate)}</time>
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="reject-reason"
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Let the employee know why their request was rejected…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Reject
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { label: 'Employee',  colKey: 'userName',     width: '22%', filter: { type: 'text', key: 'employeeName' } },
  { label: 'Requested', colKey: 'requestDate',  width: '13%', filter: { type: 'daterange', fromKey: 'requestDateFrom', toKey: 'requestDateTo' } },
  { label: 'Start',     colKey: 'startDate',    width: '13%', filter: { type: 'daterange', fromKey: 'startDateFrom',   toKey: 'startDateTo'   } },
  { label: 'End',       colKey: 'endDate',      width: '13%', filter: null },
  { label: 'Days',      colKey: 'totalDays',    width: '6%',  filter: null },
  { label: 'Type',      colKey: 'type',         width: '16%', filter: { type: 'select', key: 'type', options: [
    { value: '', label: 'All Types' },
    ...LEAVE_TYPE_OPTIONS,
  ]}},
  { label: 'Status',    colKey: 'status',       width: '11%', filter: { type: 'select', key: 'status', options: [
    { value: '',                    label: 'All Statuses' },
    { value: LEAVE_STATUS.PENDING,  label: 'Pending'     },
    { value: LEAVE_STATUS.APPROVED, label: 'Approved'    },
    { value: LEAVE_STATUS.REJECTED, label: 'Rejected'    },
    { value: LEAVE_STATUS.CANCELLED,label: 'Cancelled'   },
  ]}},
  { label: '', colKey: null, width: '6%', filter: null },
]

const INITIAL_FILTERS = {
  employeeName:    '',
  requestDateFrom: '', requestDateTo: '',
  startDateFrom:   '', startDateTo:   '',
  type:   '',
  status: '',
}

const CELL = 'px-4 py-3'

/**
 * Approvals table.
 *
 * Receives server-filtered {@code requests} as a prop. When the debounced column
 * filters change it calls {@code onFetchRequests(params)} so App.jsx can re-fetch
 * with the new query parameters.
 */
export default function ApproverView({ requests, loading, onApprove, onReject, onFetchRequests }) {
  const [page,        setPage]        = useState(1)
  const [sort,        setSort]        = useState({ key: 'requestDate', dir: 'desc' })
  const [rejectingReq, setRejectingReq] = useState(null)
  const cf                            = useColumnFilters(INITIAL_FILTERS)

  const handleRejectConfirm = useCallback((requestId, reason) => {
    setRejectingReq(null)
    onReject(requestId, reason)
  }, [onReject])

  const fetchRef = useRef(onFetchRequests)
  useEffect(() => { fetchRef.current = onFetchRequests }, [onFetchRequests])

  useEffect(() => {
    fetchRef.current?.(cf.debounced)
  }, [cf.debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [requests])

  function handleSort(key) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    )
    setPage(1)
  }

  const sorted = sortRequests(requests, sort.key, sort.dir)
  const paged  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
    {rejectingReq && (
      <RejectModal
        req={rejectingReq}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectingReq(null)}
      />
    )}
    <BaseTable
      columns={COLUMNS}
      cellPad={CELL}
      sort={sort}
      onSort={handleSort}
      filters={cf.raw}
      onFilterUpdate={cf.update}
      filterOpen={cf.open}
      onFilterToggle={() => cf.setOpen(o => !o)}
      hasActiveFilters={cf.hasActive}
      activeFilterCount={cf.activeCount}
      onFilterClear={cf.clear}
      page={page}
      total={sorted.length}
      onPageChange={setPage}
      loading={loading}
      isEmpty={requests.length === 0}
      emptyMessage="No requests yet"
      emptyHint="Requests submitted by your team will appear here."
    >
      {paged.map(req => {
        const isPending = req.status === LEAVE_STATUS.PENDING
        return (
          <tr key={req.id} className="hover:bg-gray-50 transition-colors">
            <td className={CELL}>
              <p className="font-medium text-gray-800 truncate">{req.userName}</p>
              <p className="text-[11px] text-gray-400 truncate">{req.userEmail}</p>
            </td>
            <td className={`${CELL} whitespace-nowrap`}>
              <time dateTime={req.requestDate}>{fmtDate(req.requestDate)}</time>
            </td>
            <td className={`${CELL} whitespace-nowrap`}>
              <time dateTime={req.startDate}>{fmtDate(req.startDate)}</time>
            </td>
            <td className={`${CELL} whitespace-nowrap`}>
              <time dateTime={req.endDate}>{fmtDate(req.endDate)}</time>
            </td>
            <td className={`${CELL} tabular-nums`}>{req.totalDays}</td>
            <td className={CELL}>{formatLeaveType(req.type)}</td>
            <td className={CELL}>
              <StatusBadge status={req.status.toLowerCase()} />
            </td>
            <td className={CELL}>
              {isPending && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onApprove(req.id)}
                    title="Approve"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-green-600 hover:bg-green-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
                  >
                    <IconCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingReq(req)}
                    title="Reject"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-red-500 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <IconXMark className="h-4 w-4" />
                  </button>
                </div>
              )}
            </td>
          </tr>
        )
      })}
    </BaseTable>
    </>
  )
}
