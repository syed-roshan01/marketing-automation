'use strict';
/**
 * AIAutomationEngine — Real AI chatbot that analyzes messages and responds based on context
 * Uses FREE AI models - no API keys needed!
 */
const storage = require('../../src/storage');
const deviceManager = require('../../src/deviceManager');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Store conversation history in memory
const conversationHistory = new Map(); // jid -> [{ role, content }, ...]

const CAPTURED_FIELDS = ['name', 'mobile', 'email', 'location', 'dateTime', 'service'];

function normalizeSpace(v) {
    return String(v || '').replace(/\s+/g, ' ').trim();
}

function sanitizeFieldValue(field, value) {
    const raw = normalizeSpace(value);
    if (!raw) return '';

    // Avoid low-signal placeholders in records.
    const lowSignal = new Set(['ok', 'okay', 'yes', 'no', 'na', 'n/a', '-', '--', 'none', 'not sure']);
    if (lowSignal.has(raw.toLowerCase())) return '';

    if (field === 'email') {
        const m = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        return m ? m[0].toLowerCase() : '';
    }

    if (field === 'mobile') {
        const m = raw.match(/(?:\+?\d[\d\s\-()]{7,}\d)/);
        return m ? m[0].replace(/\s+/g, ' ').trim() : '';
    }

    if (field === 'name') {
        if (raw.length < 2 || raw.length > 80) return '';
    }

    return raw;
}

function mergeFieldSets(base = {}, incoming = {}) {
    const merged = { ...base };
    for (const key of CAPTURED_FIELDS) {
        const candidate = sanitizeFieldValue(key, incoming[key]);
        if (candidate) merged[key] = candidate;
        else if (!merged[key]) merged[key] = '';
    }
    return merged;
}

function getUserTextFromHistory(history = []) {
    return (history || [])
        .filter(m => m && m.role === 'user' && m.content)
        .map(m => String(m.content))
        .join('\n');
}

function extractLabeledFields(text) {
    const fields = {};
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const aliases = {
        name: ['name', 'full name', 'customer name'],
        mobile: ['mobile', 'phone', 'phone number', 'contact number', 'whatsapp'],
        email: ['email', 'mail', 'email address'],
        location: ['location', 'address', 'city', 'meeting mode', 'meeting location'],
        dateTime: ['date', 'time', 'date and time', 'preferred date', 'preferred time', 'appointment date', 'appointment time'],
        service: ['service', 'service required', 'appointment for', 'booking for', 'purpose'],
    };

    for (const line of lines) {
        for (const [field, keys] of Object.entries(aliases)) {
            const keyRegex = new RegExp(`^(?:${keys.map(k => k.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')).join('|')})\\s*[:=-]\\s*(.+)$`, 'i');
            const m = line.match(keyRegex);
            if (m && m[1]) {
                const clean = sanitizeFieldValue(field, m[1]);
                if (clean) fields[field] = clean;
            }
        }
    }
    return fields;
}

function isLikelyNameLine(line) {
    const v = normalizeSpace(line);
    if (!v) return false;
    if (/[@\d]/.test(v)) return false;
    if (/^(hi|hello|hey|ok|okay|yes|no|thanks|thank you)$/i.test(v)) return false;
    if (v.split(' ').length < 2 || v.split(' ').length > 4) return false;
    return /^[a-zA-Z .'-]+$/.test(v);
}

function isLikelyServiceLine(line) {
    const v = normalizeSpace(line).toLowerCase();
    if (!v) return false;
    if (v.length < 3 || v.length > 50) return false;
    if (/[@\d]/.test(v)) return false;
    if (/^(hi|hello|hey|yes|no|ok|okay|office|online)$/.test(v)) return false;
    if (/^(name|email|phone|mobile|date|time|location|service)\s*[:=-]/.test(v)) return false;
    return /^[a-zA-Z\s&+./'-]+$/.test(v);
}

function extractFromStandaloneLines(text) {
    const out = {};
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    for (const line of lines) {
        const v = normalizeSpace(line);
        const lower = v.toLowerCase();

        if (!out.email) {
            const em = sanitizeFieldValue('email', v);
            if (em) out.email = em;
        }

        if (!out.mobile) {
            const ph = sanitizeFieldValue('mobile', v);
            if (ph) out.mobile = ph;
        }

        if (!out.location) {
            if (/\b(online|offline|office|remote|in\s*person)\b/i.test(lower)) {
                out.location = v;
            }
        }

        if (!out.dateTime) {
            const dt = extractDateTimeLoose(v);
            if (dt) out.dateTime = dt;
        }

        if (!out.name && isLikelyNameLine(v)) {
            out.name = v;
            continue;
        }

        if (!out.service && isLikelyServiceLine(v)) {
            out.service = v;
        }
    }

    return out;
}

function extractDateTimeLoose(text) {
    const normalized = normalizeSpace(text).toLowerCase();
    if (!normalized) return '';

    const dateNumeric = normalized.match(/\b\d{1,2}(?:st|nd|rd|th)?(?:[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?)\b/i);
    const dateMonth = normalized.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i);
    const weekday = normalized.match(/\b(?:today|tomorrow|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i);
    const time = normalized.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i);

    const datePart = (dateMonth && dateMonth[0]) || (dateNumeric && dateNumeric[0]) || (weekday && weekday[0]) || '';
    const timePart = (time && time[0]) || '';

    if (datePart && timePart) return `${datePart} ${timePart}`.trim();
    if (datePart) return datePart;
    if (timePart && /\b(?:at|time|pm|am|appointment|meeting)\b/i.test(normalized)) return timePart;
    return '';
}

function extractCustomKeyValues(text) {
    const pairs = {};
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        const match = line.match(/^([a-zA-Z][\w\s\/-]{1,40})\s*[:=-]\s*(.{1,200})$/);
        if (!match) continue;
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        pairs[key] = match[2].trim();
    }
    return pairs;
}

function extractStructuredFields(text) {
    const raw = String(text || '');
    const normalized = raw.replace(/\s+/g, ' ').trim();
    const fields = {};

    const emailMatch = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) fields.email = sanitizeFieldValue('email', emailMatch[0]);

    const mobileMatch = normalized.match(/(?:\+?\d[\d\s\-()]{7,}\d)/);
    if (mobileMatch) fields.mobile = sanitizeFieldValue('mobile', mobileMatch[0]);

    const namePatterns = [
        /(?:my\s+name\s+is|name\s*[:=-])\s*([a-zA-Z][a-zA-Z .'-]{1,60})/i,
        /(?:i\s+am|i'm)\s+([a-zA-Z][a-zA-Z .'-]{1,60})/i,
    ];
    for (const p of namePatterns) {
        const m = normalized.match(p);
        if (m && m[1]) {
            fields.name = sanitizeFieldValue('name', m[1]);
            break;
        }
    }

    const locationPatterns = [
        /(?:location|address|city)\s*[:=-]\s*([^,.;\n]{2,80})/i,
        /(?:i\s+am\s+from|from)\s+([a-zA-Z][a-zA-Z\s.'-]{1,80})/i,
    ];
    for (const p of locationPatterns) {
        const m = normalized.match(p);
        if (m && m[1]) {
            fields.location = sanitizeFieldValue('location', m[1]);
            break;
        }
    }

    const servicePatterns = [
        /(?:service|appointment\s+for|booking\s+for)\s*[:=-]?\s*([^,.;\n]{2,100})/i,
        /(?:i\s+need|i\s+want)\s+(?:a|an)?\s*([^,.;\n]{2,100})/i,
    ];
    for (const p of servicePatterns) {
        const m = normalized.match(p);
        if (m && m[1]) {
            fields.service = sanitizeFieldValue('service', m[1]);
            break;
        }
    }

    const dateMatch = normalized.match(/(?:date\s*[:=-]\s*|on\s+)(\d{1,2}(?:st|nd|rd|th)?[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*|\d{4}-\d{2}-\d{2}|today|tomorrow|(?:mon|tue|wed|thu|fri|sat|sun)\w*)/i);
    const timeMatch = normalized.match(/(?:time\s*[:=-]\s*|at\s+)(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (dateMatch && timeMatch) fields.dateTime = sanitizeFieldValue('dateTime', `${dateMatch[1]} ${timeMatch[1]}`);
    else if (dateMatch) fields.dateTime = sanitizeFieldValue('dateTime', dateMatch[1]);
    else if (timeMatch) fields.dateTime = sanitizeFieldValue('dateTime', timeMatch[1]);

    if (!fields.dateTime) {
        fields.dateTime = sanitizeFieldValue('dateTime', extractDateTimeLoose(normalized));
    }

    return fields;
}

function applyTemplateHeuristics(assistant, fields, latestText, fullUserText) {
    const merged = { ...fields };
    const template = String(assistant?.templateId || '').toLowerCase();
    if (template !== 'appointment') return merged;

    const fromLatest = extractFromStandaloneLines(latestText);
    const fromHistory = extractFromStandaloneLines(fullUserText);
    const fallback = mergeFieldSets(fromHistory, fromLatest);

    merged.name = merged.name || fallback.name || '';
    merged.service = merged.service || fallback.service || '';
    merged.dateTime = merged.dateTime || fallback.dateTime || '';
    merged.location = merged.location || fallback.location || '';
    merged.mobile = merged.mobile || fallback.mobile || '';
    merged.email = merged.email || fallback.email || '';
    return merged;
}

async function recordAutomationInput({ assistant, phone, jid, deviceId, text, history }) {
    try {
        const records = await storage.getAIRecords();
        const now = new Date().toISOString();
        const fullUserText = getUserTextFromHistory(history);
        const existing = records.find(r =>
            r && r.assistantId === assistant.id && r.phone === phone && r.deviceId === deviceId
        );
        const persistedHistoryText = Array.isArray(existing?.messages)
            ? existing.messages.map(m => String(m?.text || '')).filter(Boolean).join('\n')
            : '';
        const combinedText = [persistedHistoryText, fullUserText, String(text || '')]
            .filter(Boolean)
            .join('\n');
        const structuredFromLatest = extractStructuredFields(text);
        const structuredFromHistory = extractStructuredFields(combinedText);
        const labeledFromLatest = extractLabeledFields(text);
        const labeledFromHistory = extractLabeledFields(combinedText);
        const standaloneLatest = extractFromStandaloneLines(text);
        const standaloneHistory = extractFromStandaloneLines(combinedText);
        const structured = mergeFieldSets(
            mergeFieldSets(structuredFromHistory, structuredFromLatest),
            mergeFieldSets(
                mergeFieldSets(labeledFromHistory, labeledFromLatest),
                mergeFieldSets(standaloneHistory, standaloneLatest)
            )
        );
        const finalStructured = applyTemplateHeuristics(assistant, structured, text, combinedText);
        const customPairs = {
            ...extractCustomKeyValues(combinedText),
            ...extractCustomKeyValues(text),
        };
        const messageText = String(text || '').trim();

        if (!existing) {
            records.push({
                id: crypto.randomUUID(),
                assistantId: assistant.id,
                assistantName: assistant.name || 'AI Assistant',
                templateId: assistant.templateId || 'custom',
                phone,
                jid,
                deviceId,
                fields: {
                    name: finalStructured.name || '',
                    mobile: finalStructured.mobile || sanitizeFieldValue('mobile', phone) || phone || '',
                    email: finalStructured.email || '',
                    location: finalStructured.location || '',
                    dateTime: finalStructured.dateTime || '',
                    service: finalStructured.service || '',
                },
                customFields: customPairs,
                messages: messageText ? [{ text: messageText, at: now }] : [],
                lastInput: messageText,
                createdAt: now,
                updatedAt: now,
            });
        } else {
            existing.assistantName = assistant.name || existing.assistantName;
            existing.templateId = assistant.templateId || existing.templateId || 'custom';
            existing.jid = jid;
            existing.updatedAt = now;
            existing.lastInput = messageText || existing.lastInput;
            existing.fields = {
                name: finalStructured.name || existing.fields?.name || '',
                mobile: finalStructured.mobile || existing.fields?.mobile || sanitizeFieldValue('mobile', phone) || phone || '',
                email: finalStructured.email || existing.fields?.email || '',
                location: finalStructured.location || existing.fields?.location || '',
                dateTime: finalStructured.dateTime || existing.fields?.dateTime || '',
                service: finalStructured.service || existing.fields?.service || '',
            };
            existing.customFields = {
                ...(existing.customFields || {}),
                ...customPairs,
            };
            if (!Array.isArray(existing.messages)) existing.messages = [];
            if (messageText) {
                existing.messages.push({ text: messageText, at: now });
                if (existing.messages.length > 20) {
                    existing.messages = existing.messages.slice(-20);
                }
            }
        }

        await storage.saveAIRecords(records);
    } catch (err) {
        console.error('[AI] Record save error:', err.message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateTyping(waInst, jid, text) {
    try {
        if (!waInst?.sock?.sendPresenceUpdate) return;

        // Realistic typing time based on message length.
        const len = String(text || '').length;
        const baseMs = 800;
        const perCharMs = 45;
        const capMs = 6500;
        const jitter = Math.floor(Math.random() * 600);
        const typingMs = Math.min(capMs, baseMs + (len * perCharMs) + jitter);

        await waInst.sock.sendPresenceUpdate('composing', jid);
        await sleep(typingMs);
        await waInst.sock.sendPresenceUpdate('paused', jid);
    } catch (err) {
        // Do not block message sending if presence update fails.
        console.warn('[AI] Typing simulation failed:', err.message);
    }
}

function resolveGroqKey(currentAssistant, assistants) {
    if (currentAssistant?.apiKey && String(currentAssistant.apiKey).startsWith('gsk_')) {
        return currentAssistant.apiKey;
    }
    const fromList = (assistants || []).find(a => a?.apiKey && String(a.apiKey).startsWith('gsk_'));
    if (fromList) return fromList.apiKey;
    if (process.env.GROQ_API_KEY && String(process.env.GROQ_API_KEY).startsWith('gsk_')) {
        return process.env.GROQ_API_KEY;
    }
    return null;
}

function matchesReplyScope(scope, jid) {
    const s = String(scope || 'both').toLowerCase();
    const isGroup = String(jid || '').endsWith('@g.us');
    if (s === 'group') return isGroup;
    if (s === 'individual') return !isGroup;
    return true;
}

/**
 * Primary AI: Ollama running locally (free, private, best quality).
 * Ollama must be installed and a model pulled (e.g. `ollama pull llama3`).
 * Falls back gracefully if Ollama is not running.
 */
async function callOllamaAI(systemPrompt, messages) {
    const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
    const ollamaHost = process.env.OLLAMA_HOST || 'localhost';
    const ollamaPort = parseInt(process.env.OLLAMA_PORT || '11434', 10);
    try {
        console.log(`[AI] 🦙 Calling Ollama (${ollamaModel} @ ${ollamaHost}:${ollamaPort})...`);

        const payload = JSON.stringify({
            model: ollamaModel,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content }))
            ],
            stream: false
        });

        return new Promise((resolve) => {
            const options = {
                hostname: ollamaHost,
                port: ollamaPort,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 60000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const response = (result?.message?.content || '').trim();
                        if (response) {
                            console.log('[AI] ✅ Got Ollama response');
                            resolve(response);
                        } else {
                            console.log('[AI] ⚠️ Ollama returned empty response');
                            resolve(null);
                        }
                    } catch (e) {
                        console.error('[AI] Ollama parse error:', e.message);
                        resolve(null);
                    }
                });
            });

            req.on('error', err => {
                // Ollama not running — silently fall back
                console.log('[AI] Ollama not available, falling back to cloud AI...');
                resolve(null);
            });

            req.on('timeout', () => {
                req.destroy();
                console.error('[AI] Ollama timeout');
                resolve(null);
            });

            req.write(payload);
            req.end();
        });
    } catch (err) {
        console.error('[AI] Ollama call error:', err.message);
        return null;
    }
}

/**
 * Build a humanized system prompt that wraps the user-defined assistant context.
 * Instructs the AI to behave naturally, stay on-role, and acknowledge user data.
 */
function buildEnhancedSystemPrompt(assistant) {
    const base = (assistant.systemPrompt || assistant.context || '').trim();

    const humanLayer = [
        'You are a friendly, warm, and knowledgeable WhatsApp assistant.',
        'Respond naturally and conversationally — like a helpful human, not a generic chatbot.',
        'Keep your replies concise, clear, and directly relevant to what the customer asked.',
        'If the customer shares personal details such as their name, phone number, email, preferred date, or service needed, acknowledge them naturally and remember them throughout the conversation.',
        'Do NOT repeat generic greetings on every message.',
        'Avoid overly formal or bullet-heavy responses unless the context clearly calls for it.',
        'Respond in the same language the customer writes in.',
        'Never reveal that you are an AI or a bot unless the customer directly asks.',
        'Always base your replies strictly on the context and role defined below — do not go off-topic.',
    ].join('\n');

    if (base) {
        return `${humanLayer}\n\n--- YOUR SPECIFIC ROLE & CONTEXT ---\n${base}`;
    }
    return humanLayer;
}

async function callGroqAI(systemPrompt, messages, groqApiKey) {
    try {
        if (!groqApiKey) return null;
        console.log('[AI] 🧠 Calling backup AI (Groq)...');
        
        // Format messages for the AI
        const formattedMessages = messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const payload = JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: systemPrompt },
                ...formattedMessages
            ],
            temperature: 0.7,
            max_tokens: 700
        });

        return new Promise((resolve) => {
            const options = {
                hostname: 'api.groq.com',
                port: 443,
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Authorization': `Bearer ${groqApiKey}`
                },
                timeout: 30000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const response = result?.choices?.[0]?.message?.content || null;
                        if (response) {
                            console.log('[AI] ✅ Got AI response');
                            resolve(response);
                        } else {
                            console.log('[AI] ⚠️ No response from Groq API');
                            resolve(null);
                        }
                    } catch (e) {
                        console.error('[AI] Parse error:', e.message);
                        resolve(null);
                    }
                });
            });

            req.on('error', err => {
                console.error('[AI] Request error:', err.message);
                resolve(null);
            });

            req.on('timeout', () => {
                req.destroy();
                console.error('[AI] Request timeout');
                resolve(null);
            });

            try {
                req.write(payload);
                req.end();
            } catch (err) {
                console.error('[AI] Write error:', err.message);
                resolve(null);
            }
        });
    } catch (err) {
        console.error('[AI] Call error:', err.message);
        return null;
    }
}

/**
 * Primary real AI: Pollinations OpenAI-compatible endpoint (no API key required)
 */
async function callPollinationsAI(systemPrompt, messages) {
    try {
        console.log('[AI] 🧠 Calling primary AI (Pollinations, no key)...');

        const payload = JSON.stringify({
            model: 'openai',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({ role: m.role, content: m.content }))
            ],
            temperature: 0.7,
            max_tokens: 700
        });

        return new Promise((resolve) => {
            const options = {
                hostname: 'text.pollinations.ai',
                port: 443,
                path: '/openai',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 30000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        const response = result?.choices?.[0]?.message?.content || null;
                        if (response) {
                            console.log('[AI] ✅ Got Pollinations AI response');
                            resolve(response);
                        } else {
                            console.log('[AI] ⚠️ Pollinations returned empty response');
                            resolve(null);
                        }
                    } catch (e) {
                        console.error('[AI] Pollinations parse error:', e.message);
                        resolve(null);
                    }
                });
            });

            req.on('error', err => {
                console.error('[AI] Pollinations request error:', err.message);
                resolve(null);
            });

            req.on('timeout', () => {
                req.destroy();
                console.error('[AI] Pollinations request timeout');
                resolve(null);
            });

            req.write(payload);
            req.end();
        });
    } catch (err) {
        console.error('[AI] Pollinations call error:', err.message);
        return null;
    }
}

/**
 * Real AI wrapper:
 *   1. Ollama (local, free, best quality — requires Ollama installed + model pulled)
 *   2. Pollinations (free cloud fallback)
 *   3. Groq (API key fallback)
 */
async function callFreeAI(systemPrompt, messages, groqApiKey) {
    // Try local Ollama first
    const ollamaResp = await callOllamaAI(systemPrompt, messages);
    if (ollamaResp) return ollamaResp;

    // Fall back to Pollinations (free cloud)
    const pollinationsResp = await callPollinationsAI(systemPrompt, messages);
    if (pollinationsResp) return pollinationsResp;

    // Last resort: Groq if API key is set
    const groqResp = await callGroqAI(systemPrompt, messages, groqApiKey);
    if (groqResp) return groqResp;

    return null;
}

/**
 * Last-resort response when external AI services are temporarily unreachable.
 */
function generateFallbackResponse(_systemPrompt, latestUserMessage, assistant) {
    console.log('[AI] AI services unavailable; using temporary fallback message');
    return 'I am temporarily unable to generate an AI response. Please try again in a moment.';
}

/**
 * Main message handler - listens for incoming WhatsApp messages
 */
// In-memory cache for AI assistants (changes rarely — TTL 30 s)
let _assistantsCache = null, _assistantsCacheTs = 0;
async function getCachedAssistants() {
    if (_assistantsCache && Date.now() - _assistantsCacheTs < 30_000) return _assistantsCache;
    _assistantsCache = await storage.getAIAssistants();
    _assistantsCacheTs = Date.now();
    return _assistantsCache;
}
function invalidateAssistantsCache() { _assistantsCache = null; }

deviceManager.on('incoming_message', async ({ phone, jid, body, deviceId }) => {
    try {
        console.log(`[AI] 📨 Incoming: "${body}" from ${phone}`);
        
        // Get AI assistants for this device
        const assistants = await getCachedAssistants();
        const activeAssistants = assistants.filter((a) => {
            if (!a || !a.active) return false;
            if (!matchesReplyScope(a.replyScope, jid)) return false;
            // Empty session list means "all sessions".
            if (!Array.isArray(a.sessionIds) || a.sessionIds.length === 0) return true;
            return a.sessionIds.includes(deviceId);
        });
        
        if (activeAssistants.length === 0) {
            console.log('[AI] No active assistants for this session');
            return;
        }
        
        const assistant = activeAssistants
            .slice()
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
        // Use newest active assistant so newly created bots work immediately.
        console.log(`[AI] Found bot: ${assistant.name}`);
        
        const waInst = deviceManager.get(deviceId);
        if (!waInst || !waInst.isReady()) {
            console.log('[AI] WhatsApp instance not ready');
            return;
        }
        
        // Get or create conversation history
        let history = conversationHistory.get(jid) || [];
        history.push({ role: 'user', content: body });

        // Record structured user inputs locally per assistant/contact.
        await recordAutomationInput({ assistant, phone, jid, deviceId, text: body, history });
        
        // Keep last 20 messages for richer context continuity
        if (history.length > 20) {
            history = history.slice(-20);
        }
        
        console.log(`[AI] Conversation: ${history.length} messages | Provider: ${assistant.apiProvider}`);
        
        // Build humanized system prompt from assistant context
        const prompt = buildEnhancedSystemPrompt(assistant);
        const groqApiKey = resolveGroqKey(assistant, assistants);

        // Call AI: Ollama → Pollinations → Groq
        let aiResponse = await callFreeAI(prompt, history, groqApiKey);

        // Fallback to contextual generator if API fails
        if (!aiResponse) {
            console.log('[AI] Real AI unavailable, using contextual fallback...');
            aiResponse = generateFallbackResponse(prompt, body, assistant);
        }
        
        if (!aiResponse || !aiResponse.trim()) {
            console.error('[AI] ❌ No response generated');
            return;
        }
        
        // Add response to history
        history.push({ role: 'assistant', content: aiResponse });
        conversationHistory.set(jid, history);
        
        // Update stats
        assistant.totalInteractions = (assistant.totalInteractions || 0) + 1;
        await storage.saveAIAssistants(assistants);
        
        // Send response
        try {
            console.log(`[AI] 📤 Sending: "${aiResponse.substring(0, 50)}..."`);
            await simulateTyping(waInst, jid, aiResponse);
            await waInst.sendMessage(jid, aiResponse);
            console.log(`[AI] ✅ Sent!`);
        } catch (sendErr) {
            console.error('[AI] Send error:', sendErr.message);
        }
        
        // Save conversation (async)
        saveConversationAsync(assistant.id, phone, jid, body, aiResponse);
        
    } catch (err) {
        console.error('[AI] Engine error:', err.message);
    }
});

async function saveConversationAsync(assistantId, phone, jid, userMessage, aiMessage) {
    try {
        const conversations = await storage.getAIConversations();
        conversations.push({
            id: require('crypto').randomUUID(),
            assistantId,
            phone,
            jid,
            userMessage,
            aiMessage,
            timestamp: new Date()
        });
        await storage.saveAIConversations(conversations);
    } catch (err) {
        console.error('[AI] Save error:', err.message);
    }
}

module.exports = { aiAutomationEngine: true };
