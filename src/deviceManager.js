const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const WhatsAppManager = require('./whatsapp');
const storage = require('./storage');

const AUTH_BASE = process.env.ZYQORA_DATA
    ? require('path').join(process.env.ZYQORA_DATA, 'auth_info')
    : path.join(__dirname, '..', 'data', 'auth_info');

class DeviceManager extends EventEmitter {
    constructor() {
        super();
        this._instances = new Map(); // deviceId → WhatsAppManager
    }

    // Returns the WhatsAppManager instance for a device, or null
    get(deviceId) {
        return this._instances.get(deviceId) || null;
    }

    // Returns the first instance that is 'ready', or null
    getFirstReady() {
        for (const inst of this._instances.values()) {
            if (inst.isReady()) return inst;
        }
        return null;
    }

    // Create and start a WA instance for a device (idempotent — returns existing if already created)
    init(deviceId) {
        if (this._instances.has(deviceId)) return this._instances.get(deviceId);

        const authDir = path.join(AUTH_BASE, deviceId);
        const inst = new WhatsAppManager(authDir);

        // Store immediately so deviceManager.get() works before async init finishes
        this._instances.set(deviceId, inst);

        // Forward per-device events upward
        inst.on('qr', () => this.emit('device_qr', deviceId));
        inst.on('ready', () => this.emit('device_ready', deviceId));
        inst.on('disconnected', (reason) => {
            if (reason === 'logged_out') {
                // Credentials wiped by whatsapp.js — remove instance so next init() is fresh
                this._instances.delete(deviceId);
                // Persist the "needs re-scan" state so UI reflects it immediately
                storage.getDevices().then(devices => {
                    const d = devices.find(x => x.id === deviceId);
                    if (d) { d.status = 'disconnected'; storage.saveDevices(devices).catch(() => {}); }
                }).catch(() => {});
            }
            this.emit('device_disconnected', deviceId, reason);
        });
        inst.on('optout_keyword', (payload) => this.emit('optout_keyword', { ...payload, deviceId }));
        inst.on('incoming_message', (payload) => this.emit('incoming_message', { ...payload, deviceId }));
        // Fast-path incoming message event forwarded for instant-send flows
        inst.on('incoming_message_quick', (payload) => this.emit('incoming_message_quick', { ...payload, deviceId }));

        inst.initialize();
        return inst;
    }

    // Request a WhatsApp pairing code for a device (alternative to QR scan).
    // Waits for the device to reach 'qr' status — that means the WS is open AND
    // the Noise Protocol handshake is complete — then calls requestPairingCode.
    async requestPairingCode(deviceId, phone) {
        let inst = this._instances.get(deviceId);
        if (!inst) throw new Error('Device not initialised');

        const deadline = Date.now() + 35_000;

        // Wait for 'qr' status: WS open + noise handshake done + awaiting auth.
        // This is the exact window Baileys requires for requestPairingCode.
        while (Date.now() < deadline) {
            if (inst.status === 'qr') break;
            if (inst.status === 'ready') throw new Error('Device is already connected');
            await new Promise(r => setTimeout(r, 400));
        }

        if (inst.status !== 'qr') throw new Error('WhatsApp not ready — try again in a moment');

        return inst.requestPairingCode(phone);
    }

    // Stop a device, clean up its auth data, remove from map
    async remove(deviceId) {
        const inst = this._instances.get(deviceId);
        if (inst) {
            try { await inst.logout(); } catch (_) {}
            this._instances.delete(deviceId);
        }
        // Always clean up auth dir so a re-added device starts fresh
        const authDir = path.join(AUTH_BASE, deviceId);
        try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
    }

    // Forcefully close all active WA sockets and clear the instances map.
    // Used by the Support Fix "Delete WhatsApp Sessions" feature.
    teardownAll() {
        for (const inst of this._instances.values()) {
            try {
                if (inst._reconnectTimer) { clearTimeout(inst._reconnectTimer); inst._reconnectTimer = null; }
                // Remove all listeners to prevent stale event handlers from firing
                inst.removeAllListeners();
                if (inst.sock?.ws) { try { inst.sock.ws.close(); } catch (_) {} }
                if (inst.sock)     { try { inst.sock.end(undefined); } catch (_) {} }
                inst.sock       = null;
                inst._initLock  = false;
                inst.status     = 'disconnected';
            } catch (_) {}
        }
        this._instances.clear();
    }

    // Called on server startup — re-initializes any device that has saved credentials
    async initSavedDevices() {
        const devices = await storage.getDevices();
        if (!devices.length) return;

        // Mark all as disconnected initially; events will update them when they reconnect
        let changed = false;
        for (const d of devices) {
            if (d.status === 'connected') { d.status = 'disconnected'; changed = true; }
        }
        if (changed) await storage.saveDevices(devices);

        for (const device of devices) {
            const authDir = path.join(AUTH_BASE, device.id);
            const hasCreds = fs.existsSync(authDir) &&
                fs.readdirSync(authDir).some(f => !f.startsWith('.'));
            if (hasCreds) {
                console.log(`[DeviceManager] Restoring session for: ${device.name}`);
                this.init(device.id);
            }
        }
    }
}

module.exports = new DeviceManager();
