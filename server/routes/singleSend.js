'use strict';
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const storage = require('../../src/storage');
const deviceManager      = require('../../src/deviceManager');
const socket             = require('../socket');
const { IMAGES_DIR }     = require('../constants');
const { mediaUpload }    = require('../utils/upload');
const { normalizePhone } = require('../utils/phone');
const { personalizeText, applyVariables } = require('../utils/text');
const { getTodayCount, incrementDailyCount } = require('../utils/dailyStats');
const { v4: uuidv4 }    = require('uuid');

router.post('/', mediaUpload.single('attachment'), async (req, res) => {
    try {
        const { deviceId, numbers, contactIds, groupIds, messageType, templateId, message, minDelay, maxDelay } = req.body;

        const waDevice = deviceId ? deviceManager.get(deviceId) : deviceManager.getFirstReady();
        if (!waDevice || !waDevice.isReady())
            return res.status(400).json({ error: 'Selected device is not connected' });

        const allContacts = await storage.getContacts();
        const nameByPhone = {};
        allContacts.forEach(c => { nameByPhone[c.number] = c.name || ''; });

        let recipients = [];
        if (numbers) {
            const raw = Array.isArray(numbers) ? numbers : [numbers];
            raw.flatMap(n => n.split(/[\n,]+/))
               .map(n => n.trim().replace(/\D/g, '')).filter(Boolean)
               .forEach(phone => recipients.push({ phone, name: nameByPhone[phone] || '' }));
        }
        if (contactIds) {
            const ids = Array.isArray(contactIds) ? contactIds : [contactIds];
            allContacts.filter(c => ids.includes(c.id)).forEach(c => recipients.push({ phone: c.number, name: c.name || '' }));
        }
        if (groupIds) {
            const ids = Array.isArray(groupIds) ? groupIds : [groupIds];
            const allGroups = await storage.getGroups();
            allGroups.filter(g => ids.includes(g.id)).forEach(g => recipients.push({ phone: g.id, name: g.name || '' }));
        }

        const seen = new Set();
        recipients = recipients.filter(r => { if (seen.has(r.phone)) return false; seen.add(r.phone); return true; });
        if (!recipients.length) return res.status(400).json({ error: 'No recipients specified' });

        // Template fields
        let msgTemplate = message || '';
        let tplButtonType = 'none', tplButtons = [], tplListBtnText = 'View Options', tplListSections = [], tplImagePath = null;
        if (messageType === 'template' && templateId) {
            const templates = await storage.getTemplates();
            const tpl = templates.find(t => t.id === templateId);
            if (tpl) {
                msgTemplate     = tpl.content;
                tplButtonType   = tpl.buttonType || 'none';
                tplButtons      = Array.isArray(tpl.buttons) ? tpl.buttons.filter(Boolean) : [];
                tplListBtnText  = tpl.listButtonText || 'View Options';
                tplListSections = Array.isArray(tpl.listSections) ? tpl.listSections : [];
                if (tpl.imageFile) { const p = path.join(IMAGES_DIR, tpl.imageFile); if (fs.existsSync(p)) tplImagePath = p; }
                else if (tpl.mediaFile) { const p = path.join(IMAGES_DIR, tpl.mediaFile); if (fs.existsSync(p)) tplImagePath = p; }
            }
        }

        const attachPath      = req.file ? req.file.path : tplImagePath;
        const tplForType      = (messageType === 'template' && templateId)
            ? (await storage.getTemplates()).find(t => t.id === templateId) : null;
        const attachMediaType = req.body.mediaType
            || (tplForType && tplForType.mediaFile && !tplForType.imageFile ? (tplForType.mediaType || tplForType.templateType || 'document') : null)
            || (tplImagePath ? 'image' : null);

        const minMs = Math.max(0, parseInt(minDelay) || 1000);
        const maxMs = Math.max(minMs, parseInt(maxDelay) || 3000);

        const cfgLimit = await storage.getSettings();
        if (cfgLimit.dailyLimitEnabled !== false && getTodayCount() >= cfgLimit.dailyLimit)
            return res.status(400).json({ error: `Daily sending limit of ${cfgLimit.dailyLimit} messages reached. Try again tomorrow.` });

        const now       = new Date().toISOString();
        const dateLabel = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const campaign  = {
            id: uuidv4(),
            name: `Single: ${dateLabel}`,
            templateId: templateId || null,
            templateIds: templateId ? [templateId] : [],
            status: 'running', createdAt: now, startedAt: now, completedAt: null, safetyNote: null,
            messages: recipients.map(r => ({ contactId: null, contactName: r.name, number: r.phone, status: 'pending', sentAt: null, error: null })),
        };
        const campaigns = await storage.getCampaigns();
        campaigns.push(campaign);
        await storage.saveCampaigns(campaigns);

        const emitUpdate = () => socket.emit('campaign_update', {
            campaignId: campaign.id, messages: campaign.messages, status: campaign.status, safetyNote: campaign.safetyNote || null,
        });

        res.json({ success: true, total: recipients.length, campaignId: campaign.id });
        emitUpdate();

        (async () => {
            let tplVariables = [];
            if (messageType === 'template' && templateId) {
                const allTpls = await storage.getTemplates();
                const tplForVars = allTpls.find(t => t.id === templateId);
                if (tplForVars && Array.isArray(tplForVars.variables)) tplVariables = tplForVars.variables;
            }

            for (let i = 0; i < recipients.length; i++) {
                const { phone, name } = recipients[i];
                const msg = campaign.messages[i];
                const personalizedText = personalizeText(applyVariables(msgTemplate, tplVariables, i), name, phone);
                try {
                    let sentSpecial = false;
                    if (messageType === 'template' && templateId) {
                        const allTpls = await storage.getTemplates();
                        const activeTpl = allTpls.find(t => t.id === templateId);
                        if (activeTpl?.templateType === 'carousel' && Array.isArray(activeTpl.cards) && activeTpl.cards.length >= 2) {
                            const resolvedCards = activeTpl.cards.map(card => ({
                                text: card.text || '', footer: card.footer || '',
                                buttons: Array.isArray(card.buttons) ? card.buttons.filter(Boolean) : [],
                                imagePath: card.imageFile ? (() => { const p = path.join(IMAGES_DIR, card.imageFile); return fs.existsSync(p) ? p : null; })() : null,
                            }));
                            await waDevice.sendCarousel(phone, personalizedText, resolvedCards, { title: activeTpl.carouselTitle || '', subtitle: activeTpl.carouselSubtitle || '', footer: activeTpl.carouselFooter || '' });
                            sentSpecial = true;
                        } else if (activeTpl?.templateType === 'poll' && activeTpl.pollQuestion && Array.isArray(activeTpl.pollOptions) && activeTpl.pollOptions.length >= 2) {
                            const pollMp = activeTpl.mediaFile ? (() => { const p = path.join(IMAGES_DIR, activeTpl.mediaFile); return fs.existsSync(p) ? p : null; })() : null;
                            await waDevice.sendPoll(phone, personalizedText, activeTpl.pollQuestion, activeTpl.pollOptions, pollMp);
                            sentSpecial = true;
                        } else if (activeTpl?.templateType === 'contact' && activeTpl.contactName) {
                            await waDevice.sendContact(phone, activeTpl.contactName, activeTpl.contactPhone || '', personalizedText);
                            sentSpecial = true;
                        } else if (activeTpl?.templateType === 'location' && activeTpl.locationName) {
                            await waDevice.sendLocation(phone, activeTpl.locationName, activeTpl.locationAddress || '', activeTpl.locationLat || '0', activeTpl.locationLng || '0', personalizedText);
                            sentSpecial = true;
                        }
                    }
                    if (!sentSpecial) {
                        await waDevice.sendMessage(phone, personalizedText, attachPath, tplButtonType, tplButtons, tplListBtnText, tplListSections, attachMediaType);
                    }
                    msg.status = 'sent'; msg.sentAt = new Date().toISOString(); msg.error = null;
                } catch (err) {
                    msg.status = 'failed'; msg.error = err.message;
                    console.error(`[Single] Failed to ${phone}:`, err.message);
                }
                await storage.saveCampaigns(await storage.getCampaigns().then(all => {
                    const idx = all.findIndex(c => c.id === campaign.id);
                    if (idx !== -1) all[idx] = campaign;
                    return all;
                }));
                emitUpdate();
                if (i < recipients.length - 1) {
                    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
                    await new Promise(r => setTimeout(r, delay));
                }
            }

            const sent = campaign.messages.filter(m => m.status === 'sent').length;
            const failed = campaign.messages.filter(m => m.status === 'failed').length;
            campaign.status = failed === recipients.length ? 'failed' : 'completed';
            campaign.completedAt = new Date().toISOString();
            campaign.safetyNote  = `Sent: ${sent}, Failed: ${failed}`;
            const finalAll = await storage.getCampaigns();
            const fi = finalAll.findIndex(c => c.id === campaign.id);
            if (fi !== -1) finalAll[fi] = campaign;
            await storage.saveCampaigns(finalAll);
            emitUpdate();
            if (req.file && attachPath) fs.unlink(attachPath, () => {});
            console.log(`[Single] Done — sent: ${sent}, failed: ${failed}`);
        })();
    } catch (err) {
        console.error('[Single] Error:', err);
        res.status(500).json({ error: err.message || 'Send failed' });
    }
});

module.exports = router;
