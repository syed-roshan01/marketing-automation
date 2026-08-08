import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext.jsx';
import MobileModal from './MobileModal.jsx';

const PAGE_META = {
    '/dashboard':      { title: 'Dashboard',      sub: 'Overview & Analytics' },
    '/devices':        { title: 'Devices',         sub: 'WhatsApp Connections' },
    '/contacts':       { title: 'Contacts',        sub: 'Address Book' },
    '/groups':         { title: 'Groups',          sub: 'Contact Groups' },
    '/templates':      { title: 'Templates',       sub: 'Message Templates' },
    '/campaigns':      { title: 'Campaigns',       sub: 'Bulk Messaging' },
    '/trust-builder':  { title: 'Trust Builder',   sub: 'Account Warming' },
    '/opt-out':        { title: 'Opt-Out',         sub: 'Unsubscribe Management' },
    '/auto-reply':     { title: 'Auto Reply',      sub: 'Trigger Automation' },
    '/chatbot-flows':  { title: 'Chatbot',         sub: 'Conversation Flows' },
    '/live-chat':      { title: 'Live Chat',       sub: 'Real-time Messages' },
    '/group-grabber':  { title: 'Group Grabber',   sub: 'Extract Members' },
    '/single-message': { title: 'Quick Send',      sub: 'Single Message' },
    '/settings':       { title: 'Settings',        sub: 'App Configuration' },
};

function SunIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
    );
}

export default function Topbar({ onMenuClick }) {
    const { license, activateLicense, showToast } = useApp();
    const location = useLocation();
    const navigate = useNavigate();

    const [theme,      setTheme]      = useState(() => localStorage.getItem('wa-theme') === 'light' ? 'light' : 'dark');
    const [countdown,  setCountdown]  = useState('');
    const [search,     setSearch]     = useState('');
    const [showRenew,  setShowRenew]  = useState(false);
    const [renewKey,   setRenewKey]   = useState('');
    const [renewBusy,  setRenewBusy]  = useState('');
    const [renewErr,   setRenewErr]   = useState('');
    const [showMobile, setShowMobile] = useState(false);
    const timerRef      = useRef(null);
    const renewInputRef = useRef(null);

    // ── Apply theme (dark / light only) ───────────────────────────────────────
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('wa-theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

    // ── Live license countdown ─────────────────────────────────────────────────
    useEffect(() => {
        if (!license?.valid || license?.isLifetime || !license?.secondsLeft) return;
        const mountTs = Date.now();
        function tick() {
            const secs = Math.max(0, license.secondsLeft - Math.floor((Date.now() - mountTs) / 1000));
            const d = Math.floor(secs / 86400);
            const h = Math.floor((secs % 86400) / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            setCountdown(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
            if (secs <= 0) clearInterval(timerRef.current);
        }
        tick();
        timerRef.current = setInterval(tick, 1000);
        return () => clearInterval(timerRef.current);
    }, [license]);

    // Focus renew input when modal opens
    useEffect(() => {
        if (showRenew) setTimeout(() => renewInputRef.current?.focus(), 60);
    }, [showRenew]);

    const openRenew = () => {
        setRenewKey('');
        setRenewErr('');
        setRenewBusy('');
        setShowRenew(true);
    };

    const submitRenew = async () => {
        const key = renewKey.trim();
        if (!key) { setRenewErr('Please enter your new license key.'); return; }
        setRenewBusy('Activating…');
        setRenewErr('');
        try {
            const res = await activateLicense(key);
            if (res?.success) {
                showToast('License renewed successfully!', 'success');
                setShowRenew(false);
            } else {
                setRenewErr(res?.error || 'Activation failed. Check your key and try again.');
            }
        } catch {
            setRenewErr('Could not connect to the server. Try again.');
        } finally {
            setRenewBusy('');
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter' && search.trim()) {
            const lower = search.toLowerCase();
            const match = Object.entries(PAGE_META).find(([, m]) =>
                m.title.toLowerCase().includes(lower) || m.sub.toLowerCase().includes(lower)
            );
            if (match) { navigate(match[0]); setSearch(''); }
        }
    };

    const meta       = PAGE_META[location.pathname] || { title: 'Zyqora', sub: '' };
    const isExpiring = license?.valid && !license?.isLifetime && license?.daysLeft != null && license?.daysLeft <= 7;
    const isUrgent   = isExpiring && license?.daysLeft <= 2;

    // Plan name from server (Trial / Weekly / Monthly / 6 Months / Yearly / Lifetime / Custom)
    // Use plan from server; if server predates plan support, guess from daysLeft
    function guessPlan(daysLeft, isLifetime) {
        if (isLifetime) return 'Lifetime';
        if (daysLeft == null) return 'Licensed';
        if (daysLeft <= 7)   return 'Trial';
        if (daysLeft <= 10)  return 'Weekly';
        if (daysLeft <= 35)  return 'Monthly';
        if (daysLeft <= 100) return '3 Months';
        if (daysLeft <= 200) return '6 Months';
        if (daysLeft <= 400) return 'Yearly';
        return 'Extended';
    }
    const planLabel = license?.plan || guessPlan(license?.daysLeft, license?.isLifetime);

    const statusColor = !license?.valid ? '#999'
        : license?.isLifetime          ? '#25D366'
        : isUrgent                     ? '#f96060'
        : isExpiring                   ? '#f5a623'
        : '#25D366';

    const validityStr = license?.isLifetime
        ? '● Active forever'
        : countdown
            ? `● ${countdown}`
            : license?.daysLeft != null
                ? `● ${license.daysLeft}d left`
                : '● Active';

    return (
        <>
        <div className="topbar">
            {/* ── Hamburger (mobile only) ── */}
            <button className="topbar-hamburger" onClick={onMenuClick} aria-label="Open menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
            </button>

            {/* ── Left: page title ── */}
            <div className="topbar-left">
                <span className="topbar-page-title">{meta.title}</span>
                {meta.sub && <span className="topbar-page-sub">{meta.sub}</span>}
            </div>

            {/* ── Centre: search ── */}
            <div className="topbar-search-wrap">
                <svg className="topbar-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                    className="topbar-search-input"
                    type="text"
                    placeholder="Search modules, contacts, templates…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={handleSearch}
                />
            </div>

            {/* ── Right: controls ── */}
            <div className="topbar-right">
                {/* Open on Mobile */}
                <button
                    className="topbar-icon-btn"
                    onClick={() => setShowMobile(true)}
                    title="Open on Mobile"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="17" height="17">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                </button>

                {/* Theme toggle: sun = in dark mode (click → light), moon = in light mode (click → dark) */}
                <button
                    className="topbar-icon-btn"
                    onClick={toggleTheme}
                    title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
                >
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>

                {/* Renew — only when expiring within 7 days */}
                {isExpiring && (
                    <button
                        className="topbar-renew-btn"
                        style={{
                            '--rnw-clr': isUrgent ? '#f96060' : '#f5a623',
                            '--rnw-bg':  isUrgent ? 'rgba(249,96,96,.13)' : 'rgba(245,166,35,.13)',
                        }}
                        onClick={openRenew}
                    >
                        🔑&nbsp;Renew
                    </button>
                )}

                <div className="topbar-divider" />

                {/* Profile chip — plan + validity always visible */}
                <div className="topbar-profile-chip">
                    <div className="topbar-profile-info">
                        <span className="topbar-plan-label">{planLabel}</span>
                        <span className="topbar-validity" style={{ color: statusColor }}>{validityStr}</span>
                    </div>
                    <div className="topbar-avatar">
                        Z
                        <span className="topbar-avatar-dot" style={{ background: statusColor }} />
                    </div>
                </div>
            </div>
        </div>

        {/* ── Mobile Modal ── */}
        {showMobile && <MobileModal onClose={() => setShowMobile(false)} />}

        {/* ── Renew Modal ── */}
        {showRenew && (
            <div className="topbar-renew-overlay" onClick={e => { if (e.target === e.currentTarget) setShowRenew(false); }}>
                <div className="topbar-renew-modal">
                    <div className="topbar-renew-modal-header">
                        <span>🔑 Renew License</span>
                        <button className="topbar-renew-modal-close" onClick={() => setShowRenew(false)}>✕</button>
                    </div>
                    <p className="topbar-renew-modal-desc">
                        Enter your new license key to extend your subscription.
                    </p>
                    <input
                        ref={renewInputRef}
                        className="topbar-renew-modal-input"
                        type="text"
                        placeholder="ZYQ-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                        value={renewKey}
                        onChange={e => { setRenewKey(e.target.value.toUpperCase()); setRenewErr(''); }}
                        onKeyDown={e => e.key === 'Enter' && !renewBusy && submitRenew()}
                        spellCheck={false}
                        autoComplete="off"
                    />
                    {renewErr && <div className="topbar-renew-modal-err">{renewErr}</div>}
                    <div className="topbar-renew-modal-actions">
                        <button className="btn btn-ghost" onClick={() => setShowRenew(false)} disabled={!!renewBusy}>Cancel</button>
                        <button className="btn btn-primary" onClick={submitRenew} disabled={!!renewBusy}>
                            {renewBusy || 'Activate Key'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
