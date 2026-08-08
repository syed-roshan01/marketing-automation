import { NavLink, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';

// Maps nav route → feature key (matches license.features keys)
const FEATURE_KEY = {
    '/trust-builder': 'trustBuilder',
    '/auto-reply':    'autoReply',
    '/chatbot-flows': 'chatbot',
    '/ai-automation': 'aiAutomation',
    '/live-chat':     'liveChat',
    '/group-grabber': 'groupGrabber',
    '/forms':         'forms',
};

const NAV = [
    { to: '/dashboard', label: 'Dashboard',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
    { to: '/devices', label: 'Devices',
      sub: 'WhatsApp Sessions',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
    { to: '/single-message', label: 'Single Message',
      sub: 'Test & Quick Send',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
    { to: '/templates', label: 'Templates',
      sub: 'Message Templates',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { to: '/contacts', label: 'Contacts',
      sub: 'Manage & Import Contacts',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { to: '/groups', label: 'Groups',
      sub: 'Organize Contact Groups',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
    { to: '/campaigns', label: 'Campaigns',
      sub: 'Bulk Message Campaigns',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
    { to: '/trust-builder', label: 'Trust Builder',
      sub: 'Account Warming',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg> },
    { to: '/opt-out', label: 'Opt-Out Management',
      sub: 'Manage opt-out requests',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"/></svg> },
    { to: '/auto-reply', label: 'Auto Reply',
      sub: 'Automated Responses',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
    { to: '/chatbot-flows', label: 'Chatbot Flows',
      sub: 'Create automated conversation flows with triggers and responses',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/></svg> },
    { to: '/ai-automation', label: 'AI Automation',
      sub: 'AI-Powered Chat & Responses',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 7.07 17.07M12 2a10 10 0 0 0-7.07 17.07"/><circle cx="12" cy="12" r="3"/></svg> },
    { to: '/forms', label: 'Interactive Forms',
      sub: 'Conversational Data Collection',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></svg> },
    { to: '/live-chat', label: 'Live Chat',
      sub: 'Real-time Conversations',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { to: '/group-grabber', label: 'Group Grabber',
      sub: 'Extract Groups & Communities',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg> },
    { to: '/settings', label: 'Safety Settings',
      sub: 'Anti-Ban & Send Limits',
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
];

export default function Sidebar({ open, onClose }) {
    const location = useLocation();
    const { license } = useApp();
    const features = license?.features || {};

    function isLocked(to) {
        const key = FEATURE_KEY[to];
        return key && features[key] === false;
    }

    // Close sidebar when navigating on mobile
    useEffect(() => {
        if (onClose) onClose();
    }, [location.pathname]);

    return (
        <>
            {/* Overlay for mobile */}
            {open && <div className="sidebar-overlay" onClick={onClose} />}
            <aside className={`sidebar${open ? ' sidebar--open' : ''}`}>
                <div className="sidebar-logo">
                    <img src="/zyqora-logo.png" alt="Zyqora" style={{ height: 28, width: 'auto', maxWidth: 140 }}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='inline'; }}
                    />
                    <span style={{ display: 'none', fontWeight: 800, fontSize: 16, color: 'var(--purple)' }}>Zyqora</span>
                </div>

                <nav className="sidebar-nav">
                    {NAV.map(({ to, label, sub, icon }) => {
                        const locked = isLocked(to);
                        return (
                        <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${locked ? ' nav-item--locked' : ''}`}>
                            <span className="nav-icon" style={{ opacity: locked ? .45 : 1 }}>{icon}</span>
                            {sub ? (
                                <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, opacity: locked ? .55 : 1 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        {label}
                                        {locked && (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                        )}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 400 }}>{sub}</span>
                                </span>
                            ) : (
                                <span style={{ flex: 1, opacity: locked ? .55 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {label}
                                    {locked && (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                        </svg>
                                    )}
                                </span>
                            )}
                        </NavLink>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
}
