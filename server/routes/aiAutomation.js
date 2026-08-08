const express = require('express');
const router = express.Router();
const storage = require('../../src/storage');
const crypto = require('crypto');

// Invalidate the in-engine cache whenever assistants are saved via the API
function invalidateAssistantsCache() {
    try { require('../services/aiAutomationEngine').invalidateAssistantsCache(); } catch (_) {}
}

function normalizeReplyScope(scope, fallbackScope) {
    const raw = String(scope ?? fallbackScope ?? '').trim().toLowerCase();
    return raw === 'individual' || raw === 'group' || raw === 'both' ? raw : 'both';
}

/**
 * GET /api/ai-automation
 * Get all AI assistants
 */
router.get('/', async (req, res) => {
    try {
        const assistants = await storage.getAIAssistants();
        const normalized = (assistants || []).map((a) => ({
            ...a,
            replyScope: normalizeReplyScope(a?.replyScope, a?.targetType),
        }));
        res.json(normalized);
    } catch (err) {
        console.error('Get assistants error:', err);
        res.status(500).json({ error: 'Failed to get assistants' });
    }
});

/**
 * POST /api/ai-automation
 * Create new AI assistant
 */
router.post('/', async (req, res) => {
    try {
        const { name, context, systemPrompt, apiProvider, apiKey, replyScope, active, sessionIds, templateId } = req.body;
        const resolvedContext = (context || systemPrompt || '').trim();
        
        if (!name || !resolvedContext) {
            return res.status(400).json({ error: 'Name and context are required' });
        }
        
        const assistants = await storage.getAIAssistants();
        const devices = await storage.getDevices();
        const autoSessionIds = Array.isArray(devices)
            ? devices.map(d => d.id).filter(Boolean)
            : [];
        
        const newAssistant = {
            id: crypto.randomUUID(),
            name,
            systemPrompt: resolvedContext,
            context: resolvedContext,
            apiProvider: apiProvider || 'free',
            apiKey: apiKey || '',
            replyScope: normalizeReplyScope(replyScope),
            templateId: templateId || 'custom',
            // Enable by default so bot starts responding right away.
            active: active !== undefined ? Boolean(active) : true,
            // If none provided, bind to all current devices.
            sessionIds: Array.isArray(sessionIds) && sessionIds.length > 0 ? sessionIds : autoSessionIds,
            totalInteractions: 0,
            createdAt: new Date()
        };
        
        assistants.push(newAssistant);
        await storage.saveAIAssistants(assistants);
        invalidateAssistantsCache();
        
        res.status(201).json(newAssistant);
    } catch (err) {
        console.error('Create assistant error:', err);
        res.status(500).json({ error: 'Failed to create assistant' });
    }
});

/**
 * PUT /api/ai-automation/:id
 * Update AI assistant
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, context, systemPrompt, apiProvider, apiKey, replyScope, active, sessionIds, templateId } = req.body;
        const resolvedContext = context !== undefined ? context : systemPrompt;
        
        const assistants = await storage.getAIAssistants();
        const index = assistants.findIndex(a => a.id === id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Assistant not found' });
        }
        
        // Update fields
        if (name !== undefined) assistants[index].name = name;
        if (resolvedContext !== undefined) {
            assistants[index].systemPrompt = resolvedContext;
            assistants[index].context = resolvedContext;
        }
        if (apiProvider !== undefined) assistants[index].apiProvider = apiProvider;
        if (apiKey !== undefined) assistants[index].apiKey = apiKey;
        if (replyScope !== undefined || assistants[index].replyScope === undefined) {
            assistants[index].replyScope = normalizeReplyScope(replyScope, assistants[index].targetType || assistants[index].replyScope);
        }
        if (templateId !== undefined) assistants[index].templateId = templateId;
        if (active !== undefined) assistants[index].active = active;
        if (sessionIds !== undefined) assistants[index].sessionIds = sessionIds;
        
        await storage.saveAIAssistants(assistants);
        invalidateAssistantsCache();
        res.json(assistants[index]);
    } catch (err) {
        console.error('Update assistant error:', err);
        res.status(500).json({ error: 'Failed to update assistant' });
    }
});

/**
 * PATCH /api/ai-automation/:id/toggle
 * Toggle AI assistant active/inactive
 */
router.patch('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const assistants = await storage.getAIAssistants();
        const index = assistants.findIndex(a => a.id === id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Assistant not found' });
        }
        
        assistants[index].active = !assistants[index].active;
        await storage.saveAIAssistants(assistants);
        invalidateAssistantsCache();
        res.json(assistants[index]);
    } catch (err) {
        console.error('Toggle assistant error:', err);
        res.status(500).json({ error: 'Failed to toggle assistant' });
    }
});

/**
 * DELETE /api/ai-automation/:id
 * Delete AI assistant
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const assistants = await storage.getAIAssistants();
        const filtered = assistants.filter(a => a.id !== id);
        
        await storage.saveAIAssistants(filtered);
        invalidateAssistantsCache();
        
        // Also delete conversations for this assistant
        const conversations = await storage.getAIConversations();
        const filteredConversations = conversations.filter(c => c.assistantId !== id);
        await storage.saveAIConversations(filteredConversations);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete assistant error:', err);
        res.status(500).json({ error: 'Failed to delete assistant' });
    }
});

/**
 * GET /api/ai-automation/:id/conversations
 * Get conversations for an assistant
 */
router.get('/:id/conversations', async (req, res) => {
    try {
        const { id } = req.params;
        const conversations = await storage.getAIConversations();
        const filtered = conversations.filter(c => c.assistantId === id);
        
        res.json(filtered || []);
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ error: 'Failed to get conversations' });
    }
});

/**
 * GET /api/ai-automation-records
 * Get local AI input records
 */
router.get('/records/all', async (_req, res) => {
    try {
        const records = await storage.getAIRecords();
        res.json(Array.isArray(records) ? records : []);
    } catch (err) {
        console.error('Get AI records error:', err);
        res.status(500).json({ error: 'Failed to get AI records' });
    }
});

/**
 * DELETE /api/ai-automation-records/:id
 * Delete one AI record
 */
router.delete('/records/all/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const records = await storage.getAIRecords();
        const filtered = (records || []).filter(r => r.id !== id);
        await storage.saveAIRecords(filtered);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete AI record error:', err);
        res.status(500).json({ error: 'Failed to delete AI record' });
    }
});

module.exports = router;
