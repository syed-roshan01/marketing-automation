'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const { v4: uuidv4 }    = require('uuid');
const { normalizePhone } = require('../utils/phone');

router.get('/', async (_req, res) => {
    res.json(await storage.getCampaigns());
});

router.post('/', async (req, res) => {
    const { name, templateId, templateIds, contactIds, numbers, deviceIds, msgType, textMessage, variables, scheduledAt } = req.body;
    const tplPool   = Array.isArray(templateIds) && templateIds.length ? templateIds : (templateId ? [templateId] : []);
    const isText    = msgType === 'text';
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!isText && !tplPool.length) return res.status(400).json({ error: 'template(s) required' });
    if (isText && !textMessage)     return res.status(400).json({ error: 'textMessage required' });

    // Validate scheduledAt if provided
    let schedTs = null;
    if (scheduledAt) {
        schedTs = new Date(scheduledAt).getTime();
        if (isNaN(schedTs) || schedTs <= Date.now())
            return res.status(400).json({ error: 'scheduledAt must be a future date/time' });
    }

    let messages = [];
    if (Array.isArray(numbers) && numbers.length) {
        messages = numbers.filter(Boolean).map(n => {
            const num = normalizePhone(n);
            return { contactId: null, contactName: num, number: num, status: 'pending', sentAt: null, error: null };
        });
    } else if (Array.isArray(contactIds) && contactIds.length) {
        const allContacts = await storage.getContacts();
        messages = allContacts.filter(c => contactIds.includes(c.id)).map(c => ({
            contactId: c.id, contactName: c.name, number: c.number, status: 'pending', sentAt: null, error: null,
        }));
    }
    if (!messages.length) return res.status(400).json({ error: 'No recipients resolved' });

    // Resolve sendMode — support legacy instantSend boolean
    let sendMode = req.body.sendMode || 'safe';
    if (!['safe','instant','safest'].includes(sendMode)) sendMode = 'safe';
    // back-compat: if caller only sent instantSend:true, treat as instant
    if (sendMode === 'safe' && req.body.instantSend === true) sendMode = 'instant';

    const campaigns = await storage.getCampaigns();
    const campaign  = {
        id: uuidv4(),
        name: name.trim(),
        msgType: isText ? 'text' : 'template',
        templateId:  tplPool[0] || null,
        templateIds: tplPool,
        textMessage: isText ? textMessage : '',
        deviceIds:   Array.isArray(deviceIds) ? deviceIds : [],
        sendMode,
        instantSend: sendMode === 'instant', // back-compat flag
        variables:   Array.isArray(variables)  ? variables : [],
        status: schedTs ? 'scheduled' : 'draft',
        scheduledAt: schedTs ? new Date(schedTs).toISOString() : null,
        createdAt:   new Date().toISOString(),
        startedAt:   null,
        completedAt: null,
        safetyNote:  null,
        messages,
    };
    campaigns.push(campaign);
    await storage.saveCampaigns(campaigns);
    res.json(campaign);
});

router.delete('/:id', async (req, res) => {
    let campaigns = await storage.getCampaigns();
    campaigns = campaigns.filter(c => c.id !== req.params.id);
    await storage.saveCampaigns(campaigns);
    res.json({ success: true });
});

// Clone a campaign and reset all messages to pending
router.post('/:id/resend', async (req, res) => {
    const campaigns = await storage.getCampaigns();
    const original  = campaigns.find(c => c.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Campaign not found' });
    const clone = {
        ...original,
        id: uuidv4(),
        name: original.name.replace(/^(\(Resend\) )+/, '') + ' (Resend)',
        status: 'draft',
        createdAt:   new Date().toISOString(),
        startedAt:   null,
        completedAt: null,
        safetyNote:  null,
        messages: original.messages.map(m => ({ ...m, status: 'pending', sentAt: null, error: null })),
    };
    campaigns.push(clone);
    await storage.saveCampaigns(campaigns);
    res.json(clone);
});

// Clone a campaign with ONLY the failed messages reset to pending
router.post('/:id/retry-failed', async (req, res) => {
    const campaigns = await storage.getCampaigns();
    const original  = campaigns.find(c => c.id === req.params.id);
    if (!original) return res.status(404).json({ error: 'Campaign not found' });
    const failedMessages = (original.messages || []).filter(m => m.status === 'failed');
    if (!failedMessages.length) return res.status(400).json({ error: 'No failed messages found' });
    const clone = {
        ...original,
        id: uuidv4(),
        name: original.name.replace(/^(\(Retry Failed\) )+/, '') + ' (Retry Failed)',
        status: 'draft',
        createdAt:   new Date().toISOString(),
        startedAt:   null,
        completedAt: null,
        safetyNote:  null,
        messages: failedMessages.map(m => ({ ...m, status: 'pending', sentAt: null, error: null })),
    };
    campaigns.push(clone);
    await storage.saveCampaigns(campaigns);
    res.json(clone);
});

// Update or cancel a scheduled campaign
router.patch('/:id/schedule', async (req, res) => {
    const campaigns = await storage.getCampaigns();
    const campaign  = campaigns.find(c => c.id === req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'running') return res.status(400).json({ error: 'Cannot reschedule a running campaign' });

    const { scheduledAt } = req.body;
    if (!scheduledAt) {
        // Cancel schedule → revert to draft
        campaign.scheduledAt = null;
        campaign.status      = 'draft';
    } else {
        const schedTs = new Date(scheduledAt).getTime();
        if (isNaN(schedTs) || schedTs <= Date.now())
            return res.status(400).json({ error: 'scheduledAt must be a future date/time' });
        campaign.scheduledAt = new Date(schedTs).toISOString();
        campaign.status      = 'scheduled';
    }
    await storage.saveCampaigns(campaigns);
    res.json(campaign);
});

module.exports = router;
