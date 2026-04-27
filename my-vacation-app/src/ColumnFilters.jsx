import { useState, useEffect, useMemo, useRef, useCallback } from 'react'

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconFilter = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
  </svg>
)

const IconX = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages per-column filter state with 300ms debouncing.
 *
 * @param {object} initial  { fieldKey: '' } for every filterable column
 * @returns {{ raw, debounced, open, setOpen, hasActive, activeCount, update, clear }}
 *
 * - `raw`       — immediate state (use for client-side filtering, updates every keystroke)
 * - `debounced` — 300ms-delayed state (use to trigger API calls)
 * - `update(key, value)` — stable function, safe in effect deps
 * - `clear()`            — stable function, resets all fields to ''
 */
export function useColumnFilters(initial) {
  const initRef              = useRef(initial)
  const [raw, setRaw]        = useState(initial)
  const [debounced, setDeb]  = useState(initial)
  const [open, setOpen]      = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDeb(raw), 300)
    return () => clearTimeout(t)
  }, [raw])

  const hasActive   = useMemo(() => Object.values(raw).some(v => v !== ''), [raw])
  const activeCount = useMemo(() => Object.values(raw).filter(v => v !== '').length, [raw])

  const update = useCallback((key, value) => {
    setRaw(prev => ({ ...prev, [key]: value }))
  }, [])

  const clear = useCallback(() => {
    setRaw(initRef.current)
  }, [])

  return { raw, debounced, open, setOpen, hasActive, activeCount, update, clear }
}

// ── FilterToolbar ─────────────────────────────────────────────────────────────

/**
 * "Filters" toggle button + "Clear Filters" button rendered above the table.
 *
 * Props:
 *   open        boolean
 *   onToggle    () => void
 *   hasActive   boolean
 *   activeCount number
 *   onClear     () => void
 *   className   string (optional)
 */
export function FilterToolbar({ open, onToggle, hasActive, activeCount, onClear, className = '' }) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Toggle column filters"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
          ${open
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
      >
        <IconFilter className="h-3.5 w-3.5" />
        Filters
        {activeCount > 0 && (
          <span className="ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-none text-white tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {hasActive && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <IconX className="h-3 w-3" />
          Clear Filters
        </button>
      )}
    </div>
  )
}

// ── FilterRow ─────────────────────────────────────────────────────────────────

const inputCls = 'w-full border-0 border-b border-gray-300 bg-transparent px-0 py-0.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:outline-none'

/**
 * A <tr> to place as the second row inside <thead> for scroll-sync.
 * Only rendered when the filter panel is open.
 *
 * Column def shapes (one per header column, in order):
 *   { filter: null }
 *   { filter: { type: 'text',      key: 'field' } }
 *   { filter: { type: 'select',    key: 'field', options: [{ value, label }] } }
 *   { filter: { type: 'daterange', fromKey: 'fieldFrom', toKey: 'fieldTo' } }
 *
 * @param {string} cellClassName  padding applied to each <th> (default 'px-3 py-2')
 */
export function FilterRow({ columns, filters, onUpdate, cellClassName = 'px-3 py-2' }) {
  return (
    <tr className="bg-slate-50 border-b border-gray-200">
      {columns.map((col, i) => {
        const f = col.filter
        return (
          <th key={i} scope="col" className={`${cellClassName} font-normal align-top`}>
            {f?.type === 'text' && (
              <input
                type="text"
                value={filters[f.key] ?? ''}
                onChange={e => onUpdate(f.key, e.target.value)}
                placeholder="Filter…"
                className={inputCls}
              />
            )}

            {f?.type === 'select' && (
              <select
                value={filters[f.key] ?? ''}
                onChange={e => onUpdate(f.key, e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                {f.options.map(opt => {
                  const val = typeof opt === 'string' ? opt : opt.value
                  const lbl = typeof opt === 'string' ? (opt || 'All') : opt.label
                  return <option key={val} value={val}>{lbl}</option>
                })}
              </select>
            )}

            {f?.type === 'daterange' && (
              <div className="flex flex-col gap-1">
                <input
                  type="date"
                  value={filters[f.fromKey] ?? ''}
                  aria-label="From date"
                  onChange={e => onUpdate(f.fromKey, e.target.value)}
                  className={inputCls}
                />
                <input
                  type="date"
                  value={filters[f.toKey] ?? ''}
                  aria-label="To date"
                  onChange={e => onUpdate(f.toKey, e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </th>
        )
      })}
    </tr>
  )
}
