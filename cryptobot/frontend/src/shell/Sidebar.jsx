import { NavLink } from 'react-router-dom'

/* Minimal stroke icons — consistent 18px, 1.7 stroke */
const I = {
  terminal: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17l6-5-6-5" /><path d="M12 19h8" />
    </svg>
  ),
  journal: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  backtest: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 13l3-3 4 4 5-6" />
    </svg>
  ),
  risk: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  ),
  system: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 8-4-16-3 8H2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

const NAV = [
  { to: '/', icon: I.terminal, label: 'Terminal', end: true },
  { to: '/journal', icon: I.journal, label: 'Journal' },
  { to: '/backtest', icon: I.backtest, label: 'Backtest' },
  { to: '/risk', icon: I.risk, label: 'Risk' },
  { to: '/system', icon: I.system, label: 'System' },
]

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7">
      <rect width="32" height="32" rx="7" fill="#10131a" stroke="#1b2030" />
      <rect x="8" y="13" width="4" height="11" rx="1" fill="#f0445c" />
      <rect x="9.5" y="10" width="1" height="16" fill="#f0445c" />
      <rect x="14" y="8" width="4" height="12" rx="1" fill="#19c685" />
      <rect x="15.5" y="5" width="1" height="17" fill="#19c685" />
      <rect x="20" y="6" width="4" height="9" rx="1" fill="#19c685" />
      <rect x="21.5" y="4" width="1" height="14" fill="#19c685" />
    </svg>
  )
}

function Item({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex flex-col items-center gap-1 py-2.5 rounded-lg transition-colors duration-150 ${
          isActive ? 'text-tx' : 'text-tx-dim hover:text-tx-2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 rounded-full bg-accent" />}
          <span className={`w-[18px] h-[18px] ${isActive ? 'text-accent' : ''}`}>{icon}</span>
          <span className="text-3xs font-medium tracking-wide">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside className="w-[68px] shrink-0 bg-ink-900 border-r border-line flex flex-col items-stretch py-3 px-2">
      <div className="flex justify-center mb-4">
        <LogoMark />
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => <Item key={n.to} {...n} />)}
      </nav>
      <div className="mt-auto">
        <Item to="/settings" icon={I.settings} label="Config" />
      </div>
    </aside>
  )
}
