// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import ActionButton from '../ActionButton'

describe('ActionButton', () => {
  it('renders the label text', () => {
    render(<ActionButton label="Submit Request" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeInTheDocument()
  })

  it('calls onClick exactly once when clicked', async () => {
    const handleClick = vi.fn()
    render(<ActionButton label="Submit" onClick={handleClick} />)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when the disabled prop is true', () => {
    render(<ActionButton label="Submit" onClick={() => {}} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not call onClick when clicked in disabled state', async () => {
    const handleClick = vi.fn()
    render(<ActionButton label="Submit" onClick={handleClick} disabled />)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })
})
