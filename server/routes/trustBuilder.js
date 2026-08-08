'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const socket  = require('../socket');
const deviceManager = require('../../src/deviceManager');
const { v4: uuidv4 } = require('uuid');

// In-memory stop flags: sessionId → true
const tbStopRequested = new Map();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

router.get('/', async (_req, res) => {
    res.json(await storage.getTrustBuilderSessions());
});

router.post('/', async (req, res) => {
    const { name, description, deviceIds, messages, randomMode, minDelay, maxDelay, duration } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!Array.isArray(deviceIds) || deviceIds.length < 2)
        return res.status(400).json({ error: 'Minimum 2 devices required' });
    const cleanMsgs = Array.isArray(messages) ? messages.map(m => String(m).trim()).filter(Boolean) : [];
    if (!randomMode && !cleanMsgs.length) return res.status(400).json({ error: 'At least one message required' });

    const sessions = await storage.getTrustBuilderSessions();
    const session  = {
        id: uuidv4(),
        name: name.trim(),
        description: description || '',
        deviceIds,
        messages:   cleanMsgs,
        randomMode: !!randomMode,
        minDelay:   Math.max(5,  parseInt(minDelay)  || 30),
        maxDelay:   Math.max(10, parseInt(maxDelay)  || 120),
        duration:   Math.max(1,  parseInt(duration)  || 60),
        status: 'idle',
        messageCount: 0,
        createdAt:  new Date().toISOString(),
        startedAt:  null,
        stoppedAt:  null,
        endTime:    null,
    };
    sessions.push(session);
    await storage.saveTrustBuilderSessions(sessions);
    res.json(session);
});

router.post('/:id/start', async (req, res) => {
    const sessions = await storage.getTrustBuilderSessions();
    const session  = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'running') return res.status(400).json({ error: 'Already running' });

    const connectedIds = session.deviceIds.filter(id => deviceManager.get(id)?.isReady());
    if (connectedIds.length < 2)
        return res.status(400).json({ error: 'Need at least 2 connected devices to start' });

    session.status       = 'running';
    session.startedAt    = new Date().toISOString();
    session.messageCount = 0;
    session.endTime      = Date.now() + session.duration * 60 * 1000;
    tbStopRequested.delete(session.id);
    await storage.saveTrustBuilderSessions(sessions);
    res.json({ success: true });

    (async () => {
        const endTime = session.endTime;
        let stoppedEarly = false;
        const emitTB = (extra = {}) => socket.emit('trust_builder_update', {
            sessionId: session.id, messageCount: session.messageCount, status: session.status, endTime, ...extra,
        });
        emitTB();
        let rrIdx = 0;

        while (Date.now() < endTime) {
            if (tbStopRequested.get(session.id)) { tbStopRequested.delete(session.id); stoppedEarly = true; break; }
            const available = session.deviceIds.filter(id => deviceManager.get(id)?.isReady());
            if (available.length < 2) { await sleep(5000); continue; }

            const senderId   = available[rrIdx % available.length];
            const receiverId = available[(rrIdx + 1) % available.length];
            rrIdx++;
            const senderInst   = deviceManager.get(senderId);
            const receiverInst = deviceManager.get(receiverId);

            let receiverNumber = null;
            try {
                const jid = receiverInst.sock?.user?.id;
                if (jid) receiverNumber = jid.split(':')[0].split('@')[0];
            } catch (_) {}
            if (!receiverNumber) { await sleep(5000); continue; }

            const _greetings = ['Hi', 'Hey'];
            const msg = session.randomMode
                ? `${_greetings[Math.floor(Math.random() * _greetings.length)]} ${rrIdx}`
                : session.messages[(rrIdx - 1) % session.messages.length];

            const _typingJid = `${receiverNumber}@s.whatsapp.net`;
            const _typingMs  = 800 + Math.min(msg.length * 60, 2200) + Math.floor(Math.random() * 800);
            try {
                await senderInst.sock.sendPresenceUpdate('composing', _typingJid);
                await sleep(_typingMs);
                await senderInst.sock.sendPresenceUpdate('paused', _typingJid);
            } catch (_) {}

            try {
                await senderInst.sendMessage(receiverNumber, msg);
                session.messageCount++;
                const all = await storage.getTrustBuilderSessions();
                const si  = all.findIndex(s => s.id === session.id);
                if (si !== -1) { all[si].messageCount = session.messageCount; await storage.saveTrustBuilderSessions(all); }
                emitTB();
            } catch (err) { console.error('[TrustBuilder] Send error:', err.message); }

            const delaySecs = session.minDelay + Math.random() * (session.maxDelay - session.minDelay);
            await sleep(Math.round(delaySecs * 1000));
        }

        const finalStatus = stoppedEarly ? 'stopped' : 'completed';
        session.status    = finalStatus;
        session.stoppedAt = new Date().toISOString();
        const all = await storage.getTrustBuilderSessions();
        const si  = all.findIndex(s => s.id === session.id);
        if (si !== -1) { all[si].status = finalStatus; all[si].stoppedAt = session.stoppedAt; all[si].messageCount = session.messageCount; await storage.saveTrustBuilderSessions(all); }
        emitTB({ status: finalStatus });
        console.log(`[TrustBuilder] "${session.name}" ${finalStatus}. Messages: ${session.messageCount}`);
    })();
});

router.post('/:id/stop', async (req, res) => {
    const sessions = await storage.getTrustBuilderSessions();
    const session  = sessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    tbStopRequested.set(req.params.id, true);
    res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
    tbStopRequested.set(req.params.id, true);
    let sessions = await storage.getTrustBuilderSessions();
    sessions = sessions.filter(s => s.id !== req.params.id);
    await storage.saveTrustBuilderSessions(sessions);
    res.json({ success: true });
});

module.exports = router;
