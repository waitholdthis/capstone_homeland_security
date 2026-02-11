import { Link, useLocation } from 'react-router-dom'
import { useIncidents } from '../../context/IncidentContext'
import { useTheme } from '../../context/ThemeContext'

export default function Header() {
  const location = useLocation()
  const { state } = useIncidents()
  const { theme, toggleTheme } = useTheme()
  const activeCount = state.incidents.filter((i) => i.status === 'active').length

  const navLinks = [
    { to: '/', label: 'Dashboard', match: (p) => p === '/' },
    { to: '/map', label: 'Map', match: (p) => p === '/map' },
    { to: '/doctrine', label: 'Doctrine', match: (p) => p === '/doctrine' },
    { to: '/incident/new', label: 'New Incident', match: (p) => p === '/incident/new' },
  ]

  return (
    <>
      <div className="classification-banner">
        UNCLASSIFIED // FOR OFFICIAL USE ONLY — TRAINING / EXERCISE ENVIRONMENT
      </div>

      <header className="bg-surface-overlay backdrop-blur-sm border-b border-line px-6 py-2.5 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-3 no-underline group">
          <div className="relative w-10 h-10 shrink-0">
            <svg viewBox="0 0 40 40" className="w-full h-full">
              <defs>
                <linearGradient id="shield-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity="0.7" />
                </linearGradient>
              </defs>
              <path d="M20 2 L36 10 L36 22 C36 30 28 37 20 39 C12 37 4 30 4 22 L4 10 Z"
                fill="none" stroke="url(#shield-grad)" strokeWidth="1.5" />
              <path d="M20 6 L32 12 L32 22 C32 28 26 34 20 36 C14 34 8 28 8 22 L8 12 Z"
                fill="rgba(6, 182, 212, 0.08)" stroke="none" />
              <text x="20" y="24" textAnchor="middle" fill="#22d3ee"
                fontSize="13" fontWeight="700" fontFamily="'JetBrains Mono', monospace">A</text>
            </svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold text-cyan-400 tracking-widest group-hover:text-cyan-300 transition-colors">AEGIS</h1>
            <p className="text-[9px] text-muted tracking-[0.2em] uppercase font-medium">AI-Enabled Governance & Incident Support</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors no-underline ${
                link.match(location.pathname)
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  : 'text-secondary hover:text-body hover:bg-surface-inset border border-transparent'
              }`}
            >
              {link.label}
            </Link>
          ))}

          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded border border-amber-400/20 ml-2 font-mono font-semibold">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse-glow" />
              {activeCount} ACTIVE
            </span>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="ml-2 p-1.5 rounded-lg border border-line text-secondary hover:text-cyan-400 hover:border-cyan-500/30 transition-colors cursor-pointer bg-transparent"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>
        </nav>
      </header>
    </>
  )
}
