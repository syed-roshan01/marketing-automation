import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';

const TABS = ['overview', 'rules'];
const TAB_LABEL = { overview: '📊 Overview', rules: '⚡ Rules' };

const EMPTY_FORM = {
    name: '',
    sessionId: '',
    targetType: 'all',
    priority: 1,
    cooldownMinutes: 0,
    templateId: '',
    response: '',
    active: true,
    skipOptedOut: true,
    firstContactOnly: true,
};

export default function AutoReply() {
    const { showToast, showConfirm } = useApp();
    const [tab,       setTab]       = useState('overview');
    const [rules,     setRules]     = useState([]);
    const [devices,   setDevices]   = useState([]);
    const [templates, setTemplates] = useState([]);
    const [search,    setSearch]    = useState('');
    const [filter,    setFilter]    = useState('all'); // all | active | inactive
    const [modal,     setModal]     = useState(null);  // null | 'create' | 'edit'
    const [editing,   setEditing]   = useState(null);
    const [form,      setForm]      = useState({ ...EMPTY_FORM });
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState('');
    const [refreshing, setRefreshing] = useState(false);

    async function load() {
        try {
            const [r, d, t] = await Promise.all([
                api.getAutoReply(),
                api.getDevices(),
                api.getTemplates(),
            ]);
            setRules(Array.isArray(r) ? r : []);
            setDevices(Array.isArray(d) ? d.filter(dv => dv.status === 'connected') : []);
            setTemplates(Array.isArray(t) ? t : []);
        } catch { /* ignore */ }
    }

    async function refresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    useEffect(() => { load(); }, []);

    // ── Derived stats ──────────────────────────────────────────────────────────
    const totalRules     = rules.length;
    const activeRules    = rules.filter(r => r.active).length;
    const inactiveRules  = rules.filter(r => !r.active).length;
    const totalResponses = rules.reduce((s, r) => s + (r.totalResponses || 0), 0);

    // ── Filtered list ──────────────────────────────────────────────────────────
    const filtered = rules.filter(r => {
        if (filter === 'active'   && !r.active)  return false;
        if (filter === 'inactive' && r.active)   return false;
        if (search) {
            const q = search.toLowerCase();
            if (!r.name.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // ── Helpers ────────────────────────────────────────────────────────────────
    function openCreate() {
        setForm({ ...EMPTY_FORM });
        setError('');
        setEditing(null);
        setModal('create');
    }

    function openEdit(rule) {
        setForm({
            name: rule.name,
            sessionId: rule.sessionId,
            targetType: rule.targetType,
            priority: rule.priority,
            cooldownMinutes: rule.cooldownMinutes,
            templateId: rule.templateId || '',
            response: rule.response || '',
            active: rule.active,
            skipOptedOut: rule.skipOptedOut !== false,
            firstContactOnly: rule.firstContactOnly !== false,
        });
        setError('');
        setEditing(rule);
        setModal('edit');
    }

    function closeModal() {
        setModal(null);
        setEditing(null);
        setError('');
    }

    async function saveRule() {
        if (!form.name.trim())    { setError('Rule name is required'); return; }
        if (!form.sessionId)      { setError('WhatsApp session is required'); return; }
        if (!form.response.trim() && !form.templateId) { setError('Response message or template is required'); return; }
        setSaving(true);
        setError('');
        try {
            const payload = {
                ...form,
                priority:        Number(form.priority) || 1,
                cooldownMinutes: Number(form.cooldownMinutes) || 0,
                templateId:      form.templateId || null,
            };
            if (modal === 'edit') {
                await api.updateAutoReply(editing.id, payload);
            } else {
                await api.createAutoReply(payload);
            }
            await load();
            closeModal();
            showToast(modal === 'edit' ? 'Rule updated!' : 'Rule created!', 'success');
        } catch (e) {
            setError(e.message || 'Failed to save rule');
        } finally {
            setSaving(false);
        }
    }

    async function toggleRule(rule) {
        try {
            await api.toggleAutoReply(rule.id);
            await load();
        } catch { /* ignore */ }
    }

    async function deleteRule(rule) {
        if (!await showConfirm('Delete Rule', `Delete rule "${rule.name}"?`, { danger: true, confirmLabel: 'Delete' })) return;
        try {
            await api.deleteAutoReply(rule.id);
            await load();
            showToast('Rule deleted', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    }

    function deviceName(id) {
        const d = devices.find(dv => dv.id === id);
        return d ? d.name : id;
    }

    function allDevices() {
        // include all devices (connected or not) for display
        return devices;
    }

    const targetLabel = { all: 'All', individual: 'Individual', group: 'Groups' };

    // Top rules by response count for overview tab
    const recentRules = [...rules].sort((a, b) => (b.totalResponses || 0) - (a.totalResponses || 0)).slice(0, 5);

    return (
        <div className="page-content">

            {/* Header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Auto Reply</h1>
                        <p className="page-sub">Set up automatic keyword-based responses</p>
                    </div>
                </div>
                <button className="btn btn-primary"
                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderColor: 'transparent' }}
                    onClick={openCreate}>
                    + Create Rule
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 13,
                            fontWeight: tab === t ? 600 : 400,
                            color: tab === t ? '#f59e0b' : 'var(--txt2)',
                            borderBottom: tab === t ? '2px solid #f59e0b' : '2px solid transparent',
                            transition: 'all .15s' }}>
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
                        <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Monitor auto-reply statistics and rule performance</div>
                    </div>

                    {/* Stats cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16, marginBottom: 24 }}>
                        {[
                            { label: 'Total Rules',     value: totalRules,     color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  icon: '⚡' },
                            { label: 'Active Rules',    value: activeRules,    color: '#22c55e', bg: 'rgba(34,197,94,.12)',   icon: '▶' },
                            { label: 'Inactive Rules',  value: inactiveRules,  color: '#f97316', bg: 'rgba(249,115,22,.12)',  icon: '⏸' },
                            { label: 'Total Responses', value: totalResponses, color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: '💬' },
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

                    {/* Top rules by responses */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <div style={{ fontWeight: 600 }}>Top Rules by Responses</div>
                            <button onClick={() => setTab('rules')}
                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '4px 12px', fontSize: 12, color: 'var(--txt2)' }}>
                                View All →
                            </button>
                        </div>
                        {recentRules.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--txt3)' }}>
                                <div style={{ fontSize: 40, marginBottom: 8, opacity: .4 }}>⚡</div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>No auto reply rules yet</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>Create your first rule to start automating responses</div>
                                <button onClick={openCreate}
                                    style={{ marginTop: 16, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '8px 18px', fontSize: 13, fontWeight: 600 }}>
                                    + Create Rule
                                </button>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['Rule Name', 'Session', 'Target', 'On/Off', 'Responses'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--txt3)', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentRules.map((rule, i) => (
                                        <tr key={rule.id} style={{ borderBottom: i < recentRules.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>
                                                {rule.name}
                                                {rule.templateId && <span style={{ marginLeft: 8, fontSize: 10, background: 'rgba(59,130,246,.12)', color: '#3b82f6', borderRadius: 4, padding: '2px 6px' }}>TPL</span>}
                                            </td>
                                            <td style={{ padding: '10px 8px', color: 'var(--txt2)' }}>{deviceName(rule.sessionId)}</td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                    background: rule.targetType === 'group' ? 'rgba(139,92,246,.12)' : rule.targetType === 'individual' ? 'rgba(59,130,246,.12)' : 'rgba(34,197,94,.12)',
                                                    color: rule.targetType === 'group' ? '#8b5cf6' : rule.targetType === 'individual' ? '#3b82f6' : '#22c55e' }}>
                                                    {targetLabel[rule.targetType] || rule.targetType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 8px' }}>
                                                <button onClick={() => toggleRule(rule)}
                                                    style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: rule.active ? '#22c55e' : '#374151', transition: 'background .2s' }}>
                                                    <span style={{ position: 'absolute', top: 3, left: rule.active ? 20 : 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                                                </button>
                                            </td>
                                            <td style={{ padding: '10px 8px', color: 'var(--txt)', fontWeight: 600 }}>{rule.totalResponses || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ── Rules Tab ── */}
            {tab === 'rules' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search rules by name…"
                            style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--card)', color: 'var(--txt)', fontSize: 13 }} />
                        <select value={filter} onChange={e => setFilter(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#181d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value="all"      style={{ background: '#181d27', color: '#e2e8f0' }}>All Rules</option>
                            <option value="active"   style={{ background: '#181d27', color: '#e2e8f0' }}>Active Only</option>
                            <option value="inactive" style={{ background: '#181d27', color: '#e2e8f0' }}>Inactive Only</option>
                        </select>
                        <button className="btn btn-primary"
                            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderColor: 'transparent', padding: '8px 16px', fontSize: 13 }}
                            onClick={openCreate}>
                            + Create Rule
                        </button>
                    </div>

                    {/* Table */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                            Auto Reply Rules ({filtered.length})
                        </div>
                        {filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
                                <div style={{ fontSize: 40, marginBottom: 8, opacity: .4 }}>⚡</div>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>No auto reply rules found</div>
                                <div style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>Create your first auto reply rule to start automating responses</div>
                                <button onClick={openCreate}
                                    style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '8px 18px', fontSize: 13, fontWeight: 600 }}>
                                    + Create Rule
                                </button>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg)' }}>
                                        {['RULE NAME', 'SESSION', 'TARGET', 'PRIORITY', 'COOLDOWN', 'RESPONSES', 'ACTIVE', 'ACTIONS'].map(h => (
                                            <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((rule) => (
                                        <tr key={rule.id} style={{ borderTop: '1px solid var(--border)' }}>
                                            <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--txt)' }}>
                                                {rule.name}
                                                {rule.templateId && <span style={{ marginLeft: 8, fontSize: 10, background: 'rgba(59,130,246,.12)', color: '#3b82f6', borderRadius: 4, padding: '2px 6px' }}>TPL</span>}
                                            </td>
                                            <td style={{ padding: '12px 14px', color: 'var(--txt2)' }}>{deviceName(rule.sessionId)}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
                                                    background: rule.targetType === 'group' ? 'rgba(139,92,246,.12)' : rule.targetType === 'individual' ? 'rgba(59,130,246,.12)' : 'rgba(34,197,94,.12)',
                                                    color:      rule.targetType === 'group' ? '#8b5cf6'              : rule.targetType === 'individual' ? '#3b82f6'              : '#22c55e' }}>
                                                    {targetLabel[rule.targetType] || rule.targetType}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 14px', color: 'var(--txt2)' }}>{rule.priority}</td>
                                            <td style={{ padding: '12px 14px', color: 'var(--txt2)' }}>{rule.cooldownMinutes > 0 ? `${rule.cooldownMinutes}m` : 'None'}</td>
                                            <td style={{ padding: '12px 14px', color: 'var(--txt)', fontWeight: 600 }}>{rule.totalResponses || 0}</td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <button onClick={() => toggleRule(rule)}
                                                    style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: rule.active ? '#22c55e' : '#374151', transition: 'background .2s' }}>
                                                    <span style={{ position: 'absolute', top: 3, left: rule.active ? 20 : 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                                                </button>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <button onClick={() => openEdit(rule)}
                                                        style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontSize: 12, color: 'var(--txt2)' }}>
                                                        Edit
                                                    </button>
                                                    <button onClick={() => deleteRule(rule)} title="Delete rule"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
                                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Create / Edit Modal */}
            {modal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{modal === 'edit' ? 'Edit Auto Reply Rule' : 'Create Auto Reply Rule'}</h2>
                            <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 20, lineHeight: 1 }}>×</button>
                        </div>

                        {error && (
                            <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)', marginBottom: 18 }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>Rule Name *</label>
                                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g., Welcome Message"
                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>WhatsApp Session *</label>
                                <select value={form.sessionId} onChange={e => setForm(f => ({ ...f, sessionId: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#181d27', color: form.sessionId ? '#e2e8f0' : '#8892aa', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                                    <option value="" style={{ background: '#181d27', color: '#8892aa' }}>Select a session</option>
                                    {devices.map(d => (
                                        <option key={d.id} value={d.id} style={{ background: '#181d27', color: '#e2e8f0' }}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>Target Type *</label>
                            <select value={form.targetType} onChange={e => setForm(f => ({ ...f, targetType: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#181d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                                <option value="all"        style={{ background: '#181d27', color: '#e2e8f0' }}>All (Individual &amp; Groups)</option>
                                <option value="individual" style={{ background: '#181d27', color: '#e2e8f0' }}>Individual Only</option>
                                <option value="group"      style={{ background: '#181d27', color: '#e2e8f0' }}>Groups Only</option>
                            </select>
                            <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 5 }}>Choose where this auto-reply should be active</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>Priority</label>
                                <input type="number" min="1" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, outline: 'none' }} />
                                <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 5 }}>Lower numbers = higher priority</p>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>Cooldown Period (minutes)</label>
                                <input type="number" min="0" value={form.cooldownMinutes} onChange={e => setForm(f => ({ ...f, cooldownMinutes: e.target.value }))}
                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, outline: 'none' }} />
                                <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 5 }}>Minimum time between auto-replies to the same user (0 = no cooldown)</p>
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>Template (Optional)</label>
                            <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))}
                                style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#181d27', color: form.templateId ? '#e2e8f0' : '#8892aa', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                                <option value="" style={{ background: '#181d27', color: '#8892aa' }}>Select a template or write custom response</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id} style={{ background: '#181d27', color: '#e2e8f0' }}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 }}>
                                Auto Reply Response {!form.templateId && '*'}
                            </label>
                            <textarea value={form.response} onChange={e => setForm(f => ({ ...f, response: e.target.value }))}
                                placeholder="Enter the automatic response message…"
                                rows={4}
                                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
                            {form.templateId && <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Template is selected — this field is optional (template message will be used if left blank)</p>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" id="ar-active" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                <label htmlFor="ar-active" style={{ fontSize: 13, color: 'var(--txt2)', cursor: 'pointer', margin: 0 }}>Rule is active</label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" id="ar-skipoptout" checked={form.skipOptedOut} onChange={e => setForm(f => ({ ...f, skipOptedOut: e.target.checked }))}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                <label htmlFor="ar-skipoptout" style={{ fontSize: 13, color: 'var(--txt2)', cursor: 'pointer', margin: 0 }}>
                                    Skip opted-out contacts
                                    <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 6 }}>(uncheck to send to everyone including opted-out)</span>
                                </label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <input type="checkbox" id="ar-firstcontact" checked={form.firstContactOnly} onChange={e => setForm(f => ({ ...f, firstContactOnly: e.target.checked }))}
                                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                                <label htmlFor="ar-firstcontact" style={{ fontSize: 13, color: 'var(--txt2)', cursor: 'pointer', margin: 0 }}>
                                    Reply only on first message from a new number
                                    <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 6 }}>(recommended)</span>
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={closeModal}
                                style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 14 }}>
                                Cancel
                            </button>
                            <button onClick={saveRule} disabled={saving}
                                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: 'var(--blue)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? .7 : 1 }}>
                                {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Create Rule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
