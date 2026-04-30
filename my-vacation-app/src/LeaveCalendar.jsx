import { useState, useMemo } from 'react'
import { isoOf, HOLIDAYS } from './utils/dateUtils'

export { isoOf, HOLIDAYS }

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_LABELS = ['Mo','Tu','We','Th','Fr','Sa','Su']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameDay(a, b) {
  return a && b && isoOf(a) === isoOf(b)
}

function isWeekend(date) {
  const d = date.getDay()
  return d === 0 || d === 6
}

function firstDayOffset(year, month) {
  const raw = new Date(year, month, 1).getDay()
  return raw === 0 ? 6 : raw - 1
}

// ─── Dot indicator ────────────────────────────────────────────────────────────

function Dot({ color, faded }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${color} ${faded ? 'opacity-50' : ''}`}
    />
  )
}

// ─── Month grid ───────────────────────────────────────────────────────────────

/**
 * leaveDates: { [iso: string]: 'approved' | 'pending' }
 */
function MonthGrid({ year, month, today, selFrom, selTo, range, leaveDates, onPrev, onNext, onClick, onHover }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const offset      = firstDayOffset(year, month)
  const rangeSpan   = selFrom && selTo && !sameDay(selFrom, selTo)

  return (
    <div className="flex-1 min-w-[252px]">

      {/* Month header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev}
          aria-label="Previous month"
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:invisible text-xl leading-none"
        >‹</button>
        <span className="text-sm font-semibold text-gray-800">{MONTH_NAMES[month]} {year}</span>
        <button
          type="button"
          onClick={onNext}
          disabled={!onNext}
          aria-label="Next month"
          className="w-7 h-7 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:invisible text-xl leading-none"
        >›</button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className={`text-center text-xs font-medium py-1 ${i >= 5 ? 'text-gray-300' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {Array.from({ length: offset }).map((_, i) => <div key={`b${i}`} />)}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const date    = new Date(year, month, i + 1)
          const iso     = isoOf(date)
          const isPast  = date < today
          const isToday = sameDay(date, today)
          const holiday = HOLIDAYS[iso]
          const weekend = isWeekend(date)
          const leave   = leaveDates?.[iso] // 'approved' | 'pending' | undefined

          const isStart = selFrom && sameDay(date, selFrom)
          const isEnd   = selTo   && sameDay(date, selTo)
          const inRange = selFrom && selTo && date > selFrom && date < selTo
          const hasSel  = isStart || isEnd
          const inSel   = hasSel || inRange

          // ── Wrapper background ──────────────────────────────────────────
          // Priority: selection strip > leave tint
          let wrapperCls   = 'flex items-center justify-center h-9 '
          let wrapperStyle = undefined

          if (rangeSpan && !isPast) {
            if (isStart)     wrapperStyle = { background: 'linear-gradient(to right, transparent 50%, #eff6ff 50%)' }
            else if (isEnd)  wrapperStyle = { background: 'linear-gradient(to left,  transparent 50%, #eff6ff 50%)' }
            else if (inRange) wrapperCls += 'bg-blue-50 '
          }

          // Existing-leave tint only when not fully overridden by selection
          if (!isPast && leave && !inSel) {
            wrapperCls += leave === 'approved' ? 'bg-green-50 ' : 'bg-orange-50 '
          }

          // ── Button text & bg ────────────────────────────────────────────
          let btn = 'relative mx-auto w-8 h-8 flex flex-col items-center justify-center rounded-full text-sm transition-colors focus:outline-none '

          if (isPast) {
            btn += 'text-gray-200 cursor-default '
          } else if (hasSel) {
            btn += 'bg-blue-600 text-white font-semibold shadow-sm cursor-pointer '
          } else if (inRange) {
            btn += weekend || holiday ? 'text-gray-400 cursor-pointer ' : 'text-blue-700 font-medium cursor-pointer '
          } else if (leave === 'approved') {
            btn += 'text-green-700 hover:bg-green-100 cursor-pointer '
          } else if (leave === 'pending') {
            btn += 'text-orange-600 hover:bg-orange-100 cursor-pointer '
          } else if (holiday) {
            btn += 'text-amber-600 hover:bg-amber-50 cursor-pointer '
          } else if (weekend) {
            btn += 'text-gray-300 hover:bg-gray-100 cursor-pointer '
          } else {
            btn += 'text-gray-700 hover:bg-blue-50 cursor-pointer '
          }

          if (isToday && !hasSel) btn += 'ring-1 ring-inset ring-blue-400 '

          // ── Bottom indicator dot ────────────────────────────────────────
          // Priority: leave > holiday  (holiday amber text is still visible for coloring)
          let dot = null
          if (!isPast) {
            if (leave === 'approved') {
              dot = <Dot color="bg-green-500" faded={hasSel} />
            } else if (leave === 'pending') {
              dot = <Dot color="bg-orange-400" faded={hasSel} />
            } else if (holiday) {
              dot = <Dot color={hasSel ? 'bg-white/60' : 'bg-amber-400'} />
            }
          }

          // Tooltip
          const title = leave === 'approved' ? `Approved leave${holiday ? ` · ${holiday}` : ''}`
            : leave === 'pending'            ? `Pending leave${holiday ? ` · ${holiday}` : ''}`
            : holiday                        ? holiday
            : weekend                        ? 'Weekend'
            : undefined

          return (
            <div key={iso} className={wrapperCls} style={wrapperStyle}>
              <button
                type="button"
                disabled={isPast}
                title={title}
                aria-label={`${iso}${title ? ' — ' + title : ''}`}
                aria-pressed={!!hasSel}
                onClick={() => !isPast && onClick(date)}
                onMouseEnter={() => !isPast && range?.from && !range?.to && onHover(date)}
                onMouseLeave={() => onHover(null)}
                className={btn}
              >
                <span className="leading-none">{i + 1}</span>
                {dot}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Swatch({ className, dot }) {
  return (
    <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
    </span>
  )
}

function LegendItem({ swatch, dotColor, label, textColor = 'text-gray-500' }) {
  return (
    <span className={`flex items-center gap-1.5 ${textColor}`}>
      <Swatch className={swatch} dot={dotColor} />
      {label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {{ from: Date|null, to: Date|null }} range
 * @param {(r: { from: Date|null, to: Date|null }) => void} onRangeChange
 * @param {{ [iso: string]: 'approved' | 'pending' }} leaveDates  existing leave by ISO date
 */
export default function LeaveCalendar({ range, onRangeChange, leaveDates = {} }) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [hover, setHover]         = useState(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function handleClick(date) {
    if (!range?.from || (range.from && range.to)) {
      onRangeChange({ from: date, to: null })
    } else {
      const [a, b] = date < range.from ? [date, range.from] : [range.from, date]
      onRangeChange({ from: a, to: b })
    }
  }

  // Extend selection with hover preview
  let selFrom = range?.from ?? null
  let selTo   = range?.to   ?? null
  if (selFrom && !selTo && hover) {
    if (hover >= selFrom) { selTo = hover }
    else { selTo = selFrom; selFrom = hover }
  }

  const m2     = viewMonth === 11 ? { year: viewYear + 1, month: 0 } : { year: viewYear, month: viewMonth + 1 }
  const shared = { today, selFrom, selTo, range, leaveDates, onHover: setHover, onClick: handleClick }

  return (
    <div>
      <div className="flex flex-wrap gap-6">
        <MonthGrid year={viewYear} month={viewMonth} onPrev={prevMonth} onNext={null}      {...shared} />
        <MonthGrid year={m2.year}  month={m2.month}  onPrev={null}      onNext={nextMonth} {...shared} />
      </div>

      {/* Compact legend */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        <LegendItem swatch="bg-blue-600"   label="Selected"  textColor="text-blue-700" />
        <LegendItem swatch="bg-blue-50 border border-blue-200" label="Range" textColor="text-blue-600" />
        <LegendItem swatch="bg-green-50"   dotColor="bg-green-500"  label="Approved"  textColor="text-green-700" />
        <LegendItem swatch="bg-orange-50"  dotColor="bg-orange-400" label="Pending"   textColor="text-orange-600" />
        <LegendItem swatch="bg-gray-50 border border-gray-200"  dotColor="bg-amber-400" label="Holiday"  textColor="text-amber-600" />
        <LegendItem swatch="bg-gray-100"   label="Weekend"   textColor="text-gray-400" />
      </div>
    </div>
  )
}
