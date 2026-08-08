// ── Generic request helper ────────────────────────────────────────────────────
async function req(method, url, body) {
    const opts = { method, headers: body ? { 'Content-Type': 'application/json' } : {} };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = new Error(data.error || 'Request failed');
        err.status = res.status;
        throw err;
    }
    return res.json().catch(() => ({}));
}

export const api = {
    // ── WhatsApp ──────────────────────────────────────────────────────────────
    getStatus:    ()       => req('GET',  '/api/status'),

    // ── License ───────────────────────────────────────────────────────────────
    getLicenseStatus:  ()    => req('GET',  '/api/license/status'),
    activateLicense:   (key) => req('POST', '/api/license/activate', { key }),

    // ── Settings ──────────────────────────────────────────────────────────────
    getSettings:  ()       => req('GET',  '/api/settings'),
    updateSettings: (d)    => req('PUT',  '/api/settings', d),
    getDailyStats:  ()     => req('GET',  '/api/daily-stats'),
    getHookNumbers: ()     => req('GET',  '/api/hook-numbers'),
    saveHookNumbers: (d)   => req('PUT',  '/api/hook-numbers', d),
    resetAllData: ()       => req('POST', '/api/data-management/reset'),

    // ── Contacts ──────────────────────────────────────────────────────────────
    getContacts:   ()      => req('GET',  '/api/contacts'),
    createContact: (d)     => req('POST', '/api/contacts', d),
    updateContact: (id, d) => req('PUT',  `/api/contacts/${id}`, d),
    deleteContact: (id)    => req('DELETE', `/api/contacts/${id}`),
    bulkDeleteContacts: (ids)  => req('DELETE', '/api/contacts/bulk', { ids }),
    importContacts(file) {
        const fd = new FormData(); fd.append('csv', file);
        return fetch('/api/contacts/import', { method: 'POST', body: fd }).then(r => r.json());
    },

    // ── Groups ────────────────────────────────────────────────────────────────
    getGroups:   ()        => req('GET',  '/api/groups'),
    createGroup: (d)       => req('POST', '/api/groups', d),
    updateGroup: (id, d)   => req('PUT',  `/api/groups/${id}`, d),
    deleteGroup: (id)      => req('DELETE', `/api/groups/${id}`),

    // ── Templates ────────────────────────────────────────────────────────────
    getTemplates:   ()     => req('GET',  '/api/templates'),
    createTemplate: (d)    => req('POST', '/api/templates', d),
    updateTemplate: (id,d) => req('PUT',  `/api/templates/${id}`, d),
    deleteTemplate: (id)   => req('DELETE', `/api/templates/${id}`),
    uploadTemplateImage(id, file) {
        const fd = new FormData(); fd.append('image', file);
        return fetch(`/api/templates/${id}/image`, { method: 'POST', body: fd }).then(r => r.json());
    },
    deleteTemplateImage: (id) => req('DELETE', `/api/templates/${id}/image`),
    uploadTemplateMedia(id, file) {
        const fd = new FormData(); fd.append('media', file);
        return fetch(`/api/templates/${id}/media`, { method: 'POST', body: fd }).then(r => r.json());
    },
    deleteTemplateMedia: (id) => req('DELETE', `/api/templates/${id}/media`),
    uploadCardImage(id, cardIndex, file) {
        const fd = new FormData(); fd.append('image', file);
        return fetch(`/api/templates/${id}/cards/${cardIndex}/image`, { method: 'POST', body: fd }).then(r => r.json());
    },
    deleteCardImage: (id, cardIndex) => req('DELETE', `/api/templates/${id}/cards/${cardIndex}/image`),

    // ── Campaigns ────────────────────────────────────────────────────────────
    getCampaigns:   ()     => req('GET',  '/api/campaigns'),
    createCampaign: (d)    => req('POST', '/api/campaigns', d),
    deleteCampaign: (id)   => req('DELETE', `/api/campaigns/${id}`),
    sendCampaign:   (id)   => req('POST', `/api/campaigns/${id}/send`),
    pauseCampaign:  (id)   => req('POST', `/api/campaigns/${id}/pause`),
    resendCampaign:     (id) => req('POST', `/api/campaigns/${id}/resend`),
    retryFailedCampaign: (id) => req('POST', `/api/campaigns/${id}/retry-failed`),
    scheduleCampaign: (id, scheduledAt) => req('PATCH', `/api/campaigns/${id}/schedule`, { scheduledAt }),
    cancelSchedule:   (id) => req('PATCH', `/api/campaigns/${id}/schedule`, {}),

    // ── Devices ──────────────────────────────────────────────────────────────
    getDevices:         ()             => req('GET',  '/api/devices'),
    createDevice:       (name)         => req('POST', '/api/devices', { name }),
    deleteDevice:       (id)           => req('DELETE', `/api/devices/${id}`),
    getDeviceQR:        (id)           => req('GET',  `/api/devices/${id}/qr`),
    requestPairingCode: (id, phone)    => req('POST', `/api/devices/${id}/pairing-code`, { phone }),
    // ── Trust Builder ──────────────────────────────────────────────
    getTrustBuilder:         ()        => req('GET',  '/api/trust-builder'),
    createTrustBuilder:      (d)       => req('POST', '/api/trust-builder', d),
    startTrustBuilder:       (id)      => req('POST', `/api/trust-builder/${id}/start`),
    stopTrustBuilder:        (id)      => req('POST', `/api/trust-builder/${id}/stop`),
    deleteTrustBuilder:      (id)      => req('DELETE', `/api/trust-builder/${id}`),
    // ── Opt-Out Management ────────────────────────────────────────────────────
    getOptout:               ()        => req('GET',    '/api/optout'),
    addOptout:               (d)       => req('POST',   '/api/optout', d),
    deleteOptout:            (phone)   => req('DELETE', `/api/optout/${phone}`),
    getOptoutSettings:       ()        => req('GET',    '/api/optout/settings'),
    saveOptoutSettings:      (d)       => req('POST',   '/api/optout/settings', d),
    // ── Auto Reply ────────────────────────────────────────────────────────────
    getAutoReply:       ()        => req('GET',    '/api/auto-reply'),
    createAutoReply:    (d)       => req('POST',   '/api/auto-reply', d),
    updateAutoReply:    (id, d)   => req('PUT',    `/api/auto-reply/${id}`, d),
    toggleAutoReply:    (id)      => req('PATCH',  `/api/auto-reply/${id}/toggle`),
    deleteAutoReply:    (id)      => req('DELETE', `/api/auto-reply/${id}`),    // ── Chatbot Flows ─────────────────────────────────────────────────────────────
    getChatbotFlows:       ()       => req('GET',    '/api/chatbot-flows'),
    createChatbotFlow:     (d)      => req('POST',   '/api/chatbot-flows', d),
    updateChatbotFlow:     (id, d)  => req('PUT',    `/api/chatbot-flows/${id}`, d),
    toggleChatbotFlow:     (id)     => req('PATCH',  `/api/chatbot-flows/${id}/toggle`),
    deleteChatbotFlow:     (id)     => req('DELETE', `/api/chatbot-flows/${id}`),
    cleanupChatbotFlows:   ()       => req('DELETE', '/api/chatbot-flows'),
    importChatbotFlows:    (flows)  => req('POST',   '/api/chatbot-flows/import', flows),
    uploadChatbotAttachment(file) {
        const fd = new FormData(); fd.append('file', file);
        return fetch('/api/chatbot-flows/upload-attachment', { method: 'POST', body: fd }).then(r => r.json());
    },    // ── Live Chat ─────────────────────────────────────────────────────────────
    getLiveChats:          (params) => req('GET',    `/api/live-chat${params ? '?' + new URLSearchParams(params) : ''}`),
    getLiveChatMessages:   (id)     => req('GET',    `/api/live-chat/${id}/messages`),
    setLiveChatStatus:     (id, s)  => req('PATCH',  `/api/live-chat/${id}/status`, { status: s }),
    markLiveChatRead:      (id)     => req('PATCH',  `/api/live-chat/${id}/read`),
    sendLiveChatMessage:   (id, m)  => req('POST',   `/api/live-chat/${id}/send`, { message: m }),
    addLiveChatNote:       (id, n)  => req('POST',   `/api/live-chat/${id}/notes`, { note: n }),
    deleteLiveChatNote:    (id, nid)=> req('DELETE', `/api/live-chat/${id}/notes/${nid}`),
    deleteLiveChat:        (id)     => req('DELETE', `/api/live-chat/${id}`),
    // ── Single Message ────────────────────────────────────────────────────────
    sendSingle: (formData) =>
        fetch('/api/send-single', { method: 'POST', body: formData }).then(r => r.json()),

    // ── Support Fix ───────────────────────────────────────────────────────────
    openAppData:              () => req('POST', '/api/open-app-data'),
    deleteWhatsAppSessions:   () => req('POST', '/api/data-management/delete/whatsapp-sessions'),
    deleteSupportContacts:    () => req('POST', '/api/data-management/delete/contacts'),
    deleteSupportTemplates:   () => req('POST', '/api/data-management/delete/templates'),
    deleteSupportCampaigns:   () => req('POST', '/api/data-management/delete/campaigns'),
    deleteSupportChatbot:     () => req('POST', '/api/data-management/delete/chatbot-flows'),
    deleteSupportAutoReply:   () => req('POST', '/api/data-management/delete/auto-reply'),
    deleteSupportGroups:      () => req('POST', '/api/data-management/delete/groups'),
    deleteSupportOptout:      () => req('POST', '/api/data-management/delete/optout'),
    deleteSupportLiveChat:    () => req('POST', '/api/data-management/delete/live-chat'),
    deleteSupportTrustBuilder:() => req('POST', '/api/data-management/delete/trust-builder'),
    deleteLicense:            () => req('POST', '/api/data-management/delete/license'),

    // ── AI Automation ─────────────────────────────────────────────────────────
    getAIAssistants:       ()       => req('GET',    '/api/ai-automation'),
    createAIAssistant:     (d)      => req('POST',   '/api/ai-automation', d),
    updateAIAssistant:     (id, d)  => req('PUT',    `/api/ai-automation/${id}`, d),
    toggleAIAssistant:     (id)     => req('PATCH',  `/api/ai-automation/${id}/toggle`),
    deleteAIAssistant:     (id)     => req('DELETE', `/api/ai-automation/${id}`),
    getAIConversations:    (id)     => req('GET',    `/api/ai-automation/${id}/conversations`),
    getAIRecords:          ()       => req('GET',    '/api/ai-automation/records/all'),
    deleteAIRecord:        (id)     => req('DELETE', `/api/ai-automation/records/all/${id}`),

    // ── Interactive Forms ─────────────────────────────────────────────────────
    getForms:              ()       => req('GET',    '/api/forms'),
    createForm:            (d)      => req('POST',   '/api/forms', d),
    updateForm:            (id, d)  => req('PUT',    `/api/forms/${id}`, d),
    toggleForm:            (id)     => req('PATCH',  `/api/forms/${id}/toggle`),
    deleteForm:            (id)     => req('DELETE', `/api/forms/${id}`),
    getFormSubmissions:    (params) => req('GET',    `/api/forms/submissions${params ? '?' + new URLSearchParams(params) : ''}`),
    deleteFormSubmission:  (id)     => req('DELETE', `/api/forms/submissions/${id}`),
    clearFormSubmissions:  (formId) => req('DELETE', `/api/forms/submissions${formId ? '?formId=' + formId : ''}`),
};
