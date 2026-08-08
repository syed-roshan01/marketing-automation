'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const storage = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');

function normalizeStatus(status) {
    if (status === 'open') return 'active';
    if (status === 'closed') return 'resolved';
    if (['active', 'pending', 'resolved', 'archived'].includes(status)) return status;
    return 'active';
}

function normalizeChat(chat) {
    return {
        ...chat,
        deviceId: chat.deviceId || chat.sessionId || '',
        name: chat.name || chat.contactName || chat.phone,
        status: normalizeStatus(chat.status),
        lastMessageTime: chat.lastMessageTime || chat.lastMessageAt || chat.updatedAt || chat.createdAt,
        notes: Array.isArray(chat.notes) ? chat.notes : [],
    };
}

// Normalize phone: remove +, spaces, dashes
const normPhone = (p) => (p || '').replace(/[+\s\-()]/g, '');

router.get('/', async (req, res) => {
    const { deviceId, status } = req.query;
    let chats = (await storage.getLiveChats()).map(normalizeChat);
    if (deviceId) chats = chats.filter(c => c.deviceId === deviceId);
    if (status && status !== 'all') chats = chats.filter(c => c.status === status);
    chats.sort((a, b) => new Date(b.lastMessageTime || 0) - new Date(a.lastMessageTime || 0));
    const contacts = await storage.getContacts();
    const enriched = chats.map(c => {
        const pn      = normPhone(c.phone);
        const contact = contacts.find(ct => {
            const cn = normPhone(ct.number || ct.phone);
            return cn === pn || cn === '0' + pn || pn === '0' + cn ||
                   cn.endsWith(pn.slice(-9)) || pn.endsWith(cn.slice(-9));
        });
        return { ...c, name: (contact && contact.name) || c.name || c.phone, messages: undefined };
    });
    res.json(enriched);
});

router.get('/:id/messages', async (req, res) => {
    const chats = await storage.getLiveChats();
    const chat  = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    const normalized = normalizeChat(chat);
    const contacts = await storage.getContacts();
    const pn       = normPhone(normalized.phone);
    const contact  = contacts.find(ct => {
        const cn = normPhone(ct.number || ct.phone);
        return cn === pn || cn === '0' + pn || pn === '0' + cn ||
               cn.endsWith(pn.slice(-9)) || pn.endsWith(cn.slice(-9));
    });
    const name = (contact && contact.name) || normalized.name || normalized.phone;
    const { messages, ...rest } = normalized;
    res.json({ messages: messages || [], chat: { ...rest, name } });
});

router.patch('/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['active', 'pending', 'resolved', 'archived'].includes(status))
        return res.status(400).json({ error: 'Invalid status' });
    const chats = await storage.getLiveChats();
    const chat  = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    chat.status = status;
    await storage.saveLiveChats(chats);
    res.json(normalizeChat(chat));
});

router.patch('/:id/read', async (req, res) => {
    const chats = await storage.getLiveChats();
    const chat  = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    chat.unreadCount = 0;
    await storage.saveLiveChats(chats);
    res.json({ ok: true });
});

router.post('/:id/send', async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });
    const chats  = await storage.getLiveChats();
    const chat   = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    const deviceId = chat.deviceId || chat.sessionId;
    if (!deviceId) return res.status(400).json({ error: 'Device not linked to this conversation' });
    const waInst = deviceManager.get(deviceId);
    if (!waInst || !waInst.isReady()) return res.status(400).json({ error: 'Device not connected' });
    await waInst.sendMessage(chat.jid, message.trim(), null, 'none', [], 'View Options', [], null);
    const msgObj = { id: crypto.randomUUID(), body: message.trim(), fromMe: true, timestamp: new Date().toISOString(), type: 'text' };
    chat.deviceId = deviceId;
    chat.sessionId = chat.sessionId || deviceId;
    chat.messages = chat.messages || [];
    chat.messages.push(msgObj);
    chat.lastMessage = message.trim();
    chat.lastMessageTime = new Date().toISOString();
    await storage.saveLiveChats(chats);
    res.json(msgObj);
});

router.post('/:id/notes', async (req, res) => {
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ error: 'Note required' });
    const chats = await storage.getLiveChats();
    const chat  = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    chat.notes = chat.notes || [];
    chat.notes.push({ id: crypto.randomUUID(), text: note.trim(), createdAt: new Date().toISOString() });
    await storage.saveLiveChats(chats);
    res.json(chat.notes);
});

router.delete('/:id/notes/:noteId', async (req, res) => {
    const chats = await storage.getLiveChats();
    const chat  = chats.find(c => c.id === req.params.id);
    if (!chat) return res.status(404).json({ error: 'Not found' });
    chat.notes = (chat.notes || []).filter(n => n.id !== req.params.noteId);
    await storage.saveLiveChats(chats);
    res.json(chat.notes);
});

router.delete('/:id', async (req, res) => {
    const chats    = await storage.getLiveChats();
    const filtered = chats.filter(c => c.id !== req.params.id);
    if (filtered.length === chats.length) return res.status(404).json({ error: 'Not found' });
    await storage.saveLiveChats(filtered);
    res.json({ ok: true });
});

module.exports = router;
