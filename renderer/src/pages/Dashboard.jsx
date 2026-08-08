import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';

function CircleGauge({ pct, color, label, sub }) {
    const r = 44, circ = 2 * Math.PI * r;
    const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
    return (
        <div className="dash-gauge">
            <svg width="120" height="120" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg4)" strokeWidth="8" />
                <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
                    strokeDasharray={circ} strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: '55px 55px', transition: 'stroke-dashoffset .8s ease' }} />
                <text x="55" y="50" textAnchor="middle" fill="var(--txt)" fontSize="17" fontWeight="800">{pct}%</text>
                <text x="55" y="64" textAnchor="middle" fill="var(--txt3)" fontSize="7.5">{sub}</text>
            </svg>
            <div className="dash-gauge-label">{label}</div>
        </div>
    );
}

export default function Dashboard() {
    const { campaignUpdates, license } = useApp();
    const navigate = useNavigate();
    const [stats, setStats]               = useState({ contacts: 0, templates: 0, campaigns: 0 });
    const [campaigns, setCampaigns]       = useState([]);
    const [devices, setDevices]           = useState([]);
    const [autoReplies, setAutoReplies]   = useState([]);
    const [chatbotFlows, setChatbotFlows] = useState([]);
    const [dailyStats, setDailyStats]     = useState({ count: 0, date: '' });
    const [settings, setSettings]         = useState({ dailyLimit: 50, dailyLimitEnabled: true });

    useEffect(() => {
        Promise.all([
            api.getContacts(), api.getTemplates(), api.getCampaigns(),
            api.getDailyStats(), api.getSettings(),
            api.getDevices(), api.getAutoReply(), api.getChatbotFlows(),
        ]).then(([contacts, templates, camps, daily, sett, devs, ar, cf]) => {
            const safeContacts = Array.isArray(contacts) ? contacts : [];
            const safeTemplates = Array.isArray(templates) ? templates : [];
            const safeCamps = Array.isArray(camps) ? camps : [];
            setStats({ contacts: safeContacts.length, templates: safeTemplates.length, campaigns: safeCamps.length });
            setCampaigns(safeCamps.slice(-8).reverse());
            setDailyStats(daily);
            setSettings(sett);
            setDevices(Array.isArray(devs) ? devs : []);
            setAutoReplies(Array.isArray(ar) ? ar : []);
            setChatbotFlows(Array.isArray(cf) ? cf : []);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (Object.keys(campaignUpdates).length === 0) return;
        api.getCampaigns().then(list => {
            const safeList = Array.isArray(list) ? list : [];
            setCampaigns(safeList.slice(-8).reverse());
            setStats(prev => ({ ...prev, campaigns: safeList.length }));
        }).catch(() => {});
        api.getDailyStats().then(setDailyStats).catch(() => {});
    }, [campaignUpdates]);

    const activeDevices    = devices.filter(d => d.status === 'connected').length;
    const totalSent        = campaigns.reduce((s, c) => s + (c.messages?.filter(m => m.status === 'sent').length || 0), 0);
    const totalFailed      = campaigns.reduce((s, c) => s + (c.messages?.filter(m => m.status === 'failed').length || 0), 0);
    const totalMsgs        = totalSent + totalFailed;
    const successRate      = totalMsgs > 0 ? Math.round((totalSent / totalMsgs) * 100) : (campaigns.length > 0 ? 100 : 0);
    const dailyPct         = settings.dailyLimitEnabled ? Math.min(100, Math.round((dailyStats.count / (settings.dailyLimit || 50)) * 100)) : 0;
    const activeAutoR      = autoReplies.filter(r => r.enabled).length;
    const activeChatbots   = chatbotFlows.filter(f => f.active).length;
    const campaignsDone    = campaigns.filter(c => c.status === 'done').length;
    const campaignCompRate = campaigns.length > 0 ? Math.round((campaignsDone / campaigns.length) * 100) : 100;

    return (
        <div className="page-content dash-page">

            {/* ── Welcome Banner ── */}
            <div className="dash-welcome">
                <div className="dash-welcome-left">
                    <div className="dash-welcome-title">Welcome back!</div>
                    <div className="dash-welcome-sub">Here's what's happening with your WhatsApp automation today.</div>
                    <div className="dash-welcome-pills">
                        <span className="dash-pill">
                            <span className={`dash-pill-dot ${activeDevices > 0 ? 'dpd-on' : 'dpd-off'}`} />
                            {activeDevices} device{activeDevices !== 1 ? 's' : ''} online
                        </span>
                        <span className="dash-pill">
                            <span className="dash-pill-dot dpd-on" />
                            {dailyStats.count} messages today
                        </span>
                        <span className="dash-pill">
                            <span className="dash-pill-dot dpd-warn" />
                            {stats.contacts} total contacts
                        </span>
                    </div>
                </div>
                <div className="dash-welcome-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="1.5" width="54" height="54">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>
            </div>

            {/* ── Stats Row ── */}
            <div className="dash-stats-row">
                {[
                    { label: 'Messages Sent',  value: dailyStats.count,  sub: `+${dailyStats.count} today`,        color: '#4a9eff', page: '/campaigns',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
                    { label: 'Active Devices', value: activeDevices,       sub: `${devices.length} total sessions`,  color: '#25D366', page: '/devices',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
                    { label: 'Total Contacts', value: stats.contacts,      sub: 'in address book',                   color: '#bc8cff', page: '/contacts',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                    { label: 'Templates',      value: stats.templates,     sub: 'message templates',                 color: '#f5a623', page: '/templates',
                      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
                ].map(({ label, value, sub, color, icon, page }) => (
                    <div key={label} className="dash-stat-card" onClick={() => navigate(page)} style={{ '--accent': color }}>
                        <div className="dash-stat-left">
                            <div className="dash-stat-label">{label}</div>
                            <div className="dash-stat-value">{value}</div>
                            <div className="dash-stat-trend">↑ {sub}</div>
                        </div>
                        <div className="dash-stat-icon" style={{ background: `${color}1f`, color }}>{icon}</div>
                    </div>
                ))}
            </div>

            {/* ── Feature Cards ── */}
            <div className="dash-feature-row">
                <div className="dash-feature-card">
                    <div className="dash-feature-header">
                        <span className="dash-feature-title">Auto Reply</span>
                        <span className="dash-feature-ico" style={{ color: '#f5a623' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        </span>
                    </div>
                    <div className="dash-feature-stat"><span>Active Rules</span><span>{activeAutoR}</span></div>
                    <div className="dash-feature-stat"><span>Total Rules</span><span>{autoReplies.length}</span></div>
                    <div className="dash-feature-bar" style={{ '--fpct': `${autoReplies.length > 0 ? Math.round(activeAutoR / autoReplies.length * 100) : 0}%`, '--fclr': '#f5a623' }} />
                </div>
                <div className="dash-feature-card">
                    <div className="dash-feature-header">
                        <span className="dash-feature-title">Chatbot</span>
                        <span className="dash-feature-ico" style={{ color: '#4a9eff' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/></svg>
                        </span>
                    </div>
                    <div className="dash-feature-stat"><span>Active Flows</span><span>{activeChatbots}</span></div>
                    <div className="dash-feature-stat"><span>Total Flows</span><span>{chatbotFlows.length}</span></div>
                    <div className="dash-feature-bar" style={{ '--fpct': `${chatbotFlows.length > 0 ? Math.round(activeChatbots / chatbotFlows.length * 100) : 0}%`, '--fclr': '#4a9eff' }} />
                </div>
                <div className="dash-feature-card">
                    <div className="dash-feature-header">
                        <span className="dash-feature-title">Bulk Campaigns</span>
                        <span className="dash-feature-ico" style={{ color: '#bc8cff' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        </span>
                    </div>
                    <div className="dash-feature-stat"><span>Completed</span><span>{campaignsDone}</span></div>
                    <div className="dash-feature-stat"><span>Success Rate</span><span>{successRate}%</span></div>
                    <div className="dash-feature-bar" style={{ '--fpct': `${successRate}%`, '--fclr': '#bc8cff' }} />
                </div>
                <div className="dash-feature-card">
                    <div className="dash-feature-header">
                        <span className="dash-feature-title">Daily Limit</span>
                        <span className="dash-feature-ico" style={{ color: dailyPct >= 90 ? '#f96060' : '#25D366' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        </span>
                    </div>
                    <div className="dash-feature-stat"><span>Sent Today</span><span>{dailyStats.count}</span></div>
                    <div className="dash-feature-stat"><span>Limit</span><span>{settings.dailyLimit}</span></div>
                    <div className="dash-feature-bar" style={{ '--fpct': `${dailyPct}%`, '--fclr': dailyPct >= 90 ? '#f96060' : dailyPct >= 70 ? '#f5a623' : '#25D366' }} />
                </div>
            </div>

            {/* ── Performance Overview ── */}
            <div className="card dash-perf-card">
                <div className="card-header"><h2>Performance Overview</h2></div>
                <div className="dash-gauges">
                    <CircleGauge pct={successRate}      color="#25D366" label="Message Success Rate"  sub={`${totalSent} sent · ${totalFailed} failed`} />
                    <CircleGauge pct={dailyPct}         color={dailyPct >= 90 ? '#f96060' : '#4a9eff'} label="Daily Limit Usage" sub={`${dailyStats.count} of ${settings.dailyLimit} used`} />
                    <CircleGauge pct={campaignCompRate} color="#bc8cff" label="Campaign Completion"   sub={`${campaignsDone} of ${campaigns.length} completed`} />
                </div>
            </div>

            {/* ── Bottom: Activity + Quick Actions ── */}
            <div className="dash-bottom-row">
                {/* Recent Activity */}
                <div className="card dash-activity-card">
                    <div className="card-header">
                        <h2>Recent Activity</h2>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns')}>View All</button>
                    </div>
                    <div className="dash-activity-list">
                        {campaigns.length === 0
                            ? <p className="empty-state">No recent activity.</p>
                            : campaigns.map(c => {
                                const sent  = c.messages?.filter(m => m.status === 'sent').length || 0;
                                const total = c.messages?.length || 0;
                                const dotClr = c.status === 'done' ? '#25D366' : c.status === 'running' ? '#4a9eff' : 'var(--txt3)';
                                return (
                                    <div key={c.id} className="dash-act-item">
                                        <div className="dash-act-dot" style={{ background: dotClr, boxShadow: `0 0 6px ${dotClr}` }} />
                                        <div className="dash-act-body">
                                            <div className="dash-act-name">{c.name}</div>
                                            <div className="dash-act-meta">{sent}/{total} sent · {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</div>
                                        </div>
                                        <span className={`badge badge-${c.status}`}>{c.status}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="dash-quick-wrap">
                    <div className="dash-quick-title">Quick Actions</div>
                    <div className="dash-quick-grid">
                        {[
                            { label: 'Send Bulk Message', color: '#4a9eff', page: '/campaigns',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
                            { label: 'Add Device',        color: '#25D366', page: '/devices',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> },
                            { label: 'Create Template',   color: '#f5a623', page: '/templates',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
                            { label: 'Import Contacts',   color: '#bc8cff', page: '/contacts',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                            { label: 'Chatbot Flows',     color: '#a855f7', page: '/chatbot-flows',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
                            { label: 'View Reports',      color: '#f96060', page: '/campaigns',
                              icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                        ].map(({ label, color, icon, page }) => (
                            <button key={label} className="dash-quick-btn" style={{ '--qclr': color }} onClick={() => navigate(page)}>
                                <span className="dash-quick-icon" style={{ color }}>{icon}</span>
                                <span className="dash-quick-label">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

        </div>
    );
}
