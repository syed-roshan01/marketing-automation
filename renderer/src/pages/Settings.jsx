import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import { useNavigate } from 'react-router-dom';

const DEFAULTS = {
    minDelay: 25, maxDelay: 40, delayEnabled: true,
    batchEnabled: true, batchSize: 20, batchPauseMin: 60, batchPauseMax: 120,
    dailyLimitEnabled: true, dailyLimit: 50,
    typingEnabled: true, typingMin: 2, typingMax: 5,
    companyName: 'Zyqora', companyPhone: '9217758442', companyEmail: 'support@zyqora.in', companyWebsite: 'zyqora.in',
    // Smart Protection
    smartProtection: false,
    timeWindowEnabled: false, timeWindowStart: '09:00', timeWindowEnd: '19:00',
    startDelayEnabled: false, startDelayMin: 2, startDelayMax: 15,
    autoWarmupEnabled: false, warmupStartedAt: null,
    // Keep Awake
    keepAwakeEnabled: false,
};

const PRESETS = {
    new:  { ...DEFAULTS, dailyLimit: 50,  minDelay: 25, maxDelay: 45 },
    warm: { ...DEFAULTS, dailyLimit: 150, minDelay: 20, maxDelay: 35 },
    max:  { ...DEFAULTS, dailyLimit: 300, minDelay: 20, maxDelay: 25, batchPauseMin: 30, batchPauseMax: 60 },
};

function calcScore(s) {
    let score = 100;
    if (!s.delayEnabled)      score -= 30;
    if (s.minDelay < 20)      score -= 15;
    else if (s.minDelay < 30) score -= 10;
    if (!s.batchEnabled)      score -= 20;
    if (s.batchSize > 15)     score -= 7;
    if (s.dailyLimit > 200)   score -= 15;
    if (!s.typingEnabled)     score -= 10;
    if (!s.dailyLimitEnabled) score -= 10;
    return Math.max(0, score);
}

function Toggle({ checked, onChange, warnOff, label }) {
    const { showConfirm } = useApp();
    function handleChange(e) {
        const newChecked = e.target.checked;  // capture before async
        if (warnOff && !newChecked) {
            showConfirm('Disable Protection', `Disabling "${label}" will reduce your protection score. Are you sure?`, { danger: true, confirmLabel: 'Disable' })
                .then(ok => { if (ok) onChange({ target: { checked: newChecked } }); });
            return;
        }
        onChange({ target: { checked: newChecked } });
    }
    return (
        <label className="toggle-switch">
            <input type="checkbox" checked={checked} onChange={handleChange} />
            <span className="toggle-slider"></span>
        </label>
    );
}

function RiskChip({ value, low, high }) {
    const color = value <= low ? 'var(--green)' : value <= high ? 'var(--orange)' : 'var(--red)';
    const label = value <= low ? 'Safe' : value <= high ? 'Moderate' : 'Risky';
    return <span className="risk-chip" style={{ background: `${color}22`, color }}>{label}</span>;
}

export default function Settings() {
    const { showToast, showConfirm } = useApp();
    const [tab, setTab] = useState('general');
    const navigate = useNavigate();
    // Secret 3-click trigger on version number → license portal
    const clickCountRef = useRef(0);
    const clickTimerRef = useRef(null);
    function handleVersionClick() {
        clickCountRef.current += 1;
        clearTimeout(clickTimerRef.current);
        if (clickCountRef.current >= 3) {
            clickCountRef.current = 0;
            navigate('/zyq');
            return;
        }
        clickTimerRef.current = setTimeout(() => { clickCountRef.current = 0; }, 1500);
    }

    // General settings state
    const [s,       setS]       = useState(DEFAULTS);
    const [daily,   setDaily]   = useState({ count: 0 });
    const [saved,   setSaved]   = useState(false);
    const [loading, setLoading] = useState(true);

    // Keep-awake effect — sync with Electron whenever the setting changes
    useEffect(() => {
        if (window.electronAPI?.setKeepAwake) {
            window.electronAPI.setKeepAwake(!!s.keepAwakeEnabled);
        }
    }, [s.keepAwakeEnabled]);

    // Hook Numbers state
    const [hooks,        setHooks]        = useState([]);
    const [showAddHook,  setShowAddHook]  = useState(false);
    const [hookInput,    setHookInput]    = useState('');
    const [hookLabel,    setHookLabel]    = useState('');
    const [hookSaving,   setHookSaving]   = useState(false);
    const [editingHook,  setEditingHook]  = useState(null); // { id, number, label }

    // Backup/restore state
    const restoreFileRef = useRef(null);
    const [restoring, setRestoring] = useState(false);

    // Theme
    const [theme, setTheme] = useState(() => localStorage.getItem('wa-theme') || 'dark');
    useEffect(() => {
        const apply = (t) => {
            const resolved = t === 'system'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : t;
            document.documentElement.setAttribute('data-theme', resolved);
            localStorage.setItem('wa-theme', t);
        };
        apply(theme);
        if (theme !== 'system') return;
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const h = () => apply('system');
        mq.addEventListener('change', h);
        return () => mq.removeEventListener('change', h);
    }, [theme]);

    useEffect(() => {
        Promise.all([api.getSettings(), api.getDailyStats(), api.getHookNumbers()])
            .then(([sett, d, h]) => {
                setS({ ...DEFAULTS, ...sett });
                setDaily(d);
                setHooks(Array.isArray(h) ? h : []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    // Auto-refresh daily count every 8 seconds while on General tab
    useEffect(() => {
        if (tab !== 'general') return;
        const id = setInterval(() => {
            api.getDailyStats().then(d => setDaily(d)).catch(() => {});
        }, 8000);
        return () => clearInterval(id);
    }, [tab]);

    const set = (key, val) => setS(p => ({ ...p, [key]: val }));

    async function saveSettings() {
        try {
            const res = await api.updateSettings(s);
            setS(res);
            setSaved(true); setTimeout(() => setSaved(false), 2000);
            showToast('Settings saved');
        } catch (e) { showToast(e.message, 'error'); }
    }

    function applyPreset(key) {
        setS(PRESETS[key]);
        showToast(`Preset "${key}" applied`);
    }

    function resetToSafeDefaults() {
        setS(DEFAULTS);
        showToast('Reset to safe defaults — click Save to apply');
    }

    // ── Hook Number helpers ──────────────────────────────────────────────────
    function normaliseNum(raw) {
        const digits = raw.replace(/\D/g, '');
        // If 10 digits and starts with 6-9 (Indian mobile), prepend 91
        if (digits.length === 10 && /^[6-9]/.test(digits)) return '91' + digits;
        return digits;
    }

    async function addHook() {
        const num = normaliseNum(hookInput);
        if (num.length < 7) return showToast('Enter a valid phone number', 'error');
        setHookSaving(true);
        try {
            const newHooks = [...hooks, { id: Date.now().toString(), number: num, label: hookLabel.trim() || num, enabled: true }];
            const res = await api.saveHookNumbers(newHooks);
            setHooks(res);
            setHookInput(''); setHookLabel(''); setShowAddHook(false);
            showToast('Hook number added');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setHookSaving(false); }
    }

    async function saveEditHook() {
        if (!editingHook) return;
        const num = normaliseNum(editingHook.number);
        if (num.length < 7) return showToast('Enter a valid phone number', 'error');
        setHookSaving(true);
        try {
            const updated = hooks.map(h => h.id === editingHook.id
                ? { ...h, number: num, label: editingHook.label.trim() || num }
                : h);
            setHooks(await api.saveHookNumbers(updated));
            setEditingHook(null);
            showToast('Hook number updated');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setHookSaving(false); }
    }

    async function toggleHook(id) {
        const updated = hooks.map(h => h.id === id ? { ...h, enabled: !h.enabled } : h);
        try { setHooks(await api.saveHookNumbers(updated)); }
        catch (e) { showToast(e.message, 'error'); }
    }

    async function deleteHook(id) {
        const updated = hooks.filter(h => h.id !== id);
        try { setHooks(await api.saveHookNumbers(updated)); showToast('Removed'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    // ── Backup helpers ───────────────────────────────────────────────────────
    function downloadBackup() {
        const a = document.createElement('a');
        a.href = '/api/backup/download';
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    async function restoreBackup(file) {
        if (!file) return;
        const ok = await showConfirm('Restore Backup',
            'This will overwrite your current contacts, templates, campaigns, settings and more. Continue?',
            { confirmLabel: 'Yes, Restore', danger: true });
        if (!ok) return;
        setRestoring(true);
        try {
            const fd = new FormData();
            fd.append('backup', file);
            const res = await fetch('/api/backup/restore', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Restore failed');
            showToast(`Restored ${data.restored} data collections. Reload the page to see changes.`);
        } catch (e) { showToast(e.message, 'error'); }
        finally {
            setRestoring(false);
            if (restoreFileRef.current) restoreFileRef.current.value = '';
        }
    }

    // ── Data Management ──────────────────────────────────────────────────────
    async function deleteAllData() {
        const ok = await showConfirm('Delete All Data',
            'This will permanently delete contacts, templates, campaigns, groups, chatbot flows, opt-out records, hook numbers and message logs. This cannot be undone.',
            { confirmLabel: 'Delete Everything', danger: true });
        if (!ok) return;
        try {
            await api.resetAllData();
            setHooks([]);
            showToast('All data deleted');
        } catch (e) { showToast(e.message, 'error'); }
    }

    // ── Support Fix helpers ──────────────────────────────────────────────────
    async function supportFix(label, apiCall, successMsg) {
        const ok = await showConfirm(
            `Reset ${label}`,
            `This will permanently delete all ${label.toLowerCase()} data. This cannot be undone.`,
            { confirmLabel: `Delete ${label}`, danger: true }
        );
        if (!ok) return;
        try {
            await apiCall();
            showToast(successMsg || `${label} data cleared`);
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function deleteWhatsAppSessions() {
        const ok = await showConfirm(
            'Delete WhatsApp Session Data',
            'This will disconnect all devices and delete their login credentials. You will need to re-scan the QR code for each device.',
            { confirmLabel: 'Delete Sessions', danger: true }
        );
        if (!ok) return;
        try {
            await api.deleteWhatsAppSessions();
            showToast('WhatsApp sessions cleared — re-scan QR to reconnect');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function deleteLicense() {
        const ok1 = await showConfirm(
            'Delete License Key',
            'This will remove the stored license from this device. The app will require a valid license key to function after restarting.',
            { confirmLabel: 'Yes, continue', danger: true }
        );
        if (!ok1) return;
        const ok2 = await showConfirm(
            '⚠️ Final Confirmation',
            'Are you absolutely sure you want to delete the license? The app will stop working until you activate again.',
            { confirmLabel: 'Delete License', danger: true }
        );
        if (!ok2) return;
        try {
            await api.deleteLicense();
            showToast('License deleted. Restart the app to reactivate.', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function openAppData() {
        try {
            const res = await api.openAppData();
            if (!res.ok && res.path) showToast(`App data folder: ${res.path}`, 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    const score        = calcScore(s);
    const shields      = [s.delayEnabled, s.batchEnabled, s.dailyLimitEnabled, s.typingEnabled].filter(Boolean).length;
    const circumference = 2 * Math.PI * 44;
    const offset       = circumference - (score / 100) * circumference;
    const ringColor    = score >= 80 ? '#25D366' : score >= 50 ? '#d29922' : '#f85149';
    const dailyPct     = s.dailyLimitEnabled ? Math.min(100, Math.round((daily.count / (s.dailyLimit || 50)) * 100)) : 0;

    if (loading) return <div className="page-content"><p style={{ color: 'var(--txt3)' }}>Loading…</p></div>;

    return (
        <div className="page-content">

            {/* ── Tab Bar ── */}
            <div className="settings-tabs">
                {[
                    ['general',  '⚙️',  'General Settings'],
                    ['smart',    '🔒',  'Smart Protection'],
                    ['awake',    '☕',  'Keep Awake'],
                    ['updates',  '🔄',  'App Updates'],
                    ['hooks',    '🔔',  'Hook Number'],
                    ['backup',   '💾',  'Backup & Restore'],
                    ['data',     '🗑️',  'Data Management'],
                    ['support',  '🔧',  'Support Fix'],
                ].map(([key, icon, label]) => (
                    <button key={key}
                        className={`settings-tab-btn${tab === key ? ' active' : ''}`}
                        onClick={() => setTab(key)}>
                        <span>{icon}</span> {label}
                    </button>
                ))}
            </div>

            {/* ══════════════ GENERAL SETTINGS ══════════════ */}
            {tab === 'general' && (<>
                <div className="page-header" style={{ alignItems: 'flex-start' }}>
                    <div>
                        <h1>🛡 Anti-Ban Protection</h1>
                        <p className="page-sub">Control sending behaviour to protect your WhatsApp number.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="risk-chip" style={{ background: `${ringColor}22`, color: ringColor }}>
                            🛡 {shields}/4 Shields Active
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={resetToSafeDefaults} title="Reset to safe defaults">↺ Defaults</button>
                        <button className="btn btn-primary" onClick={saveSettings}>{saved ? '✓ Saved' : 'Save Settings'}</button>
                    </div>
                </div>

                <div className="settings-hero">
                    <div className="score-ring-wrap">
                        <svg viewBox="0 0 120 120" width="120" height="120">
                            <circle cx="60" cy="60" r="44" fill="none" stroke="var(--bg4)" strokeWidth="10"/>
                            <circle cx="60" cy="60" r="44" fill="none" stroke={ringColor} strokeWidth="10"
                                    strokeDasharray={circumference} strokeDashoffset={offset}
                                    strokeLinecap="round" transform="rotate(-90 60 60)"
                                    style={{ transition: 'stroke-dashoffset .5s' }}/>
                        </svg>
                        <div className="score-ring-center">
                            <span className="score-ring-num">{score}</span>
                            <span className="score-ring-sub">/ 100</span>
                        </div>
                    </div>
                    <div className="score-info">
                        <div style={{ color: 'var(--txt3)', fontSize: 13, marginBottom: 4 }}>Account Protection Score</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: ringColor }}>
                            {score >= 80 ? 'Safe Configuration' : score >= 50 ? 'Moderate Risk' : 'High Risk'}
                        </div>
                        <div style={{ color: 'var(--txt2)', fontSize: 13, marginTop: 6 }}>
                            Today: {daily.count} / {s.dailyLimitEnabled ? s.dailyLimit : '∞'} messages sent
                        </div>
                        {s.dailyLimitEnabled && (
                            <div className="daily-meter-track" style={{ marginTop: 10, width: 200 }}>
                                <div className="daily-meter-fill" style={{ width: `${dailyPct}%`, background: dailyPct >= 90 ? 'var(--red)' : 'var(--green)' }}/>
                            </div>
                        )}
                    </div>
                    <div className="presets-panel">
                        <div style={{ color: 'var(--txt3)', fontSize: 12, marginBottom: 8 }}>Quick Presets</div>
                        {[
                            ['new',  '🆕', 'New Number',     '50 msg/day · 25–45s'],
                            ['warm', '🔥', 'Warm Number',    '150 msg/day · 20–35s'],
                            ['max',  '⚡', 'Maximum Speed',  '300 msg/day · 20s min'],
                        ].map(([key, emoji, label, desc]) => (
                            <button key={key} className="preset-btn" onClick={() => applyPreset(key)}>
                                <span style={{ fontSize: 18 }}>{emoji}</span>
                                <div>
                                    <div style={{ fontWeight: 600 }}>{label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="settings-blocks">

                    {/* Company Details */}
                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>🏢 Company Details</h3>
                                </div>
                                <p className="settings-block-desc">Your company info used in templates and exports.</p>
                            </div>
                        </div>
                        <div className="settings-inputs" style={{ marginTop: 14, paddingTop: 14 }}>
                            <div className="form-group-inline" style={{ flex: 1, minWidth: 200 }}>
                                <label>Company Name</label>
                                <input type="text" value="Zyqora" readOnly style={{ width: '100%', opacity: .7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group-inline" style={{ flex: 1, minWidth: 180 }}>
                                <label>Mobile Number</label>
                                <input type="tel" value="9217758442" readOnly style={{ width: '100%', opacity: .7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group-inline" style={{ flex: 1, minWidth: 200 }}>
                                <label>Email</label>
                                <input type="email" value="support@zyqora.in" readOnly style={{ width: '100%', opacity: .7, cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group-inline" style={{ flex: 1, minWidth: 200 }}>
                                <label>Website</label>
                                <input type="text" value="zyqora.in" readOnly style={{ width: '100%', opacity: .7, cursor: 'not-allowed' }} />
                            </div>
                        </div>
                    </div>

                    {/* Appearance */}
                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>🎨 Appearance</h3>
                                </div>
                                <p className="settings-block-desc">Choose how the app looks. System follows your OS preference.</p>
                            </div>
                            <span className="risk-chip" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>
                                {theme === 'dark' ? '🌙 Dark' : theme === 'light' ? '☀️ Light' : '💻 System'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                            {[
                                ['dark',   '🌙', 'Dark',   'Dark background'],
                                ['light',  '☀️', 'Light',  'Light background'],
                                ['system', '💻', 'System', 'Follow OS setting'],
                            ].map(([val, icon, label, desc]) => (
                                <button key={val} className="preset-btn"
                                    style={theme === val ? { borderColor: 'var(--green)', background: 'var(--green-dim)', flex: 1 } : { flex: 1 }}
                                    onClick={() => setTheme(val)}>
                                    <span style={{ fontSize: 20 }}>{icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600 }}>{label}</div>
                                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{desc}</div>
                                    </div>
                                    {theme === val && <span style={{ color: 'var(--green)', fontSize: 15 }}>✓</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>⏱ Message Delay</h3>
                                    <Toggle checked={s.delayEnabled} onChange={e => set('delayEnabled', e.target.checked)} warnOff label="Message Delay" />
                                </div>
                                <p className="settings-block-desc">Random wait between messages. Min 20s enforced to appear human-like.</p>
                            </div>
                            <RiskChip value={s.minDelay} low={25} high={20} />
                        </div>
                        {s.delayEnabled && (
                            <div className="settings-inputs">
                                <div className="form-group-inline">
                                    <label>Min Delay (s)</label>
                                    <input type="number" min="20" max="300" value={s.minDelay} onChange={e => set('minDelay', +e.target.value)} />
                                </div>
                                <div className="form-group-inline">
                                    <label>Max Delay (s)</label>
                                    <input type="number" min="20" max="600" value={s.maxDelay} onChange={e => set('maxDelay', +e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>📦 Batch Pause</h3>
                                    <Toggle checked={s.batchEnabled} onChange={e => set('batchEnabled', e.target.checked)} warnOff label="Batch Pause" />
                                </div>
                                <p className="settings-block-desc">Pause after every N messages to simulate natural behaviour.</p>
                            </div>
                            <RiskChip value={s.batchSize} low={30} high={50} />
                        </div>
                        {s.batchEnabled && (
                            <div className="settings-inputs">
                                <div className="form-group-inline">
                                    <label>Batch Size</label>
                                    <input type="number" min="1" max="200" value={s.batchSize} onChange={e => set('batchSize', +e.target.value)} />
                                </div>
                                <div className="form-group-inline">
                                    <label>Pause Min (s)</label>
                                    <input type="number" min="30" max="3600" value={s.batchPauseMin} onChange={e => set('batchPauseMin', +e.target.value)} />
                                </div>
                                <div className="form-group-inline">
                                    <label>Pause Max (s)</label>
                                    <input type="number" min="30" max="7200" value={s.batchPauseMax} onChange={e => set('batchPauseMax', +e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>📊 Daily Limit</h3>
                                    <Toggle checked={s.dailyLimitEnabled} onChange={e => set('dailyLimitEnabled', e.target.checked)} warnOff label="Daily Limit" />
                                </div>
                                <p className="settings-block-desc">Maximum messages per day to avoid triggering rate-limits.</p>
                            </div>
                            <RiskChip value={s.dailyLimit} low={100} high={200} />
                        </div>
                        {s.dailyLimitEnabled && (
                            <div className="settings-inputs">
                                <div className="form-group-inline">
                                    <label>Daily Limit</label>
                                    <input type="number" min="1" max="1000" value={s.dailyLimit} onChange={e => set('dailyLimit', +e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>⌨️ Typing Indicator</h3>
                                    <Toggle checked={s.typingEnabled} onChange={e => set('typingEnabled', e.target.checked)} warnOff label="Typing Indicator" />
                                </div>
                                <p className="settings-block-desc">Show "typing…" before each message for a human feel.</p>
                            </div>
                        </div>
                        {s.typingEnabled && (
                            <div className="settings-inputs">
                                <div className="form-group-inline">
                                    <label>Min Duration (s)</label>
                                    <input type="number" min="1" max="30" value={s.typingMin} onChange={e => set('typingMin', +e.target.value)} />
                                </div>
                                <div className="form-group-inline">
                                    <label>Max Duration (s)</label>
                                    <input type="number" min="1" max="60" value={s.typingMax} onChange={e => set('typingMax', +e.target.value)} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Account Warmup Guide ── */}
                    <div className="settings-block">
                        <div className="settings-block-head">
                            <div>
                                <div className="settings-block-title-row">
                                    <h3>📈 Account Warmup Plan</h3>
                                </div>
                                <p className="settings-block-desc">Gradually increase your daily limit to avoid bans on new numbers.</p>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                            {[
                                { phase: 'Days 1–3',   limit: 50,  delay: '25–45s', emoji: '🆕', color: '#4a9eff' },
                                { phase: 'Days 4–7',   limit: 100, delay: '22–38s', emoji: '🌱', color: '#25D366' },
                                { phase: 'Week 2',     limit: 150, delay: '20–35s', emoji: '🔥', color: '#f5a623' },
                                { phase: 'Week 3',     limit: 200, delay: '20–30s', emoji: '💪', color: '#bc8cff' },
                                { phase: 'Month 2+',   limit: 300, delay: '20–25s', emoji: '⚡', color: '#ff6b6b' },
                            ].map(({ phase, limit, delay, emoji, color }) => {
                                const isActive = s.dailyLimit >= limit - 20 && s.dailyLimit <= limit + 20;
                                return (
                                    <div key={phase} onClick={() => setS(p => ({ ...p, dailyLimit: limit }))}
                                        style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
                                            border: isActive ? `2px solid ${color}` : '2px solid var(--border)',
                                            background: isActive ? `${color}15` : 'var(--bg3)' }}>
                                        <div style={{ fontSize: 20, marginBottom: 4 }}>{emoji}</div>
                                        <div style={{ fontWeight: 700, fontSize: 13, color: isActive ? color : 'var(--txt)' }}>{phase}</div>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{limit} msg/day</div>
                                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{delay} delay</div>
                                    </div>
                                );
                            })}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 12 }}>
                            💡 Click a phase to set the daily limit. Increase only after successfully sending at the lower limit for the full period without any warnings.
                        </p>
                    </div>
                </div>
            </>)}

            {/* ═════════════ KEEP AWAKE ═════════════ */}
            {tab === 'awake' && (
                <div>
                    <div className="page-header" style={{ alignItems: 'flex-start' }}>
                        <div>
                            <h1>☕ Keep System Awake</h1>
                            <p className="page-sub">Prevent your computer from sleeping while automation is running.</p>
                        </div>
                        <button className="btn btn-primary" onClick={saveSettings}>{saved ? '✓ Saved' : 'Save Settings'}</button>
                    </div>

                    <div className="settings-blocks">
                        <div className="settings-block">
                            <div className="settings-block-head">
                                <div>
                                    <div className="settings-block-title-row">
                                        <h3>📌 Prevent System Sleep</h3>
                                        <Toggle
                                            checked={!!s.keepAwakeEnabled}
                                            onChange={e => set('keepAwakeEnabled', e.target.checked)}
                                            label="Keep Awake"
                                        />
                                    </div>
                                    <p className="settings-block-desc">
                                        When enabled, Zyqora tells Windows not to put this computer to sleep.
                                        Campaigns, chatbot flows, and auto-replies will keep running even if you
                                        walk away from the keyboard. Remember to turn this off when you're done.
                                    </p>
                                </div>
                                <span className="risk-chip" style={s.keepAwakeEnabled
                                    ? { background: 'rgba(37,211,102,.15)', color: 'var(--green)' }
                                    : { background: 'rgba(100,100,130,.15)', color: 'var(--txt3)' }}>
                                    {s.keepAwakeEnabled ? '☕ Awake' : '💤 Normal'}
                                </span>
                            </div>

                            {s.keepAwakeEnabled && (
                                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'center',
                                        padding: '12px 16px', borderRadius: 10,
                                        background: 'rgba(37,211,102,.07)', border: '1px solid rgba(37,211,102,.25)' }}>
                                        <span style={{ fontSize: 24 }}>✅</span>
                                        <div>
                                            <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 13 }}>
                                                Keep-Awake is active
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 3 }}>
                                                The system will not go to sleep automatically. Automation will continue running uninterrupted.
                                                Screen may still turn off (display sleep) — that's fine, the PC stays ON.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="settings-block">
                            <div className="settings-block-head">
                                <div>
                                    <div className="settings-block-title-row">
                                        <h3>ℹ️ How it works</h3>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { icon: '🔒', title: 'Blocks system sleep only', desc: 'The setting uses Windows / macOS power management to prevent the OS from suspending the process. Your screen may still dim or turn off — that\'s fine.' },
                                    { icon: '⚡', title: 'Takes effect immediately', desc: 'As soon as you toggle it ON and save, the blocker activates. You don\'t need to restart the app.' },
                                    { icon: '💾', title: 'Saved across sessions', desc: 'The setting is saved to your configuration. It will re-activate automatically each time you open Zyqora.' },
                                    { icon: '⚠️', title: 'Turn off when not needed', desc: 'Keeping the system awake 24/7 uses more power. Disable it when you\'re done with automation to let your computer sleep normally.' },
                                ].map(({ icon, title, desc }) => (
                                    <div key={title} style={{ display: 'flex', gap: 12 }}>
                                        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)' }}>{title}</div>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════ SMART PROTECTION ══════════════ */}
            {tab === 'smart' && (() => {
                // Compute warmup-suggested daily limit
                let warmupLimit = s.dailyLimit;
                let warmupPhaseLabel = '';
                if (s.autoWarmupEnabled && s.warmupStartedAt) {
                    const daysSince = Math.floor((Date.now() - new Date(s.warmupStartedAt).getTime()) / 86400000);
                    if      (daysSince < 3)  { warmupLimit = 50;  warmupPhaseLabel = `Days 1–3 · ${daysSince + 1} day(s) in`; }
                    else if (daysSince < 7)  { warmupLimit = 100; warmupPhaseLabel = `Days 4–7 · ${daysSince + 1} day(s) in`; }
                    else if (daysSince < 14) { warmupLimit = 150; warmupPhaseLabel = `Week 2 · ${daysSince + 1} day(s) in`; }
                    else if (daysSince < 21) { warmupLimit = 200; warmupPhaseLabel = `Week 3 · ${daysSince + 1} day(s) in`; }
                    else                     { warmupLimit = 300; warmupPhaseLabel = `Month 2+ · ${daysSince + 1} day(s) in`; }
                }

                function activateAll() {
                    setS(p => ({
                        ...p,
                        smartProtection: true,
                        timeWindowEnabled: true,  timeWindowStart: '09:00', timeWindowEnd: '19:00',
                        startDelayEnabled: true,  startDelayMin: 2, startDelayMax: 15,
                        autoWarmupEnabled: true,
                        delayEnabled: true, typingEnabled: true, batchEnabled: true, dailyLimitEnabled: true,
                    }));
                    showToast('All Smart Protection features activated! Click Save to apply.', 'info');
                }

                function deactivateAll() {
                    setS(p => ({
                        ...p,
                        smartProtection: false,
                        timeWindowEnabled: false,
                        startDelayEnabled: false,
                        autoWarmupEnabled: false,
                    }));
                    showToast('Smart Protection deactivated. Click Save to apply.');
                }

                const allOn = s.timeWindowEnabled && s.startDelayEnabled && s.autoWarmupEnabled;

                return (
                    <div>
                        <div className="page-header" style={{ alignItems: 'flex-start' }}>
                            <div>
                                <h1>🔒 Smart Protection</h1>
                                <p className="page-sub">Advanced anti-ban features. Toggle each individually or activate all with one click.</p>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {!allOn
                                    ? <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#25D366,#128C7E)', border: 'none' }} onClick={activateAll}>
                                        ⚡ Activate All Protection
                                      </button>
                                    : <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={deactivateAll}>
                                        ✕ Deactivate All
                                      </button>
                                }
                                <button className="btn btn-primary" onClick={saveSettings}>{saved ? '✓ Saved' : 'Save Settings'}</button>
                            </div>
                        </div>

                        {/* Status banner */}
                        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12,
                            background: allOn ? 'rgba(37,211,102,.08)' : 'rgba(239,68,68,.06)',
                            border: `1.5px solid ${allOn ? 'rgba(37,211,102,.3)' : 'rgba(239,68,68,.25)'}`,
                            display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 24 }}>{allOn ? '🛡️' : '⚠️'}</span>
                            <div>
                                <div style={{ fontWeight: 700, color: allOn ? 'var(--green)' : 'var(--red)', fontSize: 14 }}>
                                    {allOn ? 'All Smart Protection features are ON' : 'Some or all features are OFF'}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                                    {allOn
                                        ? 'Your campaigns will only send during safe hours, start with a human-like delay, and respect warm-up limits.'
                                        : 'Click "Activate All Protection" to enable all features at once, or toggle them individually below.'}
                                </div>
                            </div>
                        </div>

                        <div className="settings-blocks">

                            {/* ── 1. Sending Time Window ── */}
                            <div className="settings-block">
                                <div className="settings-block-head">
                                    <div>
                                        <div className="settings-block-title-row">
                                            <h3>🕐 Sending Time Window</h3>
                                            <Toggle checked={!!s.timeWindowEnabled} onChange={e => set('timeWindowEnabled', e.target.checked)} label="Sending Time Window" />
                                        </div>
                                        <p className="settings-block-desc">
                                            Campaigns only send messages during the hours you set. Outside these hours, sending pauses automatically and resumes the next day. Disable if you need to send at any time.
                                        </p>
                                    </div>
                                    <span className="risk-chip" style={s.timeWindowEnabled
                                        ? { background: 'rgba(37,211,102,.15)', color: 'var(--green)' }
                                        : { background: 'rgba(239,68,68,.1)', color: 'var(--red)' }}>
                                        {s.timeWindowEnabled ? '✓ Active' : '✕ Off'}
                                    </span>
                                </div>
                                {s.timeWindowEnabled && (
                                    <div className="settings-inputs" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                        <div className="form-group-inline">
                                            <label>Start Time</label>
                                            <input type="time" value={s.timeWindowStart || '09:00'} onChange={e => set('timeWindowStart', e.target.value)} style={{ width: 130 }} />
                                        </div>
                                        <div className="form-group-inline">
                                            <label>End Time</label>
                                            <input type="time" value={s.timeWindowEnd || '19:00'} onChange={e => set('timeWindowEnd', e.target.value)} style={{ width: 130 }} />
                                        </div>
                                        <div style={{ alignSelf: 'flex-end', paddingBottom: 4, fontSize: 12, color: 'var(--txt3)' }}>
                                            Sending allowed: <strong style={{ color: 'var(--txt)' }}>{s.timeWindowStart || '09:00'} – {s.timeWindowEnd || '19:00'}</strong> local time
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 2. Random Start Delay ── */}
                            <div className="settings-block">
                                <div className="settings-block-head">
                                    <div>
                                        <div className="settings-block-title-row">
                                            <h3>⏳ Random Campaign Start Delay</h3>
                                            <Toggle checked={!!s.startDelayEnabled} onChange={e => set('startDelayEnabled', e.target.checked)} label="Start Delay" />
                                        </div>
                                        <p className="settings-block-desc">
                                            When you hit "Send", the campaign waits a random number of minutes before sending the first message. Mimics a human opening the app and not instantly blasting messages.
                                        </p>
                                    </div>
                                    <span className="risk-chip" style={s.startDelayEnabled
                                        ? { background: 'rgba(37,211,102,.15)', color: 'var(--green)' }
                                        : { background: 'rgba(239,68,68,.1)', color: 'var(--red)' }}>
                                        {s.startDelayEnabled ? '✓ Active' : '✕ Off'}
                                    </span>
                                </div>
                                {s.startDelayEnabled && (
                                    <div className="settings-inputs" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                        <div className="form-group-inline">
                                            <label>Min Delay (min)</label>
                                            <input type="number" min="0" max="60" value={s.startDelayMin ?? 2} onChange={e => set('startDelayMin', +e.target.value)} />
                                        </div>
                                        <div className="form-group-inline">
                                            <label>Max Delay (min)</label>
                                            <input type="number" min="1" max="120" value={s.startDelayMax ?? 15} onChange={e => set('startDelayMax', +e.target.value)} />
                                        </div>
                                        <div style={{ alignSelf: 'flex-end', paddingBottom: 4, fontSize: 12, color: 'var(--txt3)' }}>
                                            Campaigns start after <strong style={{ color: 'var(--txt)' }}>{s.startDelayMin ?? 2}–{s.startDelayMax ?? 15} min</strong> random wait
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── 3. Auto Warm-Up ── */}
                            <div className="settings-block">
                                <div className="settings-block-head">
                                    <div>
                                        <div className="settings-block-title-row">
                                            <h3>📈 Auto Warm-Up Schedule</h3>
                                            <Toggle checked={!!s.autoWarmupEnabled} onChange={e => set('autoWarmupEnabled', e.target.checked)} label="Auto Warm-Up" />
                                        </div>
                                        <p className="settings-block-desc">
                                            Automatically caps the daily sending limit based on how old this number's session is. Starts at 50/day and increases weekly. The daily limit in General Settings is overridden by this while active.
                                        </p>
                                    </div>
                                    <span className="risk-chip" style={s.autoWarmupEnabled
                                        ? { background: 'rgba(37,211,102,.15)', color: 'var(--green)' }
                                        : { background: 'rgba(239,68,68,.1)', color: 'var(--red)' }}>
                                        {s.autoWarmupEnabled ? '✓ Active' : '✕ Off'}
                                    </span>
                                </div>
                                {s.autoWarmupEnabled && (
                                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                                            {[
                                                { label: 'Days 1–3',  limit: 50,  color: '#4a9eff', emoji: '🆕' },
                                                { label: 'Days 4–7',  limit: 100, color: '#25D366', emoji: '🌱' },
                                                { label: 'Week 2',    limit: 150, color: '#f5a623', emoji: '🔥' },
                                                { label: 'Week 3',    limit: 200, color: '#bc8cff', emoji: '💪' },
                                                { label: 'Month 2+',  limit: 300, color: '#ff6b6b', emoji: '⚡' },
                                            ].map(phase => {
                                                const isActive = warmupLimit === phase.limit;
                                                return (
                                                    <div key={phase.label} style={{
                                                        padding: '10px 12px', borderRadius: 10, textAlign: 'center',
                                                        border: isActive ? `2px solid ${phase.color}` : '2px solid var(--border)',
                                                        background: isActive ? `${phase.color}18` : 'var(--bg3)',
                                                    }}>
                                                        <div style={{ fontSize: 18 }}>{phase.emoji}</div>
                                                        <div style={{ fontWeight: 700, fontSize: 12, color: isActive ? phase.color : 'var(--txt)', marginTop: 3 }}>{phase.label}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{phase.limit}/day</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {warmupPhaseLabel && (
                                            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--green)' }}>
                                                ✓ Current phase: <strong>{warmupPhaseLabel}</strong> → limit capped at <strong>{warmupLimit} msg/day</strong>
                                            </div>
                                        )}
                                        <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 8 }}>
                                            The warm-up clock started when you first enabled this feature. It progresses automatically.
                                        </p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                );
            })()}

            {/* ══════════════ APP UPDATES ══════════════ */}
            {tab === 'updates' && (
                <div>
                    <div className="page-header">
                        <div>
                            <h1>🔄 App Updates</h1>
                            <p className="page-sub">Keep your application up to date.</p>
                        </div>
                    </div>
                    <div className="settings-block" style={{ maxWidth: 520 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <div style={{ fontSize: 48 }}>📦</div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 16 }}>Zyqora</div>
                                <div style={{ color: 'var(--txt3)', fontSize: 13, marginTop: 2 }}>
                                    Current version: <strong style={{ color: 'var(--green)' }}>1.0.0</strong>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <span className="risk-chip" style={{ background: 'rgba(37,211,102,.15)', color: 'var(--green)' }}>✓ Up to date</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 18, paddingTop: 14 }}>
                            <button className="btn btn-primary"
                                onClick={() => showToast('You are already on the latest version (1.0.0)')}>
                                🔍 Check for Updates
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════ HOOK NUMBER ══════════════ */}
            {tab === 'hooks' && (
                <div>
                    <div className="page-header">
                        <div>
                            <h1>🔔 Hook Number</h1>
                            <p className="page-sub">All inbound replies received by any connected device are forwarded to these numbers.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddHook(true)}>+ Add Number</button>
                    </div>

                    {hooks.length === 0 && !showAddHook && (
                        <div className="empty-state">
                            <div className="empty-icon">🔕</div>
                            <div className="empty-title">No hook numbers configured</div>
                            <div className="empty-sub">Add a number to receive forwarded copies of all inbound replies.</div>
                        </div>
                    )}

                    {hooks.length > 0 && (
                        <div className="settings-blocks">
                            {hooks.map(hook => (
                                <div key={hook.id} className="settings-block">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        {/* Phone SVG icon */}
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="1.8">
                                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.77 12 19.79 19.79 0 0 1 1.72 3.4 2 2 0 0 1 3.7 1.22h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.06 6.06l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
                                            </svg>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{hook.label || hook.number}</div>
                                            {hook.label && hook.label !== hook.number &&
                                                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>+{hook.number}</div>}
                                        </div>
                                        <span className="risk-chip" style={hook.enabled
                                            ? { background: 'rgba(37,211,102,.15)', color: 'var(--green)' }
                                            : { background: 'var(--bg4)', color: 'var(--txt3)' }}>
                                            {hook.enabled ? '● Active' : '○ Paused'}
                                        </span>
                                        <label className="toggle-switch">
                                            <input type="checkbox" checked={hook.enabled} onChange={() => toggleHook(hook.id)} />
                                            <span className="toggle-slider"></span>
                                        </label>
                                        <button className="btn btn-sm btn-ghost"
                                            title="Edit"
                                            onClick={() => setEditingHook({ id: hook.id, number: hook.number, label: hook.label || '' })}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                            </svg>
                                        </button>
                                        <button className="btn btn-sm"
                                            style={{ color: 'var(--red)', borderColor: 'transparent', background: 'transparent' }}
                                            onClick={() => deleteHook(hook.id)}>✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showAddHook && (
                        <div className="modal-backdrop">
                            <div className="modal" style={{ maxWidth: 400 }}>
                                <div className="modal-header">
                                    <h2>Add Hook Number</h2>
                                    <button className="modal-close" onClick={() => { setShowAddHook(false); setHookInput(''); setHookLabel(''); }}>✕</button>
                                </div>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>Phone Number *</label>
                                        <input type="tel" placeholder="e.g. 9876543210 or 919876543210" value={hookInput}
                                            onChange={e => setHookInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addHook()} />
                                        <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 4 }}>Enter with or without country code — 91 added automatically for 10-digit Indian numbers.</div>
                                    </div>
                                    <div className="form-group">
                                        <label>Label (optional)</label>
                                        <input type="text" placeholder="e.g. My Phone" value={hookLabel}
                                            onChange={e => setHookLabel(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addHook()} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="btn" onClick={() => { setShowAddHook(false); setHookInput(''); setHookLabel(''); }}>Cancel</button>
                                    <button className="btn btn-primary" onClick={addHook} disabled={hookSaving}>
                                        {hookSaving ? 'Saving…' : 'Add Number'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {editingHook && (
                        <div className="modal-backdrop">
                            <div className="modal" style={{ maxWidth: 400 }}>
                                <div className="modal-header">
                                    <h2>Edit Hook Number</h2>
                                    <button className="modal-close" onClick={() => setEditingHook(null)}>✕</button>
                                </div>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label>Phone Number *</label>
                                        <input type="tel" placeholder="e.g. 9876543210" value={editingHook.number}
                                            onChange={e => setEditingHook(h => ({ ...h, number: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && saveEditHook()} />
                                        <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 4 }}>91 is added automatically for 10-digit Indian numbers.</div>
                                    </div>
                                    <div className="form-group">
                                        <label>Label (optional)</label>
                                        <input type="text" placeholder="e.g. My Phone" value={editingHook.label}
                                            onChange={e => setEditingHook(h => ({ ...h, label: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && saveEditHook()} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button className="btn" onClick={() => setEditingHook(null)}>Cancel</button>
                                    <button className="btn btn-primary" onClick={saveEditHook} disabled={hookSaving}>
                                        {hookSaving ? 'Saving…' : 'Save Changes'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════ BACKUP & RESTORE ══════════════ */}
            {tab === 'backup' && (
                <div>
                    <div className="page-header">
                        <div>
                            <h1>💾 Backup &amp; Restore</h1>
                            <p className="page-sub">Export all your data to a JSON file or restore from a previous backup.</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
                        <div className="settings-block">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ fontSize: 32 }}>⬇️</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700 }}>Create Backup</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginTop: 2 }}>
                                        Download all contacts, templates, campaigns, settings, hook numbers and more as a JSON file.
                                    </div>
                                </div>
                                <button className="btn btn-primary" onClick={downloadBackup}>
                                    Download Backup
                                </button>
                            </div>
                        </div>

                        <div className="settings-block">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ fontSize: 32 }}>⬆️</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700 }}>Restore Backup</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginTop: 2 }}>
                                        Upload a previously downloaded backup file. Existing data will be overwritten.
                                    </div>
                                </div>
                                <input ref={restoreFileRef} type="file" accept=".json,application/json"
                                    style={{ display: 'none' }}
                                    onChange={e => restoreBackup(e.target.files[0])} />
                                <button className="btn" disabled={restoring}
                                    onClick={() => restoreFileRef.current?.click()}>
                                    {restoring ? 'Restoring…' : 'Choose File'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════ DATA MANAGEMENT ══════════════ */}
            {/* Secret version trigger — tell clients: "go to Settings, scroll to bottom, click v1.0 three times" */}
            <div
                onClick={handleVersionClick}
                style={{ textAlign: 'right', padding: '10px 4px 0', fontSize: 10, color: 'var(--txt3)', userSelect: 'none', cursor: 'default', opacity: 0.35 }}
                title=""
            >
                v1.0
            </div>

            {tab === 'data' && (
                <div>
                    <div className="page-header">
                        <div>
                            <h1>🗑️ Data Management</h1>
                            <p className="page-sub">Permanently delete stored data. These actions cannot be undone.</p>
                        </div>
                    </div>
                    <div className="settings-block" style={{ maxWidth: 560, borderColor: 'rgba(248,81,73,.3)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                            <div style={{ fontSize: 32 }}>⚠️</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 10 }}>Delete All Data</div>
                                <div style={{ fontSize: 12.5, color: 'var(--txt3)', marginBottom: 6 }}>
                                    This will permanently delete:
                                </div>
                                <ul style={{ fontSize: 12.5, color: 'var(--txt2)', paddingLeft: 18, lineHeight: 1.9 }}>
                                    <li>All contacts</li>
                                    <li>All message templates</li>
                                    <li>All campaigns &amp; history</li>
                                    <li>All groups</li>
                                    <li>All chatbot flows &amp; logs</li>
                                    <li>All opt-out records &amp; auto-reply rules</li>
                                    <li>All hook numbers</li>
                                    <li>All live chat conversations</li>
                                </ul>
                                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--txt3)' }}>
                                    Device connections and anti-ban settings are preserved.
                                </div>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(248,81,73,.2)', marginTop: 16, paddingTop: 14 }}>
                            <button className="btn btn-danger" onClick={deleteAllData}>
                                🗑️ Delete All Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════ SUPPORT FIX ══════════════ */}
            {tab === 'support' && (
                <div>
                    <div className="page-header">
                        <div>
                            <h1>🔧 Support &amp; Fix</h1>
                            <p className="page-sub">Targeted fixes for specific issues. Each action only affects its own data — nothing else is touched.</p>
                        </div>
                    </div>

                    <div className="settings-blocks">

                        {/* App Data Folder */}
                        <div className="settings-block">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📁</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>Open App Data Folder</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                                        Opens the folder where all app data, sessions, and license files are stored. Useful for manual inspection or backup.
                                    </div>
                                </div>
                                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={openAppData}>
                                    Open Folder →
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ padding: '4px 0 2px', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Connection &amp; Sessions
                        </div>

                        {/* WhatsApp Sessions */}
                        <div className="settings-block" style={{ borderColor: 'rgba(248,81,73,.25)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(37,211,102,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔌</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>WhatsApp Session Data</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                                        <strong style={{ color: 'var(--red)' }}>Fix:</strong> Login loops, QR code keeps refreshing, "Connection closed" errors.
                                        Deletes auth credentials — all devices must be re-scanned.
                                    </div>
                                </div>
                                <button className="btn btn-danger" style={{ flexShrink: 0 }} onClick={deleteWhatsAppSessions}>
                                    Reset Sessions
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ padding: '4px 0 2px', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Feature Data
                        </div>

                        {[
                            {
                                icon: '👥', label: 'Contacts',
                                fix: 'Contact list not loading, duplicate or corrupt contacts.',
                                action: () => supportFix('Contacts', api.deleteSupportContacts),
                            },
                            {
                                icon: '📝', label: 'Templates',
                                fix: 'Templates not loading, editor crashes, corrupt template data.',
                                action: () => supportFix('Templates', api.deleteSupportTemplates),
                            },
                            {
                                icon: '📣', label: 'Campaigns',
                                fix: 'Campaigns stuck or not loading, history errors.',
                                action: () => supportFix('Campaigns', api.deleteSupportCampaigns),
                            },
                            {
                                icon: '🤖', label: 'Chatbot Flows',
                                fix: 'Chatbot not responding, flow errors, stuck conversations.',
                                action: () => supportFix('Chatbot Flows', api.deleteSupportChatbot),
                            },
                            {
                                icon: '↩️', label: 'Auto Reply Rules',
                                fix: 'Auto replies not triggering, rule errors, duplicate replies.',
                                action: () => supportFix('Auto Reply Rules', api.deleteSupportAutoReply),
                            },
                            {
                                icon: '👥', label: 'Groups',
                                fix: 'Group list not loading, sync errors.',
                                action: () => supportFix('Groups', api.deleteSupportGroups),
                            },
                            {
                                icon: '🚫', label: 'Opt-Out Records',
                                fix: 'Opt-out list not working, unsubscribe records corrupt.',
                                action: () => supportFix('Opt-Out Records', api.deleteSupportOptout),
                            },
                            {
                                icon: '💬', label: 'Live Chat History',
                                fix: 'Live chat not loading, conversation history errors.',
                                action: () => supportFix('Live Chat History', api.deleteSupportLiveChat),
                            },
                            {
                                icon: '🤝', label: 'Trust Builder Sessions',
                                fix: 'Trust builder not starting, session data errors.',
                                action: () => supportFix('Trust Builder Sessions', api.deleteSupportTrustBuilder),
                            },
                        ].map(({ icon, label, fix, action }) => (
                            <div key={label} className="settings-block" style={{ borderColor: 'rgba(248,81,73,.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                                            <strong style={{ color: 'var(--orange)' }}>Fix:</strong> {fix}
                                        </div>
                                    </div>
                                    <button className="btn btn-sm"
                                        style={{ flexShrink: 0, color: 'var(--red)', border: '1px solid rgba(248,81,73,.4)', background: 'rgba(248,81,73,.07)' }}
                                        onClick={action}>
                                        Clear {label}
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Divider */}
                        <div style={{ padding: '4px 0 2px', fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            License
                        </div>

                        {/* License Delete */}
                        <div className="settings-block" style={{ borderColor: 'rgba(248,81,73,.4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(248,81,73,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔑</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--red)' }}>Delete License Key</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                                        Removes the stored license from this device. The app will stop working until you activate with a valid key again.
                                        <strong style={{ color: 'var(--red)', display: 'block', marginTop: 4 }}>⚠️ Requires 2 confirmations. Cannot be undone.</strong>
                                    </div>
                                </div>
                                <button className="btn btn-danger" style={{ flexShrink: 0 }} onClick={deleteLicense}>
                                    Delete License
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
