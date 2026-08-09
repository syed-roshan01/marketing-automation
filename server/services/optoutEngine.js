'use strict';
// Handles incoming optout/optin keyword events from any device
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const socket        = require('../socket');

const _cooldown = new Map();
const OPTOUT_COOLDOWN_MS = 60_000;

// Legacy direct keyword event (emitted by device instances for exact matches)
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

// New: listen for all incoming messages and match against editable keywords
deviceManager.on('incoming_message', async ({ phone, body, sock }) => {
    try {
        if (!body || !body.trim()) return;
        const settings = await storage.getOptoutSettings();
        const keywords = Array.isArray(settings.keywords) ? settings.keywords : [];
        const bodyUpper = String(body || '').toUpperCase();
        for (const kw of keywords) {
            try {
                if (!kw || !kw.enabled) continue;
                const word = String(kw.word || '').toUpperCase();
                if (!word) continue;
                let matched = false;
                if (kw.match === 'exact') matched = (bodyUpper === word);
                else matched = bodyUpper.includes(word);
                if (!matched) continue;

                const key = `${phone}:${word}`;
                const last = _cooldown.get(key) || 0;
                if (Date.now() - last < OPTOUT_COOLDOWN_MS) break;
                _cooldown.set(key, Date.now());

                const type = (kw.type === 'optout') ? 'optout' : 'optin';
                const records = await storage.getOptoutRecords();
                const entry = { phone, name: '', type, messageType: 'all', reason: `Keyword: ${word}`, date: new Date().toISOString() };
                const idx = records.findIndex(r => r.phone === phone);
                if (idx !== -1) records[idx] = entry; else records.push(entry);
                await storage.saveOptoutRecords(records);
                socket.emit('optout_update', { action: 'upsert', record: entry });
                const replyMsg = type === 'optout' ? settings.unsubscribeMsg : settings.subscribeMsg;
                if (replyMsg && sock) {
                    try { await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: replyMsg }); } catch (_) {}
                }
                console.log(`[OptOut] ${phone} matched keyword ${word} → ${type}`);
                break; // stop after first match
            } catch (e) { /* ignore per-key errors */ }
        }
    } catch (err) { console.error('[OptOut] incoming_message handler error:', err.message); }
});
