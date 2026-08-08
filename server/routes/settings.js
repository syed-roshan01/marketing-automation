'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const { v4: uuidv4 } = require('uuid');
const { getState: dailyState, getTodayCount } = require('../utils/dailyStats');
const { DATA_ROOT, LICENSE_FILE } = require('../constants');
const fsSync  = require('fs');
const fsp     = require('fs').promises;
const pathMod = require('path');
const AUTH_BASE = pathMod.join(DATA_ROOT, 'auth_info');

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
    res.json(await storage.getSettings());
});

router.put('/settings', async (req, res) => {
    const current = await storage.getSettings();
    const updated = { ...current, ...req.body };
    if (updated.minDelay < 20) updated.minDelay = 20;
    if (updated.maxDelay < updated.minDelay)       updated.maxDelay = updated.minDelay + 5;
    if (updated.batchSize < 1)                     updated.batchSize = 1;
    if (updated.batchPauseMin < 30)                updated.batchPauseMin = 30;
    if (updated.batchPauseMax < updated.batchPauseMin) updated.batchPauseMax = updated.batchPauseMin + 60;
    if (updated.dailyLimit < 1)                    updated.dailyLimit = 1;
    if (updated.typingMin < 1)                     updated.typingMin = 1;
    if (updated.typingMax < updated.typingMin)     updated.typingMax = updated.typingMin + 2;
    if (updated.startDelayMin < 0)  updated.startDelayMin = 0;
    if (updated.startDelayMax < updated.startDelayMin) updated.startDelayMax = updated.startDelayMin + 5;
    // When auto warmup is first enabled, record the start date
    if (updated.autoWarmupEnabled && !updated.warmupStartedAt) {
        updated.warmupStartedAt = new Date().toISOString();
    }
    if (!updated.autoWarmupEnabled) updated.warmupStartedAt = null;
    await storage.saveSettings(updated);
    res.json(updated);
});

// ─── Daily Stats ──────────────────────────────────────────────────────────────

router.get('/daily-stats', (_req, res) => {
    const s = dailyState();
    res.json({ date: s.date || new Date().toISOString().slice(0, 10), count: getTodayCount() });
});

// ─── Hook Numbers ─────────────────────────────────────────────────────────────

router.get('/hook-numbers', async (_req, res) => {
    res.json(await storage.getHookNumbers());
});

router.put('/hook-numbers', async (req, res) => {
    const hooks = Array.isArray(req.body) ? req.body : [];
    const clean = hooks.map(h => ({
        id:      h.id || uuidv4(),
        number:  String(h.number || '').replace(/\D/g, ''),
        label:   String(h.label  || '').slice(0, 60),
        enabled: h.enabled !== false,
    })).filter(h => h.number.length >= 7);
    await storage.saveHookNumbers(clean);
    res.json(clean);
});

// ─── Data Management — reset all ──────────────────────────────────────────────
router.post('/data-management/reset', async (_req, res) => {
    try {
        await Promise.all([
            storage.saveContacts([]),     storage.saveTemplates([]),
            storage.saveCampaigns([]),    storage.saveGroups([]),
            storage.saveOptoutRecords([]), storage.saveAutoReplyRules([]),
            storage.saveChatbotFlows([]), storage.saveHookNumbers([]),
            storage.saveAutoReplyLog({}), storage.saveChatbotLog({}),
            storage.saveLiveChats([]),
        ]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Support Fix — open app data folder ───────────────────────────────────────
router.post('/open-app-data', (_req, res) => {
    try {
        const { shell } = require('electron');
        shell.openPath(DATA_ROOT)
            .then(() => res.json({ ok: true, path: DATA_ROOT }))
            .catch(() => res.json({ ok: false, path: DATA_ROOT }));
    } catch (_) {
        res.json({ ok: false, path: DATA_ROOT });
    }
});

// ─── Support Fix — individual data slice deletes ──────────────────────────────
router.post('/data-management/delete/whatsapp-sessions', async (_req, res) => {
    try {
        const dm = require('../../src/deviceManager');
        dm.teardownAll();
        if (fsSync.existsSync(AUTH_BASE)) {
            const entries = await fsp.readdir(AUTH_BASE, { withFileTypes: true });
            await Promise.all(
                entries.filter(e => e.isDirectory())
                       .map(e => fsp.rm(pathMod.join(AUTH_BASE, e.name), { recursive: true, force: true }))
            );
        }
        const devices = await storage.getDevices();
        devices.forEach(d => { d.status = 'disconnected'; });
        await storage.saveDevices(devices);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/contacts',      async (_req, res) => {
    try { await storage.saveContacts([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/templates',     async (_req, res) => {
    try { await storage.saveTemplates([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/campaigns',     async (_req, res) => {
    try { await storage.saveCampaigns([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/chatbot-flows', async (_req, res) => {
    try {
        await Promise.all([storage.saveChatbotFlows([]), storage.saveChatbotLog({})]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/auto-reply',    async (_req, res) => {
    try {
        await Promise.all([storage.saveAutoReplyRules([]), storage.saveAutoReplyLog({})]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/groups',        async (_req, res) => {
    try { await storage.saveGroups([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/optout',        async (_req, res) => {
    try { await storage.saveOptoutRecords([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/live-chat',     async (_req, res) => {
    try { await storage.saveLiveChats([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/trust-builder', async (_req, res) => {
    try { await storage.saveTrustBuilderSessions([]); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/data-management/delete/license',       async (_req, res) => {
    try {
        if (fsSync.existsSync(LICENSE_FILE)) fsSync.unlinkSync(LICENSE_FILE);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
