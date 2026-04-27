/**
 * Shared application constants — single source of truth for all status/type enums.
 * Import these instead of writing magic strings in components and hooks.
 */

/** Canonical leave type keys (sent to and received from the API). */
export const LEAVE_TYPES = {
  ANNUAL:      'annual',
  SICK:        'sick',
  UNPAID:      'unpaid',
  MATERNITY:   'maternity',
  HOME_OFFICE: 'home_office',
}

/** Human-readable labels for each canonical leave type key. */
export const LEAVE_TYPE_LABELS = {
  [LEAVE_TYPES.ANNUAL]:      'Annual Leave',
  [LEAVE_TYPES.SICK]:        'Sick Leave',
  [LEAVE_TYPES.UNPAID]:      'Unpaid Leave',
  [LEAVE_TYPES.MATERNITY]:   'Maternity / Paternity',
  [LEAVE_TYPES.HOME_OFFICE]: 'Home Office',
}

/**
 * Maps legacy label strings (stored before the canonical-key migration) to
 * their canonical keys. Used by {@link normalizeLeaveType}.
 */
export const LEGACY_TYPE_MAP = {
  'annual leave':          LEAVE_TYPES.ANNUAL,
  'sick leave':            LEAVE_TYPES.SICK,
  'unpaid leave':          LEAVE_TYPES.UNPAID,
  'maternity / paternity': LEAVE_TYPES.MATERNITY,
  'home office':           LEAVE_TYPES.HOME_OFFICE,
}

/**
 * Normalises any leave type string to its canonical key.
 * Handles both current canonical keys and legacy label format transparently.
 *
 * @param {string|null|undefined} type
 * @returns {string} canonical key, or '' for null/undefined input
 */
export function normalizeLeaveType(type) {
  if (!type) return ''
  const lower = type.toLowerCase().trim()
  return LEGACY_TYPE_MAP[lower] ?? lower
}

/**
 * Returns the human-readable label for any type string, regardless of storage format.
 *
 * @param {string|null|undefined} type
 * @returns {string} the display label, or the raw type string as fallback
 */
export function formatLeaveType(type) {
  const key = normalizeLeaveType(type)
  return LEAVE_TYPE_LABELS[key] ?? type ?? '—'
}

/** Select options for the leave type filter/picker. */
export const LEAVE_TYPE_OPTIONS = [
  { value: LEAVE_TYPES.ANNUAL,      label: LEAVE_TYPE_LABELS[LEAVE_TYPES.ANNUAL]      },
  { value: LEAVE_TYPES.SICK,        label: LEAVE_TYPE_LABELS[LEAVE_TYPES.SICK]        },
  { value: LEAVE_TYPES.UNPAID,      label: LEAVE_TYPE_LABELS[LEAVE_TYPES.UNPAID]      },
  { value: LEAVE_TYPES.MATERNITY,   label: LEAVE_TYPE_LABELS[LEAVE_TYPES.MATERNITY]   },
  { value: LEAVE_TYPES.HOME_OFFICE, label: LEAVE_TYPE_LABELS[LEAVE_TYPES.HOME_OFFICE] },
]

/** Leave request status values (uppercase — as returned by the API). */
export const LEAVE_STATUS = {
  PENDING:   'PENDING',
  APPROVED:  'APPROVED',
  REJECTED:  'REJECTED',
  CANCELLED: 'CANCELLED',
}

/** User role values (uppercase — as returned by the API). */
export const ROLES = {
  USER:       'USER',
  ADMIN:      'ADMIN',
  APPROVER:   'APPROVER',
  ACCOUNTANT: 'ACCOUNTANT',
}

/** Half-day slot values (uppercase — as returned by the API). */
export const HALF_DAY_SLOTS = {
  NONE:      'NONE',
  MORNING:   'MORNING',
  AFTERNOON: 'AFTERNOON',
}
