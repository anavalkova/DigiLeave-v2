// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
  it('renders the status label with first letter capitalised', () => {
    render(<StatusBadge status="approved" />)
    expect(screen.getByRole('status')).toHaveTextContent('Approved')
  })

  it('renders correct label for each known status', () => {
    const cases = [
      { status: 'approved',  label: 'Approved'  },
      { status: 'pending',   label: 'Pending'   },
      { status: 'rejected',  label: 'Rejected'  },
      { status: 'cancelled', label: 'Cancelled' },
    ]
    for (const { status, label } of cases) {
      const { unmount } = render(<StatusBadge status={status} />)
      expect(screen.getByRole('status')).toHaveTextContent(label)
      unmount()
    }
  })

  it('applies green classes for approved status', () => {
    render(<StatusBadge status="approved" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveClass('bg-green-100')
    expect(badge).toHaveClass('text-green-700')
  })

  it('applies red classes for rejected status', () => {
    render(<StatusBadge status="rejected" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveClass('bg-red-100')
    expect(badge).toHaveClass('text-red-700')
  })

  it('applies neutral classes for an unknown status', () => {
    render(<StatusBadge status="unknown_status" />)
    const badge = screen.getByRole('status')
    expect(badge).toHaveClass('bg-gray-100')
    expect(badge).toHaveClass('text-gray-700')
  })

  it('still renders text for an unknown status', () => {
    render(<StatusBadge status="unknown_status" />)
    expect(screen.getByRole('status')).toHaveTextContent('Unknown_status')
  })
})
