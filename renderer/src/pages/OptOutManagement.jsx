import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import socket from '../socket.js';

const TABS = ['overview', 'contacts', 'settings'];

const TAB_LABEL = { overview: '📊 Overview', contacts: '👤 Opted-Out Contacts', settings: '⚙️ Settings' };

function now() { return Date.now(); }

function isToday(d)    { const t = new Date(d); const n = new Date(); return t.getFullYear()===n.getFullYear()&&t.getMonth()===n.getMonth()&&t.getDate()===n.getDate(); }
function isThisWeek(d) { return now() - new Date(d).getTime() < 7*24*3600*1000; }
function isThisMonth(d){ const t = new Date(d); const n = new Date(); return t.getFullYear()===n.getFullYear()&&t.getMonth()===n.getMonth(); }

export default function OptOutManagement() {
    const { showToast, showConfirm } = useApp();
    const [tab,      setTab]      = useState('overview');
    const [records,  setRecords]  = useState([]);
    const [settings, setSettings] = useState({ subscribeMsg: '', unsubscribeMsg: '' });
    const [savingSettings, setSavingSettings] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Contacts tab filters
    const [search,   setSearch]   = useState('');
    const [typeFilter, setTypeFilter] = useState('all'); // all | optout | optin
    const [timeFilter, setTimeFilter] = useState('all'); // all | today | week | month

    // Add manual opt-out modal
    const [addModal,  setAddModal]  = useState(false);
    const [addForm,   setAddForm]   = useState({ phone: '', name: '', type: 'optout', messageType: 'all', reason: '' });
    const [addSaving, setAddSaving] = useState(false);

    async function load() {
        try {
            const [r, s] = await Promise.all([api.getOptout(), api.getOptoutSettings()]);
            setRecords(r);
            setSettings(s);
        } catch { /* ignore */ }
    }

    async function refresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    useEffect(() => { load(); }, []);

    useEffect(() => {
        function onUpdate({ action, record, phone }) {
            if (action === 'upsert') {
                setRecords(prev => {
                    const idx = prev.findIndex(r => r.phone === record.phone);
                    if (idx !== -1) { const n = [...prev]; n[idx] = record; return n; }
                    return [...prev, record];
                });
            } else if (action === 'delete') {
                setRecords(prev => prev.filter(r => r.phone !== phone));
            }
        }
        socket.on('optout_update', onUpdate);
        return () => socket.off('optout_update', onUpdate);
    }, []);

    // ── Derived stats ──────────────────────────────────────────────────────────
    // Count by CURRENT state of each phone
    const optouts    = records.filter(r => r.type === 'optout');
    const optins     = records.filter(r => r.type === 'optin');
    // Date-based counts use ALL opt-out type records (accurate event counts)
    const todayOut   = records.filter(r => r.type === 'optout' && isToday(r.date));
    const weekOut    = records.filter(r => r.type === 'optout' && isThisWeek(r.date));
    const monthOut   = records.filter(r => r.type === 'optout' && isThisMonth(r.date));
    // Opt-out rate = opted-out phones / total unique phones
    const totalUnique = records.length;
    const rate       = totalUnique ? ((optouts.length / totalUnique) * 100).toFixed(2) : '0.00';

    // Recent activity (last 10 events sorted by date desc)
    const recentActivity = [...records]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    // ── Filtered contacts ──────────────────────────────────────────────────────
    const filtered = records.filter(r => {
        if (typeFilter !== 'all' && r.type !== typeFilter) return false;
        if (timeFilter === 'today' && !isToday(r.date)) return false;
        if (timeFilter === 'week'  && !isThisWeek(r.date)) return false;
        if (timeFilter === 'month' && !isThisMonth(r.date)) return false;
        if (search) {
            const q = search.toLowerCase();
            if (!r.phone.includes(q) && !(r.name||'').toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // ── Save settings ──────────────────────────────────────────────────────────
    async function saveSettings() {
        setSavingSettings(true);
        try {
            const saved = await api.saveOptoutSettings(settings);
            setSettings(saved);
            showToast('Settings saved!', 'success');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSavingSettings(false); }
    }

    // ── Add manual ─────────────────────────────────────────────────────────────
    async function addRecord() {
        if (!addForm.phone.trim()) return showToast('Phone number required', 'error');
        setAddSaving(true);
        try {
            await api.addOptout({ ...addForm, phone: addForm.phone.replace(/[^0-9]/g, '') });
            setAddModal(false);
            setAddForm({ phone: '', name: '', type: 'optout', messageType: 'all', reason: '' });
            showToast('Contact recorded');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setAddSaving(false); }
    }

    // ── Delete ─────────────────────────────────────────────────────────────────
    async function deleteRecord(phone) {
        if (!await showConfirm('Remove Record', `Remove opt-out record for ${phone}?`, { danger: true, confirmLabel: 'Remove' })) return;
        try {
            await api.deleteOptout(phone);
            showToast('Record removed');
        } catch (e) { showToast(e.message, 'error'); }
    }

    // ── Export ─────────────────────────────────────────────────────────────────
    function exportCSV() {
        window.open('/api/optout/export.csv', '_blank');
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="page-content">
            {/* Header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#ef4444,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Opt-Out Management</h1>
                        <p className="page-sub">Manage opt-out requests and subscription preferences</p>
                    </div>
                </div>
                <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', borderColor: 'transparent' }}
                    onClick={() => setAddModal(true)}>
                    + Add Record
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? '#ef4444' : 'var(--txt2)', borderBottom: tab === t ? '2px solid #ef4444' : '2px solid transparent', transition: 'all .15s' }}>
                        {TAB_LABEL[t]}
                    </button>
                ))}
                <button onClick={refresh} disabled={refreshing}
                    style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '6px 14px', fontSize: 12, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5, alignSelf: 'center', opacity: refreshing ? .6 : 1 }}>
                    {refreshing ? '…' : '↻'} Refresh
                </button>
            </div>

            {/* ── Overview Tab ── */}
            {tab === 'overview' && (
                <div>
                    <div style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Overview Dashboard</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Monitor opt-out statistics and recent activity</div>
                    </div>

                    {/* Stats row 1 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16, marginBottom: 12 }}>
                        {[
                            { label: 'Total Opted-Out',       value: optouts.length,    color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: '🔕' },
                            { label: 'Opted-Out Today',       value: todayOut.length,   color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '🕐' },
                            { label: 'Opted-Out This Week',   value: weekOut.length,    color: '#eab308', bg: 'rgba(234,179,8,.12)',   icon: '📊' },
                            { label: 'Opted-Out This Month',  value: monthOut.length,   color: '#8b5cf6', bg: 'rgba(139,92,246,.12)',  icon: '📅' },
                        ].map(s => (
                            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{s.icon}</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{s.label}</div>
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Stats row 2 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                            { label: 'Opt-Out Rate',     value: `${rate}%`,       color: '#3b82f6', bg: 'rgba(59,130,246,.12)',   icon: '👥' },
                            { label: 'Total Opt-Ins',    value: optins.length,    color: '#22c55e', bg: 'rgba(34,197,94,.12)',    icon: '✅' },
                            { label: 'Total Preferences',value: records.length,   color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: '⚙️' },
                        ].map(s => (
                            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{s.icon}</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{s.label}</div>
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Recent activity */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div style={{ fontWeight: 600 }}>Recent Activity</div>
                            <span style={{ fontSize: 12, color: 'var(--txt3)' }}>{recentActivity.length} recent actions</span>
                        </div>
                        {recentActivity.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt3)' }}>
                                <div style={{ fontSize: 40, marginBottom: 8, opacity: .4 }}>👤</div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>No recent activity found</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>Opt-out and opt-in activities will appear here</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['Contact','Type','Reason','Date'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--txt3)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentActivity.map((r, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 8px' }}>
                                                <div style={{ fontWeight: 600 }}>{r.name || r.phone}</div>
                                                {r.name && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{r.phone}</div>}
                                            </td>
                                            <td style={{ padding: '8px 8px' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                    background: r.type === 'optout' ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                                                    color: r.type === 'optout' ? '#ef4444' : '#22c55e' }}>
                                                    {r.type === 'optout' ? '🔕 Opt-Out' : '✅ Opt-In'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 8px', color: 'var(--txt2)', fontSize: 12 }}>{r.reason || '—'}</td>
                                            <td style={{ padding: '8px 8px', color: 'var(--txt3)', fontSize: 12 }}>{new Date(r.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ── Contacts Tab ── */}
            {tab === 'contacts' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search by phone number or name…"
                            style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13 }} />
                        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#181d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value="all"    style={{ background: '#181d27', color: '#e2e8f0' }}>All Types</option>
                            <option value="optout" style={{ background: '#181d27', color: '#e2e8f0' }}>Opt-Out Only</option>
                            <option value="optin"  style={{ background: '#181d27', color: '#e2e8f0' }}>Opt-In Only</option>
                        </select>
                        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#181d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value="all"   style={{ background: '#181d27', color: '#e2e8f0' }}>All Time</option>
                            <option value="today" style={{ background: '#181d27', color: '#e2e8f0' }}>Today</option>
                            <option value="week"  style={{ background: '#181d27', color: '#e2e8f0' }}>This Week</option>
                            <option value="month" style={{ background: '#181d27', color: '#e2e8f0' }}>This Month</option>
                        </select>
                        <button className="btn" style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={exportCSV}>⬇ Export</button>
                        <button className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={refresh} disabled={refreshing}>{refreshing ? '…' : '↻'} Refresh</button>
                    </div>

                    {/* Table */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                            Opted-Out Contacts ({filtered.length})
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg)' }}>
                                    {['CONTACT', 'TYPE', 'MESSAGE TYPE', 'OPT-OUT DATE', 'REASON', 'ACTIONS'].map(h => (
                                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--txt3)', fontSize: 13 }}>No opted-out contacts found</td></tr>
                                ) : filtered.map((r, i) => (
                                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 14px' }}>
                                            <div style={{ fontWeight: 600 }}>{r.name || r.phone}</div>
                                            {r.name && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{r.phone}</div>}
                                        </td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                background: r.type === 'optout' ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)',
                                                color: r.type === 'optout' ? '#ef4444' : '#22c55e' }}>
                                                {r.type === 'optout' ? 'Opt-Out' : 'Opt-In'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', color: 'var(--txt2)' }}>{r.messageType || 'all'}</td>
                                        <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12 }}>{new Date(r.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</td>
                                        <td style={{ padding: '10px 14px', color: 'var(--txt2)', fontSize: 12, maxWidth: 160 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '—'}</span></td>
                                        <td style={{ padding: '10px 14px' }}>
                                            <button title="Remove record" onClick={() => deleteRecord(r.phone)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Settings Tab ── */}
            {tab === 'settings' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Auto keywords info */}
                    <div style={{ background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.25)', borderRadius: 'var(--radius)', padding: 16 }}>
                        <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>Automatic Keywords</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>The following keywords are automatically processed:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {(settings.keywords || []).map((k, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <input type="checkbox" checked={k.enabled} onChange={e => setSettings(s => {
                                                    const nw = [...(s.keywords || [])]; nw[i] = { ...nw[i], enabled: e.target.checked }; return { ...s, keywords: nw };
                                                })} />
                                            </label>
                                            <div style={{ padding: '6px 10px', borderRadius: 16, background: k.type === 'optout' ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)', fontWeight: 700, fontSize: 13 }}>
                                                {k.word} ({k.match}) · {k.type === 'optout' ? 'Opt-Out' : 'Opt-In'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Manage keywords below to enable/disable or add new opt-in/opt-out phrases.</div>
                            </div>
                    </div>

                    {/* Auto-response messages */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Auto-Response Messages</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>Customize the automatic replies sent when customers opt-in or opt-out:</div>

                        <div className="form-group">
                            <label>Subscribe Confirmation Message</label>
                            <textarea rows={3} value={settings.subscribeMsg}
                                onChange={e => setSettings(p => ({ ...p, subscribeMsg: e.target.value }))}
                                placeholder="Message sent when someone replies SUBSCRIBE" />
                        </div>

                        <div className="form-group">
                            <label>Unsubscribe Confirmation Message</label>
                            <textarea rows={3} value={settings.unsubscribeMsg}
                                onChange={e => setSettings(p => ({ ...p, unsubscribeMsg: e.target.value }))}
                                placeholder="Message sent when someone replies UNSUBSCRIBE" />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', borderColor: 'transparent' }}
                                onClick={saveSettings} disabled={savingSettings}>
                                {savingSettings ? 'Saving…' : 'Save Settings'}
                            </button>
                        </div>
                    </div>

                    {/* Keyword editor */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Keyword Editor</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 12 }}>Add, edit, enable or disable automatic keywords that trigger opt-in or opt-out.</div>
                        {(settings.keywords || []).map((k, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 80px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                <input type="text" value={k.word} onChange={e => setSettings(s => { const nw = [...(s.keywords||[])]; nw[i] = { ...nw[i], word: e.target.value }; return { ...s, keywords: nw }; })} />
                                <select value={k.type} onChange={e => setSettings(s => { const nw = [...(s.keywords||[])]; nw[i] = { ...nw[i], type: e.target.value }; return { ...s, keywords: nw }; })}>
                                    <option value="optout">Opt-Out</option>
                                    <option value="optin">Opt-In</option>
                                </select>
                                <select value={k.match} onChange={e => setSettings(s => { const nw = [...(s.keywords||[])]; nw[i] = { ...nw[i], match: e.target.value }; return { ...s, keywords: nw }; })}>
                                    <option value="exact">Exact</option>
                                    <option value="contains">Contains</option>
                                </select>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input type="checkbox" checked={k.enabled} onChange={e => setSettings(s => { const nw = [...(s.keywords||[])]; nw[i] = { ...nw[i], enabled: e.target.checked }; return { ...s, keywords: nw }; })} />
                                    </label>
                                    <button className="btn btn-ghost" onClick={() => setSettings(s => ({ ...s, keywords: (s.keywords||[]).filter((_, idx) => idx !== i) }))}>Remove</button>
                                </div>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn" onClick={() => setSettings(s => ({ ...s, keywords: [...(s.keywords||[]), { word: '', type: 'optin', enabled: true, match: 'contains' }] }))}>+ Add Keyword</button>
                            <div style={{ marginLeft: 'auto', color: 'var(--txt3)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>Remember to press Save Settings to apply changes</div>
                        </div>
                    </div>

                    {/* Compliance features */}
                    <div style={{ background: 'rgba(34,197,94,.05)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 'var(--radius)', padding: 16 }}>
                        <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>Compliance Features</div>
                        <ul style={{ fontSize: 13, color: 'var(--txt2)', paddingLeft: 18, lineHeight: 2, margin: 0 }}>
                            <li>Automatic opt-out processing for incoming UNSUBSCRIBE keywords</li>
                            <li>Automatic opt-in processing for incoming SUBSCRIBE keywords</li>
                            <li>Auto-reply confirmation messages with human typing feel</li>
                            <li>Searchable contact list with type and date filters</li>
                            <li>Export capabilities for reporting (CSV)</li>
                            <li>Manual record management (add / remove)</li>
                            <li>Real-time live updates via socket</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* ── Add Manual Record Modal ── */}
            {addModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => e.target === e.currentTarget && setAddModal(false)}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, width: 480, maxWidth: '95vw', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
                        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>Add Opt-Out / Opt-In Record</div>

                        <div className="form-group">
                            <label>Phone Number *</label>
                            <input type="text" value={addForm.phone} autoFocus placeholder="e.g. 447911123456"
                                onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} />
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>Include country code, digits only</div>
                        </div>
                        <div className="form-group">
                            <label>Name <span style={{ color: 'var(--txt3)', fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={addForm.name} placeholder="Contact name"
                                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div className="form-group">
                                <label>Type *</label>
                                <select value={addForm.type} onChange={e => setAddForm(p => ({ ...p, type: e.target.value }))}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13 }}>
                                    <option value="optout">Opt-Out (Unsubscribe)</option>
                                    <option value="optin">Opt-In (Subscribe)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Message Type</label>
                                <select value={addForm.messageType} onChange={e => setAddForm(p => ({ ...p, messageType: e.target.value }))}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg)', color: 'var(--txt)', fontSize: 13 }}>
                                    <option value="all">All Messages</option>
                                    <option value="campaigns">Campaigns Only</option>
                                    <option value="promotions">Promotions Only</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Reason <span style={{ color: 'var(--txt3)', fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={addForm.reason} placeholder="e.g. Customer request"
                                onChange={e => setAddForm(p => ({ ...p, reason: e.target.value }))} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', borderColor: 'transparent' }}
                                onClick={addRecord} disabled={addSaving}>{addSaving ? 'Saving…' : 'Save Record'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
