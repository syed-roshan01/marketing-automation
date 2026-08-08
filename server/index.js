'use strict';
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const QRCode   = require('qrcode');

const storage       = require('../src/storage');
const deviceManager = require('../src/deviceManager');
const socketSingleton = require('./socket');
const requireLicense  = require('./middleware/requireLicense');
const requireFeature  = require('./middleware/requireFeature');

// ── App & server ──────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
socketSingleton.init(io);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Unprotected routes ────────────────────────────────────────────────────────
app.use('/api/license', require('./routes/license'));

// ── License guard for all other /api/* routes ─────────────────────────────────
app.use('/api', requireLicense);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api',              require('./routes/settings'));
app.use('/api/contacts',     require('./routes/contacts'));
app.use('/api/groups',       require('./routes/groups'));
app.use('/api/templates',    require('./routes/templates'));
app.use('/api/campaigns',    require('./routes/campaigns'));
app.use('/api/campaigns',    require('./services/campaignService'));   // send / pause
app.use('/api/devices',      require('./routes/devices'));
app.use('/api/optout',       require('./routes/optout'));
app.use('/api/backup',       require('./routes/backup'));
app.use('/api/send-single',  require('./routes/singleSend'));
// ── Feature-gated routes ──────────────────────────────────────────────────────
app.use('/api/mobile',        requireFeature('mobile'),       require('./routes/mobile'));
app.use('/api/auto-reply',    requireFeature('autoReply'),    require('./routes/autoReply'));
app.use('/api/chatbot-flows', requireFeature('chatbot'),      require('./routes/chatbot'));
app.use('/api/live-chat',     requireFeature('liveChat'),     require('./routes/liveChat'));
app.use('/api/trust-builder', requireFeature('trustBuilder'), require('./routes/trustBuilder'));
app.use('/api/group-grabber', requireFeature('groupGrabber'), require('./routes/groupGrabber'));
app.use('/api/ai-automation', requireFeature('aiAutomation'), require('./routes/aiAutomation'));
app.use('/api/forms',         requireFeature('forms'),        require('./routes/forms'));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Device socket events ──────────────────────────────────────────────────────
// Track which devices have successfully connected in this session.
// Used to gate disconnect notifications (avoids noise during QR scan).
const _everConnected = new Set();

deviceManager.on('device_qr', async (deviceId) => {
    try {
        const inst = deviceManager.get(deviceId);
        const qr   = inst?.getQR();
        if (!qr) return;
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        io.emit('device_qr', { deviceId, qrDataUrl });
    } catch (_) {}
});

deviceManager.on('device_ready', async (deviceId) => {
    try {
        _everConnected.add(deviceId);
        const devices = await storage.getDevices();
        const device  = devices.find(d => d.id === deviceId);
        if (device) { device.status = 'connected'; await storage.saveDevices(devices); }
        io.emit('device_connected', { deviceId });
        io.emit('devices_updated');
    } catch (_) {}
});

deviceManager.on('device_disconnected', async (deviceId) => {
    try {
        const devices = await storage.getDevices();
        const device  = devices.find(d => d.id === deviceId);
        // Always update stored status
        if (device && device.status !== 'disconnected') {
            device.status = 'disconnected';
            await storage.saveDevices(devices);
        }
        // Only notify if this device had successfully connected in this session
        if (_everConnected.has(deviceId)) {
            _everConnected.delete(deviceId);
            const name = device?.name || deviceId;
            io.emit('device_disconnected', { deviceId, deviceName: name });
        }
        io.emit('devices_updated');
    } catch (_) {}
});

// ── Register incoming-message engines (order matters — breaks are internal) ───
require('./services/optoutEngine');
require('./services/autoReplyEngine');
require('./services/chatbotEngine');
require('./services/liveChatEngine');
require('./services/hookEngine');
require('./services/aiAutomationEngine');
require('./services/formEngine');

// ── Campaign Scheduler ────────────────────────────────────────────────────────
// Checks every 30 seconds for campaigns whose scheduledAt has arrived and fires them.
const { startCampaignById } = require('./services/campaignService');
setInterval(async () => {
    try {
        const campaigns = await storage.getCampaigns();
        const now = Date.now();
        const due = campaigns.filter(c =>
            c.status === 'scheduled' &&
            c.scheduledAt &&
            new Date(c.scheduledAt).getTime() <= now
        );
        for (const c of due) {
            startCampaignById(c.id)
                .then(() => console.log(`[Scheduler] Auto-started campaign "${c.name}"`))
                .catch(err => console.warn(`[Scheduler] Could not start campaign "${c.name}": ${err.message}`));
        }
    } catch (err) {
        console.error('[Scheduler] Error:', err.message);
    }
}, 30_000);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`\n  Zyqora WhatsApp Sender`);
    console.log(`  Open: http://localhost:${PORT}\n`);
    // Pre-populate _everConnected for devices that were already connected when server last ran
    try {
        const savedDevices = await storage.getDevices();
        savedDevices.filter(d => d.status === 'connected').forEach(d => _everConnected.add(d.id));
    } catch (_) {}
    deviceManager.initSavedDevices().catch(err => console.error('[DeviceManager] Init error:', err));
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.warn(`[Zyqora] Port ${PORT} already in use — another instance may be running.`);
        // App window will connect to the already-running server on the same port
    } else {
        throw err;
    }
});

module.exports = { app, server, io };
