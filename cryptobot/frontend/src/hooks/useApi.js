import axios from 'axios'
import { clearApiKey, getApiKey } from '../lib/apiKey.js'

// In local dev, Vite proxies /api to localhost:8000 (see vite.config.js).
// In production, if the frontend is deployed on a different origin than the
// backend (e.g. Vercel + a separate VPS), set VITE_API_BASE_URL to the
// backend's full URL, e.g. https://bot.example.com/api
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const key = getApiKey()
  if (key) config.headers['X-API-Key'] = key
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('API error:', err.response?.data || err.message)
    if (err.response?.status === 401) {
      // Stored key is missing/wrong — drop it and force the unlock gate again.
      clearApiKey()
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

export default api
