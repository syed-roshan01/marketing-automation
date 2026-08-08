'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const socket  = require('../socket');

router.get('/', async (req, res) => {
    res.json(await storage.getOptoutRecords());
});

router.post('/', async (req, res) => {
    const { phone, name, type, messageType, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!['optout', 'optin'].includes(type)) return res.status(400).json({ error: 'type must be optout or optin' });
    const records = await storage.getOptoutRecords();
    const entry = {
        phone:       String(phone).replace(/[^0-9]/g, ''),
        name:        name || '',
        type,
        messageType: messageType || 'all',
        reason:      reason || '',
        date:        new Date().toISOString(),
    };
    const idx = records.findIndex(r => r.phone === entry.phone);
    if (idx !== -1) records[idx] = entry; else records.push(entry);
    await storage.saveOptoutRecords(records);
    socket.emit('optout_update', { action: 'upsert', record: entry });
    res.json(entry);
});

router.delete('/:phone', async (req, res) => {
    let records = await storage.getOptoutRecords();
    const phone = req.params.phone.replace(/[^0-9]/g, '');
    records = records.filter(r => r.phone !== phone);
    await storage.saveOptoutRecords(records);
    socket.emit('optout_update', { action: 'delete', phone });
    res.json({ success: true });
});

router.get('/settings', async (req, res) => {
    res.json(await storage.getOptoutSettings());
});

router.post('/settings', async (req, res) => {
    const current = await storage.getOptoutSettings();
    const updated = { ...current, ...req.body };
    await storage.saveOptoutSettings(updated);
    res.json(updated);
});

router.get('/export.csv', async (req, res) => {
    const records = await storage.getOptoutRecords();
    const lines = [
        'Phone,Name,Type,MessageType,Reason,Date',
        ...records.map(r => [
            r.phone,
            `"${(r.name || '').replace(/"/g, '""')}"`,
            r.type,
            r.messageType,
            `"${(r.reason || '').replace(/"/g, '""')}"`,
            r.date,
        ].join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="optout_contacts.csv"');
    res.send(lines.join('\r\n'));
});

module.exports = router;
