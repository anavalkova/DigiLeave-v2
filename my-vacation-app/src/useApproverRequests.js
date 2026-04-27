import { useState, useCallback } from 'react'
import api from './api'
import { LEAVE_STATUS } from './constants'

const API = import.meta.env.VITE_API_BASE_URL

/**
 * Manages the approvals queue for users with ADMIN or APPROVER role.
 *
 * The caller is responsible for triggering the initial fetch (e.g. on tab change
 * or when the user becomes eligible). This keeps the hook free of side effects
 * that would fire even when the approvals tab is not visible.
 *
 * @param {string|null} userId  the approver/admin user ID
 * @returns {{
 *   requests: object[],
 *   loading: boolean,
 *   pendingCount: number,
 *   fetchRequests: (filterParams?: object) => Promise<void>,
 *   approveRequest: (requestId: string) => Promise<void>,
 *   rejectRequest: (requestId: string) => Promise<void>,
 * }}
 */
export function useApproverRequests(userId) {
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(false)

  /**
   * Fetches pending/all requests visible to this approver.
   * Optional {@code filterParams} are forwarded as query parameters.
   *
   * @param {object} [filterParams={}]
   */
  const fetchRequests = useCallback(async (filterParams = {}) => {
    if (!userId) return
    setLoading(true)
    try {
      const { data } = await api.get(`${API}/api/leave/pending`, {
        params: { userId, ...filterParams },
      })
      setRequests(data)
    } catch {
      // non-critical — stale data stays visible
    } finally {
      setLoading(false)
    }
  }, [userId])

  /**
   * Approves a single leave request and re-fetches the queue.
   *
   * @param {string} requestId
   */
  const approveRequest = useCallback(async (requestId) => {
    try {
      await api.patch(`${API}/api/leave/${requestId}/status`, { status: LEAVE_STATUS.APPROVED })
      await fetchRequests()
    } catch {
      // silently ignore — table re-fetches on next tab visit
    }
  }, [fetchRequests])

  /**
   * Rejects a single leave request and re-fetches the queue.
   *
   * @param {string} requestId
   * @param {string} [reason]  optional free-text rejection reason
   */
  const rejectRequest = useCallback(async (requestId, reason) => {
    try {
      await api.patch(`${API}/api/leave/${requestId}/status`, {
        status: LEAVE_STATUS.REJECTED,
        rejectionReason: reason?.trim() || null,
      })
      await fetchRequests()
    } catch {
      // silently ignore
    }
  }, [fetchRequests])

  const pendingCount = requests.filter(r => r.status === LEAVE_STATUS.PENDING).length

  return { requests, loading, pendingCount, fetchRequests, approveRequest, rejectRequest }
}
