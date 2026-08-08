'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const storage = require('../../src/storage');

// ── Helpers ───────────────────────────────────────────────────────────────────
function validateField(field) {
    const allowed = ['text','number','email','phone','textarea','dropdown','radio','checkbox','date','time','confirmation','multi'];
    if (!allowed.includes(field.type)) return `Invalid field type: ${field.type}`;
    // confirmation fields don't require a label
    if (field.type !== 'confirmation' && (!field.label || !field.label.toString().trim())) return 'Field label is required';
    if (['dropdown','radio','checkbox'].includes(field.type)) {
        if (!Array.isArray(field.options) || field.options.filter(o => o && o.toString().trim()).length < 2) {
            return `Field "${field.label}" needs at least 2 options`;
        }
    }
    if (field.type === 'multi') {
        if (!Array.isArray(field.subFields) || field.subFields.filter(sf => sf.label?.toString().trim()).length < 1) {
            return `Multi-input field "${field.label}" needs at least 1 sub-field`;
        }
    }
    return null;
}

// ── GET /api/forms — list all forms ──────────────────────────────────────────
router.get('/', async (_req, res) => {
    try {
        res.json(await storage.getForms());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/forms — create form ─────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name, description, sessionIds, targetType, triggerKeywords, matchType, fields, successMessage, webhookUrl, active } = req.body;
        if (!name || !name.toString().trim()) return res.status(400).json({ error: 'Form name is required' });
        if (!Array.isArray(fields) || fields.length === 0) return res.status(400).json({ error: 'At least one field is required' });

        for (const field of fields) {
            const err = validateField(field);
            if (err) return res.status(400).json({ error: err });
        }

        const forms = await storage.getForms();
        const form = {
            id: crypto.randomUUID(),
            name: name.toString().trim(),
            description: description || '',
            active: active !== false,
            sessionIds: Array.isArray(sessionIds) ? sessionIds : [],
            targetType: targetType || 'all',
            triggerKeywords: Array.isArray(triggerKeywords) ? triggerKeywords.filter(Boolean) : [],
            matchType: matchType || 'exact',
            fields: fields.map((f, i) => ({
                id: f.id || crypto.randomUUID(),
                type: f.type,
                label: f.type === 'confirmation' ? (f.label || '') : f.label.toString().trim(),
                placeholder: f.placeholder || '',
                required: f.required !== false,
                order: i,
                options: Array.isArray(f.options) ? f.options.filter(o => o && o.toString().trim()) : [],
                validation: f.validation || {},
                ...(f.type === 'confirmation' ? {
                    confirmLabel: f.confirmLabel || '',
                    restartLabel: f.restartLabel || '',
                } : {}),
                ...(f.type === 'multi' ? {
                    subFields: (f.subFields || []).filter(sf => sf.label?.toString().trim()).map(sf => ({
                        id: sf.id || crypto.randomUUID(),
                        label: sf.label.toString().trim(),
                        type: sf.type || 'text',
                        required: sf.required !== false,
                    })),
                } : {}),
            })),
            successMessage: successMessage || 'Thank you! Your response has been recorded.',
            webhookUrl: webhookUrl || '',
            totalSubmissions: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        forms.push(form);
        await storage.saveForms(forms);
        res.json(form);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/forms/:id — update form ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const forms = await storage.getForms();
        const idx   = forms.findIndex(f => f.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Form not found' });

        const { name, description, sessionIds, targetType, triggerKeywords, matchType, fields, successMessage, webhookUrl, active } = req.body;
        if (!name || !name.toString().trim()) return res.status(400).json({ error: 'Form name is required' });
        if (!Array.isArray(fields) || fields.length === 0) return res.status(400).json({ error: 'At least one field is required' });

        for (const field of fields) {
            const err = validateField(field);
            if (err) return res.status(400).json({ error: err });
        }

        forms[idx] = {
            ...forms[idx],
            name: name.toString().trim(),
            description: description || '',
            active: active !== false,
            sessionIds: Array.isArray(sessionIds) ? sessionIds : [],
            targetType: targetType || 'all',
            triggerKeywords: Array.isArray(triggerKeywords) ? triggerKeywords.filter(Boolean) : [],
            matchType: matchType || 'exact',
            fields: fields.map((f, i) => ({
                id: f.id || crypto.randomUUID(),
                type: f.type,
                label: f.type === 'confirmation' ? (f.label || '') : f.label.toString().trim(),
                placeholder: f.placeholder || '',
                required: f.required !== false,
                order: i,
                options: Array.isArray(f.options) ? f.options.filter(o => o && o.toString().trim()) : [],
                validation: f.validation || {},
                ...(f.type === 'confirmation' ? {
                    confirmLabel: f.confirmLabel || '',
                    restartLabel: f.restartLabel || '',
                } : {}),
                ...(f.type === 'multi' ? {
                    subFields: (f.subFields || []).filter(sf => sf.label?.toString().trim()).map(sf => ({
                        id: sf.id || crypto.randomUUID(),
                        label: sf.label.toString().trim(),
                        type: sf.type || 'text',
                        required: sf.required !== false,
                    })),
                } : {}),
            })),
            successMessage: successMessage || 'Thank you! Your response has been recorded.',
            webhookUrl: webhookUrl || '',
            updatedAt: new Date().toISOString(),
        };
        await storage.saveForms(forms);
        res.json(forms[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/forms/:id/toggle — toggle active ───────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
    try {
        const forms = await storage.getForms();
        const form  = forms.find(f => f.id === req.params.id);
        if (!form) return res.status(404).json({ error: 'Form not found' });
        form.active = !form.active;
        form.updatedAt = new Date().toISOString();
        await storage.saveForms(forms);
        res.json(form);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/forms/submissions — list submissions ─────────────────────────────
router.get('/submissions', async (req, res) => {
    try {
        let subs = await storage.getFormSubmissions();
        const { formId, status, search, page = 1, limit = 50 } = req.query;

        if (formId)  subs = subs.filter(s => s.formId === formId);
        if (status && status !== 'all') subs = subs.filter(s => s.status === status);
        if (search) {
            const q = search.toLowerCase();
            subs = subs.filter(s =>
                s.phone?.toLowerCase().includes(q) ||
                s.formName?.toLowerCase().includes(q) ||
                JSON.stringify(s.responses || {}).toLowerCase().includes(q)
            );
        }

        // Sort newest first
        subs = subs.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const total  = subs.length;
        const offset = (Number(page) - 1) * Number(limit);
        const items  = subs.slice(offset, offset + Number(limit));

        res.json({ items, total, page: Number(page), limit: Number(limit) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/forms/submissions/:id — delete a single submission ────────────
router.delete('/submissions/:id', async (req, res) => {
    try {
        const subs    = await storage.getFormSubmissions();
        const filtered = subs.filter(s => s.id !== req.params.id);
        if (filtered.length === subs.length) return res.status(404).json({ error: 'Submission not found' });
        await storage.saveFormSubmissions(filtered);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/forms/submissions — clear all submissions for a form ──────────
router.delete('/submissions', async (req, res) => {
    try {
        const { formId } = req.query;
        let subs = await storage.getFormSubmissions();
        if (formId) subs = subs.filter(s => s.formId !== formId);
        else        subs = [];
        await storage.saveFormSubmissions(subs);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/forms/:id — delete form ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const forms    = await storage.getForms();
        const filtered = forms.filter(f => f.id !== req.params.id);
        if (filtered.length === forms.length) return res.status(404).json({ error: 'Form not found' });
        await storage.saveForms(filtered);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
