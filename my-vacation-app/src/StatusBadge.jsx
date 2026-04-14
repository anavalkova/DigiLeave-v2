export default function StatusBadge({ status }) {
  const label = status.charAt(0).toUpperCase() + status.slice(1)
  const colours = {
    approved: 'bg-green-100 text-green-700 ring-green-600/20',
    pending:  'bg-amber-100 text-amber-700 ring-amber-600/20',
    rejected: 'bg-red-100 text-red-700 ring-red-600/20',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colours[status] ?? 'bg-gray-100 text-gray-700 ring-gray-600/20'}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  )
}
