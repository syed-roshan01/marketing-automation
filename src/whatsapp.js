const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
} = require('@fadzzzslebew/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
const sharp = require('sharp');

class WhatsAppManager extends EventEmitter {
    constructor(authDir) {
        super();
        this.authDir = authDir;
        this.sock = null;
        this.status = 'disconnected'; // disconnected | initializing | qr | ready
        this.qrCode = null;
        // Maps @lid JIDs → phone digits  (populated from contacts.upsert events)
        this.lidToPhone = new Map();
        // JIDs known to exist on WhatsApp (they messaged us) — skips onWhatsApp existence check on replies
        this.knownJids = new Set();
        // WhatsApp labels (Business feature) — populated from labels.edit events
        this._labels = new Map(); // id → { id, name, color }
        this._labelAssociations = []; // [{ chatId, labelId, type }]
        // Reconnection state
        this._initLock       = false;  // prevent simultaneous init races
        this._reconnectTimer = null;
        this._reconnectAttempts = 0;
        this._keepaliveTimer = null;
        // Persists across reconnects so the same message is never re-processed
        this._seenMsgIds = new Set();
    }

    // Returns all known WhatsApp labels
    getLabels() {
        return Array.from(this._labels.values());
    }

    // Returns labelIds for a given chat JID
    getChatLabels(chatId) {
        return this._labelAssociations
            .filter(a => a.chatId === chatId)
            .map(a => a.labelId);
    }

    // Called by server.js (without await) — kicks off async init internally
    initialize() {
        // Cancel any pending reconnect timer so we don't double-connect
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        this._doInitialize().catch(err => {
            console.error('[WhatsApp] Init error:', err);
            this._initLock = false;
            this._scheduleReconnect();
        });
    }

    async _doInitialize() {
        if (this.sock || this._initLock) return;
        this._initLock = true;

        this.status = 'initializing';
        this.emit('status_change', this.status);

        if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

        // Fetch the latest WA version from WhiskeySockets' maintained repo.
        // The fork's fetchLatestBaileysVersion points to a broken JSON source,
        // causing it to silently fall back to a stale version that WA rejects (405).
        let version;
        try {
            const res = await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json',
                { signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            version = data.version;
            console.log('[WhatsApp] WA version:', version.join('.'));
        } catch (_) {
            ({ version } = await fetchLatestBaileysVersion());
            console.log('[WhatsApp] WA version (fallback):', version.join('.'));
        }

        this.sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: true,
            browser: ['Windows', 'Chrome', '24.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            logger: require('pino')({ level: 'silent' }),
            // Stability settings — tuned for persistent long-running connections
            keepAliveIntervalMs:    20_000,   // ping every 20s (was 25s)
            connectTimeoutMs:       90_000,   // allow 90s to establish (was 60s)
            retryRequestDelayMs:    500,      // wait 500ms between retries (was 250ms)
            maxMsgRetryCount:       5,        // retry failed sends up to 5 times (was 3)
            defaultQueryTimeoutMs:  60_000,   // don't give up on queries quickly
        });
        // Lock released once socket object exists — any further initialize() call
        // will be rejected by the `if (this.sock)` guard instead
        this._initLock = false;

        this.sock.ev.on('creds.update', saveCreds);

        // ── Incoming message keyword handler (opt-out / opt-in) ──────────────
        // Deduplicate by message ID — Baileys can fire upsert multiple times for
        // the same message (history sync, multi-device relay, etc.)
        // NOTE: _seenMsgIds is an instance property (set in constructor) so it
        // survives socket reconnects and prevents double-triggering after blips.
        const _seenMsgIds = this._seenMsgIds;
        const extractMessagePayload = (m) => {
            let cur = m || {};
            for (let i = 0; i < 5; i++) {
                if (cur.ephemeralMessage?.message) { cur = cur.ephemeralMessage.message; continue; }
                if (cur.viewOnceMessage?.message)  { cur = cur.viewOnceMessage.message; continue; }
                if (cur.viewOnceMessageV2?.message) { cur = cur.viewOnceMessageV2.message; continue; }
                if (cur.viewOnceMessageV2Extension?.message) { cur = cur.viewOnceMessageV2Extension.message; continue; }
                if (cur.documentWithCaptionMessage?.message) { cur = cur.documentWithCaptionMessage.message; continue; }
                break;
            }
            return cur || {};
        };

        const extractBodyText = (messageObj) => {
            const m = extractMessagePayload(messageObj);

            // Parse paramsJson from interactive button/list responses so all engines
            // receive clean plain text instead of a raw JSON string.
            const rawParamsJson = m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            let interactiveText = '';
            if (rawParamsJson) {
                try {
                    const p = JSON.parse(rawParamsJson);
                    interactiveText = p.display_text || p.title || p.id || rawParamsJson;
                } catch (_) {
                    interactiveText = rawParamsJson;
                }
            }

            return (
                m.conversation ||
                m.extendedTextMessage?.text ||
                m.imageMessage?.caption ||
                m.videoMessage?.caption ||
                m.documentMessage?.caption ||
                m.buttonsResponseMessage?.selectedDisplayText ||
                m.templateButtonReplyMessage?.selectedDisplayText ||
                m.listResponseMessage?.title ||
                m.listResponseMessage?.singleSelectReply?.selectedRowId ||
                interactiveText ||
                ''
            ).trim();
        };

        this.sock.ev.on('messages.upsert', ({ messages, type }) => {
            // Accept both 'notify' (standard real-time) and 'append' (some WA clients/states
            // deliver live messages as append). Reject everything else (e.g. 'set' for status updates).
            if (type !== 'notify' && type !== 'append') return;
            for (const msg of messages) {
                if (!msg.message || msg.key.fromMe) continue;
                // Skip messages older than 30 seconds — prevents re-processing history sync
                // messages that Baileys replays on reconnect (those always arrive as 'append').
                const msgTs = Number(msg.messageTimestamp || 0) * 1000;
                if (msgTs > 0 && Date.now() - msgTs > 30_000) continue;
                const msgId = msg.key.id;
                if (_seenMsgIds.has(msgId)) continue;
                _seenMsgIds.add(msgId);
                // Keep the set bounded — drop oldest entry after 2000 messages
                if (_seenMsgIds.size > 2000) {
                    const first = _seenMsgIds.values().next().value;
                    _seenMsgIds.delete(first);
                }
                // Register sender as known-valid so sendMessage skips the onWhatsApp check
                if (msg.key.remoteJid) {
                    this.knownJids.add(msg.key.remoteJid);
                    if (this.knownJids.size > 2000) this.knownJids.delete(this.knownJids.values().next().value);
                }
                const body = extractBodyText(msg.message);
                const bodyUpper = body.toUpperCase();
                if (bodyUpper === 'UNSUBSCRIBE' || bodyUpper === 'SUBSCRIBE') {
                    const phone = (msg.key.remoteJid || '').split('@')[0].split(':')[0];
                    this.emit('optout_keyword', { phone, keyword: bodyUpper, sock: this.sock });
                }
                // Emit every inbound message for auto-reply / chatbot engines (original case preserved)
                const phone2 = (msg.key.remoteJid || '').split('@')[0].split(':')[0];
                this.emit('incoming_message', { phone: phone2, jid: msg.key.remoteJid, body, msg, sock: this.sock });
            }
        });

        // Build LID → phone mapping from contact sync events.
        // WhatsApp sends this data during initial connection and on contact updates.
        const _applyContacts = (contacts) => {
            for (const c of contacts) {
                if (!c.id) continue;
                // c.id is the phone JID (@s.whatsapp.net), c.lid is the LID JID (@lid)
                if (c.lid && c.id.endsWith('@s.whatsapp.net')) {
                    const lidJid = c.lid.includes('@') ? c.lid : `${c.lid}@lid`;
                    const phone  = c.id.split('@')[0].split(':')[0];
                    if (phone) this.lidToPhone.set(lidJid, phone);
                }
            }
        };
        this.sock.ev.on('contacts.upsert', _applyContacts);
        this.sock.ev.on('contacts.update', _applyContacts);

        // ── WhatsApp label tracking (Business accounts) ───────────────────────
        this.sock.ev.on('labels.edit', (label) => {
            if (label.deleted) this._labels.delete(label.id);
            else this._labels.set(label.id, { id: label.id, name: label.name, color: label.color });
        });
        this.sock.ev.on('labels.association', ({ type, association }) => {
            if (type === 'add') {
                // avoid duplicates
                const exists = this._labelAssociations.some(a => a.chatId === association.chatId && a.labelId === association.labelId);
                if (!exists) this._labelAssociations.push({ chatId: association.chatId, labelId: association.labelId });
            } else {
                this._labelAssociations = this._labelAssociations.filter(a =>
                    !(a.chatId === association.chatId && a.labelId === association.labelId)
                );
            }
        });

        this.sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                this.qrCode = qr;
                this.status = 'qr';
                this.emit('qr', qr);
                this.emit('status_change', this.status);
            }

            if (connection === 'open') {
                this.qrCode = null;
                this.status = 'ready';
                this._reconnectAttempts = 0; // reset backoff on successful connect
                this._startKeepalive();
                this.emit('ready');
                this.emit('status_change', this.status);
                console.log('[WhatsApp] Client is ready');
            }

            if (connection === 'close') {
                const code = (lastDisconnect?.error instanceof Boom)
                    ? lastDisconnect.error.output?.statusCode
                    : 0;
                const loggedOut  = code === DisconnectReason.loggedOut;
                const badSession = code === DisconnectReason.badSession;
                // restartRequired (515): WA pushes this when it wants us to reconnect NOW
                const restartNow = code === DisconnectReason.restartRequired;

                this._stopKeepalive();
                this.status = 'disconnected';
                this.qrCode = null;
                this.sock   = null;
                this._initLock = false;
                this._labels.clear();
                this._labelAssociations = [];
                this.emit('status_change', this.status);

                if (loggedOut || badSession) {
                    // Explicit logout OR corrupted session — wipe creds and ask for re-scan
                    try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (_) {}
                    console.log(`[WhatsApp] Session ended (code ${code}) — credentials cleared`);
                    this.emit('disconnected', 'logged_out');
                } else if (restartNow) {
                    // Server-requested restart — reconnect immediately, no backoff
                    console.log('[WhatsApp] Restart requested by WA server — reconnecting now…');
                    this.emit('disconnected', 'connection_closed');
                    setTimeout(() => this.initialize(), 500);
                } else {
                    // Network glitch / timeout / server blip — exponential backoff
                    this.emit('disconnected', 'connection_closed');
                    this._scheduleReconnect();
                }
            }
        });
    }

    // ── Reconnection helpers ─────────────────────────────────────────────────

    _scheduleReconnect() {
        if (this._reconnectTimer) return; // already scheduled, don't stack timers
        // Exponential backoff: 3s, 6s, 12s, 24s … capped at 30s
        const delay = Math.min(3000 * Math.pow(2, this._reconnectAttempts), 30_000);
        this._reconnectAttempts++;
        console.log(`[WhatsApp] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this._reconnectAttempts})…`);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            this.initialize();
        }, delay);
    }

    _startKeepalive() {
        this._stopKeepalive();
        this._keepaliveFailures = 0; // reset failure counter on (re)connect
        this._keepaliveTimer = setInterval(async () => {
            if (!this.sock || this.status !== 'ready') {
                this._stopKeepalive();
                return;
            }
            try {
                // Lightweight presence ping — keeps TCP connection alive through NAT/firewalls
                await this.sock.sendPresenceUpdate('available');
                this._keepaliveFailures = 0; // reset on success
            } catch (err) {
                this._keepaliveFailures = (this._keepaliveFailures || 0) + 1;
                console.warn(`[WhatsApp] Keepalive ping failed (${this._keepaliveFailures}/3):`, err.message);
                // Only disconnect after 3 consecutive failures — single blips are normal
                if (this._keepaliveFailures >= 3) {
                    console.warn('[WhatsApp] 3 consecutive keepalive failures — triggering reconnect');
                    this._stopKeepalive();
                    this.sock   = null;
                    this._initLock = false;
                    this.status = 'disconnected';
                    this.qrCode = null;
                    this.emit('status_change', this.status);
                    this.emit('disconnected', 'connection_closed');
                    this._scheduleReconnect();
                }
            }
        }, 20_000); // every 20 seconds
    }

    _stopKeepalive() {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    }

    async logout() {
        if (this.sock) {
            try { await this.sock.logout(); } catch (_) {}
            this.sock = null;
        }
        try { fs.rmSync(this.authDir, { recursive: true, force: true }); } catch (_) {}
        this.status = 'disconnected';
        this.qrCode = null;
        this.emit('status_change', this.status);
    }

    // buttonType: 'none' | 'quick_reply' | 'list'
    // buttons: string[]  (quick_reply labels, max 3)
    // listButtonText: string  (list open button lead label)
    // listSections: [{title, rows:[{id,title,description}]}]
    // mediaType: 'image' | 'video' | 'audio' | 'document' | null
    async sendMessage(to, message, imagePath = null, buttonType = 'none', buttons = [], listButtonText = 'View Options', listSections = [], mediaType = null) {
        if (!this.isReady()) throw new Error('WhatsApp client not ready');

        // Normalise buttonType: accept both 'quick-reply' and 'quick_reply'
        if (buttonType === 'quick-reply') buttonType = 'quick_reply';

        const jid = this._toJid(to);
        const digits = String(to).replace(/[^0-9]/g, '');

        // Warn about likely-missing country code (all real WA numbers are ≥11 digits)
        if (digits.length < 11) {
            console.warn(`[WA] Warning: "${to}" is only ${digits.length} digits — probably missing country code. JID: ${jid}`);
        }

        // Verify the number is registered on WhatsApp — skip if they already messaged us
        // (knownJids guarantees they exist, saving a network round-trip for every reply)
        if (!jid.endsWith('@g.us') && !this.knownJids.has(jid)) {
            try {
                const [check] = await this.sock.onWhatsApp(jid);
                if (!check || !check.exists) {
                    throw new Error(`Number ${to} (${jid}) is not registered on WhatsApp`);
                }
            } catch (err) {
                // Re-throw "not registered" errors; swallow onWhatsApp infrastructure errors
                if (err.message.includes('not registered')) throw err;
                console.warn(`[WA] onWhatsApp check failed for ${jid}: ${err.message} — proceeding anyway`);
            }
        }

        console.log(`[WA send] to=${jid} type=${buttonType} image=${!!imagePath}`);

        // Read media into buffer + derive mimetype
        let imageBuffer;
        if (imagePath) {
            imageBuffer = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase().replace('.', '');
            const mimeMap = {
                // images
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                gif: 'image/gif',  webp: 'image/webp',
                // video
                mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
                mkv: 'video/x-matroska', webm: 'video/webm',
                // audio
                mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4',
                wav: 'audio/wav',  aac: 'audio/aac',  opus: 'audio/ogg',
                // document
                pdf: 'application/pdf',
                doc: 'application/msword',
                docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                xls: 'application/vnd.ms-excel',
                xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                ppt: 'application/vnd.ms-powerpoint',
                pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                txt: 'text/plain', zip: 'application/zip', rar: 'application/x-rar-compressed',
            };
            imageBuffer._mimetype = mimeMap[ext] || 'application/octet-stream';
            imageBuffer._filename = path.basename(imagePath);
            // Determine effective media type from extension if not provided
            if (!mediaType) {
                const imgExts = ['jpg','jpeg','png','gif','webp'];
                const vidExts = ['mp4','mov','avi','mkv','webm'];
                const audExts = ['mp3','ogg','m4a','wav','aac','opus'];
                if (imgExts.includes(ext)) mediaType = 'image';
                else if (vidExts.includes(ext)) mediaType = 'video';
                else if (audExts.includes(ext)) mediaType = 'audio';
                else mediaType = 'document';
            }
        }

        // Generate thumbnail for the blurred preview shown before full download.
        // WhatsApp requires a very small JPEG (≤100px) — larger thumbnails are ignored.
        // Only generate for image; video thumbnails must come from a frame (skip for now).
        let jpegThumbnail;
        if (imageBuffer && (!mediaType || mediaType === 'image')) {
            try {
                jpegThumbnail = await sharp(imageBuffer)
                    .resize(72, 72, { fit: 'cover', position: 'centre' })
                    .jpeg({ quality: 30, progressive: false })
                    .toBuffer();
                // Baileys expects a plain Uint8Array, not a Node Buffer with custom props
                jpegThumbnail = new Uint8Array(jpegThumbnail);
            } catch (e) {
                console.warn('[WA] Thumbnail generation failed:', e.message);
            }
        }

        let result;
        // Track whether this send was handled by the buttons path
        let handled = false;

        // ── Quick Reply Buttons ──────────────────────────────────────────────────────────────────
        // Uses the nativeFlow / interactive format supported by this Baileys fork
        // which works with image, video, document, and text headers.
        // This Baileys fork routes through dugong.handleInteractive when the content object
        // has an "interactiveMessage" key -- that triggers the correct native-flow button path.
        if (buttonType === 'quick_reply' && buttons.length > 0) {
            const nativeBtns = buttons.slice(0, 5).map((btn, i) => {
                const label = typeof btn === 'string' ? btn : (btn.label || '');
                const bType = typeof btn === 'string' ? 'quick_reply' : (btn.type || 'quick_reply');
                if (bType === 'cta_url') {
                    return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: label, url: btn.url || '', merchant_url: btn.url || '' }) };
                } else if (bType === 'cta_phone') {
                    return { name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text: label, phone_number: btn.phone || '' }) };
                } else if (bType === 'copy_code') {
                    return { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: label, copy_code: btn.copyCode || '' }) };
                } else {
                    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: label, id: `btn_${i}` }) };
                }
            });

            const buildInteractive = (mediaField) => ({
                interactiveMessage: {
                    title: message,
                    footer: '',
                    buttons: nativeBtns,
                    ...mediaField,
                },
            });

            if (imageBuffer && (!mediaType || mediaType === 'image')) {
                result = await this.sock.sendMessage(jid, buildInteractive({
                    image: imageBuffer,
                    mimetype: imageBuffer._mimetype,
                    ...(jpegThumbnail && { jpegThumbnail }),
                }));
            } else if (imageBuffer && mediaType === 'video') {
                result = await this.sock.sendMessage(jid, buildInteractive({
                    video: imageBuffer,
                    mimetype: imageBuffer._mimetype,
                }));
            } else if (imageBuffer && mediaType === 'document') {
                result = await this.sock.sendMessage(jid, buildInteractive({
                    document: imageBuffer,
                    mimetype: imageBuffer._mimetype,
                    fileName: imageBuffer._filename || 'file',
                }));
            } else {
                result = await this.sock.sendMessage(jid, buildInteractive({}));
                if (imageBuffer && mediaType === 'audio') {
                    await this.sock.sendMessage(jid, { audio: imageBuffer, mimetype: imageBuffer._mimetype, ptt: false });
                }
            }
            handled = true;
        }

        // ── List Message ───────────────────────────────────────────────────
        // Uses the modern interactiveMessage / single_select format.
        // The old { text, buttonText, sections } format is deprecated and causes
        // "your version of WhatsApp doesn't support this message" on modern clients.
        else if (buttonType === 'list' && listSections.length > 0) {
            const listPayload = {
                interactiveMessage: {
                    body:   { text: message },
                    footer: { text: '' },
                    nativeFlowMessage: {
                        buttons: [{
                            name: 'single_select',
                            buttonParamsJson: JSON.stringify({
                                title: listButtonText || 'View Options',
                                sections: listSections.map(s => ({
                                    title: s.title || '',
                                    rows: (s.rows || []).map(r => ({
                                        id:          r.id    || r.title || '',
                                        title:       r.title || '',
                                        description: r.description || '',
                                    })),
                                })),
                            }),
                        }],
                    },
                },
            };
            if (imageBuffer && (!mediaType || mediaType === 'image')) {
                listPayload.interactiveMessage.image = imageBuffer;
                listPayload.interactiveMessage.mimetype = imageBuffer._mimetype;
                if (jpegThumbnail) listPayload.interactiveMessage.jpegThumbnail = jpegThumbnail;
            }
            result = await this.sock.sendMessage(jid, listPayload);
            handled = true;
        }

        // ── Plain media or text (no interactive buttons, or non-image media that
        //    couldn't be combined with buttons) ────────────────────────────────
        if (!handled) {
            if (imageBuffer) {
                if (mediaType === 'video') {
                    result = await this.sock.sendMessage(jid, {
                        video: imageBuffer,
                        mimetype: imageBuffer._mimetype,
                        caption: message,
                    });
                } else if (mediaType === 'audio') {
                    result = await this.sock.sendMessage(jid, {
                        audio: imageBuffer,
                        mimetype: imageBuffer._mimetype,
                        ptt: false,
                    });
                } else if (mediaType === 'document') {
                    result = await this.sock.sendMessage(jid, {
                        document: imageBuffer,
                        mimetype: imageBuffer._mimetype,
                        caption: message,
                        fileName: imageBuffer._filename || 'file',
                    });
                } else {
                    // default: image
                    result = await this.sock.sendMessage(jid, {
                        image: imageBuffer,
                        mimetype: imageBuffer._mimetype,
                        caption: message,
                        ...(jpegThumbnail && { jpegThumbnail }),
                    });
                }
            } else {
                result = await this.sock.sendMessage(jid, { text: message });
            }
        }

        if (!result || !result.key) {
            throw new Error(`sendMessage returned no confirmation (jid=${jid})`);
        }
        console.log(`[WA send] OK msgId=${result.key.id}`);
    }

    // ── Carousel Message ─────────────────────────────────────────────────────
    // cards: [{ imagePath, text, footer, buttons: string[] }]
    // WhatsApp carousel requires ≥2 cards. Each card can have up to 2 buttons.
    async sendCarousel(to, bodyText, cards, { title = '', subtitle = '', footer = '' } = {}) {
        if (!this.isReady()) throw new Error('WhatsApp client not ready');
        if (!Array.isArray(cards) || cards.length < 2) throw new Error('Carousel requires at least 2 cards');

        const jid = this._toJid(to);

        // Verify the number is registered on WhatsApp
        try {
            const [check] = await this.sock.onWhatsApp(jid);
            if (!check || !check.exists) throw new Error(`Number ${to} is not registered on WhatsApp`);
        } catch (err) {
            if (err.message.includes('not registered')) throw err;
            console.warn(`[WA] onWhatsApp check failed for ${jid}: ${err.message} — proceeding`);
        }

        // Build each card proto
        const cardProtos = [];
        for (let ci = 0; ci < cards.length; ci++) {
            const card = cards[ci];
            let header;
            if (card.imagePath && fs.existsSync(card.imagePath)) {
                const buf = fs.readFileSync(card.imagePath);
                const media = await prepareWAMessageMedia(
                    { image: buf },
                    { upload: this.sock.waUploadToServer }
                );
                // imageMessage must be NESTED under header.imageMessage, not spread
                header = proto.Message.InteractiveMessage.Header.fromObject({
                    hasMediaAttachment: true,
                    imageMessage: media.imageMessage,
                });
            } else {
                header = proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false });
            }

            const validButtons = (card.buttons || []).filter(Boolean).slice(0, 2);
            // IDs must be unique across all cards to avoid conflicts
            const btns = validButtons.map((label, bi) => ({
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({ display_text: label, id: `c${ci}_b${bi}` }),
            }));

            cardProtos.push(proto.Message.InteractiveMessage.create({
                header,
                body:   proto.Message.InteractiveMessage.Body.create({ text: card.text || '' }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: card.footer || '' }),
                ...(btns.length > 0 && {
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: btns }),
                }),
            }));
        }

        const interactiveMsg = proto.Message.InteractiveMessage.create({
            body:   proto.Message.InteractiveMessage.Body.create({ text: bodyText || '' }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || '' }),
            header: proto.Message.InteractiveMessage.Header.create({
                hasMediaAttachment: false,
                ...(title    && { title }),
                ...(subtitle && { subtitle }),
            }),
            carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({ cards: cardProtos }),
        });

        const waMsg = generateWAMessageFromContent(
            jid,
            proto.Message.create({ interactiveMessage: interactiveMsg }),
            { userJid: this.sock.user?.jid }
        );

        await this.sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });
        console.log(`[WA carousel] OK to=${jid} cards=${cards.length}`);
        return waMsg;
    }

    // ── Poll Message ─────────────────────────────────────────────────────────
    // Sends an optional intro text/media, then a WhatsApp poll.
    // pollOptions: string[] (2–12 items)
    // mediaPath:   optional path to an image/video/audio/document sent before the poll
    async sendPoll(to, introText, pollQuestion, pollOptions, mediaPath = null) {
        if (!this.isReady()) throw new Error('WhatsApp client not ready');
        if (!pollQuestion || !Array.isArray(pollOptions) || pollOptions.length < 2)
            throw new Error('Poll requires a question and at least 2 options');

        const jid = this._toJid(to);

        // Verify number
        try {
            const [check] = await this.sock.onWhatsApp(jid);
            if (!check || !check.exists) throw new Error(`Number ${to} is not registered on WhatsApp`);
        } catch (err) {
            if (err.message.includes('not registered')) throw err;
            console.warn(`[WA] onWhatsApp check failed for ${jid}: ${err.message} — proceeding`);
        }

        // Send intro message + optional media first
        if (introText && introText.trim()) {
            if (mediaPath && fs.existsSync(mediaPath)) {
                const buf = fs.readFileSync(mediaPath);
                const ext = path.extname(mediaPath).toLowerCase().replace('.', '');
                const mimeMap = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
                    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
                    mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
                    pdf: 'application/pdf', doc: 'application/msword',
                    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                };
                const mime = mimeMap[ext] || 'application/octet-stream';
                const vidExts = ['mp4','mov','avi','mkv','webm'];
                const audExts = ['mp3','ogg','m4a','wav','aac'];
                if (vidExts.includes(ext)) {
                    await this.sock.sendMessage(jid, { video: buf, mimetype: mime, caption: introText });
                } else if (audExts.includes(ext)) {
                    await this.sock.sendMessage(jid, { text: introText });
                    await this.sock.sendMessage(jid, { audio: buf, mimetype: mime, ptt: false });
                } else if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
                    await this.sock.sendMessage(jid, { image: buf, mimetype: mime, caption: introText });
                } else {
                    await this.sock.sendMessage(jid, { document: buf, mimetype: mime, caption: introText, fileName: path.basename(mediaPath) });
                }
            } else {
                await this.sock.sendMessage(jid, { text: introText });
            }
        } else if (mediaPath && fs.existsSync(mediaPath)) {
            const buf = fs.readFileSync(mediaPath);
            const ext = path.extname(mediaPath).toLowerCase().replace('.', '');
            await this.sock.sendMessage(jid, { document: buf, fileName: path.basename(mediaPath) });
        }

        // Send the poll
        const result = await this.sock.sendMessage(jid, {
            poll: {
                name: pollQuestion,
                values: pollOptions.slice(0, 12),
                selectableCount: 1,
            },
        });

        if (!result || !result.key) throw new Error(`sendPoll returned no confirmation (jid=${jid})`);
        console.log(`[WA poll] OK to=${jid} question="${pollQuestion}" options=${pollOptions.length}`);
        return result;
    }

    // Simulate human typing before a message (best-effort)
    async sendTyping(to, durationMs) {
        if (!this.isReady()) return;
        try {
            const jid = this._toJid(to);
            await this.sock.presenceSubscribe(jid);
            await this.sock.sendPresenceUpdate('composing', jid);
            await new Promise(resolve => setTimeout(resolve, durationMs));
            await this.sock.sendPresenceUpdate('paused', jid);
        } catch (_) {}
    }

    // ── Send Contact Card ─────────────────────────────────────────────────────
    async sendContact(to, contactName, contactPhone, introText = '') {
        if (!this.isReady()) throw new Error('WhatsApp client not ready');
        const jid = this._toJid(to);
        try {
            const [check] = await this.sock.onWhatsApp(jid);
            if (!check || !check.exists) throw new Error(`Number ${to} is not registered on WhatsApp`);
        } catch (err) {
            if (err.message.includes('not registered')) throw err;
            console.warn(`[WA] onWhatsApp check failed for ${jid}: ${err.message} — proceeding anyway`);
        }
        const cleanPhone = String(contactPhone).replace(/[^0-9+]/g, '');
        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contactName}\nTEL;type=CELL;type=VOICE;waid=${cleanPhone.replace(/^\+/, '')}:${cleanPhone}\nEND:VCARD`;
        if (introText && introText.trim()) {
            await this.sock.sendMessage(jid, { text: introText.trim() });
        }
        await this.sock.sendMessage(jid, {
            contacts: { displayName: contactName, contacts: [{ vcard }] },
        });
    }

    // ── Send Location ─────────────────────────────────────────────────────────
    async sendLocation(to, locationName, locationAddress, lat, lng, introText = '') {
        if (!this.isReady()) throw new Error('WhatsApp client not ready');
        const jid = this._toJid(to);
        try {
            const [check] = await this.sock.onWhatsApp(jid);
            if (!check || !check.exists) throw new Error(`Number ${to} is not registered on WhatsApp`);
        } catch (err) {
            if (err.message.includes('not registered')) throw err;
            console.warn(`[WA] onWhatsApp check failed for ${jid}: ${err.message} — proceeding anyway`);
        }
        if (introText && introText.trim()) {
            await this.sock.sendMessage(jid, { text: introText.trim() });
        }
        await this.sock.sendMessage(jid, {
            location: {
                degreesLatitude:  parseFloat(lat)  || 0,
                degreesLongitude: parseFloat(lng) || 0,
                name:    locationName    || '',
                address: locationAddress || '',
            },
        });
    }

    // Convert phone number string to WhatsApp JID
    _toJid(number) {
        if (String(number).includes('@')) return String(number);
        let clean = String(number).replace(/[^0-9]/g, '');
        // Auto-prepend India code: 10-digit numbers starting with 6-9 are Indian mobiles
        if (clean.length === 10 && /^[6-9]/.test(clean)) clean = '91' + clean;
        return `${clean}@s.whatsapp.net`;
    }

    // Kept for API compatibility with server.js — returns number unchanged,
    // JID conversion happens inside sendMessage / sendTyping
    getRecipientNumber(number) {
        return number;
    }

    isReady() {
        return this.status === 'ready';
    }

    getStatus() {
        return { status: this.status };
    }

    getQR() {
        return this.qrCode;
    }

    // Request a pairing code instead of QR scan.
    // Must be called after the socket is initialised (sock exists) but before auth completes.
    // phone: digits only with country code, e.g. "919876543210"
    async requestPairingCode(phone) {
        const digits = String(phone).replace(/\D/g, '');
        if (!digits) throw new Error('Invalid phone number');
        if (!this.sock) throw new Error('Socket not initialised yet — try again in a moment');
        const raw = await this.sock.requestPairingCode(digits);
        // Format as XXXX-XXXX
        return raw && raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
    }
}

module.exports = WhatsAppManager;
