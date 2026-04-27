import { useState, useEffect, useCallback } from 'react'
import api from './api'
import { isoOf } from './LeaveCalendar'

const API = import.meta.env.VITE_API_BASE_URL

/**
 * Manages leave history, balance summary, request submission, and cancellation
 * for a single authenticated user.
 *
 * @param {string|null} userId  the authenticated user's ID; no fetch occurs when null
 * @returns {{
 *   history: object[],
 *   summary: object|null,
 *   loading: boolean,
 *   historyError: string,
 *   cancelError: string,
 *   fetchHistory: () => Promise<void>,
 *   fetchSummary: () => Promise<void>,
 *   cancelRequest: (requestId: string) => Promise<void>,
 *   submitRequest: (payload: object) => Promise<object>,
 *   leaveDateMap: Record<string, 'approved'|'pending'>,
 * }}
 */
export function useLeaveRequests(userId) {
  const [history,      setHistory]      = useState([])
  const [summary,      setSummary]      = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [cancelError,  setCancelError]  = useState('')

  /** Fetches the full leave history for the user, normalising status to lowercase. */
  const fetchHistory = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setHistoryError('')
    try {
      const { data } = await api.get(`${API}/api/leave/user/${userId}`)
      setHistory(data.map(item => ({ ...item, status: item.status.toLowerCase() })))
    } catch (err) {
      if (err.response) {
        setHistoryError('Could not load your leave history. Please refresh to try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  /** Fetches the balance summary. Failure is non-critical — cards show 0 until next fetch. */
  const fetchSummary = useCallback(async () => {
    if (!userId) return
    try {
      const { data } = await api.get(`${API}/api/leave/summary/${userId}`)
      setSummary(data)
    } catch {
      // non-critical
    }
  }, [userId])

  /**
   * Cancels an existing leave request.
   * Sets cancelError if the server rejects the operation.
   *
   * @param {string} requestId
   */
  const cancelRequest = useCallback(async (requestId) => {
    setCancelError('')
    try {
      await api.patch(`${API}/api/leave/${requestId}/cancel?userId=${userId}`)
      await fetchHistory()
      await fetchSummary()
    } catch (err) {
      const data = err.response?.data
      const msg = data?.message ?? (typeof data === 'string' ? data : null)
        ?? `Request failed (HTTP ${err.response?.status ?? 'network error'})`
      setCancelError(msg)
    }
  }, [userId, fetchHistory, fetchSummary])

  /**
   * Submits a new leave request.
   * Throws with a user-visible message on validation failure (422).
   *
   * @param {{ startDate, endDate, type, halfDaySlot }} payload
   * @returns {Promise<object>} the created leave request
   * @throws {string} user-visible validation message
   */
  const submitRequest = useCallback(async (payload) => {
    const { data } = await api.post(`${API}/api/leave/request`, { userId, ...payload })
    const created = { ...data, status: data.status.toLowerCase() }
    setHistory(prev => [created, ...prev])
    await fetchSummary()
    return created
  }, [userId, fetchSummary])

  // Initial load
  useEffect(() => {
    if (userId) {
      fetchHistory()
      fetchSummary()
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build a map of ISO date → 'approved' | 'pending' for the calendar component
  const leaveDateMap = {}
  history.forEach(req => {
    if (req.status === 'rejected' || req.status === 'cancelled') return
    const cur = new Date(req.startDate + 'T00:00:00')
    const end = new Date(req.endDate   + 'T00:00:00')
    while (cur <= end) {
      const iso = isoOf(cur)
      if (!leaveDateMap[iso] || leaveDateMap[iso] === 'pending') leaveDateMap[iso] = req.status
      cur.setDate(cur.getDate() + 1)
    }
  })

  return {
    history,
    summary,
    loading,
    historyError,
    cancelError,
    setCancelError,
    fetchHistory,
    fetchSummary,
    cancelRequest,
    submitRequest,
    leaveDateMap,
  }
}
