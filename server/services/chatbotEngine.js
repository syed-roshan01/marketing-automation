'use strict';
// Chatbot engine — matches keyword-triggered conversation flows
const path          = require('path');
const fs            = require('fs');
const fsp           = fs.promises;
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const { IMAGES_DIR } = require('../constants');

const sessionCooldowns = new Map(); // flowId:jid -> last trigger time

function randInt(min, max) {
    const lo = Number.isFinite(min) ? Math.floor(min) : 1;
    const hi = Number.isFinite(max) ? Math.floor(max) : lo;
    if (hi <= lo) return lo;
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function normalizeText(v) {
    return String(v || '').replace(/\s+/g, ' ').trim();
}

function normalizeKeywordToken(v) {
    return normalizeText(v)
        .replace(/^[\s.,!?;:'"`~()\[\]{}<>\-_/\\]+/, '')
        .replace(/[\s.,!?;:'"`~()\[\]{}<>\-_/\\]+$/, '');
}

function matchKeyword(body, kw, matchType, caseSensitive) {
    let text = normalizeKeywordToken(body);
    let keyword = normalizeKeywordToken(kw);
    if (!keyword) return false;
    const textLower = text.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    if (!caseSensitive) { text = textLower; keyword = keywordLower; }
    switch (matchType) {
        case 'exact':
            // For exact match, allow a case-insensitive fallback even when matchCase=true
            // to prevent intermittent misses from keyboard auto-capitalization.
            return text === keyword || textLower === keywordLower;
        case 'starts_with': return text.startsWith(keyword);
        case 'ends_with':   return text.endsWith(keyword);
        case 'contains':
        default:            return text.includes(keyword);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── In-memory flows cache (avoids a disk read on every incoming message) ────────
// Flows change rarely — refresh every 10 s or on explicit invalidation.
let _flowsCache = null;
let _flowsCacheTs = 0;
const FLOWS_CACHE_TTL = 10_000;

// Debounced save to avoid frequent disk writes when flows trigger often
let _pendingFlowsSave = false;
function scheduleSaveFlows(flows) {
    if (_pendingFlowsSave) return;
    _pendingFlowsSave = true;
    setTimeout(() => {
        _pendingFlowsSave = false;
        storage.saveChatbotFlows(flows).catch(e => console.error('[Chatbot] Save error:', e.message));
    }, 1500);
}

async function getCachedFlows() {
    if (_flowsCache && Date.now() - _flowsCacheTs < FLOWS_CACHE_TTL) return _flowsCache;
    _flowsCache = await storage.getChatbotFlows();
    _flowsCacheTs = Date.now();
    return _flowsCache;
}

// Templates cache to avoid disk reads when sending template nodes on instant flows
let _templatesCache = null;
let _templatesCacheTs = 0;
const TEMPLATES_CACHE_TTL = 10_000;
async function getCachedTemplates() {
    if (_templatesCache && Date.now() - _templatesCacheTs < TEMPLATES_CACHE_TTL) return _templatesCache;
    _templatesCache = await storage.getTemplates();
    _templatesCacheTs = Date.now();

    // Preload media buffers for templates to avoid disk reads during fast-path sends
    try {
        await Promise.all((_templatesCache || []).map(async (tpl) => {
            tpl._preloaded = tpl._preloaded || {};
            const candidate = tpl.imageFile || tpl.mediaFile;
            if (!candidate) return;
            const p = path.join(IMAGES_DIR, candidate);
            try {
                await fsp.access(p);
                const buf = await fsp.readFile(p);
                // Attach metadata similar to sendMessage's expectations
                const ext = path.extname(p).toLowerCase().replace('.', '');
                const mimeMap = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
                    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
                    mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
                    pdf: 'application/pdf', doc: 'application/msword',
                    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                };
                buf._mimetype = mimeMap[ext] || 'application/octet-stream';
                buf._filename = path.basename(p);
                tpl._preloaded.buffer = buf;
                // Precompute small JPEG thumbnail for images to avoid sharp work during send
                const imgExts = ['jpg','jpeg','png','gif','webp'];
                if (imgExts.includes(ext)) {
                    try {
                        const thumb = await require('sharp')(buf)
                            .resize(72, 72, { fit: 'cover', position: 'centre' })
                            .jpeg({ quality: 30, progressive: false })
                            .toBuffer();
                        tpl._preloaded.jpegThumbnail = new Uint8Array(thumb);
                    } catch (_) { /* ignore thumbnail failures */ }
                }
            } catch (_) {
                // ignore missing files
            }
        }));
    } catch (e) {
        console.warn('[Chatbot] Template prewarm failed:', e.message);
    }

    return _templatesCache;
}

function invalidateFlowsCache() { _flowsCache = null; }
function invalidateTemplatesCache() { _templatesCache = null; }

deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId }) => {
    try {
        const flows  = await getCachedFlows();
        // flow.sessionIds holds the device ids — match any; fall back to legacy sessionId
        const active = flows.filter(f => {
            if (!f.active) return false;
            if (Array.isArray(f.sessionIds) && f.sessionIds.length) return f.sessionIds.includes(deviceId);
            if (f.sessionId) return f.sessionId === deviceId;
            return false;
        });
        if (!active.length) return;

        const isGroup = (jid || '').includes('@g.us');
        const optouts = await storage.getOptoutRecords();
        const isOptedOut = optouts.some(r => r.phone === phone && r.type === 'optout');
        const settings = await storage.getSettings();
        const incomingText = normalizeText(body);

        // Load templates once (needed for template-type nodes)
        let templates = null;

        for (const flow of active) {
            if (isOptedOut && flow.skipOptedOut === true) continue;
            if (flow.targetType === 'individual' && isGroup)  continue;
            if (flow.targetType === 'group'      && !isGroup) continue;

            // ── keyword matching — field is triggerKeywords ─────────────────
            const keywords = (Array.isArray(flow.triggerKeywords) ? flow.triggerKeywords : [])
                .map(k => normalizeText(k))
                .filter(Boolean);
            const caseSensitive = !!flow.matchCase; // stored as matchCase, not caseSensitive
            if (keywords.length > 0 && !keywords.some(kw => matchKeyword(incomingText, kw, flow.matchType || 'exact', caseSensitive))) continue;

            // ── per-flow cooldown ───────────────────────────────────────────
            const cooldownMs = (flow.cooldownMinutes || 0) * 60 * 1000;
            const ck   = `${flow.id}:${jid}`;
            const last = sessionCooldowns.get(ck) || 0;
            if (cooldownMs > 0 && Date.now() - last < cooldownMs) continue;

            const waInst = deviceManager.get(deviceId);
            if (!waInst || !waInst.isReady()) continue;

            const nodes = (Array.isArray(flow.nodes) ? flow.nodes : [])
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            sessionCooldowns.set(ck, Date.now());
            flow.totalConversations = (flow.totalConversations || 0) + 1;

            // If the flow requests instant send, bypass global typing simulation
            const typingEnabled = (settings.typingEnabled !== false) && !flow.instantSend;

            // Delay between nodes comes from the flow-level setting
            const betweenDelayMs = flow.instantSend ? 0 : (flow.messageDelaySeconds || 0) * 1000;

            for (let ni = 0; ni < nodes.length; ni++) {
                const node = nodes[ni];

                // ── Resolve message text ────────────────────────────────────
                // Nodes store text in node.content (not node.text)
                let messageText = node.content || node.text || '';
                let activeTpl = null;
                let tplButtonType = 'none';
                let tplButtons = [];
                let tplListBtnText = 'View Options';
                let tplListSections = [];
                let isCarousel = false;
                let isPoll = false;
                let isContact = false;
                let isLocation = false;

                // If it's a template node, look up the template for its text
                if (node.messageType === 'template' && node.templateId) {
                    if (!templates) templates = await storage.getTemplates();
                    const tpl = templates.find(t => t.id === node.templateId);
                    if (tpl) {
                        activeTpl = tpl;
                        messageText = tpl.text || tpl.body || tpl.content || '';
                        tplButtonType = tpl.buttonType || 'none';
                        tplButtons = Array.isArray(tpl.buttons) ? tpl.buttons.filter(Boolean) : [];
                        tplListBtnText = tpl.listButtonText || 'View Options';
                        tplListSections = Array.isArray(tpl.listSections) ? tpl.listSections : [];
                        isCarousel = tpl.templateType === 'carousel' && Array.isArray(tpl.cards) && tpl.cards.length >= 2;
                        isPoll = tpl.templateType === 'poll' && !!tpl.pollQuestion && Array.isArray(tpl.pollOptions) && tpl.pollOptions.length >= 2;
                        isContact = tpl.templateType === 'contact' && !!tpl.contactName;
                        isLocation = tpl.templateType === 'location' && !!tpl.locationName;
                    }
                }

                // ── Resolve attachment ──────────────────────────────────────
                // Nodes store attachment in node.attachmentFile (not node.imageFile)
                let imagePath = null, mediaType = null;
                const attachFile = node.messageType === 'template'
                    ? (activeTpl?.imageFile || activeTpl?.mediaFile || null)
                    : (node.attachmentFile || node.imageFile || node.mediaFile);
                    if (attachFile) {
                        const ap = path.join(IMAGES_DIR, attachFile);
                        // Prefer preloaded buffer when available (from templates cache)
                        if (activeTpl && activeTpl._preloaded && activeTpl._preloaded.buffer) {
                            imagePath = activeTpl._preloaded.buffer;
                            mediaType = activeTpl._preloaded.buffer._mimetype && activeTpl._preloaded.buffer._mimetype.startsWith('image/') ? 'image' : (activeTpl._preloaded.buffer._mimetype && activeTpl._preloaded.buffer._mimetype.startsWith('video/') ? 'video' : null);
                        } else {
                            try {
                                await fsp.access(ap);
                                imagePath = ap;
                                // attachmentType stores the media kind; fall back to extension sniff
                                mediaType = node.messageType === 'template'
                                    ? (activeTpl?.mediaType || null)
                                    : (node.attachmentType || node.mediaType || null);
                                if (!mediaType) {
                                    const ext = path.extname(attachFile).toLowerCase();
                                    if (['.mp4','.mov','.avi','.mkv'].includes(ext))      mediaType = 'video';
                                    else if (['.mp3','.ogg','.m4a','.wav','.aac'].includes(ext)) mediaType = 'audio';
                                    else if (['.pdf','.doc','.docx','.xls','.xlsx','.txt','.zip'].includes(ext)) mediaType = 'document';
                                    else mediaType = 'image';
                                }
                            } catch (_) { /* missing file */ }
                        }
                    }

                // Skip nodes with nothing to send
                if (!messageText && !imagePath && !isCarousel && !isPoll && !isContact && !isLocation) continue;

                // If instantSend is enabled for this flow, bypass typing simulation and inter-node delays entirely
                if (!flow.instantSend) {
                    const interNodeDelayMs = ni > 0 ? betweenDelayMs : 0;
                    let configuredTypingMs = 0;
                    if (typingEnabled) {
                        const minSec = Math.max(0, Number(settings.typingMin) || 1);
                        const maxSec = Math.max(minSec, Number(settings.typingMax) || minSec);
                        configuredTypingMs = Math.max(500, Math.min(randInt(minSec, maxSec) * 1000, 15000));
                    }

                    // Use a single lead-in window. Typing is shown during this time, then send instantly.
                    const leadInMs = Math.max(interNodeDelayMs, configuredTypingMs);
                    if (leadInMs > 0) {
                        const effectiveLeadMs = Math.min(leadInMs, 60000);
                        if (typingEnabled && effectiveLeadMs >= 350) {
                            await waInst.sendTyping(jid, effectiveLeadMs);
                        } else {
                            await sleep(effectiveLeadMs);
                        }
                        const remainingMs = leadInMs - effectiveLeadMs;
                        if (remainingMs > 0) await sleep(remainingMs);
                    }
                }

                const btnType  = node.messageType === 'template' ? tplButtonType : (node.buttonType || 'none');
                const buttons  = node.messageType === 'template' ? tplButtons : (Array.isArray(node.buttons) ? node.buttons.filter(Boolean) : []);
                const listBtn  = node.messageType === 'template' ? tplListBtnText : (node.listButtonText || 'View Options');
                const listSect = node.messageType === 'template' ? tplListSections : (Array.isArray(node.listSections) ? node.listSections : []);

                try {
                    if (isCarousel && activeTpl) {
                        const resolvedCards = activeTpl.cards.map(card => ({
                            text: card.text || '',
                            footer: card.footer || '',
                            buttons: Array.isArray(card.buttons) ? card.buttons.filter(Boolean) : [],
                            imagePath: card.imageFile ? (() => {
                                const p = path.join(IMAGES_DIR, card.imageFile);
                                return fs.existsSync(p) ? p : null;
                            })() : null,
                        }));
                        await waInst.sendCarousel(jid, messageText, resolvedCards, {
                            title: activeTpl.carouselTitle || '',
                            subtitle: activeTpl.carouselSubtitle || '',
                            footer: activeTpl.carouselFooter || '',
                        });
                    } else if (isPoll && activeTpl) {
                        const pollMediaPath = activeTpl.mediaFile ? (() => {
                            const p = path.join(IMAGES_DIR, activeTpl.mediaFile);
                            return fs.existsSync(p) ? p : null;
                        })() : null;
                        await waInst.sendPoll(jid, messageText, activeTpl.pollQuestion, activeTpl.pollOptions, pollMediaPath);
                    } else if (isContact && activeTpl) {
                        await waInst.sendContact(jid, activeTpl.contactName, activeTpl.contactPhone || '', messageText);
                    } else if (isLocation && activeTpl) {
                        await waInst.sendLocation(jid, activeTpl.locationName, activeTpl.locationAddress || '', activeTpl.locationLat || '0', activeTpl.locationLng || '0', messageText);
                    } else {
                        await waInst.sendMessage(jid, messageText, imagePath, btnType, buttons, listBtn, listSect, mediaType);
                    }
                } catch (sendErr) { console.error('[Chatbot] Send error:', sendErr.message); }
            }

            // persist updated conversation count (debounced to avoid frequent disk writes)
            scheduleSaveFlows(flows);
            break; // fire only first matching flow
        }
    } catch (err) { console.error('[Chatbot] Engine error:', err.message); }
});

    // Fast-path for instant-send flows. This listens to a lightweight incoming event
    // emitted before heavier parsing and persists; only handles flows with instantSend=true
    deviceManager.on('incoming_message_quick', async ({ phone, jid, body: quickBody, deviceId, recvDelayMs }) => {
        try {
            const flows = await getCachedFlows();
            const active = flows.filter(f => f.active && (Array.isArray(f.sessionIds) && f.sessionIds.length ? f.sessionIds.includes(deviceId) : (f.sessionId ? f.sessionId === deviceId : false)));
            if (!active.length) return;

            const isGroup = (jid || '').includes('@g.us');
            const optouts = await storage.getOptoutRecords();
            const isOptedOut = optouts.some(r => r.phone === phone && r.type === 'optout');

            for (const flow of active) {
                if (!flow.instantSend) continue; // only fast-path instant flows
                if (isOptedOut && flow.skipOptedOut === true) continue;
                if (flow.targetType === 'individual' && isGroup)  continue;
                if (flow.targetType === 'group'      && !isGroup) continue;

                const keywords = (Array.isArray(flow.triggerKeywords) ? flow.triggerKeywords : []).map(k => normalizeText(k)).filter(Boolean);
                const caseSensitive = !!flow.matchCase;
                if (keywords.length > 0 && !keywords.some(kw => matchKeyword(quickBody, kw, flow.matchType || 'exact', caseSensitive))) continue;

                const ck   = `${flow.id}:${jid}`;
                const cooldownMs = (flow.cooldownMinutes || 0) * 60 * 1000;
                const last = sessionCooldowns.get(ck) || 0;
                if (cooldownMs > 0 && Date.now() - last < cooldownMs) continue;

                const waInst = deviceManager.get(deviceId);
                if (!waInst || !waInst.isReady()) continue;

                const nodes = (Array.isArray(flow.nodes) ? flow.nodes : []).slice().sort((a,b) => (a.order??0)-(b.order??0));
                sessionCooldowns.set(ck, Date.now());
                flow.totalConversations = (flow.totalConversations || 0) + 1;

                // Load templates once for this flow
                const templates = await getCachedTemplates();

                for (let ni = 0; ni < nodes.length; ni++) {
                    const node = nodes[ni];
                    let messageText = node.content || node.text || '';
                    let activeTpl = null;
                    let tplButtonType = 'none';
                    let tplButtons = [];
                    let tplListBtnText = 'View Options';
                    let tplListSections = [];
                    let isCarousel = false;
                    let isPoll = false;
                    let isContact = false;
                    let isLocation = false;

                    if (node.messageType === 'template' && node.templateId) {
                        const tpl = templates.find(t => t.id === node.templateId);
                        if (tpl) {
                            activeTpl = tpl;
                            messageText = tpl.text || tpl.body || tpl.content || '';
                            tplButtonType = tpl.buttonType || 'none';
                            tplButtons = Array.isArray(tpl.buttons) ? tpl.buttons.filter(Boolean) : [];
                            tplListBtnText = tpl.listButtonText || 'View Options';
                            tplListSections = Array.isArray(tpl.listSections) ? tpl.listSections : [];
                            isCarousel = tpl.templateType === 'carousel' && Array.isArray(tpl.cards) && tpl.cards.length >= 2;
                            isPoll = tpl.templateType === 'poll' && !!tpl.pollQuestion && Array.isArray(tpl.pollOptions) && tpl.pollOptions.length >= 2;
                            isContact = tpl.templateType === 'contact' && !!tpl.contactName;
                            isLocation = tpl.templateType === 'location' && !!tpl.locationName;
                        }
                    }

                    let imagePath = null, mediaType = null;
                    const attachFile = node.messageType === 'template' ? (activeTpl?.imageFile || activeTpl?.mediaFile || null) : (node.attachmentFile || node.imageFile || node.mediaFile);
                    if (attachFile) {
                        const ap = path.join(IMAGES_DIR, attachFile);
                        if (activeTpl && activeTpl._preloaded && activeTpl._preloaded.buffer) {
                            imagePath = activeTpl._preloaded.buffer;
                            mediaType = activeTpl._preloaded.buffer._mimetype && activeTpl._preloaded.buffer._mimetype.startsWith('image/') ? 'image' : (activeTpl._preloaded.buffer._mimetype && activeTpl._preloaded.buffer._mimetype.startsWith('video/') ? 'video' : null);
                        } else {
                            try {
                                await fsp.access(ap);
                                imagePath = ap;
                                mediaType = node.messageType === 'template' ? (activeTpl?.mediaType || null) : (node.attachmentType || node.mediaType || null);
                                if (!mediaType) {
                                    const ext = path.extname(attachFile).toLowerCase();
                                    if (['.mp4','.mov','.avi','.mkv'].includes(ext))      mediaType = 'video';
                                    else if (['.mp3','.ogg','.m4a','.wav','.aac'].includes(ext)) mediaType = 'audio';
                                    else if (['.pdf','.doc','.docx','.xls','.xlsx','.txt','.zip'].includes(ext)) mediaType = 'document';
                                    else mediaType = 'image';
                                }
                            } catch (_) { }
                        }
                    }

                    if (!messageText && !imagePath && !isCarousel && !isPoll && !isContact && !isLocation) continue;

                    try {
                        if (isCarousel && activeTpl) {
                            const resolvedCards = activeTpl.cards.map(card => ({ text: card.text||'', footer: card.footer||'', buttons: Array.isArray(card.buttons)?card.buttons.filter(Boolean):[], imagePath: card.imageFile ? (() => { const p = path.join(IMAGES_DIR, card.imageFile); return fs.existsSync(p)?p:null; })() : null }));
                            await waInst.sendCarousel(jid, messageText, resolvedCards, { title: activeTpl.carouselTitle||'', subtitle: activeTpl.carouselSubtitle||'', footer: activeTpl.carouselFooter||'' });
                        } else if (isPoll && activeTpl) {
                            const pollMediaPath = activeTpl.mediaFile ? (() => { const p = path.join(IMAGES_DIR, activeTpl.mediaFile); return fs.existsSync(p)?p:null; })() : null;
                            await waInst.sendPoll(jid, messageText, activeTpl.pollQuestion, activeTpl.pollOptions, pollMediaPath);
                        } else if (isContact && activeTpl) {
                            await waInst.sendContact(jid, activeTpl.contactName, activeTpl.contactPhone||'', messageText);
                        } else if (isLocation && activeTpl) {
                            await waInst.sendLocation(jid, activeTpl.locationName, activeTpl.locationAddress||'', activeTpl.locationLat||'0', activeTpl.locationLng||'0', messageText);
                        } else {
                            const btnType  = node.messageType === 'template' ? tplButtonType : (node.buttonType || 'none');
                            const buttons  = node.messageType === 'template' ? tplButtons : (Array.isArray(node.buttons) ? node.buttons.filter(Boolean) : []);
                            const listBtn  = node.messageType === 'template' ? tplListBtnText : (node.listButtonText || 'View Options');
                            const listSect = node.messageType === 'template' ? tplListSections : (Array.isArray(node.listSections) ? node.listSections : []);
                            await waInst.sendMessage(jid, messageText, imagePath, btnType, buttons, listBtn, listSect, mediaType);
                        }
                    } catch (sendErr) { console.error('[Chatbot][Fast] Send error:', sendErr.message); }
                }

                scheduleSaveFlows(flows);
                break; // only first matching flow
            }
        } catch (err) { console.error('[Chatbot][Fast] Engine error:', err.message); }
    });

module.exports = { invalidateFlowsCache, invalidateTemplatesCache };
