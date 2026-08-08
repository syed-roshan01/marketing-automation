import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext.jsx';

function fmt(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PlanBadge({ plan }) {
    const colors = {
        trial:    '#f59e0b', weekly: '#3b82f6', monthly: '#4a9eff',
        '3months':'#06b6d4', '6months':'#8b5cf6', yearly: '#22c55e',
        lifetime: '#a78bfa', custom: '#94a3b8',
    };
    const c = colors[plan] || '#94a3b8';
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
            borderRadius: 99, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.5px',
            background: `${c}22`, color: c, border: `1px solid ${c}44`,
        }}>
            {plan || 'unknown'}
        </span>
    );
}

export default function LicensePortal() {
    const navigate = useNavigate();
    const { license, activateLicense, showToast } = useApp();

    const [key,     setKey]     = useState('');
    const [busy,    setBusy]    = useState(false);
    const [err,     setErr]     = useState('');
    const [success, setSuccess] = useState('');
    const inputRef = useRef(null);

    const daysLeft    = license?.daysLeft    ?? null;
    const isLifetime  = license?.isLifetime  ?? false;
    const plan        = license?.plan        ?? '—';
    const deviceLimit = license?.deviceLimit ?? '—';
    const machineId   = license?.machineId   ?? '—';
    const expiry      = license?.expiry      ?? null;

    const daysColor = isLifetime ? '#a78bfa'
        : daysLeft == null ? '#64748b'
        : daysLeft <= 5  ? '#ef4444'
        : daysLeft <= 14 ? '#f59e0b'
        : '#22c55e';

    async function handleActivate(e) {
        e.preventDefault();
        if (!key.trim()) return;
        setBusy(true);
        setErr('');
        setSuccess('');
        try {
            await activateLicense(key.trim());
            setSuccess('License activated successfully!');
            setKey('');
            showToast('License activated!', 'success');
        } catch (e) {
            setErr(e?.message || 'Activation failed. Check the key and try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }}>
            <div style={{ width: '100%', maxWidth: 560 }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <button
                        onClick={() => navigate('/settings')}
                        style={{
                            background: 'none', border: 'none', color: 'var(--txt3)',
                            cursor: 'pointer', fontSize: 20, padding: '4px 6px', lineHeight: 1,
                            borderRadius: 6,
                        }}
                        title="Back to Settings"
                    >←</button>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)' }}>License Portal</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>View plan details & activate a new key</div>
                    </div>
                </div>

                {/* Current License Card */}
                <div style={{
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: '22px 24px', marginBottom: 20,
                }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16 }}>
                        Current License
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Plan</div>
                            <PlanBadge plan={plan} />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Status</div>
                            {license?.valid ? (
                                <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>✓ Active</span>
                            ) : (
                                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>✗ Inactive</span>
                            )}
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Expiry</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                                {isLifetime ? '∞ Lifetime' : fmt(expiry)}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Days Remaining</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: daysColor, lineHeight: 1 }}>
                                {isLifetime ? '∞' : daysLeft != null ? daysLeft : '—'}
                                {!isLifetime && daysLeft != null && (
                                    <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 4, color: 'var(--txt3)' }}>days</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Device Slots</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{deviceLimit}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Machine ID</div>
                            <div style={{
                                fontFamily: 'Courier New, monospace', fontSize: 11,
                                color: 'var(--purple)', letterSpacing: '.5px',
                                userSelect: 'all', cursor: 'text',
                            }}>
                                {machineId}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Activate New Key */}
                <div style={{
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: '22px 24px',
                }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16 }}>
                        Activate New Key
                    </div>

                    <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <input
                            ref={inputRef}
                            value={key}
                            onChange={e => { setKey(e.target.value); setErr(''); setSuccess(''); }}
                            placeholder="ZYQ-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                            style={{
                                width: '100%', padding: '10px 14px',
                                background: 'var(--bg3)', border: '1px solid var(--border)',
                                borderRadius: 9, color: 'var(--txt)',
                                fontFamily: 'Courier New, monospace', fontSize: 13,
                                outline: 'none', boxSizing: 'border-box',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--purple)'}
                            onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                            disabled={busy}
                            autoComplete="off"
                            spellCheck={false}
                        />

                        {err && (
                            <div style={{
                                background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.25)',
                                borderRadius: 8, padding: '9px 13px', color: '#ef4444', fontSize: 13,
                            }}>
                                {err}
                            </div>
                        )}
                        {success && (
                            <div style={{
                                background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
                                borderRadius: 8, padding: '9px 13px', color: '#22c55e', fontSize: 13,
                            }}>
                                ✓ {success}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy || !key.trim()}
                            className="btn btn-primary"
                            style={{ alignSelf: 'flex-start', padding: '9px 22px' }}
                        >
                            {busy ? 'Activating…' : 'Activate Key'}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
}
