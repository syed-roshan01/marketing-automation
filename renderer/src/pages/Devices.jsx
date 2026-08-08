import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useApp } from '../contexts/AppContext.jsx';
import socket from '../socket.js';

// Status badge config
const STATUS_CONFIG = {
    qr_pending:   { label: 'QR Code Ready', color: 'var(--orange)',  bg: 'var(--orange-dim)' },
    connected:    { label: 'Connected',      color: 'var(--green)',   bg: 'var(--green-dim)'  },
    disconnected: { label: 'Disconnected',   color: 'var(--red)',     bg: 'var(--red-dim)'    },
};

function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Devices() {
    const { showToast, showConfirm, license } = useApp();
    const MAX_DEVICES = license?.deviceLimit ?? 3;

    const [devices, setDevices]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [addOpen, setAddOpen]       = useState(false);
    const [deviceName, setDeviceName] = useState('');
    const [pairMethod, setPairMethod] = useState('qr');   // 'qr' | 'phone'
    const [pairPhone, setPairPhone]   = useState('');
    const [adding, setAdding]         = useState(false);
    const [qrModal, setQrModal]       = useState(null); // { device, qrDataUrl, polling }
    const [codeModal, setCodeModal]   = useState(null); // { device, code }
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const list = await api.getDevices();
            setDevices(list);
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        load();
        socket.on('devices_updated', load);

        // Real-time QR push from server — update open modal immediately
        socket.on('device_qr', ({ deviceId, qrDataUrl }) => {
            setQrModal(prev => {
                if (!prev || prev.device.id !== deviceId) return prev;
                return { ...prev, qrDataUrl };
            });
        });

        // Real-time connected push from server — flip modal to success immediately
        socket.on('device_connected', ({ deviceId }) => {
            setQrModal(prev => {
                if (!prev || prev.device.id !== deviceId) return prev;
                stopPolling();
                return { ...prev, qrDataUrl: null, connected: true };
            });
            load();
        });

        // Device disconnected — reload list so status badge updates
        socket.on('device_disconnected', () => { load(); });

        return () => {
            socket.off('devices_updated', load);
            socket.off('device_qr');
            socket.off('device_connected');
            socket.off('device_disconnected');
        };
    }, [load]);

    // ── QR polling (fallback in case socket event is missed) ─────────────────
    function startPolling(device) {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const res = await api.getDeviceQR(device.id);
                if (res.status === 'connected') {
                    stopPolling();
                    setQrModal(prev => prev ? { ...prev, qrDataUrl: null, connected: true } : null);
                    load();
                    return;
                }
                if (res.qrDataUrl) {
                    setQrModal(prev => prev ? { ...prev, qrDataUrl: res.qrDataUrl } : null);
                }
            } catch (_) {}
        }, 5000);
    }

    function stopPolling() {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }

    async function openQR(device) {
        try {
            const res = await api.getDeviceQR(device.id);
            setQrModal({ device, qrDataUrl: res.qrDataUrl, connected: res.status === 'connected' });
            if (res.status !== 'connected') startPolling(device);
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    function closeQR() {
        stopPolling();
        setQrModal(null);
    }

    // ── Add device ────────────────────────────────────────────────────────────
    async function handleAdd(e) {
        e.preventDefault();
        const name = deviceName.trim();
        if (!name) return;
        if (pairMethod === 'phone' && !pairPhone.trim()) return;
        setAdding(true);
        try {
            const device = await api.createDevice(name);
            setDevices(prev => [...prev, device]);
            setAddOpen(false);
            setDeviceName('');
            setPairPhone('');
            setPairMethod('qr');

            if (pairMethod === 'phone') {
                // Request pairing code — show spinner in a modal while we wait
                setCodeModal({ device, code: null, loading: true, error: null });
                try {
                    const { code } = await api.requestPairingCode(device.id, pairPhone.trim());
                    setCodeModal({ device, code, loading: false, error: null });
                } catch (err) {
                    setCodeModal({ device, code: null, loading: false, error: err.message });
                }
            } else {
                showToast(`Device "${device.name}" created`);
                try {
                    await openQR(device);
                } catch (_) {
                    showToast('Device added. Click "Show QR" to scan.', 'info');
                }
            }
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setAdding(false);
        }
    }

    // ── Delete device ─────────────────────────────────────────────────────────
    async function handleDelete(device) {
        const ok = await showConfirm(
            'Delete Device',
            `Remove "${device.name}"? This cannot be undone.`,
            { danger: true, confirmLabel: 'Delete' },
        );
        if (!ok) return;
        try {
            await api.deleteDevice(device.id);
            setDevices(prev => prev.filter(d => d.id !== device.id));
            showToast('Device removed');
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    return (
        <div className="page-content">
            {/* ── Header ── */}
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div style={{
                    width: 46, height: 46, borderRadius: 12,
                    background: 'var(--green-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                        <line x1="12" y1="18" x2="12.01" y2="18"/>
                    </svg>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h1>WhatsApp Devices</h1>
                        <span style={{
                            background: 'var(--blue-dim)', color: 'var(--blue)',
                            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                        }}>
                            {devices.length} / {MAX_DEVICES}
                        </span>
                    </div>
                    <p style={{ marginTop: 2, fontSize: 13 }}>Manage your WhatsApp sessions and connections</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={() => { setDeviceName(''); setPairPhone(''); setPairMethod('qr'); setAddOpen(true); }}
                    disabled={devices.length >= MAX_DEVICES}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Add Device
                </button>
            </div>

            {/* ── Empty state ── */}
            {!loading && devices.length === 0 && (
                <div style={{ textAlign: 'center', padding: '80px 0' }}>
                    <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="1.2"
                        style={{ margin: '0 auto 16px', display: 'block' }}>
                        <rect x="3" y="3" width="5" height="5" rx="1"/>
                        <rect x="10" y="3" width="5" height="5" rx="1"/>
                        <rect x="3" y="10" width="5" height="5" rx="1"/>
                        <rect x="10" y="10" width="2" height="2" rx=".5"/>
                    </svg>
                    <h2 style={{ marginBottom: 6, color: 'var(--txt2)' }}>No devices connected</h2>
                    <p style={{ marginBottom: 20, fontSize: 13 }}>Add your first WhatsApp device to get started</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setDeviceName(''); setPairPhone(''); setPairMethod('qr'); setAddOpen(true); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add Device
                    </button>
                </div>
            )}

            {/* ── Device cards grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {devices.map(device => {
                    const cfg = STATUS_CONFIG[device.status] || STATUS_CONFIG.disconnected;
                    return (
                        <div key={device.id} style={{
                            background: 'var(--bg2)',
                            border: '1.5px solid var(--border)',
                            borderRadius: 'var(--radius-lg)',
                            overflow: 'hidden',
                        }}>
                            {/* Card header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '14px 16px',
                                borderBottom: '1px solid var(--border)',
                            }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: cfg.color,
                                    boxShadow: device.status === 'connected' ? `0 0 6px ${cfg.color}` : 'none',
                                    flexShrink: 0,
                                }} />
                                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{device.name}</span>
                                <span style={{
                                    background: cfg.bg, color: cfg.color,
                                    borderRadius: 20, padding: '3px 10px',
                                    fontSize: 11, fontWeight: 600,
                                }}>
                                    {cfg.label}
                                </span>
                                <button
                                    onClick={() => handleDelete(device)}
                                    style={{ color: 'var(--txt3)', marginLeft: 4, padding: '2px 4px', lineHeight: 1 }}
                                    title="Delete device"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                    </svg>
                                </button>
                            </div>

                            {/* Card body */}
                            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace', letterSpacing: '.3px' }}>
                                    {device.sessionId}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt2)' }}>
                                    <span>Status:</span>
                                    <span style={{ color: cfg.color, display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            {device.status === 'connected'
                                                ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                                                : <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>}
                                        </svg>
                                        {cfg.label}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--txt2)' }}>
                                    <span>Created:</span>
                                    <span>{formatDate(device.createdAt)}</span>
                                </div>
                                {device.status !== 'connected' && (
                                    <button
                                        className="btn btn-primary"
                                        style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                        onClick={() => openQR(device)}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
                                            <rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="2" height="2" rx=".5"/>
                                            <rect x="11" y="3" width="2" height="2" rx=".5"/><rect x="11" y="11" width="2" height="2" rx=".5"/>
                                            <rect x="3" y="11" width="2" height="2" rx=".5"/>
                                        </svg>
                                        Show QR Code
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Add Device Modal ── */}
            {addOpen && createPortal(
                <div className="modal-overlay" onClick={() => setAddOpen(false)}>
                    <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: 10,
                                background: 'var(--blue-dim)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                            </div>
                            <h2>Add New Device</h2>
                        </div>

                        <form onSubmit={handleAdd} style={{ padding: '0 24px 24px' }}>
                            <div className="form-group">
                                <label>Device Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. My Phone, Work Device"
                                    value={deviceName}
                                    onChange={e => setDeviceName(e.target.value)}
                                    autoFocus
                                    maxLength={60}
                                />
                            </div>

                            {/* ── Pairing method tabs ── */}
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                {[{ id: 'qr', label: '📷  QR Code' }, { id: 'phone', label: '📱  Phone Number' }].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setPairMethod(tab.id)}
                                        style={{
                                            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                            border: `1.5px solid ${pairMethod === tab.id ? 'var(--blue)' : 'var(--border)'}`,
                                            background: pairMethod === tab.id ? 'var(--blue-dim)' : 'transparent',
                                            color: pairMethod === tab.id ? 'var(--blue)' : 'var(--txt2)',
                                            cursor: 'pointer',
                                            transition: 'all .15s',
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {pairMethod === 'qr' && (
                                <p style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16, lineHeight: 1.6 }}>
                                    A QR code will appear. Open WhatsApp → <strong>Settings → Linked Devices → Link a Device</strong> and scan it.
                                </p>
                            )}

                            {pairMethod === 'phone' && (
                                <div className="form-group">
                                    <label>WhatsApp Phone Number</label>
                                    <input
                                        type="tel"
                                        placeholder="Country code + number, e.g. 919876543210"
                                        value={pairPhone}
                                        onChange={e => setPairPhone(e.target.value)}
                                        maxLength={15}
                                    />
                                    <p style={{ fontSize: 11, marginTop: 5, color: 'var(--txt3)', lineHeight: 1.6 }}>
                                        Enter the number linked to the WhatsApp account (with country code, no + or spaces).
                                        You'll get an 8-digit code to enter in WhatsApp.
                                    </p>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={adding || !deviceName.trim() || (pairMethod === 'phone' && !pairPhone.trim())}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {pairMethod === 'qr' ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/>
                                            <rect x="3" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="2" height="2" rx=".5"/>
                                        </svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
                                        </svg>
                                    )}
                                    {adding ? 'Creating…' : pairMethod === 'qr' ? 'Create & Show QR' : 'Create & Get Code'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Pairing Code Modal ── */}
            {codeModal && createPortal(
                <div className="modal-overlay" onClick={() => !codeModal.loading && setCodeModal(null)}>
                    <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                            <h2>Link with Phone Number</h2>
                            <p style={{ fontSize: 12 }}>Enter this code in WhatsApp to connect</p>
                        </div>
                        <div style={{ padding: '8px 24px 28px' }}>
                            {codeModal.loading ? (
                                <div style={{ padding: '30px 0' }}>
                                    <div className="splash-spinner" style={{ width: 32, height: 32, margin: '0 auto 14px' }} />
                                    <p style={{ fontSize: 13 }}>Requesting pairing code…</p>
                                    <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 6 }}>This may take up to 20 seconds</p>
                                </div>
                            ) : codeModal.error ? (
                                <div style={{ padding: '20px 0' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.5"
                                        style={{ margin: '0 auto 14px', display: 'block' }}>
                                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                    <p style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 8 }}>Failed to get code</p>
                                    <p style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 20 }}>{codeModal.error}</p>
                                    <button className="btn btn-ghost" onClick={() => setCodeModal(null)}>Close</button>
                                </div>
                            ) : (
                                <>
                                    <div style={{
                                        background: 'var(--bg3)', border: '1.5px solid var(--border)',
                                        borderRadius: 14, padding: '20px 28px', margin: '12px 0 20px',
                                        display: 'inline-block',
                                    }}>
                                        <span style={{
                                            fontSize: 36, fontWeight: 800, letterSpacing: 6,
                                            fontFamily: 'monospace', color: 'var(--blue)',
                                        }}>
                                            {codeModal.code}
                                        </span>
                                    </div>
                                    <ol style={{ textAlign: 'left', fontSize: 13, lineHeight: 2, color: 'var(--txt2)', paddingLeft: 20, marginBottom: 20 }}>
                                        <li>Open <strong>WhatsApp</strong> on your phone</li>
                                        <li>Go to <strong>Settings → Linked Devices</strong></li>
                                        <li>Tap <strong>Link a Device</strong></li>
                                        <li>Tap <strong>"Link with phone number"</strong></li>
                                        <li>Enter the code above</li>
                                    </ol>
                                    <button className="btn btn-primary" onClick={() => { setCodeModal(null); load(); }}>Done</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── QR Code Modal ── */}
            {qrModal && createPortal(
                <div className="modal-overlay" onClick={closeQR}>
                    <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                            <h2>Scan to Connect</h2>
                            <p style={{ fontSize: 12 }}>
                                Open WhatsApp → Settings → Linked Devices → Link a Device
                            </p>
                        </div>

                        <div style={{ padding: '8px 24px 24px' }}>
                            {qrModal.connected ? (
                                <div style={{ padding: '30px 0' }}>
                                    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5"
                                        style={{ margin: '0 auto 14px', display: 'block' }}>
                                        <circle cx="12" cy="12" r="10"/>
                                        <polyline points="9 12 11 14 15 10"/>
                                    </svg>
                                    <h2 style={{ color: 'var(--green)' }}>Device Connected!</h2>
                                    <p style={{ marginTop: 8, fontSize: 13 }}>
                                        {qrModal.device.name} is now linked to WhatsApp.
                                    </p>
                                    <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={closeQR}>
                                        Done
                                    </button>
                                </div>
                            ) : qrModal.qrDataUrl ? (
                                <>
                                    <div style={{
                                        background: '#fff',
                                        borderRadius: 12,
                                        padding: 12,
                                        display: 'inline-block',
                                        marginBottom: 14,
                                    }}>
                                        <img src={qrModal.qrDataUrl} alt="QR Code" style={{ width: 260, height: 260, display: 'block' }} />
                                    </div>
                                    <p style={{ fontSize: 12, color: 'var(--txt3)' }}>
                                        QR code refreshes automatically. Waiting for scan…
                                    </p>
                                    <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={closeQR}>
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <div style={{ padding: '30px 0' }}>
                                    <div className="splash-spinner" style={{ width: 32, height: 32, margin: '0 auto 14px' }} />
                                    <p style={{ fontSize: 13 }}>Generating QR Code…</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
