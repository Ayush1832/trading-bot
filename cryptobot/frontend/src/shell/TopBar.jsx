import { useState } from 'react'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'
import { Chip, Dot, Num, fmtUsd, fmtSigned, pnlColor } from '../ui/kit.jsx'

function ModeChip({ dryRun, sandbox }) {
  if (dryRun) return <Chip tone="warn">PAPER</Chip>
  if (sandbox) return <Chip tone="accent">TESTNET</Chip>
  return <Chip tone="down" pulse>LIVE · REAL FUNDS</Chip>
}

function BotControl({ running }) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    if (running && !window.confirm('Stop the bot? Open positions keep their stop-loss but will no longer be monitored.')) return
    setBusy(true)
    try {
      await api.post(running ? '/bot/stop' : '/bot/start')
    } catch (e) {
      alert('Error: ' + (e.response?.data?.detail || e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button onClick={toggle} disabled={busy} className={running ? 'btn-down' : 'btn-up'}>
      {busy ? (
        <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-down' : 'bg-up'}`} />
      )}
      {running ? 'STOP ENGINE' : 'START ENGINE'}
    </button>
  )
}

export default function TopBar() {
  const botState = useStore((s) => s.botState)
  const wsConnected = useStore((s) => s.wsConnected)
  const { running, dry_run, sandbox_mode, usdt_balance = 0, pnl_today_usdt = 0, trade_open } = botState

  return (
    <header className="h-12 shrink-0 bg-ink-900 border-b border-line flex items-center px-4 gap-4">
      {/* Identity */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-bold tracking-tight text-tx whitespace-nowrap">
          CryptoBot <span className="text-tx-dim font-medium">Terminal</span>
        </span>
        <ModeChip dryRun={dry_run} sandbox={sandbox_mode} />
      </div>

      {/* Engine state */}
      <div className="flex items-center gap-2 pl-4 border-l border-line-soft">
        <Dot tone={running ? 'up' : 'idle'} pulse={running} />
        <span className={`text-2xs font-semibold tracking-wider ${running ? 'text-up' : 'text-tx-dim'}`}>
          {running ? (trade_open ? 'IN POSITION' : 'SCANNING') : 'STOPPED'}
        </span>
      </div>

      <div className="flex-1" />

      {/* Live numbers */}
      <div className="hidden md:flex items-center gap-6">
        <div className="text-right">
          <p className="microlabel">Equity</p>
          <Num value={usdt_balance} format={(v) => fmtUsd(v)} className="text-sm font-semibold text-tx leading-none" />
        </div>
        <div className="text-right">
          <p className="microlabel">Today</p>
          <Num
            value={pnl_today_usdt}
            format={(v) => fmtSigned(v)}
            className={`text-sm font-semibold leading-none ${pnlColor(pnl_today_usdt, 'text-tx')}`}
          />
        </div>
      </div>

      {/* Connection */}
      <div className="flex items-center gap-1.5 pl-4 border-l border-line-soft" title={wsConnected ? 'Live data stream connected' : 'Data stream offline'}>
        <Dot tone={wsConnected ? 'up' : 'down'} pulse={wsConnected} />
        <span className="text-3xs font-semibold tracking-wider text-tx-dim">{wsConnected ? 'STREAM' : 'OFFLINE'}</span>
      </div>

      <BotControl running={running} />
    </header>
  )
}
