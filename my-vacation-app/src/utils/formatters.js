/**
 * Return the display label for a half-day slot.
 * 'MORNING' → 'Morning', 'AFTERNOON' → 'Afternoon', anything else → ''.
 */
export function halfDaySlotLabel(slot) {
  if (slot === 'MORNING')   return 'Morning'
  if (slot === 'AFTERNOON') return 'Afternoon'
  return ''
}

/**
 * Return the Tailwind CSS colour class for the remaining-days figure.
 *   overBudget   → text-red-500   (committed exceeds total budget)
 *   available ≤2 → text-amber-500 (low balance warning)
 *   otherwise    → text-emerald-600
 */
export function remainingDaysColor(displayAvail, overBudget) {
  if (overBudget)         return 'text-red-500'
  if (displayAvail <= 2)  return 'text-amber-500'
  return 'text-emerald-600'
}
