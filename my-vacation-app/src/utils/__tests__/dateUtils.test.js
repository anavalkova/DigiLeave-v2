import { describe, it, expect } from 'vitest'
import { fmtDate, fmtDays, initials, countWorkdays, isoOf, HOLIDAYS } from '../dateUtils'

// ── fmtDate ───────────────────────────────────────────────────────────────────

describe('fmtDate', () => {
  it('formats a standard date as "D Mon YYYY"', () => {
    expect(fmtDate('2026-06-01')).toBe('1 Jun 2026')
  })

  it('does not zero-pad the day', () => {
    expect(fmtDate('2026-02-05')).toBe('5 Feb 2026')
  })

  it('handles start of year', () => {
    expect(fmtDate('2026-01-01')).toBe('1 Jan 2026')
  })

  it('handles end of year', () => {
    expect(fmtDate('2026-12-28')).toBe('28 Dec 2026')
  })

  it('avoids timezone drift — parses date as local midnight not UTC', () => {
    // If the implementation used `new Date(iso)` (UTC parse), a UTC-offset timezone
    // could shift the date back by one day.  The local-date constructor is safe.
    expect(fmtDate('2026-03-03')).toBe('3 Mar 2026')
  })
})

// ── fmtDays ───────────────────────────────────────────────────────────────────

describe('fmtDays', () => {
  it('integer → no decimal point', () => {
    expect(fmtDays(0)).toBe('0')
    expect(fmtDays(1)).toBe('1')
    expect(fmtDays(20)).toBe('20')
  })

  it('half-day (0.5) → one decimal place', () => {
    expect(fmtDays(0.5)).toBe('0.5')
  })

  it('non-integer half-day totals → one decimal place', () => {
    expect(fmtDays(2.5)).toBe('2.5')
    expect(fmtDays(4.5)).toBe('4.5')
  })
})

// ── initials ──────────────────────────────────────────────────────────────────

describe('initials', () => {
  it('two-word name → two uppercase initials', () => {
    expect(initials('Jane Doe')).toBe('JD')
  })

  it('single word → one initial', () => {
    expect(initials('Ana')).toBe('A')
  })

  it('more than two words → only first two initials', () => {
    expect(initials('Ana Maria Valkova')).toBe('AM')
  })

  it('empty string → empty string', () => {
    expect(initials('')).toBe('')
  })

  it('extra spaces are ignored', () => {
    expect(initials('  Jane   Doe  ')).toBe('JD')
  })
})

// ── isoOf ─────────────────────────────────────────────────────────────────────

describe('isoOf', () => {
  it('serialises a Date as YYYY-MM-DD', () => {
    expect(isoOf(new Date(2026, 5, 1))).toBe('2026-06-01')
  })

  it('zero-pads single-digit month and day', () => {
    expect(isoOf(new Date(2026, 0, 9))).toBe('2026-01-09')
  })
})

// ── countWorkdays ─────────────────────────────────────────────────────────────

describe('countWorkdays', () => {
  // ── Happy path ──────────────────────────────────────────────────────────────

  it('Monday–Friday range → 5 workdays', () => {
    expect(countWorkdays('2026-06-01', '2026-06-05')).toBe(5)
  })

  it('single workday → 1', () => {
    expect(countWorkdays('2026-06-01', '2026-06-01')).toBe(1)
  })

  it('same start and end with halfDayOnEnd → 0.5', () => {
    expect(countWorkdays('2026-06-01', '2026-06-01', true)).toBe(0.5)
  })

  it('multi-day range ending on half-day → subtracts 0.5 from last day', () => {
    // Mon–Wed (3 full days) with half-day on Wed → 2 + 0.5 = 2.5
    expect(countWorkdays('2026-06-01', '2026-06-03', true)).toBe(2.5)
  })

  // ── Weekend exclusion ────────────────────────────────────────────────────────

  it('Friday to following Monday → 2 workdays (Sat+Sun excluded)', () => {
    expect(countWorkdays('2026-06-05', '2026-06-08')).toBe(2)
  })

  it('Saturday–Sunday only → 0 workdays', () => {
    expect(countWorkdays('2026-06-06', '2026-06-07')).toBe(0)
  })

  // ── Bulgarian public holiday exclusion ───────────────────────────────────────

  it('Easter block (Good Fri → Easter Mon 2026) → 0 workdays', () => {
    // 2026-04-10 Good Friday, 04-11 Holy Saturday, 04-12 Sunday, 04-13 Easter Monday
    expect(countWorkdays('2026-04-10', '2026-04-13')).toBe(0)
  })

  it('Labour Day (non-weekend holiday) is excluded', () => {
    // 2026-05-01 is a Friday and a public holiday
    expect(countWorkdays('2026-05-01', '2026-05-01')).toBe(0)
  })

  it('week containing Labour Day → one fewer workday', () => {
    // Mon 2026-04-27 → Fri 2026-05-01: 4 workdays (Fri is Labour Day)
    expect(countWorkdays('2026-04-27', '2026-05-01')).toBe(4)
  })

  it('all holidays listed in HOLIDAYS are excluded', () => {
    for (const iso of Object.keys(HOLIDAYS)) {
      const count = countWorkdays(iso, iso)
      expect(count, `${iso} (${HOLIDAYS[iso]}) should be excluded`).toBe(0)
    }
  })

  // ── Null / invalid inputs ────────────────────────────────────────────────────

  it('null start → null', () => {
    expect(countWorkdays(null, '2026-06-05')).toBeNull()
  })

  it('null end → null', () => {
    expect(countWorkdays('2026-06-01', null)).toBeNull()
  })

  it('both null → null', () => {
    expect(countWorkdays(null, null)).toBeNull()
  })

  it('end before start → null', () => {
    expect(countWorkdays('2026-06-05', '2026-06-01')).toBeNull()
  })

  it('empty string start → null', () => {
    expect(countWorkdays('', '2026-06-05')).toBeNull()
  })
})
