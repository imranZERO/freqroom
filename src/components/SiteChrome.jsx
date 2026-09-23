import { Link } from 'wouter';
import { InfoIcon, SunIcon, MoonIcon, GitHubIcon, DocIcon, WaveIcon } from './Icons.jsx';

// Shared page header: title (links home), subtitle, How it works, theme toggle
export function SiteHeader({ subtitle, isDark, onToggleTheme, onInfo }) {
  return (
    <header className="app-header">
      <div className="header-top">
        <div className="header-title">
          <h1>
            <Link href="/" className="title-link">
              <svg className="header-mark" viewBox="0 0 32 32" aria-hidden="true">
                <polyline points="2,22 8,22 11,18 14,8 17,18 20,22 30,22" />
              </svg>
              <span>Fr<span className="title-eq">eq</span>Room</span>
            </Link>
          </h1>
          <p>{subtitle}</p>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={onInfo}
            aria-label="How it works"
            data-tooltip="How it works"
          >
            <InfoIcon />
          </button>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            data-tooltip={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}

// Shared page footer; `page` swaps the first link so it never points at itself
export function SiteFooter({ page }) {
  return (
    <footer className="app-footer">
      <nav className="footer-links" aria-label="Footer">
        {page === 'technical'
          ? <Link href="/"><WaveIcon />Trainer</Link>
          : <Link href="/technical-details"><DocIcon />Technical Details</Link>}
        <a href="https://github.com/imranZERO/freqroom" target="_blank" rel="noopener noreferrer">
          <GitHubIcon />GitHub
        </a>
      </nav>
      <p className="footer-links">
        <span className="footer-credit">
          Created by <a href="https://imranzero.pages.dev" target="_blank" rel="noopener noreferrer">imranZERO</a>
        </span>
      </p>
    </footer>
  );
}
