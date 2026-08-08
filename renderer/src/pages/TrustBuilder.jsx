import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import socket from '../socket.js';

const STATUS_COLOR = {
    idle:      'var(--txt3)',
    running:   'var(--orange)',
    stopped:   'var(--red)',
    completed: 'var(--green)',
};

const DEFAULT_MESSAGES = [
    'Hey! How are you doing?',
    "I'm good, how about you?",
    'Everything alright?',
    'Just checking in!',
    'Hope you are having a great day.',
    "Let's catch up soon.",
    'Did you see the news today?',
    'What are your plans for the weekend?',
    'Long time no chat!',
    'Take care 😊',
].join('\n');

const EMPTY_FORM = {
    name: '',
    description: '',
    deviceIds: [],
    messages: DEFAULT_MESSAGES,
    randomMode: false,
    minDelay: 30,
    maxDelay: 120,
    duration: 60,
};

export default function TrustBuilder() {
    const { showToast, showConfirm } = useApp();
    const [sessions, setSessions] = useState([]);
    const [devices,  setDevices]  = useState([]);
    const [modal,    setModal]    = useState(false);
    const [form,     setForm]     = useState(EMPTY_FORM);
    const [saving,   setSaving]   = useState(false);
    // Live message-count updates from socket
    const [liveUpdates, setLiveUpdates] = useState({}); // sessionId → { messageCount, status, endTime }
    // Tick every second so timer/progress re-renders live without needing socket events
    const [, setTick] = useState(0);

    async function load() {
        try {
            const [s, d] = await Promise.all([api.getTrustBuilder(), api.getDevices()]);
            setSessions(Array.isArray(s) ? s : []);
            setDevices(Array.isArray(d) ? d.filter(x => x.status === 'connected') : []);
        } catch { /* ignore */ }
    }

    useEffect(() => { load(); }, []);

    // 1-second tick for live timer & progress bar — only runs while a session is running
    useEffect(() => {
        const id = setInterval(() => {
            setTick(t => t + 1);
        }, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        function onUpdate(payload) {
            setLiveUpdates(prev => ({ ...prev, [payload.sessionId]: payload }));
            // Sync status, count AND startedAt/endTime into sessions so progressPct works post-refresh
            setSessions(prev => prev.map(s =>
                s.id === payload.sessionId
                    ? { ...s, status: payload.status, messageCount: payload.messageCount, endTime: payload.endTime }
                    : s
            ));
        }
        socket.on('trust_builder_update', onUpdate);
        return () => socket.off('trust_builder_update', onUpdate);
    }, []);

    async function save() {
        if (!form.name.trim())            return showToast('Session name required', 'error');
        if (form.deviceIds.length < 2)   return showToast('Select at least 2 devices', 'error');
        const msgs = form.randomMode ? [] : form.messages.split('\n').map(l => l.trim()).filter(Boolean);
        if (!form.randomMode && !msgs.length) return showToast('Enter at least one message', 'error');
        if (form.minDelay < 5)           return showToast('Min delay must be ≥ 5 seconds', 'error');
        if (form.maxDelay < form.minDelay) return showToast('Max delay must be ≥ min delay', 'error');
        if (form.duration < 1)           return showToast('Duration must be ≥ 1 minute', 'error');
        setSaving(true);
        try {
            const s = await api.createTrustBuilder({ ...form, messages: msgs });
            setSessions(prev => [...prev, s]);
            setModal(false);
            showToast('Trust Builder session created');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSaving(false); }
    }

    async function start(id) {
        try {
            await api.startTrustBuilder(id);
            // Reload session from server so we get the fresh startedAt + endTime
            const fresh = await api.getTrustBuilder();
            setSessions(Array.isArray(fresh) ? fresh : []);
            showToast('Session started!', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function stop(id) {
        try {
            await api.stopTrustBuilder(id);
            setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'stopped' } : s));
            showToast('Stop requested', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function del(id) {
        if (!await showConfirm('Delete Session', 'Delete this Trust Builder session?', { danger: true, confirmLabel: 'Delete' })) return;
        try {
            await api.deleteTrustBuilder(id);
            setSessions(prev => prev.filter(s => s.id !== id));
            showToast('Session deleted');
        } catch (e) { showToast(e.message, 'error'); }
    }

    function timeRemaining(session) {
        const live = liveUpdates[session.id];
        const endTime = live?.endTime || session.endTime;
        if (!endTime || session.status !== 'running') return null;
        const rem = Math.max(0, endTime - Date.now());
        const mins = Math.floor(rem / 60000);
        const secs = Math.floor((rem % 60000) / 1000);
        return `${mins}m ${secs}s remaining`;
    }

    function progressPct(session) {
        const live = liveUpdates[session.id];
        const endTime = live?.endTime || session.endTime;
        if (!endTime || !session.startedAt) return 0;
        const total = endTime - new Date(session.startedAt).getTime();
        const elapsed = Date.now() - new Date(session.startedAt).getTime();
        return Math.min(100, Math.max(0, (elapsed / total) * 100));
    }

    const durationLabel = `${form.duration >= 60 ? (form.duration / 60).toFixed(1).replace('.0','') + 'h' : form.duration + 'm'}`;

    return (
        <div className="page-content">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#ff6b2b,#ff9500)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                            <path d="M12 2c-4.42 3.37-6 6.37-6 9a6 6 0 0 0 12 0c0-2.63-1.58-5.63-6-9zm0 13.5A3.5 3.5 0 0 1 8.5 12c0-1.72 1.04-3.51 3.5-5.28C14.46 8.49 15.5 10.28 15.5 12A3.5 3.5 0 0 1 12 15.5z"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Trust Builder</h1>
                        <p className="page-sub">Warm up WhatsApp numbers with automated conversations — anti-ban protection</p>
                    </div>
                </div>
                <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ff6b2b,#ff9500)', borderColor: 'transparent' }}
                    onClick={() => { setForm(EMPTY_FORM); setModal(true); load(); }}>
                    + New Session
                </button>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                {[
                    { label: 'Total Sessions', value: sessions.length,                                                color: '#ff6b2b', bg: 'rgba(255,107,43,.12)' },
                    { label: 'Running',         value: sessions.filter(s => s.status === 'running').length,           color: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
                    { label: 'Completed',       value: sessions.filter(s => s.status === 'completed').length,         color: '#22c55e', bg: 'rgba(34,197,94,.12)'  },
                    { label: 'Messages Sent',   value: sessions.reduce((n, s) => n + (s.messageCount || 0), 0),       color: '#4a9eff', bg: 'rgba(74,158,255,.12)' },
                ].map(s => (
                    <div key={s.label} style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {sessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 48, marginBottom: 12, opacity: .35 }}>🔥</div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No sessions yet</div>
                    <p style={{ color: 'var(--txt3)', fontSize: 13, marginBottom: 20 }}>Create a warming session to build trust between your connected numbers.</p>
                    <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ff6b2b,#ff9500)', borderColor: 'transparent' }}
                        onClick={() => { setForm(EMPTY_FORM); setModal(true); load(); }}>
                        + New Session
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sessions.map(session => {
                        const lv       = liveUpdates[session.id];
                        const count    = lv?.messageCount ?? session.messageCount ?? 0;
                        const status   = lv?.status       ?? session.status;
                        const sc       = STATUS_COLOR[status] || 'var(--txt3)';
                        const pct      = progressPct(session);
                        const rem      = timeRemaining(session);
                        const deviceNames = (session.deviceIds || []).map(id => {
                            const d = devices.find(x => x.id === id);
                            return d ? d.name : '?';
                        }).join(', ');
                        return (
                            <div key={session.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 15 }}>{session.name}</div>
                                        {session.description && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{session.description}</div>}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, color: sc, background: `${sc}18`, border: `1px solid ${sc}40`, whiteSpace: 'nowrap' }}>
                                        {status === 'running' ? '🔥 Running' : status === 'completed' ? '✓ Completed' : status === 'stopped' ? '⏹ Stopped' : '○ Idle'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--txt2)' }}>📱 {(session.deviceIds || []).length} devices</span>
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--txt2)' }}>💬 {count} messages sent</span>
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--txt2)' }}>⏱ {session.minDelay}–{session.maxDelay}s delay</span>
                                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--txt2)' }}>🕐 {session.duration} min</span>
                                    {session.createdAt && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--txt3)' }}>{new Date(session.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                                </div>
                                {deviceNames && <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8 }}>Devices: {deviceNames}</div>}
                                {status === 'running' && (
                                    <>
                                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#ff6b2b,#ff9500)', borderRadius: 2, transition: 'width 1s linear' }} />
                                        </div>
                                        {rem && <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 8 }}>🔥 {rem}</div>}
                                    </>
                                )}
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                    {(status === 'idle' || status === 'stopped') && (
                                        <button className="btn btn-success btn-sm" style={{ background: 'linear-gradient(135deg,#ff6b2b,#ff9500)', borderColor: 'transparent' }} onClick={() => start(session.id)}>▶ Start</button>
                                    )}
                                    {status === 'running' && (
                                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--orange)', borderColor: 'var(--orange)' }} onClick={() => stop(session.id)}>⏹ Stop</button>
                                    )}
                                    <button className="campaign-del-btn" title="Delete session" style={{ marginLeft: 'auto' }} onClick={() => del(session.id)}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create modal */}
            {modal && (
                <Modal title="New Trust Builder Session" onClose={() => setModal(false)} size="lg">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                        <div className="form-group">
                            <label>Session Name *</label>
                            <input type="text" value={form.name} autoFocus
                                placeholder="e.g. Morning Warm-Up" onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                        </div>

                        <div className="form-group">
                            <label>Description <span style={{ color: 'var(--txt3)', fontWeight: 400 }}>(optional)</span></label>
                            <input type="text" value={form.description}
                                placeholder="Brief note about this session" onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                        </div>

                        <div className="form-group">
                            <label>Select Devices * <span style={{ color: form.deviceIds.length < 2 ? 'var(--red)' : 'var(--green)', fontWeight: 400, fontSize: 11 }}>(minimum 2 — {form.deviceIds.length} selected)</span></label>
                            {devices.length === 0
                                ? <div style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--txt3)' }}>No connected devices available. Connect devices first.</div>
                                : <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {devices.map(d => (
                                        <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 8px', borderRadius: 5, background: form.deviceIds.includes(d.id) ? 'rgba(255,107,43,.08)' : 'transparent' }}>
                                            <input type="checkbox" checked={form.deviceIds.includes(d.id)}
                                                onChange={() => setForm(p => ({ ...p, deviceIds: p.deviceIds.includes(d.id) ? p.deviceIds.filter(x => x !== d.id) : [...p.deviceIds, d.id] }))} />
                                            <span style={{ fontSize: 13, flex: 1 }}>{d.name}</span>
                                            <span style={{ fontSize: 11, color: 'var(--green)' }}>● Connected</span>
                                        </label>
                                    ))}
                                </div>
                            }
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>These devices will exchange messages with each other during the session.</div>
                        </div>

                        <div className="form-group">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <label style={{ margin: 0 }}>Messages {!form.randomMode && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: form.randomMode ? 600 : 400, color: form.randomMode ? '#ff6b2b' : 'var(--txt2)', background: form.randomMode ? 'rgba(255,107,43,.1)' : 'var(--bg)', border: `1px solid ${form.randomMode ? 'rgba(255,107,43,.4)' : 'var(--border)'}`, padding: '3px 10px', borderRadius: 20, transition: 'all .2s', userSelect: 'none' }}>
                                    <input type="checkbox" style={{ accentColor: '#ff6b2b', cursor: 'pointer' }}
                                        checked={form.randomMode}
                                        onChange={e => setForm(p => ({ ...p, randomMode: e.target.checked }))} />
                                    🎲 Random
                                </label>
                            </div>
                            {form.randomMode ? (
                                <div style={{ padding: '12px 14px', background: 'rgba(255,107,43,.07)', border: '1px solid rgba(255,107,43,.25)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--txt2)', lineHeight: 1.7 }}>
                                    <div style={{ fontWeight: 700, color: '#ff6b2b', marginBottom: 4 }}>🎲 Hi / Hey Pattern Active</div>
                                    Devices will exchange messages like <strong>Hi 1</strong> → <strong>Hey 1</strong> → <strong>Hi 2</strong> → <strong>Hey 2</strong> … with the number incrementing each exchange.
                                    <br/>Each send also shows a <strong>typing…</strong> indicator for a natural human feel.
                                </div>
                            ) : (
                                <>
                                    <textarea rows={7} value={form.messages}
                                        onChange={e => setForm(p => ({ ...p, messages: e.target.value }))}
                                        placeholder={"Hey! How are you?\nI'm good, thanks!\nWhat's up?"} />
                                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>
                                        {form.messages.split('\n').filter(l => l.trim()).length} messages configured — sent in order, cycling through the list.
                                    </div>
                                </>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div className="form-group">
                                <label>Min Delay (seconds) *</label>
                                <input type="number" min={5} value={form.minDelay}
                                    onChange={e => setForm(p => ({ ...p, minDelay: parseInt(e.target.value) || 30 }))} />
                            </div>
                            <div className="form-group">
                                <label>Max Delay (seconds) *</label>
                                <input type="number" min={10} value={form.maxDelay}
                                    onChange={e => setForm(p => ({ ...p, maxDelay: parseInt(e.target.value) || 120 }))} />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Session Duration (minutes) *</label>
                            <input type="number" min={1} value={form.duration}
                                onChange={e => setForm(p => ({ ...p, duration: parseInt(e.target.value) || 60 }))} />
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>How long the session should run: {durationLabel}</div>
                        </div>

                        <div style={{ padding: '10px 14px', background: 'rgba(255,107,43,.07)', border: '1px solid rgba(255,107,43,.2)', borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4, color: '#ff6b2b' }}>🔥 How Trust Builder works:</div>
                            <div style={{ color: 'var(--txt2)', lineHeight: 1.6 }}>
                                During the session, selected devices will send messages to each other at random intervals (between {form.minDelay}–{form.maxDelay}s). This simulates natural conversation patterns and builds account trust with WhatsApp's systems, reducing ban risk.
                            </div>
                        </div>

                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                        <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#ff6b2b,#ff9500)', borderColor: 'transparent' }}
                            onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create Session'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
