const STORAGE_KEY = 'cryptobot_api_key'

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

export function setApiKey(key) {
  localStorage.setItem(STORAGE_KEY, key)
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY)
}
