'use strict';
// Live-chat engine — upserts chat records on every incoming message
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const socketSingleton = require('../socket');

deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId, pushName, msgId, timestamp, messageType, mediaData }) => {
    try {
        const chats  = await storage.getLiveChats();
        const idx    = chats.findIndex(c => c.jid === jid && (c.deviceId === deviceId || c.sessionId === deviceId));
        const contacts = await storage.getContacts();
        const contact  = contacts.find(c => c.phone === phone || c.phone?.replace(/\D/g, '') === phone);
        const displayName = contact?.name || pushName || phone;
        const now        = new Date().toISOString();

        const msgRecord = {
            id:          msgId || `msg_${Date.now()}`,
            fromMe:      false,
            body:        body || '',
            messageType: messageType || 'text',
            mediaData:   mediaData || null,
            timestamp:   timestamp ? new Date(timestamp * 1000).toISOString() : now,
        };

        if (idx === -1) {
            // new chat
            chats.push({
                id:           `lc_${Date.now()}`,
                jid,
                phone,
                deviceId,
                sessionId:    deviceId,
                name:         displayName,
                contactName:  displayName,
                status:       'active',
                unreadCount:  1,
                lastMessage:  body || '',
                lastMessageTime: now,
                lastMessageAt: now,
                messages:     [msgRecord],
                notes:        [],
                tags:         [],
                createdAt:    now,
            });
        } else {
            const chat    = chats[idx];
            chat.lastMessage  = body || chat.lastMessage;
            chat.lastMessageTime = now;
            chat.lastMessageAt = now;
            chat.unreadCount  = (chat.unreadCount || 0) + 1;
            chat.deviceId     = chat.deviceId || chat.sessionId || deviceId;
            chat.sessionId    = chat.sessionId || chat.deviceId;
            chat.name         = displayName;
            chat.contactName  = displayName;
            if (chat.status === 'resolved' || chat.status === 'closed') chat.status = 'active';
            if (!Array.isArray(chat.notes)) chat.notes = [];
            if (!Array.isArray(chat.messages)) chat.messages = [];
            chat.messages.push(msgRecord);
        }

        await storage.saveLiveChats(chats);

        const io = socketSingleton.get();
        if (io) io.emit('live_chat_message', { jid, deviceId, message: msgRecord, displayName });
    } catch (err) { console.error('[LiveChat] Engine error:', err.message); }
});
