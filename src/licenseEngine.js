'use strict';
/**
 * License Engine — compiled to V8 bytecode before packaging.
 * The secret, key format, and HMAC logic are buried in the bytecode
 * and are NOT visible as plain text in the distributed app.
 *
 * Build step (run once before electron-builder):
 *   npx electron scripts/compile-license.js
 * This produces src/licenseEngine.jsc which is what ships in the ASAR.
 */
const os     = require('os');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ADMIN_PANEL_URL = 'https://zyqora-admin.vercel.app';

// Secret stored as individual char codes — hidden deeper in bytecode
const _c = [90,121,113,36,55,109,75,112,57,120,76,118,50,87,110,66,100,53,116,89,115,54,104,74,102,81,101,49,99,82,56,117,65,111,86,122,51,84,71,119];
const LICENSE_SECRET = _c.map(n => String.fromCharCode(n)).join('');

function getMachineId(idFile) {
    // If a persistence file path is given, read from it for stability across restarts.
    // On first run the file won't exist yet — we compute, save, and return the same value forever.
    if (idFile) {
        try {
            if (fs.existsSync(idFile)) {
                const stored = fs.readFileSync(idFile, 'utf8').trim().toUpperCase();
                if (stored && stored.length === 16 && /^[0-9A-F]+$/.test(stored)) return stored;
            }
        } catch (_) {}
    }
    // Compute from hardware fingerprint
    const nets = os.networkInterfaces();
    let mac = '';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                mac = net.mac; break;
            }
        }
        if (mac) break;
    }
    const raw = `${os.hostname()}|${mac}|${(os.cpus()[0]?.model || '')}`;
    const id = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
    // Persist so all future calls return the same value regardless of NIC order changes
    if (idFile) {
        try {
            const dir = path.dirname(idFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(idFile, id);
        } catch (_) {}
    }
    return id;
}

function getLicenseData(licenseFile) {
    try {
        if (fs.existsSync(licenseFile)) return JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
    } catch (_) {}
    return null;
}

function saveLicenseData(licenseFile, data) {
    const dir = path.dirname(licenseFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2));
}

async function validateOnline(key, machineId) {
    try {
        const res = await fetch(`${ADMIN_PANEL_URL}/api/licenses/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, machineId }),
            signal: AbortSignal.timeout(8000),
        });
        return await res.json();
    } catch {
        return null;
    }
}

let _onlineCache = { ts: 0, result: null };
const ONLINE_CACHE_TTL = 5 * 60 * 1000;

async function getCachedOnlineResult(key, machineId) {
    const now = Date.now();
    if (_onlineCache.result && now - _onlineCache.ts < ONLINE_CACHE_TTL) {
        return _onlineCache.result;
    }
    const result = await validateOnline(key, machineId);
    if (result !== null) _onlineCache = { ts: now, result };
    return result;
}

function resetOnlineCache() {
    _onlineCache = { ts: 0, result: null };
}


// Online-only license validation
async function validateLicenseKeyOnline(key, machineId) {
    const result = await validateOnline(key, machineId);
    if (!result || !result.valid) return null;
    return result;
}

async function isLicenseValidOnline(licenseFile) {
    const lic = getLicenseData(licenseFile);
    if (!lic || !lic.key) return false;
    // Use the machineId stored at activation time — it matches the HMAC baked into the key.
    // Fall back to computing fresh (happens only on very first activation attempt).
    const mid = (lic.machineId || '').trim().toUpperCase() || getMachineId();
    const result = await validateOnline(lic.key, mid);
    return !!(result && result.valid);
}

module.exports = {
    getMachineId,
    getLicenseData,
    saveLicenseData,
    validateOnline,
    getCachedOnlineResult,
    resetOnlineCache,
    validateLicenseKeyOnline,
    isLicenseValidOnline,
};
