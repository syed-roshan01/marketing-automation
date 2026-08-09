const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.ZYQORA_DATA || path.join(__dirname, '..', 'data');

const FILES = {
    contacts: path.join(DATA_DIR, 'contacts.json'),
    templates: path.join(DATA_DIR, 'templates.json'),
    campaigns: path.join(DATA_DIR, 'campaigns.json'),
    settings: path.join(DATA_DIR, 'settings.json'),
    groups: path.join(DATA_DIR, 'groups.json'),
    devices: path.join(DATA_DIR, 'devices.json'),
    trustBuilder: path.join(DATA_DIR, 'trust_builder.json'),
    optout:        path.join(DATA_DIR, 'optout.json'),
    optoutSettings:path.join(DATA_DIR, 'optout_settings.json'),
    aiAssistants: path.join(DATA_DIR, 'ai_assistants.json'),
    aiConversations: path.join(DATA_DIR, 'ai_conversations.json'),
    aiRecords: path.join(DATA_DIR, 'ai_records.json'),
};

const SETTINGS_DEFAULT = {
    minDelay: 20,             // seconds (minimum enforced)
    maxDelay: 35,             // seconds (random upper bound)
    batchSize: 15,            // messages before batch pause
    batchPauseMin: 180,       // seconds (3 min)
    batchPauseMax: 300,       // seconds (5 min)
    dailyLimit: 50,           // max messages per day
    delayEnabled: true,       // enable per-message random delay
    batchEnabled: true,       // enable batch pausing
    dailyLimitEnabled: true,  // enforce daily limit cap
    typingEnabled: true,      // show typing indicator before messages
    typingMin: 3,             // seconds
    typingMax: 7,             // seconds
};

async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (_) {}
}

async function readJSON(filePath, defaultValue = []) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') return defaultValue;
        throw err;
    }
}

async function writeJSON(filePath, data) {
    await ensureDataDir();
    const tmp = filePath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

async function getContacts() {
    // Try data/contacts.json first, fall back to root contacts.json for migration
    let contacts = await readJSON(FILES.contacts, null);

    if (contacts === null) {
        // Migrate from root contacts.json
        const rootPath = path.join(__dirname, '..', 'contacts.json');
        const rootContacts = await readJSON(rootPath, []);
        contacts = rootContacts.map(c => ({
            id: c.id || uuidv4(),
            name: c.name,
            number: c.number,
        }));
        await writeJSON(FILES.contacts, contacts);
    }

    // Ensure all have IDs (idempotent)
    let changed = false;
    contacts = contacts.map(c => {
        if (!c.id) { changed = true; return { id: uuidv4(), ...c }; }
        return c;
    });
    if (changed) await writeJSON(FILES.contacts, contacts);

    return contacts;
}

async function saveContacts(contacts) {
    await writeJSON(FILES.contacts, contacts);
}

// ─── Templates ────────────────────────────────────────────────────────────────

async function getTemplates() {
    return readJSON(FILES.templates, []);
}

async function saveTemplates(templates) {
    await writeJSON(FILES.templates, templates);
}

// ─── Campaigns ────────────────────────────────────────────────────────────────

async function getCampaigns() {
    return readJSON(FILES.campaigns, []);
}

async function saveCampaigns(campaigns) {
    await writeJSON(FILES.campaigns, campaigns);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getSettings() {
    const saved = await readJSON(FILES.settings, {});
    return { ...SETTINGS_DEFAULT, ...saved };
}

async function saveSettings(settings) {
    await writeJSON(FILES.settings, settings);
}

// ─── Groups ───────────────────────────────────────────────────────────────────

async function getGroups() {
    return readJSON(FILES.groups, []);
}

async function saveGroups(groups) {
    await writeJSON(FILES.groups, groups);
}

// ─── Devices ──────────────────────────────────────────────────────────────────

async function getDevices() {
    return readJSON(FILES.devices, []);
}

async function saveDevices(devices) {
    await writeJSON(FILES.devices, devices);
}

// ─── Trust Builder ─────────────────────────────────────────────────────────────

async function getTrustBuilderSessions() {
    return readJSON(FILES.trustBuilder, []);
}

async function saveTrustBuilderSessions(sessions) {
    await writeJSON(FILES.trustBuilder, sessions);
}

// ─── Opt-Out Management ───────────────────────────────────────────────────────
const OPTOUT_SETTINGS_DEFAULT = {
    subscribeMsg:   'You have been subscribed to our messages. Reply UNSUBSCRIBE to unsubscribe. Thanks',
    unsubscribeMsg: 'You have been unsubscribed from our messages. Reply SUBSCRIBE to opt back in. Thanks',
};
// Backwards-compatible default keywords (allows UI to edit/enable/disable)
OPTOUT_SETTINGS_DEFAULT.keywords = [
    { word: 'UNSUBSCRIBE', type: 'optout', enabled: true, match: 'exact' },
    { word: 'SUBSCRIBE',   type: 'optin',  enabled: true, match: 'exact' },
    { word: 'INTERESTED',  type: 'optin',  enabled: true, match: 'contains' },
];
async function getOptoutRecords() {
    return readJSON(FILES.optout, []);
}
async function saveOptoutRecords(records) {
    await writeJSON(FILES.optout, records);
}
async function getOptoutSettings() {
    const s = await readJSON(FILES.optoutSettings, null);
    return s ? { ...OPTOUT_SETTINGS_DEFAULT, ...s } : { ...OPTOUT_SETTINGS_DEFAULT };
}
async function saveOptoutSettings(settings) {
    await writeJSON(FILES.optoutSettings, settings);
}

// ─── Auto Reply ───────────────────────────────────────────────────────────────
FILES.autoReply    = path.join(DATA_DIR, 'auto_reply.json');
FILES.autoReplyLog = path.join(DATA_DIR, 'auto_reply_log.json');

async function getAutoReplyRules() {
    return readJSON(FILES.autoReply, []);
}
async function saveAutoReplyRules(rules) {
    await writeJSON(FILES.autoReply, rules);
}
async function getAutoReplyLog() {
    return readJSON(FILES.autoReplyLog, {});
}
async function saveAutoReplyLog(log) {
    await writeJSON(FILES.autoReplyLog, log);
}

// ─── Chatbot Flows ─────────────────────────────────────────────────────────────
FILES.chatbotFlows = path.join(DATA_DIR, 'chatbot_flows.json');
FILES.chatbotLog   = path.join(DATA_DIR, 'chatbot_log.json');

async function getChatbotFlows() { return readJSON(FILES.chatbotFlows, []); }
async function saveChatbotFlows(flows) { await writeJSON(FILES.chatbotFlows, flows); }
async function getChatbotLog() { return readJSON(FILES.chatbotLog, {}); }
async function saveChatbotLog(log) { await writeJSON(FILES.chatbotLog, log); }

FILES.liveChats = path.join(DATA_DIR, 'live_chats.json');
async function getLiveChats() { return readJSON(FILES.liveChats, []); }
async function saveLiveChats(chats) { await writeJSON(FILES.liveChats, chats); }

// ─── Hook Numbers ─────────────────────────────────────────────────────────────
FILES.hookNumbers = path.join(DATA_DIR, 'hook_numbers.json');
async function getHookNumbers() { return readJSON(FILES.hookNumbers, []); }
async function saveHookNumbers(hooks) { await writeJSON(FILES.hookNumbers, hooks); }

// AI Assistants
async function getAIAssistants() { return readJSON(FILES.aiAssistants, []); }
async function saveAIAssistants(assistants) { await writeJSON(FILES.aiAssistants, assistants); }

// AI Conversations
async function getAIConversations() { return readJSON(FILES.aiConversations, []); }
async function saveAIConversations(conversations) { await writeJSON(FILES.aiConversations, conversations); }

// AI Records
async function getAIRecords() { return readJSON(FILES.aiRecords, []); }
async function saveAIRecords(records) { await writeJSON(FILES.aiRecords, records); }

// ─── Interactive Forms ─────────────────────────────────────────────────────────
FILES.forms           = path.join(DATA_DIR, 'forms.json');
FILES.formSubmissions = path.join(DATA_DIR, 'form_submissions.json');

async function getForms() { return readJSON(FILES.forms, []); }
async function saveForms(forms) { await writeJSON(FILES.forms, forms); }
async function getFormSubmissions() { return readJSON(FILES.formSubmissions, []); }
async function saveFormSubmissions(submissions) { await writeJSON(FILES.formSubmissions, submissions); }

module.exports = { getContacts, saveContacts, getTemplates, saveTemplates, getCampaigns, saveCampaigns, getSettings, saveSettings, getGroups, saveGroups, getDevices, saveDevices, getTrustBuilderSessions, saveTrustBuilderSessions, getOptoutRecords, saveOptoutRecords, getOptoutSettings, saveOptoutSettings, getAutoReplyRules, saveAutoReplyRules, getAutoReplyLog, saveAutoReplyLog, getChatbotFlows, saveChatbotFlows, getChatbotLog, saveChatbotLog, getLiveChats, saveLiveChats, getHookNumbers, saveHookNumbers, getAIAssistants, saveAIAssistants, getAIConversations, saveAIConversations, getAIRecords, saveAIRecords, getForms, saveForms, getFormSubmissions, saveFormSubmissions, DATA_DIR, FILES };
