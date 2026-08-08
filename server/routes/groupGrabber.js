'use strict';
const router  = require('express').Router();
const deviceManager = require('../../src/deviceManager');

router.get('/', async (req, res) => {
    const { deviceId } = req.query;
    const inst = deviceId ? deviceManager.get(deviceId) : deviceManager.getFirstReady();
    if (!inst || !inst.isReady())
        return res.status(400).json({ error: 'Device not ready. Please connect a WhatsApp device first.' });
    try {
        const groupsMap = await inst.sock.groupFetchAllParticipating();
        const myPhone   = (inst.sock.user?.id || '').split(':')[0];

        const firstGroup = Object.values(groupsMap)[0];
        if (firstGroup?.participants?.length) {
            const sample = firstGroup.participants.slice(0, 3).map(p => ({ id: p.id, pn: p.pn, admin: p.admin }));
            console.log('[GroupGrabber] Participant sample:', JSON.stringify(sample));
        }

        const groups = Object.values(groupsMap).map(g => {
            const myParticipant = (g.participants || []).find(p => p.id.split(':')[0] === myPhone);
            const myRole = myParticipant
                ? (myParticipant.admin === 'superadmin' ? 'superadmin' : myParticipant.admin === 'admin' ? 'admin' : 'member')
                : 'member';
            const realParticipants = (g.participants || []).filter(p =>
                !p.id.endsWith('@g.us') && !p.id.endsWith('@broadcast') && !p.id.endsWith('@newsletter')
            );
            return {
                id: g.id,
                name: g.subject || 'Unknown Group',
                desc: g.desc || '',
                creation: g.creation ? new Date(g.creation * 1000).toISOString() : null,
                owner: (g.owner || '').split('@')[0],
                isCommunity: !!(g.isCommunity),
                isCommunityAnnounce: !!(g.isCommunityAnnounce),
                announce: !!(g.announce),
                restrict: !!(g.restrict),
                size: realParticipants.length,
                myRole,
                participants: realParticipants.map(p => {
                    const jid = p.jid || p.id;
                    let phone = null;
                    if (jid.endsWith('@s.whatsapp.net')) phone = jid.split('@')[0].split(':')[0];
                    else if (jid.endsWith('@lid'))        phone = inst.lidToPhone.get(jid) || null;
                    if (!phone) phone = jid.split('@')[0].split(':')[0];
                    const isLid = jid.endsWith('@lid') && !inst.lidToPhone.has(jid);
                    return { id: p.id, phone, admin: p.admin || null, isLid };
                }),
            };
        });
        res.json(groups);
    } catch (err) {
        console.error('[GroupGrabber] Fetch error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.get('/metadata', async (req, res) => {
    const { deviceId, groupJid } = req.query;
    if (!groupJid) return res.status(400).json({ error: 'groupJid required' });
    const inst = deviceId ? deviceManager.get(deviceId) : deviceManager.getFirstReady();
    if (!inst || !inst.isReady()) return res.status(400).json({ error: 'Device not ready' });
    try {
        const meta            = await inst.sock.groupMetadata(groupJid);
        const rawParticipants = meta.participants || [];
        console.log(`[GroupGrabber/meta] ${groupJid} — ${rawParticipants.length} raw`);

        const participants = rawParticipants
            .filter(p => !p.id.endsWith('@g.us') && !p.id.endsWith('@broadcast') && !p.id.endsWith('@newsletter'))
            .map(p => {
                const jid = p.jid || p.id;
                let phone = null;
                if (jid.endsWith('@s.whatsapp.net')) phone = jid.split('@')[0].split(':')[0];
                else if (jid.endsWith('@lid'))        phone = inst.lidToPhone.get(jid) || null;
                if (!phone) phone = jid.split('@')[0].split(':')[0];
                const isLid = jid.endsWith('@lid') && !inst.lidToPhone.has(jid);
                return { id: p.id, phone, admin: p.admin || null, isLid };
            });

        res.json({ id: meta.id, name: meta.subject, size: participants.length, participants });
    } catch (err) {
        console.error('[GroupGrabber/meta] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/invite-link', async (req, res) => {
    const { deviceId, groupJid } = req.body;
    if (!groupJid) return res.status(400).json({ error: 'groupJid required' });
    const inst = deviceId ? deviceManager.get(deviceId) : deviceManager.getFirstReady();
    if (!inst || !inst.isReady()) return res.status(400).json({ error: 'Device not ready' });
    try {
        const code = await inst.sock.groupInviteCode(groupJid);
        res.json({ link: `https://chat.whatsapp.com/${code}`, code });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/labels', async (req, res) => {
    const { deviceId } = req.query;
    const inst = deviceId ? deviceManager.get(deviceId) : deviceManager.getFirstReady();
    if (!inst || !inst.isReady())
        return res.status(400).json({ error: 'Device not ready. Please connect a WhatsApp device first.' });
    try {
        // If no labels yet, try to trigger a resync from WA
        let labels = inst.getLabels();
        if (labels.length === 0 && typeof inst.sock?.resyncAppState === 'function') {
            try {
                await inst.sock.resyncAppState(['label_edit', 'label_jid'], true);
                // Small wait for events to fire
                await new Promise(r => setTimeout(r, 1500));
                labels = inst.getLabels();
            } catch (_) { /* resync not supported — continue */ }
        }

        // Build per-label chat lists using label associations
        const labelMap = {};
        for (const label of labels) {
            labelMap[label.id] = { ...label, chats: [] };
        }
        for (const assoc of inst._labelAssociations) {
            if (labelMap[assoc.labelId]) {
                const chatId  = assoc.chatId || '';
                const isGroup = chatId.includes('@g.us');
                // Resolve @lid JIDs to real phone numbers using the lidToPhone map
                let phone;
                if (chatId.endsWith('@lid')) {
                    phone = inst.lidToPhone.get(chatId) || inst.lidToPhone.get(chatId.split('@')[0]) || null;
                }
                if (!phone) phone = chatId.split('@')[0].split(':')[0];
                labelMap[assoc.labelId].chats.push({ chatId, phone, isGroup });
            }
        }
        res.json(Object.values(labelMap));
    } catch (err) {
        console.error('[GroupGrabber/labels] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
