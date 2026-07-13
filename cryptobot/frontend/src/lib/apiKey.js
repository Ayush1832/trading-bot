const STORAGE_KEY = 'cryptobot_api_key'

// If VITE_API_KEY is set at build time (e.g. on Vercel), it's used as a
// fallback so the dashboard auto-authenticates without showing the unlock
// gate. Falls back to a manually-entered, localStorage-persisted key
// otherwise (e.g. local dev without a build-time key configured).
export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || import.meta.env.VITE_API_KEY || ''
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key)
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY)
}
