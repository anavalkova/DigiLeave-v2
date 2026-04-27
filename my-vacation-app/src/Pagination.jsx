export const PAGE_SIZE = 10

// ─── Sortable column header ───────────────────────────────────────────────────

export function SortableTh({ label, colKey, sortKey, sortDir, onSort, className }) {
  const active = sortKey === colKey
  return (
    <th
      scope="col"
      onClick={() => onSort(colKey)}
      className={`font-medium cursor-pointer select-none whitespace-nowrap ${className ?? 'py-3 pr-4'}`}
    >
      <span className="inline-flex items-center gap-1 group">
        {label}
        <span className={`text-[9px] leading-none transition-colors ${
          active ? 'text-gray-500' : 'text-gray-200 group-hover:text-gray-400'
        }`}>
          {active && sortDir === 'asc' ? '▲' : '▼'}
        </span>
      </span>
    </th>
  )
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

/**
 * Sorts an array of leave-request objects.
 * Primary:    the chosen column (asc or desc)
 * Secondary:  startDate DESC   — most recent leave date first among ties
 * Tertiary:   requestDate DESC — most recently submitted first
 * Quaternary: id DESC          — MongoDB ObjectId encodes insertion time
 */
export function sortRequests(rows, key, dir) {
  return [...rows].sort((a, b) => {
    // Primary comparison
    let cmp
    if (key === 'totalDays') {
      cmp = Number(a[key] ?? 0) - Number(b[key] ?? 0)
    } else {
      cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
    }
    if (dir === 'desc') cmp = -cmp
    if (cmp !== 0) return cmp

    // Tiebreaker 1: startDate DESC
    if (key !== 'startDate') {
      const d = (b.startDate ?? '').localeCompare(a.startDate ?? '')
      if (d !== 0) return d
    }
    // Tiebreaker 2: requestDate DESC
    if (key !== 'requestDate') {
      const d = (b.requestDate ?? '').localeCompare(a.requestDate ?? '')
      if (d !== 0) return d
    }
    // Tiebreaker 3: id DESC (ObjectId embeds insertion timestamp)
    return (b.id ?? '').localeCompare(a.id ?? '')
  })
}

// ─── Pagination bar ───────────────────────────────────────────────────────────

export default function Pagination({ page, total, pageSize = PAGE_SIZE, onChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('gap')
      acc.push(p)
      return acc
    }, [])

  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4 mt-2 select-none">
      <p className="text-xs text-gray-500">
        {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
        >
          ‹
        </button>
        {pages.map((item, idx) =>
          item === 'gap' ? (
            <span key={`g${idx}`} className="w-7 text-center text-xs text-gray-400">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              className={`h-7 min-w-[28px] px-1 rounded text-xs font-medium transition-colors ${
                item === page
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-base leading-none"
        >
          ›
        </button>
      </div>
    </div>
  )
}
