import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';

export default function LicenseGate() {
    const { activateLicense, refreshLicense } = useApp();
    const [machineId, setMachineId]   = useState('');
    const [key, setKey]               = useState('');
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState('');
    const [copied, setCopied]         = useState(false);
    const [showKeyEntry, setShowKeyEntry] = useState(false);

    useEffect(() => {
        api.getLicenseStatus().then(d => { if (d.machineId) setMachineId(d.machineId); }).catch(() => {});
    }, []);

    function copyMachineId() {
        navigator.clipboard.writeText(machineId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    async function handleActivate(e) {
        e.preventDefault();
        if (!key.trim()) return;
        setLoading(true);
        setError('');
        try {
            await activateLicense(key.trim());
            refreshLicense();
        } catch (err) {
            setError(err.message || 'Invalid license key');
        } finally {
            setLoading(false);
        }
    }

    // Format machine ID nicely: ABCD1234EFGH5678 → ABCD-1234-EFGH-5678
    const displayId = machineId
        ? machineId.match(/.{1,4}/g)?.join('-') ?? machineId
        : '...';

    return (
        <div className="lic-overlay">
            <div className="lic-card">
                {/* Logo */}
                <div className="lic-logo">
                    <img src="/zyqora-logo.png" alt="Zyqora" style={{ height: 36, width: 'auto', maxWidth: 160, display: 'block' }}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
                    />
                    <span style={{ display: 'none', fontWeight: 800, fontSize: 18, color: 'var(--purple)', alignItems: 'center' }}>Zyqora</span>
                </div>

                <h1 className="lic-title">License Required</h1>
                <p className="lic-sub">Activate Zyqora to continue</p>

                {/* Machine ID box */}
                <div className="lic-mid-box">
                    <div className="lic-mid-label">Your Machine ID</div>
                    <div className="lic-id-wrap">
                        <span className="lic-id">{displayId}</span>
                        <button className="lic-copy-btn" onClick={copyMachineId} title="Copy Machine ID">
                            {copied ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            )}
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>

                {/* Instructions */}
                <div className="lic-steps">
                    <p className="lic-steps-title">Instructions:</p>
                    <ol className="lic-steps-list">
                        <li>Copy the Machine ID above</li>
                        <li>Contact your administrator</li>
                        <li>Provide them with this Machine ID</li>
                        <li>They will generate a license key for you</li>
                        <li>Return here and enter the license key</li>
                    </ol>
                </div>

                {/* Key entry toggle */}
                {!showKeyEntry ? (
                    <button className="lic-btn-primary" onClick={() => setShowKeyEntry(true)}>
                        I Have a License Key
                    </button>
                ) : (
                    <form onSubmit={handleActivate} className="lic-form">
                        <input
                            className="lic-input"
                            placeholder="ZYQ-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                            value={key}
                            onChange={e => { setKey(e.target.value.toUpperCase()); setError(''); }}
                            autoFocus
                            spellCheck={false}
                        />
                        {error && <div className="lic-error">{error}</div>}
                        <button className="lic-btn-primary" type="submit" disabled={loading || !key.trim()}>
                            {loading ? 'Activating…' : 'Activate License'}
                        </button>
                        <button type="button" className="lic-btn-ghost" onClick={() => { setShowKeyEntry(false); setError(''); setKey(''); }}>
                            Cancel
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
