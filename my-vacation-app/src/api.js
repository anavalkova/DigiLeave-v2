import axios from 'axios'

const API = import.meta.env.VITE_API_BASE_URL

let accessToken = null

export function setAccessToken(token) { accessToken = token }
export function clearAccessToken()    { accessToken = null  }

// Plain instance used for the refresh call — no interceptors to avoid loops
const plain = axios.create({ baseURL: API, withCredentials: true })

// Authenticated instance — all app API calls use this
const api = axios.create({ baseURL: API, withCredentials: true })

api.interceptors.request.use(config => {
  if (accessToken) {
    config.headers['Authorization'] = `Bearer ${accessToken}`
  }
  return config
})

api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config
    if (error.response?.status === 401 && !original._retried) {
      original._retried = true
      try {
        const { data } = await plain.post('/api/auth/refresh')
        setAccessToken(data.accessToken)
        original.headers['Authorization'] = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        clearAccessToken()
        localStorage.removeItem('digileave_user')
        window.dispatchEvent(new CustomEvent('auth-expired'))
      }
    }
    return Promise.reject(error)
  }
)

export { plain as plainAxios }
export default api
