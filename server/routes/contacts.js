'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const { v4: uuidv4 }   = require('uuid');
const { normalizePhone } = require('../utils/phone');
const { csvUpload }      = require('../utils/upload');

router.get('/', async (_req, res) => {
    res.json(await storage.getContacts());
});

router.post('/', async (req, res) => {
    const { name, number } = req.body;
    if (!name || !number) return res.status(400).json({ error: 'Name and number required' });
    const contacts = await storage.getContacts();
    const contact = { id: uuidv4(), name: name.trim(), number: normalizePhone(number) };
    contacts.push(contact);
    await storage.saveContacts(contacts);
    res.json(contact);
});

router.put('/:id', async (req, res) => {
    const contacts = await storage.getContacts();
    const idx = contacts.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const update = { ...req.body };
    if (update.number) update.number = normalizePhone(update.number);
    contacts[idx] = { ...contacts[idx], ...update, id: contacts[idx].id };
    await storage.saveContacts(contacts);
    res.json(contacts[idx]);
});

router.delete('/bulk', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
    const idSet = new Set(ids);
    let contacts = await storage.getContacts();
    contacts = contacts.filter(c => !idSet.has(c.id));
    await storage.saveContacts(contacts);
    res.json({ success: true, deleted: ids.length });
});

router.delete('/:id', async (req, res) => {
    let contacts = await storage.getContacts();
    contacts = contacts.filter(c => c.id !== req.params.id);
    await storage.saveContacts(contacts);
    res.json({ success: true });
});

// CSV bulk import
router.post('/import', csvUpload.single('csv'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

        let text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) return res.status(400).json({ error: 'CSV is empty' });

        const NAME_KEYS  = ['name', 'full name', 'fullname', 'contact', 'contact name', 'customer'];
        const PHONE_KEYS = ['phone', 'number', 'mobile', 'cell', 'telephone', 'whatsapp', 'phone number', 'mobile number', 'contact number'];

        const firstCells = lines[0].split(',').map(c => c.replace(/["'=]/g, '').trim().toLowerCase());
        const hasHeader  = firstCells.some(c => NAME_KEYS.includes(c) || PHONE_KEYS.includes(c));

        let nameIdx = -1, phoneIdx = -1, start = 0;

        if (hasHeader) {
            start    = 1;
            nameIdx  = firstCells.findIndex(c => NAME_KEYS.includes(c));
            phoneIdx = firstCells.findIndex(c => PHONE_KEYS.includes(c));
        }

        if (!hasHeader) {
            const sample = lines[0].split(',')[0].replace(/["'=]/g, '').trim();
            if (/^[+\d\s\-()]{7,}$/.test(sample)) { phoneIdx = 0; nameIdx = -1; }
            else { nameIdx = 0; phoneIdx = 1; }
        }

        if (phoneIdx === -1 && !hasHeader) {
            return res.status(400).json({ error: 'Could not detect a phone number column in the CSV.' });
        }

        const contacts   = await storage.getContacts();
        const numberToId = {};
        contacts.forEach(c => { numberToId[c.number.replace(/\s+/g, '')] = c.id; });

        let imported = 0, skipped = 0;
        const matchedIds = [];

        for (let i = start; i < lines.length; i++) {
            const cols        = lines[i].split(',').map(c => c.replace(/["'=]/g, '').trim());
            const rawPhone    = phoneIdx >= 0 ? (cols[phoneIdx] || '') : (cols[1] || cols[0] || '');
            const cleanNumber = normalizePhone(rawPhone.replace(/[\s\-()]/g, ''));
            if (!cleanNumber || cleanNumber.length < 7) { skipped++; continue; }
            const rawName = nameIdx >= 0 ? (cols[nameIdx] || '').trim() : '';
            const name    = rawName || cleanNumber;
            if (numberToId[cleanNumber]) {
                matchedIds.push(numberToId[cleanNumber]);
                skipped++;
            } else {
                const id = uuidv4();
                contacts.push({ id, name, number: cleanNumber });
                numberToId[cleanNumber] = id;
                matchedIds.push(id);
                imported++;
            }
        }

        await storage.saveContacts(contacts);
        res.json({ imported, skipped, total: contacts.length, matchedIds });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
