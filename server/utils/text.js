'use strict';

// Spintax + variable personalisation for message templates

function personalizeText(template, name, phone) {
    if (!template) return template;
    let text = template;
    // Double-brace spintax: {{Hi|Hello|Hey}} → random pick (skip if no pipe)
    text = text.replace(/\{\{([^{}]+)\}\}/g, (match, inner) => {
        if (!inner.includes('|')) return match;
        const opts = inner.split('|').map(o => o.trim()).filter(Boolean);
        return opts[Math.floor(Math.random() * opts.length)];
    });
    // {{random}} → 4-digit random number
    text = text.replace(/\{\{random\}\}/gi, () => Math.floor(1000 + Math.random() * 9000).toString());
    // {{name}} → contact name
    text = text.replace(/\{\{name\}\}/gi, name || phone || '');
    // Single-brace spintax: {Hi|Hello|Hey} → random pick (only when | is present)
    text = text.replace(/\{([^{}]+)\}/g, (match, inner) => {
        if (!inner.includes('|')) return match;
        const opts = inner.split('|').map(o => o.trim()).filter(Boolean);
        return opts[Math.floor(Math.random() * opts.length)];
    });
    return text;
}

// Apply user-defined sequential variables: {varname} → values[msgIndex % values.length]
function applyVariables(text, variables, msgIndex) {
    if (!text || !Array.isArray(variables) || !variables.length) return text;
    for (const v of variables) {
        if (!v.name || !Array.isArray(v.values) || !v.values.length) continue;
        const escaped = v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('\\{' + escaped + '\\}', 'gi');
        text = text.replace(re, v.values[msgIndex % v.values.length]);
    }
    return text;
}

module.exports = { personalizeText, applyVariables };
