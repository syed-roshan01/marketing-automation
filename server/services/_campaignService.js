'use strict';
// Campaign send/pause service — exposed as an Express router
const path    = require('path');
const fs      = require('fs');
const router  = require('express').Router();

const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const socketSingleton = require('../socket');
const { IMAGES_DIR } = require('../constants');
const { personalizeText, applyVariables } = require('../utils/text');
const { getTodayCount, incrementDailyCount } = require('../utils/dailyStats');

// Map of campaignId -> true when a pause has been requested
const pauseRequested = new Map();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Rotate through the campaign's assigned device IDs
function makeCampaignDevicePicker(campaign) {
    let idx = 0;
    return function getCampaignDevice() {
        const ids = Array.isArray(campaign.deviceIds) && campaign.deviceIds.length
            ? campaign.deviceIds : null;
        if (!ids) return deviceManager.getFirstReady();
        const d = deviceManager.get(ids[idx % ids.length]);
        idx++;
        return d && d.isReady() ? d : deviceManager.getFirstReady();
    };
}

// ── Pause ─────────────────────────────────────────────────────────────────────
router.post('/:id/pause', async (req, res) => {
    const campaigns = await storage.getCampaigns();
    const campaign  = campaigns.find(c => c.id === req.params.id);
    if (!campaign)                    return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'running') return res.status(400).json({ error: 'Campaign is not running' });
    pauseRequested.set(req.params.id, true);
    res.json({ success: true });
});

// ── Shared start logic (used by HTTP route and scheduler) ─────────────────────
async function startCampaignById(id) {
    const waDevice = deviceManager.getFirstReady();
    if (!waDevice) throw new Error('No WhatsApp device connected');

    const campaigns = await storage.getCampaigns();
    const campaign  = campaigns.find(c => c.id === id);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status === 'running') throw new Error('Already running');

    const isTextCampaign = campaign.msgType === 'text' && campaign.textMessage;
    const templates   = await storage.getTemplates();
    const tplIds      = Array.isArray(campaign.templateIds) && campaign.templateIds.length
        ? campaign.templateIds : [campaign.templateId];
    const templatePool = isTextCampaign ? [] : templates.filter(t => tplIds.includes(t.id));
    if (!isTextCampaign && !templatePool.length)
        throw new Error('Template not found');

    const settings = await storage.getSettings();
    if (settings.dailyLimitEnabled !== false && getTodayCount() >= settings.dailyLimit)
        throw new Error(`Daily sending limit reached (${settings.dailyLimit} messages/day)`);

    campaign.status      = 'running';
    campaign.safetyNote  = null;
    campaign.startedAt   = new Date().toISOString();
    campaign.scheduledAt = null; // clear so it doesn't re-trigger
    pauseRequested.delete(campaign.id);
    await storage.saveCampaigns(campaigns);

    // ── Background send loop ──────────────────────────────────────────────────
    (async () => {
        const getCampaignDevice = makeCampaignDevicePicker(campaign);
        let batchCount = 0;

        const emitUpdate = (extra = {}) => {
            const io = socketSingleton.get();
            if (io) io.emit('campaign_update', {
                campaignId: campaign.id,
                messages:   campaign.messages,
                status:     campaign.status,
                safetyNote: campaign.safetyNote || null,
                dailyUsed:  getTodayCount(),
                dailyLimit: settings.dailyLimit,
                ...extra,
            });
        };

        // ── Random start delay ────────────────────────────────────────────────
        const cfg0 = await storage.getSettings();
        if (cfg0.startDelayEnabled && cfg0.startDelayMax > 0) {
            const minMs = (cfg0.startDelayMin || 0) * 60_000;
            const maxMs = (cfg0.startDelayMax || 5) * 60_000;
            const waitMs = Math.round(minMs + Math.random() * (maxMs - minMs));
            const waitMin = (waitMs / 60000).toFixed(1);
            campaign.safetyNote = `⏳ Starting in ${waitMin} min (human delay)…`;
            await storage.saveCampaigns(campaigns);
            emitUpdate();
            await sleep(waitMs);
            campaign.safetyNote = null;
        }

        for (let msgIndex = 0; msgIndex < campaign.messages.length; msgIndex++) {
            const msg = campaign.messages[msgIndex];
            if (msg.status === 'sent') continue;

            // Pause check
            if (pauseRequested.get(campaign.id)) {
                pauseRequested.delete(campaign.id);
                campaign.status     = 'paused';
                campaign.safetyNote = '⏸ Paused by user.';
                await storage.saveCampaigns(campaigns);
                emitUpdate();
                return;
            }

            const cfg = await storage.getSettings();

            // ── Sending time window check ─────────────────────────────────────
            if (cfg.timeWindowEnabled && cfg.timeWindowStart && cfg.timeWindowEnd) {
                const now     = new Date();
                const hhmm    = now.getHours() * 60 + now.getMinutes();
                const [sh, sm] = cfg.timeWindowStart.split(':').map(Number);
                const [eh, em] = cfg.timeWindowEnd.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin   = eh * 60 + em;
                if (hhmm < startMin || hhmm >= endMin) {
                    // Outside window — wait until window opens then re-check
                    const msUntilStart = (() => {
                        const todayStart = new Date(now);
                        todayStart.setHours(sh, sm, 0, 0);
                        if (todayStart <= now) todayStart.setDate(todayStart.getDate() + 1);
                        return todayStart.getTime() - now.getTime();
                    })();
                    const resumeAt = new Date(Date.now() + msUntilStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    campaign.safetyNote = `🕐 Outside sending window (${cfg.timeWindowStart}–${cfg.timeWindowEnd}). Resuming at ${resumeAt}.`;
                    await storage.saveCampaigns(campaigns);
                    emitUpdate();
                    // Sleep in 5-min chunks so pause requests are still honoured
                    const sleepChunk = 5 * 60_000;
                    let remaining = msUntilStart;
                    while (remaining > 0) {
                        if (pauseRequested.get(campaign.id)) {
                            pauseRequested.delete(campaign.id);
                            campaign.status     = 'paused';
                            campaign.safetyNote = '⏸ Paused by user.';
                            await storage.saveCampaigns(campaigns);
                            emitUpdate();
                            return;
                        }
                        await sleep(Math.min(sleepChunk, remaining));
                        remaining -= sleepChunk;
                    }
                    campaign.safetyNote = null;
                }
            }

            // Daily limit guard (auto warm-up overrides manual limit when active)
            let effectiveLimit = cfg.dailyLimit;
            if (cfg.autoWarmupEnabled && cfg.warmupStartedAt) {
                const daysSince = Math.floor((Date.now() - new Date(cfg.warmupStartedAt).getTime()) / 86400000);
                if      (daysSince < 3)  effectiveLimit = 50;
                else if (daysSince < 7)  effectiveLimit = 100;
                else if (daysSince < 14) effectiveLimit = 150;
                else if (daysSince < 21) effectiveLimit = 200;
                else                     effectiveLimit = 300;
            }
            if (cfg.dailyLimitEnabled !== false && getTodayCount() >= effectiveLimit) {
                campaign.status     = 'paused';
                campaign.safetyNote = `⏸ Daily limit of ${effectiveLimit} messages reached${cfg.autoWarmupEnabled ? ' (warm-up)' : ''}. Restart tomorrow to continue.`;
                campaign.completedAt = new Date().toISOString();
                await storage.saveCampaigns(campaigns);
                emitUpdate();
                return;
            }

            const activeDevice = getCampaignDevice() || waDevice;
            const template     = isTextCampaign
                ? null
                : templatePool[Math.floor(Math.random() * templatePool.length)];

            try {
                const chatId = activeDevice.getRecipientNumber(msg.number);

                // Typing simulation — always on for safest, else follows settings
                const useTyping = campaign.sendMode === 'safest' ? true : cfg.typingEnabled;
                if (useTyping) {
                    // Safest mode: longer, more varied typing to mimic reading + composing
                    const typMin = campaign.sendMode === 'safest' ? 4  : cfg.typingMin;
                    const typMax = campaign.sendMode === 'safest' ? 10 : cfg.typingMax;
                    const typingMs = Math.round(
                        (typMin + Math.random() * (typMax - typMin)) * 1000
                    );
                    await activeDevice.sendTyping(chatId, typingMs);
                }

                // Personalised text
                const campaignVars = Array.isArray(campaign.variables) ? campaign.variables : [];
                const templateVars = (!isTextCampaign && Array.isArray(template.variables)) ? template.variables : [];
                const vars = [...templateVars, ...campaignVars.filter(cv => !templateVars.find(tv => tv.name === cv.name))];
                const rawText = isTextCampaign ? campaign.textMessage : template.content;
                const text    = personalizeText(applyVariables(rawText, vars, msgIndex), msg.contactName, msg.number);

                if (isTextCampaign) {
                    await activeDevice.sendMessage(chatId, text);
                } else if (template.templateType === 'carousel' && Array.isArray(template.cards) && template.cards.length >= 2) {
                    const resolvedCards = template.cards.map(card => ({
                        text:      card.text || '',
                        footer:    card.footer || '',
                        buttons:   Array.isArray(card.buttons) ? card.buttons.filter(Boolean) : [],
                        imagePath: card.imageFile
                            ? (() => { const p = path.join(IMAGES_DIR, card.imageFile); return fs.existsSync(p) ? p : null; })()
                            : null,
                    }));
                    await activeDevice.sendCarousel(chatId, text, resolvedCards, {
                        title:    template.carouselTitle    || '',
                        subtitle: template.carouselSubtitle || '',
                        footer:   template.carouselFooter   || '',
                    });
                } else if (template.templateType === 'poll' && template.pollQuestion &&
                           Array.isArray(template.pollOptions) && template.pollOptions.length >= 2) {
                    const pollMediaPath = template.mediaFile
                        ? (() => { const p = path.join(IMAGES_DIR, template.mediaFile); return fs.existsSync(p) ? p : null; })()
                        : null;
                    await activeDevice.sendPoll(chatId, text, template.pollQuestion, template.pollOptions, pollMediaPath);
                } else if (template.templateType === 'contact' && template.contactName) {
                    await activeDevice.sendContact(chatId, template.contactName, template.contactPhone || '', text);
                } else if (template.templateType === 'location' && template.locationName) {
                    await activeDevice.sendLocation(
                        chatId, template.locationName, template.locationAddress || '',
                        template.locationLat || '0', template.locationLng || '0', text
                    );
                } else {
                    const imagePath = template.imageFile
                        ? path.join(IMAGES_DIR, template.imageFile)
                        : template.mediaFile
                            ? (() => { const p = path.join(IMAGES_DIR, template.mediaFile); return fs.existsSync(p) ? p : null; })()
                            : null;
                    const tplMediaType = template.imageFile ? 'image'
                        : template.mediaFile ? (template.mediaType || template.templateType || 'document')
                        : null;
                    await activeDevice.sendMessage(
                        chatId, text, imagePath,
                        template.buttonType || 'none',
                        Array.isArray(template.buttons) ? template.buttons.filter(Boolean) : [],
                        template.listButtonText || 'View Options',
                        Array.isArray(template.listSections) ? template.listSections : [],
                        tplMediaType
                    );
                }

                msg.status = 'sent';
                msg.sentAt = new Date().toISOString();
                msg.error  = null;
                incrementDailyCount();
                batchCount++;
            } catch (err) {
                msg.status = 'failed';
                msg.error  = err.message;
                console.error(`[Campaign] Failed to send to ${msg.number}:`, err.message);
            }

            await storage.saveCampaigns(campaigns);
            emitUpdate();

            // ── Delay strategy ────────────────────────────────────────────────
            const sendMode = campaign.sendMode || (campaign.instantSend ? 'instant' : 'safe');

            if (sendMode === 'safest') {
                // 55–75 sec per message + extra long batch rest every 10 msgs
                const batchSz = 10;
                if (batchCount > 0 && batchCount % batchSz === 0) {
                    const restSecs = 180 + Math.round(Math.random() * 120); // 3–5 min rest
                    const pauseUntil = Date.now() + restSecs * 1000;
                    campaign.safetyNote = `🛡️ Safest Send — resting ${(restSecs/60).toFixed(1)} min after ${batchSz} messages…`;
                    await storage.saveCampaigns(campaigns);
                    emitUpdate({ pauseUntil });
                    await sleep(restSecs * 1000);
                    campaign.safetyNote = null;
                } else {
                    // 55–75 sec random between each message
                    const delaySecs = 55 + Math.random() * 20;
                    await sleep(Math.round(delaySecs * 1000));
                }
            } else if (sendMode === 'instant') {
                const batchSz = (cfg.batchEnabled !== false && cfg.batchSize > 0) ? cfg.batchSize : 20;
                if (batchCount > 0 && batchCount % batchSz === 0) {
                    const pauseUntil = Date.now() + 60_000;
                    campaign.safetyNote = `⚡ Instant Send — resting 60 sec after ${batchSz} messages…`;
                    await storage.saveCampaigns(campaigns);
                    emitUpdate({ pauseUntil });
                    await sleep(60_000);
                    campaign.safetyNote = null;
                } else {
                    await sleep(Math.round((3 + Math.random() * 3) * 1000));
                }
            } else if (cfg.batchEnabled !== false && batchCount > 0 && batchCount % cfg.batchSize === 0) {
                const pauseSecs = Math.round(
                    cfg.batchPauseMin + Math.random() * (cfg.batchPauseMax - cfg.batchPauseMin)
                );
                const pauseUntil = Date.now() + pauseSecs * 1000;
                campaign.safetyNote = `⏳ Batch of ${cfg.batchSize} sent — pausing ${(pauseSecs / 60).toFixed(1)} min before next batch…`;
                await storage.saveCampaigns(campaigns);
                emitUpdate({ pauseUntil });
                await sleep(pauseSecs * 1000);
                campaign.safetyNote = null;
            } else if (cfg.delayEnabled !== false) {
                const delaySecs = cfg.minDelay + Math.random() * (cfg.maxDelay - cfg.minDelay);
                await sleep(Math.round(delaySecs * 1000));
            } else {
                await sleep(300);
            }
        }

        const allFailed = campaign.messages.every(m => m.status === 'failed');
        campaign.status      = allFailed ? 'failed' : 'completed';
        campaign.safetyNote  = null;
        campaign.completedAt = new Date().toISOString();
        await storage.saveCampaigns(campaigns);
        emitUpdate();
    })();
}

// ── Send (HTTP route) ─────────────────────────────────────────────────────────
router.post('/:id/send', async (req, res) => {
    try {
        await startCampaignById(req.params.id);
        res.json({ success: true });
    } catch (err) {
        const code = err.message === 'Campaign not found' ? 404
                   : err.message === 'Already running'   ? 400 : 400;
        res.status(code).json({ error: err.message });
    }
});

module.exports = router;
module.exports.startCampaignById = startCampaignById;
