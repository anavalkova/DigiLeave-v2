import { useState, useRef, useEffect } from 'react'

const IconSearch = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
  </svg>
)

/**
 * Reusable filter bar: debounced search input + optional date-range pickers + reset button.
 *
 * Props:
 *   filters   { search, from, to }   — controlled value from parent
 *   onChange  (newFilters) => void   — called with debounced search / immediate dates
 *   searchPlaceholder  string
 *   showDates          boolean (default true)
 */
export default function TableFilterBar({
  filters,
  onChange,
  searchPlaceholder = 'Search…',
  showDates = true,
}) {
  const [localSearch, setLocalSearch] = useState(filters.search ?? '')
  const timerRef   = useRef(null)
  const filtersRef = useRef(filters)

  useEffect(() => { filtersRef.current = filters }, [filters])

  function handleSearchChange(e) {
    const val = e.target.value
    setLocalSearch(val)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange({ ...filtersRef.current, search: val })
    }, 300)
  }

  function handleDate(field, val) {
    onChange({ ...filtersRef.current, [field]: val })
  }

  function handleReset() {
    clearTimeout(timerRef.current)
    setLocalSearch('')
    onChange({ search: '', from: '', to: '' })
  }

  const hasFilter = localSearch || filters.from || filters.to

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-[180px]">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={localSearch}
          onChange={handleSearchChange}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {showDates && (
        <>
          <input
            type="date"
            value={filters.from ?? ''}
            aria-label="From date"
            onChange={e => handleDate('from', e.target.value)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400 select-none">to</span>
          <input
            type="date"
            value={filters.to ?? ''}
            aria-label="To date"
            onChange={e => handleDate('to', e.target.value)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </>
      )}

      {hasFilter && (
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  )
}
