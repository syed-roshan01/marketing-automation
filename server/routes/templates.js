'use strict';
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const storage = require('../../src/storage');
const { v4: uuidv4 }          = require('uuid');
const { IMAGES_DIR }           = require('../constants');
const { upload, tplMediaUpload } = require('../utils/upload');

router.get('/', async (_req, res) => {
    res.json(await storage.getTemplates());
});

router.post('/', async (req, res) => {
    const {
        name, content, templateType, mediaType, buttonType, buttons,
        listButtonText, listSections, cards, carouselTitle, carouselSubtitle,
        carouselFooter, pollQuestion, pollOptions, variables,
        contactName, contactPhone, locationName, locationAddress, locationLat, locationLng,
    } = req.body;
    const contentOptional = ['carousel', 'poll', 'contact', 'location'].includes(templateType);
    if (!name || (!content && !contentOptional))
        return res.status(400).json({ error: 'Name and content required' });

    const templates = await storage.getTemplates();
    const template = {
        id: uuidv4(),
        name: name.trim(),
        content: content || '',
        templateType:    templateType    || 'text',
        mediaType:       mediaType       || null,
        buttonType:      buttonType      || 'none',
        buttons:         Array.isArray(buttons)       ? buttons.filter(Boolean)       : [],
        listButtonText:  listButtonText  || 'View Options',
        listSections:    Array.isArray(listSections)  ? listSections                  : [],
        cards:           Array.isArray(cards)         ? cards                         : [],
        carouselTitle:   carouselTitle   || '',
        carouselSubtitle:carouselSubtitle|| '',
        carouselFooter:  carouselFooter  || '',
        pollQuestion:    pollQuestion    || '',
        pollOptions:     Array.isArray(pollOptions)   ? pollOptions.filter(Boolean)   : [],
        variables:       Array.isArray(variables)     ? variables                     : [],
        contactName:     contactName     || '',
        contactPhone:    contactPhone    || '',
        locationName:    locationName    || '',
        locationAddress: locationAddress || '',
        locationLat:     locationLat     || '',
        locationLng:     locationLng     || '',
        mediaFile: null,
        createdAt: new Date().toISOString(),
    };
    templates.push(template);
    await storage.saveTemplates(templates);
    res.json(template);
});

router.put('/:id', async (req, res) => {
    const templates = await storage.getTemplates();
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    templates[idx] = { ...templates[idx], ...req.body, id: templates[idx].id, updatedAt: new Date().toISOString() };
    await storage.saveTemplates(templates);
    res.json(templates[idx]);
});

router.delete('/:id', async (req, res) => {
    let templates = await storage.getTemplates();
    const tpl = templates.find(t => t.id === req.params.id);
    if (tpl) {
        if (tpl.imageFile) { const p = path.join(IMAGES_DIR, tpl.imageFile); if (fs.existsSync(p)) fs.unlinkSync(p); }
        if (tpl.mediaFile) { const p = path.join(IMAGES_DIR, tpl.mediaFile); if (fs.existsSync(p)) fs.unlinkSync(p); }
        if (Array.isArray(tpl.cards)) {
            tpl.cards.forEach(card => {
                if (card.imageFile) { const p = path.join(IMAGES_DIR, card.imageFile); if (fs.existsSync(p)) fs.unlinkSync(p); }
            });
        }
    }
    templates = templates.filter(t => t.id !== req.params.id);
    await storage.saveTemplates(templates);
    res.json({ success: true });
});

// ── Image uploads ──────────────────────────────────────────────────────────────

router.post('/:id/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
        const templates = await storage.getTemplates();
        const idx = templates.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Template not found' });
        templates[idx].imageFile = req.file.filename;
        await storage.saveTemplates(templates);
        res.json({ imageFile: req.file.filename, imageUrl: `/data/images/${req.file.filename}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/image', async (req, res) => {
    const templates = await storage.getTemplates();
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const f = templates[idx].imageFile;
    if (f) { const p = path.join(IMAGES_DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p); templates[idx].imageFile = null; await storage.saveTemplates(templates); }
    res.json({ success: true });
});

// ── Media uploads (video / audio / document) ──────────────────────────────────

router.post('/:id/media', tplMediaUpload.single('media'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const templates = await storage.getTemplates();
        const idx = templates.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Template not found' });
        const old = templates[idx].mediaFile;
        if (old) { const p = path.join(IMAGES_DIR, old); if (fs.existsSync(p)) fs.unlinkSync(p); }
        templates[idx].mediaFile = req.file.filename;
        templates[idx].mediaOriginalName = req.file.originalname;
        await storage.saveTemplates(templates);
        res.json({ mediaFile: req.file.filename, originalName: req.file.originalname });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/media', async (req, res) => {
    const templates = await storage.getTemplates();
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const f = templates[idx].mediaFile;
    if (f) { const p = path.join(IMAGES_DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p); templates[idx].mediaFile = null; templates[idx].mediaOriginalName = null; await storage.saveTemplates(templates); }
    res.json({ success: true });
});

// ── Carousel card image uploads ────────────────────────────────────────────────

router.post('/:id/cards/:cardIndex/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
        const templates = await storage.getTemplates();
        const idx = templates.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Template not found' });
        const ci = parseInt(req.params.cardIndex, 10);
        if (!Array.isArray(templates[idx].cards) || ci < 0 || ci >= templates[idx].cards.length)
            return res.status(400).json({ error: 'Card index out of range' });
        const oldFile = templates[idx].cards[ci].imageFile;
        if (oldFile) { const p = path.join(IMAGES_DIR, oldFile); if (fs.existsSync(p)) fs.unlinkSync(p); }
        templates[idx].cards[ci].imageFile = req.file.filename;
        await storage.saveTemplates(templates);
        res.json({ imageFile: req.file.filename, imageUrl: `/data/images/${req.file.filename}` });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/cards/:cardIndex/image', async (req, res) => {
    const templates = await storage.getTemplates();
    const idx = templates.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const ci = parseInt(req.params.cardIndex, 10);
    if (!Array.isArray(templates[idx].cards) || ci < 0 || ci >= templates[idx].cards.length)
        return res.status(400).json({ error: 'Card index out of range' });
    const f = templates[idx].cards[ci].imageFile;
    if (f) { const p = path.join(IMAGES_DIR, f); if (fs.existsSync(p)) fs.unlinkSync(p); templates[idx].cards[ci].imageFile = null; await storage.saveTemplates(templates); }
    res.json({ success: true });
});

module.exports = router;
