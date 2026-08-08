'use strict';
const router  = require('express').Router();
const storage = require('../../src/storage');
const { v4: uuidv4 } = require('uuid');

router.get('/', async (_req, res) => {
    res.json(await storage.getGroups());
});

router.post('/', async (req, res) => {
    const { name, contactIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name required' });
    const groups = await storage.getGroups();
    const group = {
        id: uuidv4(),
        name: name.trim(),
        contactIds: Array.isArray(contactIds) ? contactIds : [],
        createdAt: new Date().toISOString(),
    };
    groups.push(group);
    await storage.saveGroups(groups);
    res.json(group);
});

router.put('/:id', async (req, res) => {
    const groups = await storage.getGroups();
    const idx = groups.findIndex(g => g.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    groups[idx] = { ...groups[idx], ...req.body, id: groups[idx].id };
    await storage.saveGroups(groups);
    res.json(groups[idx]);
});

router.delete('/:id', async (req, res) => {
    let groups = await storage.getGroups();
    groups = groups.filter(g => g.id !== req.params.id);
    await storage.saveGroups(groups);
    res.json({ success: true });
});

module.exports = router;
