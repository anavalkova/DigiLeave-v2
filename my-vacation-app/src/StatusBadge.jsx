const STATUS_STYLES = {
  approved:  'bg-green-100 text-green-700 ring-green-600/20',
  pending:   'bg-amber-100 text-amber-700 ring-amber-600/20',
  rejected:  'bg-red-100 text-red-700 ring-red-600/20',
  cancelled: 'bg-gray-100 text-gray-500 ring-gray-400/20',
}

/** Returns the Tailwind classes for a given status string (lowercase). */
export function getStatusColor(status) {
  return STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700 ring-gray-600/20'
}

export default function StatusBadge({ status }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusColor(status)}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}
