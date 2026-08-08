'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const storage = require('../../src/storage');

router.get('/', async (_req, res) => {
    res.json(await storage.getAutoReplyRules());
});

router.post('/', async (req, res) => {
    const { name, sessionId, targetType, priority, cooldownMinutes, templateId, response, active, skipOptedOut } = req.body;
    if (!name || !name.trim())    return res.status(400).json({ error: 'Rule name is required' });
    if (!sessionId)               return res.status(400).json({ error: 'WhatsApp session is required' });
    if (!response && !templateId) return res.status(400).json({ error: 'Response message or template is required' });

    const rules = await storage.getAutoReplyRules();
    const rule  = {
        id: crypto.randomUUID(),
        name: name.trim(),
        sessionId,
        targetType:       targetType       || 'all',
        priority:         Number(priority) || 1,
        cooldownMinutes:  Number(cooldownMinutes) || 0,
        templateId:       templateId || null,
        response:         response   || '',
        active:           active !== false,
        skipOptedOut:     skipOptedOut !== false,
        firstContactOnly: true,
        totalResponses:   0,
        createdAt: new Date().toISOString(),
    };
    rules.push(rule);
    await storage.saveAutoReplyRules(rules);
    res.json(rule);
});

router.put('/:id', async (req, res) => {
    const rules = await storage.getAutoReplyRules();
    const idx   = rules.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
    const { name, sessionId, targetType, priority, cooldownMinutes, templateId, response, active, skipOptedOut } = req.body;
    if (!name || !name.trim())    return res.status(400).json({ error: 'Rule name is required' });
    if (!sessionId)               return res.status(400).json({ error: 'WhatsApp session is required' });
    if (!response && !templateId) return res.status(400).json({ error: 'Response message or template is required' });
    rules[idx] = {
        ...rules[idx],
        name: name.trim(), sessionId,
        targetType:      targetType      || 'all',
        priority:        Number(priority) || 1,
        cooldownMinutes: Number(cooldownMinutes) || 0,
        templateId:      templateId || null,
        response:        response   || '',
        active:          active !== false,
        skipOptedOut:    skipOptedOut !== false,
        firstContactOnly: true,
    };
    await storage.saveAutoReplyRules(rules);
    res.json(rules[idx]);
});

router.patch('/:id/toggle', async (req, res) => {
    const rules = await storage.getAutoReplyRules();
    const rule  = rules.find(r => r.id === req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    rule.active = !rule.active;
    await storage.saveAutoReplyRules(rules);
    res.json(rule);
});

router.delete('/:id', async (req, res) => {
    const rules    = await storage.getAutoReplyRules();
    const filtered = rules.filter(r => r.id !== req.params.id);
    if (filtered.length === rules.length) return res.status(404).json({ error: 'Rule not found' });
    await storage.saveAutoReplyRules(filtered);
    res.json({ ok: true });
});

module.exports = router;
