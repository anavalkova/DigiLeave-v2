import { describe, it, expect } from 'vitest'
import { halfDaySlotLabel, remainingDaysColor } from '../formatters'

// ── halfDaySlotLabel ──────────────────────────────────────────────────────────

describe('halfDaySlotLabel', () => {
  it('"MORNING" → "Morning"', () => {
    expect(halfDaySlotLabel('MORNING')).toBe('Morning')
  })

  it('"AFTERNOON" → "Afternoon"', () => {
    expect(halfDaySlotLabel('AFTERNOON')).toBe('Afternoon')
  })

  it('"NONE" → empty string', () => {
    expect(halfDaySlotLabel('NONE')).toBe('')
  })

  it('null → empty string', () => {
    expect(halfDaySlotLabel(null)).toBe('')
  })

  it('undefined → empty string', () => {
    expect(halfDaySlotLabel(undefined)).toBe('')
  })

  it('unknown value → empty string', () => {
    expect(halfDaySlotLabel('UNKNOWN')).toBe('')
  })

  it('0.5 totalDays with MORNING slot → "Morning"', () => {
    // The slot value is what drives the label; totalDays=0.5 signals a half-day request
    const totalDays = 0.5
    const slot = 'MORNING'
    expect(totalDays).toBe(0.5)
    expect(halfDaySlotLabel(slot)).toBe('Morning')
  })

  it('0.5 totalDays with AFTERNOON slot → "Afternoon"', () => {
    const totalDays = 0.5
    const slot = 'AFTERNOON'
    expect(totalDays).toBe(0.5)
    expect(halfDaySlotLabel(slot)).toBe('Afternoon')
  })
})

// ── remainingDaysColor ────────────────────────────────────────────────────────

describe('remainingDaysColor', () => {
  // ── Over budget ──────────────────────────────────────────────────────────────

  it('over budget → text-red-500', () => {
    expect(remainingDaysColor(-1, true)).toBe('text-red-500')
  })

  it('over budget flag takes priority regardless of displayAvail value', () => {
    // Even if displayAvail looks positive (stale state), overBudget flag wins
    expect(remainingDaysColor(5, true)).toBe('text-red-500')
  })

  // ── Low balance (amber warning) ───────────────────────────────────────────────

  it('exactly 2 days remaining → text-amber-500', () => {
    expect(remainingDaysColor(2, false)).toBe('text-amber-500')
  })

  it('1 day remaining → text-amber-500', () => {
    expect(remainingDaysColor(1, false)).toBe('text-amber-500')
  })

  it('0.5 days remaining → text-amber-500', () => {
    expect(remainingDaysColor(0.5, false)).toBe('text-amber-500')
  })

  it('0 days remaining (not over budget) → text-amber-500', () => {
    expect(remainingDaysColor(0, false)).toBe('text-amber-500')
  })

  // ── Healthy balance (green) ───────────────────────────────────────────────────

  it('3 days remaining → text-emerald-600', () => {
    expect(remainingDaysColor(3, false)).toBe('text-emerald-600')
  })

  it('10 days remaining → text-emerald-600', () => {
    expect(remainingDaysColor(10, false)).toBe('text-emerald-600')
  })

  it('20 days remaining → text-emerald-600', () => {
    expect(remainingDaysColor(20, false)).toBe('text-emerald-600')
  })

  it('2.5 days remaining → text-emerald-600 (boundary: 2.5 > 2)', () => {
    expect(remainingDaysColor(2.5, false)).toBe('text-emerald-600')
  })
})
