'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const storage = require('../../src/storage');
const { invalidateFlowsCache } = require('../services/chatbotEngine');
const { cbAttachUpload } = require('../utils/upload');

router.get('/', async (_req, res) => {
    res.json(await storage.getChatbotFlows());
});

router.post('/', async (req, res) => {
    const { name, description, sessionId, sessionIds: rawSessionIds, targetType, triggerKeywords, matchType, matchCase, cooldownMinutes, messageDelaySeconds, nodes, skipOptedOut } = req.body;
    // Normalize: accept sessionIds[] from new UI, or legacy sessionId string
    const sessionIds = Array.isArray(rawSessionIds) && rawSessionIds.length ? rawSessionIds : (sessionId ? [sessionId] : []);
    if (!name || !name.trim()) return res.status(400).json({ error: 'Flow name is required' });
    if (!sessionIds.length)    return res.status(400).json({ error: 'WhatsApp session is required' });

    const flows = await storage.getChatbotFlows();
    const flow  = {
        id: crypto.randomUUID(),
        name: name.trim(),
        description:         description || '',
        sessionIds,
        targetType:          targetType || 'all',
        triggerKeywords:     Array.isArray(triggerKeywords) ? triggerKeywords : [],
        matchType:           matchType || 'exact',
        matchCase:           matchCase === true,
        cooldownMinutes:     Number(cooldownMinutes)     || 0,
        messageDelaySeconds: Number(messageDelaySeconds) || 0,
        skipOptedOut:       skipOptedOut === true,
        active: true,
        nodes:  Array.isArray(nodes) ? nodes : [],
        totalConversations: 0,
        createdAt: new Date().toISOString(),
    };
    flows.push(flow);
    await storage.saveChatbotFlows(flows);
    invalidateFlowsCache();
    res.json(flow);
});

router.put('/:id', async (req, res) => {
    const flows = await storage.getChatbotFlows();
    const idx   = flows.findIndex(f => f.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Flow not found' });
    const { name, description, sessionId, sessionIds: rawSessionIds, targetType, triggerKeywords, matchType, matchCase, cooldownMinutes, messageDelaySeconds, nodes, active, skipOptedOut } = req.body;
    const sessionIds = Array.isArray(rawSessionIds) && rawSessionIds.length ? rawSessionIds : (sessionId ? [sessionId] : []);
    if (!name || !name.trim()) return res.status(400).json({ error: 'Flow name is required' });
    if (!sessionIds.length)    return res.status(400).json({ error: 'WhatsApp session is required' });
    flows[idx] = {
        ...flows[idx],
        name: name.trim(), description: description || '', sessionIds,
        targetType:          targetType || 'all',
        triggerKeywords:     Array.isArray(triggerKeywords) ? triggerKeywords : [],
        matchType:           matchType || 'exact',
        matchCase:           matchCase === true,
        cooldownMinutes:     Number(cooldownMinutes)     || 0,
        messageDelaySeconds: Number(messageDelaySeconds) || 0,
        skipOptedOut:        skipOptedOut === true,
        nodes:               Array.isArray(nodes) ? nodes : flows[idx].nodes,
        active:              active !== undefined ? active : flows[idx].active,
    };
    await storage.saveChatbotFlows(flows);
    invalidateFlowsCache();
    res.json(flows[idx]);
});

router.patch('/:id/toggle', async (req, res) => {
    const flows = await storage.getChatbotFlows();
    const flow  = flows.find(f => f.id === req.params.id);
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    flow.active = !flow.active;
    await storage.saveChatbotFlows(flows);
    invalidateFlowsCache();
    res.json(flow);
});

// Cleanup: remove inactive + empty flows
router.delete('/', async (_req, res) => {
    const flows = await storage.getChatbotFlows();
    const keep  = flows.filter(f => f.active && f.nodes && f.nodes.length > 0);
    await storage.saveChatbotFlows(keep);
    invalidateFlowsCache();
    res.json({ removed: flows.length - keep.length });
});

router.delete('/:id', async (req, res) => {
    const flows    = await storage.getChatbotFlows();
    const filtered = flows.filter(f => f.id !== req.params.id);
    if (filtered.length === flows.length) return res.status(404).json({ error: 'Flow not found' });
    await storage.saveChatbotFlows(filtered);
    invalidateFlowsCache();
    res.json({ ok: true });
});

router.post('/upload-attachment', cbAttachUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ filename: req.file.filename });
});

router.post('/import', async (req, res) => {
    const imported = req.body;
    if (!Array.isArray(imported)) return res.status(400).json({ error: 'Expected an array of flows' });
    const flows = await storage.getChatbotFlows();
    let added = 0;
    for (const f of imported) {
        if (!f.name) continue;
        flows.push({ ...f, id: crypto.randomUUID(), totalConversations: 0, createdAt: new Date().toISOString() });
        added++;
    }
    await storage.saveChatbotFlows(flows);
    invalidateFlowsCache();
    res.json({ added });
});

module.exports = router;
