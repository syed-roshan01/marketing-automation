'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const { restoreUpload } = require('../utils/upload');

router.get('/download', async (_req, res) => {
    try {
        const [contacts, templates, campaigns, settings, groups, optoutRecords, optoutSettings,
               autoReplyRules, chatbotFlows, hookNumbers] = await Promise.all([
            storage.getContacts(),     storage.getTemplates(),  storage.getCampaigns(),
            storage.getSettings(),     storage.getGroups(),     storage.getOptoutRecords(),
            storage.getOptoutSettings(), storage.getAutoReplyRules(),
            storage.getChatbotFlows(), storage.getHookNumbers(),
        ]);
        const backup = {
            version: require('../../package.json').version || '1.0.0',
            exportedAt: new Date().toISOString(),
            contacts, templates, campaigns, settings, groups,
            optoutRecords, optoutSettings, autoReplyRules, chatbotFlows, hookNumbers,
        };
        const filename = `backup_${new Date().toISOString().slice(0, 10)}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/json');
        res.send(JSON.stringify(backup, null, 2));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/restore', restoreUpload.single('backup'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });
        const data  = JSON.parse(req.file.buffer.toString('utf8'));
        const tasks = [];
        if (Array.isArray(data.contacts))         tasks.push(storage.saveContacts(data.contacts));
        if (Array.isArray(data.templates))        tasks.push(storage.saveTemplates(data.templates));
        if (Array.isArray(data.campaigns))        tasks.push(storage.saveCampaigns(data.campaigns));
        if (data.settings && typeof data.settings === 'object') tasks.push(storage.saveSettings(data.settings));
        if (Array.isArray(data.groups))           tasks.push(storage.saveGroups(data.groups));
        if (Array.isArray(data.optoutRecords))    tasks.push(storage.saveOptoutRecords(data.optoutRecords));
        if (data.optoutSettings)                  tasks.push(storage.saveOptoutSettings(data.optoutSettings));
        if (Array.isArray(data.autoReplyRules))   tasks.push(storage.saveAutoReplyRules(data.autoReplyRules));
        if (Array.isArray(data.chatbotFlows))     tasks.push(storage.saveChatbotFlows(data.chatbotFlows));
        if (Array.isArray(data.hookNumbers))      tasks.push(storage.saveHookNumbers(data.hookNumbers));
        await Promise.all(tasks);
        res.json({ ok: true, restored: tasks.length });
    } catch (err) { res.status(400).json({ error: 'Invalid backup file: ' + err.message }); }
});

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

module.exports = router;
