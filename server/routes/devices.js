'use strict';
const router        = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const QRCode        = require('qrcode');
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const { getLicenseData } = require('../license');

// ── GET / — list all devices ──────────────────────────────────────────────────
router.get('/', async (_req, res) => {
    try {
        res.json(await storage.getDevices());
    } catch (err) {
        console.error('[Devices] GET / error:', err);
        res.status(500).json({ error: 'Failed to load devices.' });
    }
});

// ── POST / — add a new device ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Device name is required' });

        const devices = await storage.getDevices();

        // Read device limit from locally-cached license file (saved by /api/license/status
        // and /api/license/activate).  No extra network call needed — requireLicense already
        // validated the license moments earlier in this same request cycle.
        const licData   = getLicenseData();
        const deviceLimit = licData?.deviceLimit ?? 3;

        if (devices.length >= deviceLimit)
            return res.status(400).json({ error: `Device limit reached (${deviceLimit} devices on your plan)` });

        const device = {
            id:        uuidv4(),
            name:      name.trim(),
            sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            status:    'qr_pending',
            createdAt: new Date().toISOString(),
        };
        devices.push(device);
        await storage.saveDevices(devices);

        // Init WA session in next tick — response is sent first so the
        // frontend never waits on the Baileys startup (version fetch etc.)
        setImmediate(() => {
            try { deviceManager.init(device.id); } catch (ie) {
                console.error('[Devices] deviceManager.init error (non-fatal):', ie.message);
            }
        });

        res.status(201).json(device);
    } catch (err) {
        console.error('[Devices] POST error:', err);
        res.status(500).json({ error: 'Failed to create device. Please try again.' });
    }
});

// ── GET /:id/qr — fetch QR code for a device ─────────────────────────────────
router.get('/:id/qr', async (req, res) => {
    try {
        const devices = await storage.getDevices();
        const device  = devices.find(d => d.id === req.params.id);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        // Ensure a WA instance exists (idempotent when already running)
        if (!deviceManager.get(device.id)) {
            try { deviceManager.init(device.id); } catch (ie) {
                console.error('[Devices] deviceManager.init error in /qr:', ie.message);
            }
        }

        const inst = deviceManager.get(device.id);
        const qr   = inst ? inst.getQR() : null;

        if (!qr) {
            // Safe null-check: use optional chaining on both getStatus() AND .status
            const instStatus = inst?.getStatus()?.status || device.status;
            if (instStatus === 'ready') {
                device.status = 'connected';
                await storage.saveDevices(devices);
                return res.json({ status: 'connected', qrDataUrl: null });
            }
            return res.json({ status: device.status, qrDataUrl: null });
        }

        const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        res.json({ status: device.status, qrDataUrl: dataUrl });
    } catch (err) {
        console.error('[Devices] GET /qr error:', err);
        res.status(500).json({ error: 'Failed to fetch QR code. Please try again.' });
    }
});

// ── POST /:id/pairing-code — get pairing code (alternative to QR) ────────────
router.post('/:id/pairing-code', async (req, res) => {
    try {
        const { phone } = req.body;
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits || digits.length < 7)
            return res.status(400).json({ error: 'Enter phone number with country code (e.g. 919876543210)' });

        const devices = await storage.getDevices();
        const device  = devices.find(d => d.id === req.params.id);
        if (!device) return res.status(404).json({ error: 'Device not found' });

        if (!deviceManager.get(device.id)) {
            try { deviceManager.init(device.id); } catch (ie) {
                console.error('[Devices] deviceManager.init error in /pairing-code:', ie.message);
            }
        }

        const code = await deviceManager.requestPairingCode(device.id, digits);
        res.json({ code });
    } catch (err) {
        console.error('[Devices] POST /pairing-code error:', err);
        res.status(500).json({ error: err.message || 'Failed to request pairing code. Try again.' });
    }
});

// ── DELETE /:id — remove a device ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const devices = await storage.getDevices();
        const idx     = devices.findIndex(d => d.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Device not found' });

        await deviceManager.remove(req.params.id);
        devices.splice(idx, 1);
        await storage.saveDevices(devices);
        res.json({ success: true });
    } catch (err) {
        console.error('[Devices] DELETE error:', err);
        res.status(500).json({ error: 'Failed to remove device. Please try again.' });
    }
});

module.exports = router;
