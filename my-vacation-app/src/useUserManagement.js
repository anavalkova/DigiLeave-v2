import { useState, useCallback } from 'react'
import api from './api'
import { ROLES } from './constants'

const API = import.meta.env.VITE_API_BASE_URL

/**
 * Manages the user list and all admin/approver update operations.
 *
 * ADMIN users get the full user list via {@code fetchAllUsers}.
 * APPROVER users get only their direct reports via {@code fetchManagedUsers}.
 *
 * @param {object|null} currentUser  the authenticated user (needs {@code id} and {@code role})
 * @returns {{
 *   allUsers: object[],
 *   managedUsers: object[],
 *   usersLoading: boolean,
 *   managedUsersLoading: boolean,
 *   fetchAllUsers: () => Promise<void>,
 *   fetchManagedUsers: () => Promise<void>,
 *   updateRole: (userId: string, role: string) => Promise<void>,
 *   updateBalance: (userId: string, entitled: number, adj: number) => Promise<void>,
 *   updateApprovers: (userId: string, emails: string[]) => Promise<void>,
 *   updateTeam: (userId: string, team: string|null) => Promise<void>,
 * }}
 */
export function useUserManagement(currentUser) {
  const [allUsers,            setAllUsers]            = useState([])
  const [managedUsers,        setManagedUsers]        = useState([])
  const [usersLoading,        setUsersLoading]        = useState(false)
  const [managedUsersLoading, setManagedUsersLoading] = useState(false)

  /** Fetches the full user list (ADMIN only). */
  const fetchAllUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const { data } = await api.get(`${API}/api/users`)
      setAllUsers(data)
    } catch {
      // non-critical
    } finally {
      setUsersLoading(false)
    }
  }, [])

  /** Fetches only direct reports visible to this approver. */
  const fetchManagedUsers = useCallback(async () => {
    if (!currentUser?.id) return
    setManagedUsersLoading(true)
    try {
      const { data } = await api.get(`${API}/api/users/managed?requesterId=${currentUser.id}`)
      setManagedUsers(data)
    } catch {
      // non-critical
    } finally {
      setManagedUsersLoading(false)
    }
  }, [currentUser?.id])

  /**
   * Updates a user's role and reflects the change in the local user list.
   * Throws on API error so AdminPanel can surface the failure inline.
   *
   * @param {string} userId
   * @param {string} role  one of {@link ROLES}
   */
  const updateRole = useCallback(async (userId, role) => {
    const { data } = await api.patch(`${API}/api/users/${userId}/role`, { role })
    setAllUsers(prev => prev.map(u => u.id === userId ? data : u))
  }, [])

  /**
   * Updates the annual leave balance for a user.
   *
   * @param {string} userId
   * @param {number} entitled
   * @param {number} startingBalanceAdjustment
   */
  const updateBalance = useCallback(async (userId, entitled, startingBalanceAdjustment) => {
    const { data } = await api.patch(`${API}/api/users/${userId}/balance`, {
      entitled,
      startingBalanceAdjustment,
    })
    setAllUsers(prev => prev.map(u => u.id === userId ? data : u))
  }, [])

  /**
   * Updates the approver email list for a user.
   *
   * @param {string}   userId
   * @param {string[]} approverEmails
   */
  const updateApprovers = useCallback(async (userId, approverEmails) => {
    const { data } = await api.patch(`${API}/api/users/${userId}/approver`, { approverEmails })
    setAllUsers(prev => prev.map(u => u.id === userId ? data : u))
  }, [])

  /**
   * Updates the team assignment for a user. Pass {@code null} to clear it.
   *
   * @param {string}      userId
   * @param {string|null} team
   */
  const updateTeam = useCallback(async (userId, team) => {
    const { data } = await api.patch(`${API}/api/users/${userId}/team`, { team: team || null })
    setAllUsers(prev => prev.map(u => u.id === userId ? data : u))
  }, [])

  return {
    allUsers,
    managedUsers,
    usersLoading,
    managedUsersLoading,
    fetchAllUsers,
    fetchManagedUsers,
    updateRole,
    updateBalance,
    updateApprovers,
    updateTeam,
  }
}
