'use strict';
// Hook engine — forwards incoming messages to configured hook numbers
const storage       = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');

deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId }) => {
    try {
        const hookNumbers = await storage.getHookNumbers();
        const enabled     = hookNumbers.filter(h => h.enabled !== false);
        if (!enabled.length || !body) return;

        const inst = deviceManager.get(deviceId);
        if (!inst || !inst.isReady()) return;

        console.log(`[Hook] Forwarding message from ${phone} to ${enabled.length} hook number(s)...`);
        const forwardText = `[Hook] From ${phone}:\n${body}`;
        for (const h of enabled) {
            const num = String(h.number || '').replace(/\D/g, '');
            if (!num) continue;
            const hookJid = `${num}@s.whatsapp.net`;
            try {
                await inst.sock.sendMessage(hookJid, { text: forwardText });
                console.log(`[Hook] ✅ Forwarded to ${num}`);
            } catch (e) {
                console.error('[Hook] ❌ Forward error to', num, e.message);
            }
        }
    } catch (err) { console.error('[Hook] Engine error:', err.message); }
});
