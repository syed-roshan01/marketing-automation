'use strict';
// Handles incoming optout/optin keyword events from any device
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const socket        = require('../socket');

const _cooldown = new Map();
const OPTOUT_COOLDOWN_MS = 60_000;

deviceManager.on('optout_keyword', async ({ phone, keyword, sock }) => {
    const key  = `${phone}:${keyword}`;
    const last = _cooldown.get(key) || 0;
    if (Date.now() - last < OPTOUT_COOLDOWN_MS) return;
    _cooldown.set(key, Date.now());
    try {
        const type     = keyword === 'UNSUBSCRIBE' ? 'optout' : 'optin';
        const records  = await storage.getOptoutRecords();
        const settings = await storage.getOptoutSettings();
        const entry    = { phone, name: '', type, messageType: 'all', reason: `Keyword: ${keyword}`, date: new Date().toISOString() };
        const idx = records.findIndex(r => r.phone === phone);
        if (idx !== -1) records[idx] = entry; else records.push(entry);
        await storage.saveOptoutRecords(records);
        socket.emit('optout_update', { action: 'upsert', record: entry });
        const replyMsg = type === 'optout' ? settings.unsubscribeMsg : settings.subscribeMsg;
        if (replyMsg && sock) {
            try { await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: replyMsg }); } catch (_) {}
        }
        console.log(`[OptOut] ${phone} sent ${keyword} → ${type}`);
    } catch (err) { console.error('[OptOut] keyword handler error:', err.message); }
});
