import Pagination, { PAGE_SIZE, SortableTh } from './Pagination'
import { FilterToolbar, FilterRow } from './ColumnFilters'

/**
 * Reusable table scaffold that encapsulates the filter toolbar, sortable column
 * headers, filter row, body slot, and pagination.
 *
 * Callers supply:
 *   - {@code columns}     — array of column definitions (see shape below)
 *   - {@code children}    — the `<tbody>` row elements
 *   - filter / sort / pagination state from {@link useColumnFilters} and local useState
 *
 * Column definition shape:
 * ```js
 * {
 *   label:    string,          // header text
 *   colKey:   string | null,   // sort key; null = column is not sortable
 *   filter:   object | null,   // filter config forwarded to FilterRow; null = no filter
 *   width:    string,          // CSS width for <col> (e.g. '22%'); omit to skip colgroup
 *   thClass:  string,          // extra classes on the <th> (e.g. 'sr-only' for Actions)
 * }
 * ```
 *
 * @param {object}   props
 * @param {object[]} props.columns
 * @param {string}   [props.cellPad='py-3 pr-4']  padding applied to sortable header cells
 * @param {object}   props.sort            { key, dir }
 * @param {function} props.onSort
 * @param {object}   props.filters         raw filter values from useColumnFilters
 * @param {function} props.onFilterUpdate
 * @param {boolean}  props.filterOpen
 * @param {function} props.onFilterToggle
 * @param {boolean}  props.hasActiveFilters
 * @param {number}   props.activeFilterCount
 * @param {function} props.onFilterClear
 * @param {number}   props.page
 * @param {number}   props.total           total row count (after sorting, pre-pagination)
 * @param {function} props.onPageChange
 * @param {boolean}  [props.loading]
 * @param {boolean}  props.isEmpty         true when the data set is empty
 * @param {string}   [props.emptyMessage]
 * @param {string}   [props.emptyHint]
 * @param {React.ReactNode} props.children  the `<tbody>` rows
 * @param {React.ReactNode} [props.footer]  optional `<tfoot>` content
 */
export default function BaseTable({
  columns,
  cellPad = 'py-3 pr-4',
  sort,
  onSort,
  filters,
  onFilterUpdate,
  filterOpen,
  onFilterToggle,
  hasActiveFilters,
  activeFilterCount,
  onFilterClear,
  page,
  total,
  onPageChange,
  loading = false,
  isEmpty,
  emptyMessage = 'No data',
  emptyHint,
  children,
  footer,
}) {
  const hasColWidths = columns.some(c => c.width)
  const filterCols   = columns.map(c => ({ filter: c.filter ?? null }))

  if (loading) {
    return <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
  }

  return (
    <div>
      <FilterToolbar
        open={filterOpen}
        onToggle={onFilterToggle}
        hasActive={hasActiveFilters}
        activeCount={activeFilterCount}
        onClear={onFilterClear}
      />

      {isEmpty ? (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-gray-600">
            {hasActiveFilters ? 'No results match your filters.' : emptyMessage}
          </p>
          {hasActiveFilters ? (
            <button type="button" onClick={onFilterClear}
              className="mt-2 text-sm font-medium text-blue-600 hover:underline">
              Clear Filters
            </button>
          ) : emptyHint ? (
            <div className="mt-1">{emptyHint}</div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-sm text-left text-gray-700${hasColWidths ? ' table-fixed' : ''}`}>
            {hasColWidths && (
              <colgroup>
                {columns.map((col, i) => (
                  <col key={i} style={col.width ? { width: col.width } : undefined} />
                ))}
              </colgroup>
            )}
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                {columns.map((col, i) =>
                  col.colKey ? (
                    <SortableTh
                      key={i}
                      label={col.label}
                      colKey={col.colKey}
                      sortKey={sort.key}
                      sortDir={sort.dir}
                      onSort={onSort}
                      className={cellPad}
                    />
                  ) : (
                    <th key={i} scope="col" className={`${cellPad} font-medium ${col.thClass ?? ''}`}>
                      {col.label ? col.label : <span className="sr-only">Actions</span>}
                    </th>
                  )
                )}
              </tr>
              {filterOpen && (
                <FilterRow
                  columns={filterCols}
                  filters={filters}
                  onUpdate={onFilterUpdate}
                  cellClassName={cellPad.includes('px-') ? cellPad.replace(/py-\S+/, 'py-2') : 'px-3 py-2'}
                />
              )}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {children}
            </tbody>
            {footer && footer}
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={onPageChange} />
        </div>
      )}
    </div>
  )
}
