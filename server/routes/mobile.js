'use strict';
const router  = require('express').Router();
const os      = require('os');
const QRCode  = require('qrcode');

const PORT = process.env.PORT || 3000;

// ── Tunnel state ──────────────────────────────────────────────────────────────
let _tunnelStop   = null;
let _tunnelUrl    = null;
let _tunnelStatus = 'stopped'; // 'stopped' | 'starting' | 'running' | 'error'
let _tunnelError  = null;
let _tunnelMethod = 'cloudflare'; // 'cloudflare' | 'ngrok'
let _altTunnelUrl = null; // URL from alternative tunnel service

function getLocalIP() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

// GET /api/mobile/local
router.get('/local', async (_req, res) => {
    const url = `http://${getLocalIP()}:${PORT}`;
    const qr  = await QRCode.toDataURL(url, { width: 260, margin: 2 });
    res.json({ url, qr });
});

// GET /api/mobile/tunnel/status
router.get('/tunnel/status', async (_req, res) => {
    const payload = { 
        status: _tunnelStatus, 
        url: _tunnelUrl, 
        error: _tunnelError,
        method: _tunnelMethod,
        altUrl: _altTunnelUrl,
    };
    if (_tunnelStatus === 'running' && _tunnelUrl) {
        payload.qr = await QRCode.toDataURL(_tunnelUrl, { width: 260, margin: 2 });
    }
    if (_altTunnelUrl) {
        payload.altQr = await QRCode.toDataURL(_altTunnelUrl, { width: 260, margin: 2 });
    }
    res.json(payload);
});

// POST /api/mobile/tunnel/switch
// Switch between cloudflare and ngrok
router.post('/tunnel/switch', async (req, res) => {
    const { method } = req.body; // 'cloudflare' | 'ngrok'
    
    if (!['cloudflare', 'ngrok'].includes(method)) {
        return res.status(400).json({ error: 'Invalid method' });
    }
    
    if (method === _tunnelMethod) {
        return res.json({ success: true, message: `Already using ${method}` });
    }
    
    // Stop current tunnel and switch
    if (_tunnelStop) { 
        try { _tunnelStop(); } catch (_) {} 
        _tunnelStop = null; 
    }
    
    _tunnelMethod = method;
    _tunnelUrl = _altTunnelUrl || null;
    _altTunnelUrl = null;
    _tunnelStatus = 'stopped';
    _tunnelError = null;
    
    // Auto-start with new method
    startTunnel(method);
    res.json({ success: true, switching: true });
});

// ── Cloudflare tunnel startup ─────────────────────────────────────────────────
async function startCloudflare() {
    try {
        const fs = require('fs');
        const cloudflaredBin = process.env.CLOUDFLARED_BIN;
        
        if (cloudflaredBin && !fs.existsSync(cloudflaredBin)) {
            throw new Error(`cloudflared binary not found at: ${cloudflaredBin}`);
        }

        const { Tunnel } = require('cloudflared');
        const t = Tunnel.quick(`http://localhost:${PORT}`);

        _tunnelStop = () => { try { t.stop(); } catch (_) {} };

        t.on('url', (url) => {
            _tunnelUrl    = url;
            _tunnelStatus = 'running';
            _tunnelMethod = 'cloudflare';
            console.log('[Mobile] Cloudflare tunnel running:', url);
        });

        t.on('error', (err) => {
            if (_tunnelStatus !== 'stopped') {
                _tunnelStatus = 'error';
                _tunnelError  = `Cloudflare: ${err.message || 'Tunnel error'}`;
            }
            _tunnelStop = null;
            console.error('[Mobile] Cloudflare error:', err.message);
            // Auto-fallback to ngrok on cloudflare error
            fallbackToNgrok();
        });

        t.on('exit', (code) => {
            if (_tunnelStatus !== 'stopped') {
                _tunnelStatus = 'error';
                _tunnelError  = `Cloudflare process exited (code ${code})`;
            }
            _tunnelStop = null;
            fallbackToNgrok();
        });

    } catch (err) {
        _tunnelStatus = 'error';
        _tunnelError  = `Cloudflare: ${err.message}`;
        console.error('[Mobile] Cloudflare startup error:', err.message);
        fallbackToNgrok();
    }
}

// ── Ngrok tunnel startup ──────────────────────────────────────────────────────
async function startNgrok() {
    try {
        const ngrok = await import('@ngrok/ngrok');
        const listener = await ngrok.default.connect({
            addr: PORT,
            onStatusChange: (status) => {
                console.log(`[Mobile] ngrok status: ${status}`);
            },
        });

        const publicUrl = listener.url();
        _tunnelUrl = publicUrl;
        _tunnelStatus = 'running';
        _tunnelMethod = 'ngrok';
        
        _tunnelStop = async () => {
            try { 
                await listener.close(); 
            } catch (_) {} 
        };

        console.log('[Mobile] ngrok tunnel running:', publicUrl);

    } catch (err) {
        _tunnelStatus = 'error';
        _tunnelError  = `ngrok: ${err.message}`;
        console.error('[Mobile] ngrok startup error:', err.message);
    }
}

// ── Fallback logic ─────────────────────────────────────────────────────────────
async function fallbackToNgrok() {
    if (_tunnelMethod === 'cloudflare' && !_altTunnelUrl) {
        console.log('[Mobile] Cloudflare failed, trying ngrok as alternative...');
        try {
            const ngrok = await import('@ngrok/ngrok');
            const listener = await ngrok.default.connect({ addr: PORT });
            _altTunnelUrl = listener.url();
            console.log('[Mobile] Alternative ngrok URL available:', _altTunnelUrl);
        } catch (err) {
            console.error('[Mobile] ngrok fallback also failed:', err.message);
        }
    }
}

// ── Generic tunnel starter ────────────────────────────────────────────────────
function startTunnel(method) {
    if (method === 'ngrok') {
        startNgrok();
    } else {
        startCloudflare();
    }
}

// POST /api/mobile/tunnel/start
router.post('/tunnel/start', async (_req, res) => {
    if (_tunnelStatus === 'running' && _tunnelUrl) {
        const qr = await QRCode.toDataURL(_tunnelUrl, { width: 260, margin: 2 });
        return res.json({ 
            status: 'running', 
            url: _tunnelUrl, 
            method: _tunnelMethod,
            altUrl: _altTunnelUrl,
            qr 
        });
    }
    if (_tunnelStatus === 'starting') {
        return res.json({ status: 'starting', url: null });
    }

    _tunnelStatus = 'starting';
    _tunnelUrl    = null;
    _tunnelError  = null;

    // Respond immediately so the UI can poll for status
    res.json({ status: 'starting', url: null });

    // Start with the preferred method
    startTunnel(_tunnelMethod);
});

// POST /api/mobile/tunnel/stop
router.post('/tunnel/stop', (_req, res) => {
    if (_tunnelStop) { 
        try { _tunnelStop(); } catch (_) {} 
        _tunnelStop = null; 
    }
    _tunnelUrl    = null;
    _altTunnelUrl = null;
    _tunnelStatus = 'stopped';
    _tunnelError  = null;
    res.json({ success: true });
});

module.exports = router;
