import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './shell/Sidebar.jsx'
import TopBar from './shell/TopBar.jsx'
import Terminal from './pages/Terminal.jsx'
import Journal from './pages/Journal.jsx'
import Backtest from './pages/Backtest.jsx'
import Risk from './pages/Risk.jsx'
import System from './pages/System.jsx'
import Settings from './pages/Settings.jsx'
import { useWebSocket } from './hooks/useWebSocket.js'
import ApiKeyGate from './shell/ApiKeyGate.jsx'

function Shell() {
  useWebSocket()

  return (
    <BrowserRouter>
      <div className="h-screen flex bg-ink-950 text-tx overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 min-h-0 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Terminal />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/backtest" element={<Backtest />} />
              <Route path="/risk" element={<Risk />} />
              <Route path="/system" element={<System />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <ApiKeyGate>
      <Shell />
    </ApiKeyGate>
  )
}
