import { useState, useEffect, useCallback } from 'react';

const POLL_MS = 2500;

export default function MobileModal({ onClose }) {
    const [tab, setTab] = useState('wifi'); // 'wifi' | 'data'

    // ── WiFi tab state ────────────────────────────────────────────────────────
    const [wifiData, setWifiData] = useState(null);
    const [wifiLoading, setWifiLoading] = useState(false);

    // ── Tunnel tab state ──────────────────────────────────────────────────────
    const [tunnelStatus, setTunnelStatus] = useState('stopped'); // stopped|starting|running|error
    const [tunnelUrl, setTunnelUrl]       = useState(null);
    const [tunnelQr, setTunnelQr]         = useState(null);
    const [tunnelErr, setTunnelErr]       = useState(null);
    const [copied, setCopied]             = useState(false);
    const [wifiCopied, setWifiCopied]     = useState(false);

    // ── Load local URL when WiFi tab opens ────────────────────────────────────
    useEffect(() => {
        if (tab !== 'wifi' || wifiData) return;
        setWifiLoading(true);
        fetch('/api/mobile/local')
            .then(r => r.json())
            .then(d => { setWifiData(d); setWifiLoading(false); })
            .catch(() => setWifiLoading(false));
    }, [tab, wifiData]);

    // ── Poll tunnel status while starting or running ──────────────────────────
    const pollTunnel = useCallback(async () => {
        try {
            const d = await fetch('/api/mobile/tunnel/status').then(r => r.json());
            setTunnelStatus(d.status);
            setTunnelUrl(d.url   || null);
            setTunnelQr(d.qr    || null);
            setTunnelErr(d.error || null);
        } catch (_) {}
    }, []);

    useEffect(() => {
        if (tab !== 'data') return;
        pollTunnel();
        const id = setInterval(() => {
            if (tunnelStatus === 'starting') pollTunnel();
        }, POLL_MS);
        return () => clearInterval(id);
    }, [tab, tunnelStatus, pollTunnel]);

    const startTunnel = async () => {
        setTunnelStatus('starting');
        setTunnelErr(null);
        await fetch('/api/mobile/tunnel/start', { method: 'POST' });
        // Start polling
        const id = setInterval(async () => {
            const d = await fetch('/api/mobile/tunnel/status').then(r => r.json());
            setTunnelStatus(d.status);
            setTunnelUrl(d.url   || null);
            setTunnelQr(d.qr    || null);
            setTunnelErr(d.error || null);
            if (d.status !== 'starting') clearInterval(id);
        }, POLL_MS);
    };

    const stopTunnel = async () => {
        await fetch('/api/mobile/tunnel/stop', { method: 'POST' });
        setTunnelStatus('stopped');
        setTunnelUrl(null);
        setTunnelQr(null);
        setTunnelErr(null);
    };

    const copy = (text, which) => {
        navigator.clipboard?.writeText(text).catch(() => {});
        if (which === 'wifi') { setWifiCopied(true); setTimeout(() => setWifiCopied(false), 2000); }
        else                  { setCopied(true);     setTimeout(() => setCopied(false),     2000); }
    };

    return (
        <div className="mobile-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="mobile-modal">
                {/* Header */}
                <div className="mobile-modal-header">
                    <div className="mobile-modal-title">
                        <span className="mobile-modal-icon">📱</span>
                        <span>Open on Mobile</span>
                    </div>
                    <button className="mobile-modal-close" onClick={onClose}>✕</button>
                </div>

                {/* Tabs */}
                <div className="mobile-modal-tabs">
                    <button
                        className={`mobile-tab ${tab === 'wifi' ? 'active' : ''}`}
                        onClick={() => setTab('wifi')}
                    >
                        <span className="mobile-tab-icon">📶</span>
                        <div>
                            <div className="mobile-tab-title">Same WiFi</div>
                            <div className="mobile-tab-sub">Phone &amp; laptop on same network</div>
                        </div>
                    </button>
                    <button
                        className={`mobile-tab ${tab === 'data' ? 'active' : ''}`}
                        onClick={() => setTab('data')}
                    >
                        <span className="mobile-tab-icon">🌐</span>
                        <div>
                            <div className="mobile-tab-title">Mobile Data</div>
                            <div className="mobile-tab-sub">Access from anywhere via Cloudflare</div>
                        </div>
                    </button>
                </div>

                {/* Content */}
                <div className="mobile-modal-body">
                    {/* ── WiFi Tab ── */}
                    {tab === 'wifi' && (
                        wifiLoading ? (
                            <div className="mobile-loading">
                                <div className="mobile-spinner" />
                                <span>Detecting local IP…</span>
                            </div>
                        ) : wifiData ? (
                            <div className="mobile-content">
                                <div className="mobile-instructions">
                                    <span className="mobile-step">1</span> Make sure your phone is on the <strong>same WiFi</strong> as this laptop
                                </div>
                                <div className="mobile-instructions">
                                    <span className="mobile-step">2</span> Scan the QR code or open the URL in your phone browser
                                </div>
                                <div className="mobile-qr-wrap">
                                    <img src={wifiData.qr} alt="QR Code" className="mobile-qr" />
                                </div>
                                <div className="mobile-url-row">
                                    <span className="mobile-url-text">{wifiData.url}</span>
                                    <button
                                        className="mobile-copy-btn"
                                        onClick={() => copy(wifiData.url, 'wifi')}
                                    >
                                        {wifiCopied ? '✓ Copied' : 'Copy'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mobile-loading"><span>Could not detect local IP.</span></div>
                        )
                    )}

                    {/* ── Mobile Data Tab ── */}
                    {tab === 'data' && (
                        <div className="mobile-content">
                            {tunnelStatus === 'stopped' && (
                                <>
                                    <div className="mobile-instructions">
                                        <span className="mobile-step">1</span> Click <strong>Start Tunnel</strong> — a secure Cloudflare URL will be generated
                                    </div>
                                    <div className="mobile-instructions">
                                        <span className="mobile-step">2</span> Scan the QR or open the URL on <strong>any device, anywhere</strong>
                                    </div>
                                    <div className="mobile-instructions">
                                        <span className="mobile-step">3</span> Stop the tunnel when done to keep things secure
                                    </div>
                                    <button className="mobile-start-btn" onClick={startTunnel}>
                                        🚀 Start Tunnel
                                    </button>
                                </>
                            )}

                            {tunnelStatus === 'starting' && (
                                <div className="mobile-loading">
                                    <div className="mobile-spinner" />
                                    <span>Starting Cloudflare tunnel… (this takes ~10 seconds)</span>
                                </div>
                            )}

                            {tunnelStatus === 'running' && tunnelUrl && (
                                <>
                                    <div className="mobile-tunnel-badge">
                                        <span className="mobile-tunnel-dot" /> Tunnel Active
                                    </div>
                                    <div className="mobile-qr-wrap">
                                        {tunnelQr && <img src={tunnelQr} alt="QR Code" className="mobile-qr" />}
                                    </div>
                                    <div className="mobile-url-row">
                                        <span className="mobile-url-text">{tunnelUrl}</span>
                                        <button
                                            className="mobile-copy-btn"
                                            onClick={() => copy(tunnelUrl, 'tunnel')}
                                        >
                                            {copied ? '✓ Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <button className="mobile-stop-btn" onClick={stopTunnel}>
                                        ⏹ Stop Tunnel
                                    </button>
                                </>
                            )}

                            {tunnelStatus === 'error' && (
                                <div className="mobile-error">
                                    <div>❌ Failed to start tunnel</div>
                                    {tunnelErr && <div className="mobile-error-msg">{tunnelErr}</div>}
                                    <button className="mobile-start-btn" onClick={startTunnel} style={{ marginTop: 16 }}>
                                        Retry
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
