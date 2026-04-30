// Bulgarian public holidays for 2026 — mirrors BulgarianPublicHolidays.java
// and Sunday→Monday displacement fixes applied server-side.
export const HOLIDAYS = {
  '2026-01-01': "New Year's Day",
  '2026-03-03': 'Liberation Day',
  '2026-04-10': 'Good Friday',
  '2026-04-11': 'Holy Saturday',
  '2026-04-12': 'Easter Sunday',
  '2026-04-13': 'Easter Monday',
  '2026-05-01': 'Labour Day',
  '2026-05-06': "St. George's Day",
  '2026-05-25': 'Education & Culture Day',
  '2026-09-07': 'Unification Day',
  '2026-09-22': 'Independence Day',
  '2026-11-02': "National Enlighteners' Day",
  '2026-12-24': 'Christmas Eve',
  '2026-12-25': 'Christmas Day',
  '2026-12-28': 'Second Christmas Day',
}

/** Serialize a Date object to ISO date string (YYYY-MM-DD) without timezone drift. */
export function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Format an ISO date string (YYYY-MM-DD) as "3 Feb 2026" without timezone drift. */
export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Format a day count: integers without decimals, halves with one decimal place. */
export function fmtDays(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** Return initials from a full name, e.g. "Jane Doe" → "JD". */
export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

/**
 * Count working days between two ISO date strings (inclusive),
 * excluding weekends and Bulgarian public holidays.
 * When halfDayOnEnd is true the last date contributes 0.5 instead of 1.
 * Returns null if either date is missing or end < start.
 */
export function countWorkdays(start, end, halfDayOnEnd = false) {
  if (!start || !end || end < start) return null
  let count = 0
  const cur  = new Date(start + 'T00:00:00')
  const last = new Date(end   + 'T00:00:00')
  while (cur <= last) {
    const dow = cur.getDay()
    const iso = isoOf(cur)
    if (dow !== 0 && dow !== 6 && !HOLIDAYS[iso]) {
      const isLastDay = iso === end
      count += (halfDayOnEnd && isLastDay) ? 0.5 : 1
    }
    cur.setDate(cur.getDate() + 1)
  }
  return count
}
