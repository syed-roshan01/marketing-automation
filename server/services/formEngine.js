'use strict';
/**
 * Form Engine — Conversational form flows over WhatsApp using native interactive messages.
 *
 * Field delivery:
 *   - dropdown / radio / checkbox with ≤ 3 options → quick_reply buttons
 *   - dropdown / radio / checkbox with 4-9 options → single_select list message
 *   - confirmation step                             → quick_reply "✅ Yes, Confirm" / "🔄 No, Restart"
 *   - all other types (text/number/email/…)         → plain text prompt
 *
 * Answer matching for choice fields:
 *   1. Exact option text match (what comes back when user taps a button)
 *   2. Numeric fallback (in case user types "1", "2", … manually)
 *
 * Session state: in-memory Map keyed by jid, 30-minute inactivity expiry.
 */

const crypto          = require('crypto');
const storage         = require('../../src/storage');
const deviceManager   = require('../../src/deviceManager');
const socketSingleton = require('../socket');

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_LIST_ROWS  = 9; // WhatsApp single_select supports up to 10 rows

// Active form sessions keyed by jid
const sessions = new Map();
// ── In-memory forms cache (avoids a disk read on every incoming message) ─────────
// Forms change rarely — refresh every 10 s or on explicit invalidation.
let _formsCache = null;
let _formsCacheTs = 0;
const FORMS_CACHE_TTL = 10_000;

async function getCachedForms() {
    if (_formsCache && Date.now() - _formsCacheTs < FORMS_CACHE_TTL) return _formsCache;
    _formsCache = await storage.getForms();
    _formsCacheTs = Date.now();
    return _formsCache;
}

function invalidateFormsCache() { _formsCache = null; }
// ── Session cleanup ───────────────────────────────────────────────────────────
setInterval(() => {
    const now = Date.now();
    for (const [jid, sess] of sessions) {
        if (now - sess.lastActivityAt > SESSION_TIMEOUT_MS) sessions.delete(jid);
    }
}, 5 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchKeyword(body, keyword, matchType) {
    const b = body.toLowerCase().trim();
    const k = keyword.toLowerCase().trim();
    if (matchType === 'contains') return b.includes(k);
    return b === k;
}

/**
 * Find the selected option from a user's reply to a choice field.
 * Supports:
 *   - Exact text match  (button tap / list select returns option label)
 *   - Numeric index     (user typed "1", "2", … as a fallback)
 *   - "skip"            (for optional fields)
 */
function resolveChoiceAnswer(field, answer) {
    const a = answer.trim();
    if (!field.required && a.toLowerCase() === 'skip') return { valid: true, value: '' };

    // 1. Direct text match (case-insensitive)
    const textMatch = field.options.find(o => o.toLowerCase() === a.toLowerCase());
    if (textMatch) return { valid: true, value: textMatch };

    // 2. Numeric index fallback
    const num = parseInt(a, 10);
    if (!isNaN(num) && num >= 1 && num <= field.options.length) {
        return { valid: true, value: field.options[num - 1] };
    }

    return {
        valid: false,
        error: `Please select one of the options${field.options.length <= 3 ? ' using the buttons above' : ' from the list'}.`,
    };
}

function validateAnswer(field, answer) {
    const ans = answer.toString().trim();

    if (!field.required && ans.toLowerCase() === 'skip') return { valid: true, value: '' };
    if (!ans) {
        if (field.required) return { valid: false, error: `This field is required. Please provide your ${field.label.toLowerCase()}.` };
        return { valid: true, value: '' };
    }

    switch (field.type) {
        case 'dropdown':
        case 'radio':
        case 'checkbox':
            return resolveChoiceAnswer(field, ans);

        case 'number': {
            const n = Number(ans.replace(/,/g, ''));
            if (isNaN(n) || ans === '') return { valid: false, error: '❌ Invalid number. Please enter digits only (e.g. 42 or 3.5).' };
            return { valid: true, value: String(n) };
        }

        case 'email': {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ans))
                return { valid: false, error: '❌ Invalid email. Please enter a valid address (e.g. you@example.com).' };
            return { valid: true, value: ans.toLowerCase() };
        }

        case 'phone': {
            const digits = ans.replace(/[\s\-().+]/g, '').replace(/\D/g, '');
            if (digits.length < 7)  return { valid: false, error: '❌ Phone number too short. Include country code (e.g. +91 9876543210).' };
            if (digits.length > 15) return { valid: false, error: '❌ Phone number too long. Max 15 digits (ITU-T E.164 standard).' };
            return { valid: true, value: ans };
        }

        case 'date': {
            // Accept: DD/MM/YYYY, DD-MM-YYYY, DD Month YYYY, Month DD YYYY
            const parsed = new Date(ans);
            const ddmmyyyy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(ans);
            const naturalDate = /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(ans) || /^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(ans);
            if (!ddmmyyyy && !naturalDate && isNaN(parsed.getTime()))
                return { valid: false, error: '❌ Invalid date. Please use a format like: *25 March 2026* or *25/03/2026*.' };
            return { valid: true, value: ans };
        }

        case 'time': {
            // Accept: HH:MM, H:MM AM/PM, HHMM, H AM/PM (e.g. "1 PM", "12 am")
            const isValidTime =
                /^([01]?\d|2[0-3]):[0-5]\d$/.test(ans) ||
                /^(1[0-2]|0?[1-9]):[0-5]\d\s*[APap][Mm]$/.test(ans) ||
                /^([01]?\d|2[0-3])[0-5]\d$/.test(ans) ||
                /^(1[0-2]|0?[1-9])\s*[APap][Mm]$/.test(ans);
            if (!isValidTime)
                return { valid: false, error: '❌ Invalid time. Please use a format like: *10:30 AM*, *1 PM*, or *14:00*.' };
            return { valid: true, value: ans };
        }

        case 'text': {
            if (ans.length < 2) return { valid: false, error: '❌ Answer is too short. Please enter at least 2 characters.' };
            if (ans.length > 300) return { valid: false, error: '❌ Answer is too long. Please keep it under 300 characters.' };
            return { valid: true, value: ans };
        }

        case 'textarea': {
            if (ans.length < 3) return { valid: false, error: '❌ Answer is too short. Please provide more detail (at least 3 characters).' };
            if (ans.length > 1000) return { valid: false, error: '❌ Answer is too long. Please keep it under 1000 characters.' };
            return { valid: true, value: ans };
        }

        default:
            return { valid: true, value: ans };
    }
}

// ── Message senders ───────────────────────────────────────────────────────────

function sendText(wa, jid, text) {
    wa.sendMessage(jid, text, null, 'none', [], '', [], null)
      .catch(e => console.error('[FormEngine] sendText error:', e.message));
}

/**
 * Send a multi-input field prompt listing all sub-fields with example.
 */
function sendMultiFieldQuestion(wa, jid, field, fieldNumber, totalFields, headerText = '') {
    const subFields   = field.subFields || [];
    const optHint     = !field.required ? '  *(optional)*' : '';
    const TYPE_HINT   = { email:'valid email', phone:'include country code', date:'e.g. 25 March 2026', time:'e.g. 10:30 AM', number:'numeric value' };
    const EXAMPLES    = { text:'John Doe', number:'42', email:'you@example.com', phone:'+91 9999999999', date:'25 March 2026', time:'10:30 AM', textarea:'Some text' };

    let text = (headerText ? headerText + '\n\n' : '') +
        `*${fieldNumber} of ${totalFields}: ${field.label}*${optHint}\n\n` +
        `_Reply in a single message with each value separated by a comma:_\n\n`;

    subFields.forEach((sf, i) => {
        const hint = TYPE_HINT[sf.type] || '';
        const optLabel = sf.required === false ? ' _(optional)_' : '';
        text += `${i + 1}. *${sf.label}*${hint ? ` — _${hint}_` : ''}${optLabel}\n`;
    });

    const exampleParts = subFields.map(sf => EXAMPLES[sf.type] || sf.label);
    text += `\n📌 _Example:_\n${exampleParts.join(', ')}`;
    if (!field.required) text += '\n\n_Type *skip* to skip this section_';

    sendText(wa, jid, text);
}

/**
 * Validate a multi-input reply — parse comma/newline-separated values and
 * validate each against its sub-field type.  Returns { valid, values } or { valid:false, error }.
 */
function validateMultiAnswer(field, text) {
    const subFields = field.subFields || [];
    if (subFields.length === 0) return { valid: true, values: {} };

    // Optional entire block
    if (!field.required && text.toLowerCase().trim() === 'skip') return { valid: true, values: {} };

    // Split: try newlines first, fall back to commas
    const byLine = text.split(/\n/).map(s => s.trim()).filter(Boolean);
    const parts  = byLine.length >= subFields.length
        ? byLine.slice(0, subFields.length)
        : text.split(/,/).map(s => s.trim());

    // Must satisfy all required sub-fields
    const requiredSubs = subFields.filter(sf => sf.required !== false);
    const hasEnough    = requiredSubs.every((sf, _) => {
        const idx = subFields.indexOf(sf);
        return (parts[idx] || '').trim();
    });
    if (!hasEnough) {
        const labels = subFields.map(sf => sf.label);
        return { valid: false, error: `Please provide all details separated by commas.\nExpected: ${labels.join(', ')}` };
    }

    const values = {};
    const errors = [];
    for (let i = 0; i < subFields.length; i++) {
        const sf  = subFields[i];
        const raw = (parts[i] || '').trim();
        if (!raw) {
            if (sf.required !== false) errors.push(`*${sf.label}* is required`);
            continue;
        }
        const result = validateAnswer({ ...sf, type: sf.type || 'text', options: [] }, raw);
        if (!result.valid) errors.push(`*${sf.label}:* ${result.error.replace(/^❌ /, '')}`);
        else values[sf.id] = result.value;
    }

    if (errors.length > 0) return { valid: false, error: errors.join('\n') };
    return { valid: true, values };
}

/**
 * Send a field question using the most appropriate interactive format.
 */
// headerText is prepended (used to embed the form intro / error into the question,
// avoiding a separate send. All sends are fire-and-forget — caller never awaits.
function sendFieldQuestion(wa, jid, field, fieldNumber, totalFields, headerText = '') {
    if (field.type === 'multi') {
        sendMultiFieldQuestion(wa, jid, field, fieldNumber, totalFields, headerText);
        return;
    }
    const optionalHint = !field.required ? '  *(optional)*' : '';
    let questionText = (headerText ? headerText + '\n\n' : '') + `*${fieldNumber} of ${totalFields}: ${field.label}*${optionalHint}`;
    if (field.placeholder) questionText += `\n_${field.placeholder}_`;

    const isChoice = ['dropdown', 'radio', 'checkbox'].includes(field.type);

    if (isChoice && Array.isArray(field.options) && field.options.length > 0) {
        const opts = field.options.slice(0, MAX_LIST_ROWS);
        const fallbackText = questionText + '\n\n' + opts.map((o, i) => `${i + 1}. ${o}`).join('\n') + '\n\n_Reply with the number_';

        if (opts.length <= 3) {
            const buttons = opts.map(opt => ({ type: 'quick_reply', label: opt }));
            if (!field.required) buttons.push({ type: 'quick_reply', label: 'Skip' });
            wa.sendMessage(jid, questionText, null, 'quick_reply', buttons, '', [], null)
              .catch(() => wa.sendMessage(jid, fallbackText, null, 'none', [], '', [], null).catch(() => {}));
        } else {
            const rows = opts.map((opt, i) => ({ id: String(i + 1), title: opt }));
            if (!field.required) rows.push({ id: 'skip', title: 'Skip (optional)' });
            const sections = [{ title: field.label, rows }];
            wa.sendMessage(jid, questionText, null, 'list', [], 'Choose an option', sections, null)
              .catch(() => wa.sendMessage(jid, fallbackText, null, 'none', [], '', [], null).catch(() => {}));
        }
        return;
    }

    let hint = '';
    if (field.type === 'date')     hint = '\n_Format: 25 March 2026_';
    else if (field.type === 'time')   hint = '\n_Format: 10:30 AM_';
    else if (field.type === 'email')  hint = '\n_Enter a valid email address_';
    else if (field.type === 'phone')  hint = '\n_Include country code e.g. +91 9999999999_';
    else if (field.type === 'number') hint = '\n_Enter a numeric value_';
    if (!field.required) hint += '\n_Type *skip* to skip_';
    sendText(wa, jid, questionText + hint);
}

/**
 * Send a confirmation summary with Yes/No quick reply buttons.
 */
function sendConfirmation(wa, jid, fields, responses, confirmField) {
    const confirmLabel  = confirmField?.confirmLabel?.trim()  || '✅ Yes, Confirm';
    const restartLabel  = confirmField?.restartLabel?.trim()  || '🔄 No, Restart';
    let msg = '*Please confirm your details:*\n\n';
    for (const field of fields) {
        if (field.type === 'confirmation') continue;
        if (field.type === 'multi') {
            const subFields = field.subFields || [];
            const hasAny = subFields.some(sf => responses[sf.id]);
            if (hasAny) {
                msg += `▸ *${field.label}:*\n`;
                for (const sf of subFields) {
                    const val = responses[sf.id];
                    if (val) msg += `   • ${sf.label}: ${val}\n`;
                }
            }
        } else {
            const val = responses[field.id];
            if (val) msg += `▸ *${field.label}:* ${val}\n`;
        }
    }
    msg += '\nIs everything correct?';
    const buttons = [
        { type: 'quick_reply', label: confirmLabel },
        { type: 'quick_reply', label: restartLabel },
    ];
    wa.sendMessage(jid, msg, null, 'quick_reply', buttons, '', [], null)
      .catch(() => sendText(wa, jid, msg + `\n\nReply *${confirmLabel}* to confirm or *${restartLabel}* to restart.`));
}

async function fireWebhook(form, submission) {
    if (!form.webhookUrl) return;
    try {
        await fetch(form.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ form_id: form.id, form_name: form.name, submission }),
            signal: AbortSignal.timeout(8000),
        });
    } catch (e) { console.error('[FormEngine] Webhook error:', e.message); }
}

// Fully synchronous — successMessage comes from sess (set at session creation).
// All disk I/O + webhook run in setImmediate so the success reply goes out instantly.
function saveSubmission(sess, phone, deviceId) {
    const successMessage = sess.successMessage;
    const submissionId   = crypto.randomUUID();
    const now            = new Date().toISOString();
    const submission = {
        id: submissionId,
        formId: sess.formId,
        formName: sess.formName,
        phone,
        deviceId: sess.deviceId || deviceId,
        responses: { ...sess.responses },
        status: 'completed',
        startedAt: new Date(sess.startedAt).toISOString(),
        completedAt: now,
        timestamp: now,
    };
    setImmediate(async () => {
        try {
            const submissions = await storage.getFormSubmissions();
            submissions.push(submission);
            await storage.saveFormSubmissions(submissions);
            const io = socketSingleton.get();
            if (io) io.emit('form_new_submission', { submission });
            const forms = await getCachedForms();
            const form  = forms.find(f => f.id === sess.formId);
            if (form) {
                form.totalSubmissions = (form.totalSubmissions || 0) + 1;
                await storage.saveForms(forms);
                invalidateFormsCache();
                await fireWebhook(form, submission);
            }
        } catch (e) { console.error('[FormEngine] saveSubmission error:', e.message); }
    });
    return { successMessage };
}

// ── Main incoming-message handler ─────────────────────────────────────────────
deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId }) => {
    if (!body || !body.toString().trim()) return;
    const text = body.toString().trim();

    // Handle CANCEL mid-session first (before everything else)
    if (text.toUpperCase() === 'CANCEL' && sessions.has(jid)) {
        sessions.delete(jid);
        const wa = deviceManager.get(deviceId);
        if (wa && wa.isReady()) sendText(wa, jid, 'Form cancelled. Type a keyword to start again anytime.');
        return;
    }

    try {
        // ── Case 1: User is inside an active form session ─────────────────────
        if (sessions.has(jid)) {
            const sess = sessions.get(jid);
            sess.lastActivityAt = Date.now();

            const wa = deviceManager.get(sess.deviceId || deviceId);
            if (!wa || !wa.isReady()) return;

            const nonConfirmFields = sess.fields.filter(f => f.type !== 'confirmation');
            const confirmField     = sess.fields.find(f => f.type === 'confirmation');
            const hasConfirmation  = !!confirmField;

            // ── Confirmation step ─────────────────────────────────────────────
            if (sess.awaitingConfirmation) {
                const confirmLabel = (confirmField?.confirmLabel?.trim() || '✅ Yes, Confirm').toLowerCase();
                const restartLabel = (confirmField?.restartLabel?.trim() || '🔄 No, Restart').toLowerCase();
                const lower = text.toLowerCase();
                // Match button tap (exact) OR custom label words OR universal yes/no keywords
                const isYes = lower === confirmLabel || lower.includes('yes') || lower.includes('confirm') || lower === '✅';
                const isNo  = lower === restartLabel  || lower.includes('no')  || lower.includes('restart') || lower === '🔄';

                if (isYes) {
                    const { successMessage } = saveSubmission(sess, phone, deviceId);
                    sessions.delete(jid);
                    sendText(wa, jid, `✅ ${successMessage}`);
                    return;
                }
                if (isNo) {
                    sess.currentIdx = 0;
                    sess.responses = {};
                    sess.awaitingConfirmation = false;
                    sendFieldQuestion(wa, jid, nonConfirmFields[0], 1, nonConfirmFields.length, "No problem! Let's start from the top.");
                    return;
                }
                sendConfirmation(wa, jid, nonConfirmFields, sess.responses, confirmField);
                return;
            }

            // ── Normal field step ─────────────────────────────────────────────
            const currentField = nonConfirmFields[sess.currentIdx];
            if (!currentField) { sessions.delete(jid); return; }

            if (currentField.type === 'multi') {
                const result = validateMultiAnswer(currentField, text);
                if (!result.valid) {
                    sendFieldQuestion(wa, jid, currentField, sess.currentIdx + 1, nonConfirmFields.length, `⚠️ ${result.error}`);
                    return;
                }
                Object.assign(sess.responses, result.values);
            } else {
                const result = validateAnswer(currentField, text);
                if (!result.valid) {
                    sendFieldQuestion(wa, jid, currentField, sess.currentIdx + 1, nonConfirmFields.length, `⚠️ ${result.error}`);
                    return;
                }
                if (result.value !== '') sess.responses[currentField.id] = result.value;
            }
            sess.currentIdx += 1;

            if (sess.currentIdx >= nonConfirmFields.length) {
                if (hasConfirmation) {
                    sess.awaitingConfirmation = true;
                    sendConfirmation(wa, jid, nonConfirmFields, sess.responses, confirmField);
                } else {
                    const { successMessage } = saveSubmission(sess, phone, deviceId);
                    sessions.delete(jid);
                    sendText(wa, jid, `✅ ${successMessage}`);
                }
                return;
            }

            // Next field — fire and forget
            sendFieldQuestion(wa, jid, nonConfirmFields[sess.currentIdx], sess.currentIdx + 1, nonConfirmFields.length);
            return;
        }

        // ── Case 2: Check keyword triggers ────────────────────────────────────
        const forms = await getCachedForms();
        const activeForms = forms.filter(f =>
            f.active &&
            Array.isArray(f.sessionIds) &&
            (f.sessionIds.length === 0 || f.sessionIds.includes(deviceId))
        );

        for (const form of activeForms) {
            if (!Array.isArray(form.triggerKeywords) || form.triggerKeywords.length === 0) continue;

            const isGroup = (jid || '').includes('@g.us');
            if (form.targetType === 'individual' && isGroup)  continue;
            if (form.targetType === 'group'      && !isGroup) continue;

            const triggered = form.triggerKeywords.some(kw => matchKeyword(text, kw, form.matchType));
            if (!triggered) continue;

            const nonConfirmFields = form.fields.filter(f => f.type !== 'confirmation');
            if (nonConfirmFields.length === 0) continue;

            const wa = deviceManager.get(deviceId);
            if (!wa || !wa.isReady()) continue;

            sessions.set(jid, {
                formId: form.id,
                formName: form.name,
                fields: form.fields,
                currentIdx: 0,
                responses: {},
                deviceId,
                // Cache success message so saveSubmission needs zero I/O to retrieve it
                successMessage: form.successMessage || 'Thank you! Your response has been recorded.',
                startedAt: Date.now(),
                lastActivityAt: Date.now(),
                awaitingConfirmation: false,
            });

            const introHeader = `*${form.name}*${form.description ? '\n' + form.description : ''}\n_Type *CANCEL* anytime to stop._`;
            sendFieldQuestion(wa, jid, nonConfirmFields[0], 1, nonConfirmFields.length, introHeader);
            break;
        }

    } catch (err) {
        console.error('[FormEngine] Error:', err.message);
    }
});

module.exports = { sessions };
