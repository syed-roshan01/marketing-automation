'use strict';
// Auto-reply engine — fires on every incoming message and matches rules
const path          = require('path');
const fs            = require('fs');
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const { IMAGES_DIR } = require('../constants');

// Lazy-loaded to avoid circular-require at module init time
function getFormSessions() {
    try { return require('./formEngine').sessions; } catch { return new Map(); }
}

function randInt(min, max) {
    const lo = Number.isFinite(min) ? Math.floor(min) : 1;
    const hi = Number.isFinite(max) ? Math.floor(max) : lo;
    if (hi <= lo) return lo;
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId }) => {
    try {
        // Skip if this contact is mid-form — form engine owns the conversation
        if (getFormSessions().has(jid)) return;

        const rules  = await storage.getAutoReplyRules();
        const active = rules
            .filter(r => r.active && r.sessionId === deviceId)
            .sort((a, b) => (a.priority || 1) - (b.priority || 1));
        if (!active.length) return;

        const isGroup  = (jid || '').includes('@g.us');
        const optouts  = await storage.getOptoutRecords();
        const isOptedOut = optouts.some(r => r.phone === phone && r.type === 'optout');
        const settings = await storage.getSettings();
        const log  = await storage.getAutoReplyLog();
        const firstSeenKey = `__first_seen:${deviceId}:${jid}`;
        const isFirstContact = !log[firstSeenKey];
        let logUpdated = false, rulesFired = false;

        // Mark contact as seen on first inbound so auto-reply only runs on first conversation.
        if (isFirstContact) {
            log[firstSeenKey] = new Date().toISOString();
            logUpdated = true;
        }

        for (const rule of active) {
            if (isOptedOut && rule.skipOptedOut !== false) continue;
            if (rule.targetType === 'individual' && isGroup)  continue;
            if (rule.targetType === 'group'      && !isGroup) continue;
            // Product rule: auto-reply should trigger only once for a new contact.
            if (!isFirstContact) continue;

            const cooldownMs = (rule.cooldownMinutes || 0) * 60 * 1000;
            const key  = `${rule.id}:${jid}`;
            const last = log[key] ? new Date(log[key]).getTime() : 0;
            if (cooldownMs > 0 && Date.now() - last < cooldownMs) continue;

            let replyText = rule.response || '', tplButtonType = 'none', tplButtons = [],
                tplListBtnText = 'View Options', tplListSections = [],
                tplImagePath = null, tplMediaType = null,
                isCarousel = false, isPoll = false, activeTpl = null;

            if (rule.templateId) {
                const tpl = (await storage.getTemplates()).find(t => t.id === rule.templateId);
                if (tpl) {
                    activeTpl       = tpl;
                    replyText       = tpl.content || replyText;
                    tplButtonType   = tpl.buttonType || 'none';
                    tplButtons      = Array.isArray(tpl.buttons) ? tpl.buttons.filter(Boolean) : [];
                    tplListBtnText  = tpl.listButtonText || 'View Options';
                    tplListSections = Array.isArray(tpl.listSections) ? tpl.listSections : [];
                    if (tpl.imageFile) {
                        const ip = path.join(IMAGES_DIR, tpl.imageFile);
                        if (fs.existsSync(ip)) { tplImagePath = ip; tplMediaType = 'image'; }
                    } else if (tpl.mediaFile) {
                        const mp = path.join(IMAGES_DIR, tpl.mediaFile);
                        if (fs.existsSync(mp)) { tplImagePath = mp; tplMediaType = tpl.mediaType || 'document'; }
                    }
                    isCarousel = tpl.templateType === 'carousel' && Array.isArray(tpl.cards) && tpl.cards.length >= 2;
                    isPoll     = tpl.templateType === 'poll' && !!tpl.pollQuestion && Array.isArray(tpl.pollOptions) && tpl.pollOptions.length >= 2;
                }
            }
            if (!replyText && !isCarousel && !isPoll) continue;

            const waInst = deviceManager.get(deviceId);
            if (!waInst || !waInst.isReady()) continue;

            try {
                const typingEnabled = settings.typingEnabled !== false;
                if (typingEnabled) {
                    const minSec = Math.max(0, Number(settings.typingMin) || 1);
                    const maxSec = Math.max(minSec, Number(settings.typingMax) || minSec);
                    const configuredMs = randInt(minSec, maxSec) * 1000;
                    const typingMs = Math.max(500, Math.min(configuredMs, 2000));
                    await waInst.sendTyping(jid, typingMs);
                }

                if (isCarousel && activeTpl) {
                    const resolvedCards = activeTpl.cards.map(card => ({
                        text: card.text || '', footer: card.footer || '',
                        buttons: Array.isArray(card.buttons) ? card.buttons.filter(Boolean) : [],
                        imagePath: card.imageFile ? (() => { const p = path.join(IMAGES_DIR, card.imageFile); return fs.existsSync(p) ? p : null; })() : null,
                    }));
                    await waInst.sendCarousel(jid, replyText, resolvedCards, { title: activeTpl.carouselTitle || '', subtitle: activeTpl.carouselSubtitle || '', footer: activeTpl.carouselFooter || '' });
                } else if (isPoll && activeTpl) {
                    const pollMp = activeTpl.mediaFile ? (() => { const p = path.join(IMAGES_DIR, activeTpl.mediaFile); return fs.existsSync(p) ? p : null; })() : null;
                    await waInst.sendPoll(jid, replyText, activeTpl.pollQuestion, activeTpl.pollOptions, pollMp);
                } else if (activeTpl?.templateType === 'contact' && activeTpl.contactName) {
                    await waInst.sendContact(jid, activeTpl.contactName, activeTpl.contactPhone || '', replyText);
                } else if (activeTpl?.templateType === 'location' && activeTpl.locationName) {
                    await waInst.sendLocation(jid, activeTpl.locationName, activeTpl.locationAddress || '', activeTpl.locationLat || '0', activeTpl.locationLng || '0', replyText);
                } else {
                    await waInst.sendMessage(jid, replyText, tplImagePath, tplButtonType, tplButtons, tplListBtnText, tplListSections, tplMediaType);
                }
            } catch (sendErr) { console.error('[AutoReply] Send error:', sendErr.message); continue; }

            log[key] = new Date().toISOString();
            logUpdated = true;
            rule.totalResponses = (rule.totalResponses || 0) + 1;
            rulesFired = true;
            break; // only fire the highest-priority matching rule
        }

        if (logUpdated) await storage.saveAutoReplyLog(log);
        if (rulesFired)  await storage.saveAutoReplyRules(rules);
    } catch (err) { console.error('[AutoReply] Engine error:', err.message); }
});
