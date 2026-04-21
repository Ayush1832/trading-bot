import api from '../hooks/useApi.js'

export default function BotStatusBadge({ running }) {
  const toggle = async () => {
    try {
      if (running) {
        await api.post('/bot/stop')
      } else {
        await api.post('/bot/start')
      }
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
          running
            ? 'bg-green-900/60 text-green-300 ring-1 ring-green-600'
            : 'bg-gray-800 text-gray-400 ring-1 ring-gray-600'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${running ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
        />
        {running ? 'RUNNING' : 'STOPPED'}
      </span>
      <button
        onClick={toggle}
        className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
          running
            ? 'bg-red-700 hover:bg-red-600 text-white'
            : 'bg-green-700 hover:bg-green-600 text-white'
        }`}
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </div>
  )
}
