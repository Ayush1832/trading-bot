import { useState } from 'react'
import { getApiKey, setApiKey } from '../lib/apiKey.js'

export default function ApiKeyGate({ children }) {
  const [key, setKey] = useState(getApiKey())
  const [input, setInput] = useState('')

  if (key) return children

  function submit(e) {
    e.preventDefault()
    if (!input.trim()) return
    setApiKey(input.trim())
    setKey(input.trim())
  }

  return (
    <div className="h-screen flex items-center justify-center bg-ink-950 text-tx px-4">
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-lg border border-white/10 bg-black/30 space-y-3">
        <h1 className="text-lg font-semibold">CryptoBot Pro — Unlock</h1>
        <p className="text-sm text-tx-dim">
          Enter the API key to access this dashboard (backend .env{' '}
          <code>API_AUTH_TOKEN</code>, or the value printed in the backend
          startup log if it wasn't set).
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="API key"
          className="w-full px-3 py-2 rounded bg-black/40 border border-white/10 outline-none focus:border-emerald-500"
          autoFocus
        />
        <button
          type="submit"
          className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 font-medium transition-colors"
        >
          Unlock
        </button>
      </form>
    </div>
  )
}
