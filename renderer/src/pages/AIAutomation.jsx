import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const TEMPLATES = {
    support: {
        id: 'support',
        name: 'Support Bot',
        description: 'Customer support and help desk',
        icon: '🆘',
        context: `You are a professional customer support agent. Your job is to help customers with their issues and questions.

Guidelines:
- Be empathetic and understanding
- Provide clear solutions
- If you cannot solve the issue, offer to escalate to a human agent
- Keep responses concise and helpful
- Always ask for clarification if needed

[ADD YOUR BUSINESS DETAILS HERE]
- Company name: 
- What services/products do you offer: 
- Common issues you handle: 
- Escalation contact: `
    },
    appointment: {
        id: 'appointment',
        name: 'Appointment Bot',
        description: 'Schedule appointments and bookings',
        icon: '📅',
        context: `You are a professional appointment scheduling assistant. Your role is to help customers book appointments.

Guidelines:
- Confirm the customer's preferred date and time
- Ask for their contact information
- Provide appointment confirmation
- Handle rescheduling requests politely
- Always confirm the service/type of appointment needed

[ADD YOUR BUSINESS DETAILS HERE]
- Business name: 
- Services offered: 
- Available hours: 
- Appointment duration: 
- Cancellation policy: 
- Confirmation message: `
    },
    sales: {
        id: 'sales',
        name: 'Sales Bot',
        description: 'Product recommendations and sales',
        icon: '💰',
        context: `You are an enthusiastic sales assistant. Your goal is to help customers find the perfect product for their needs.

Guidelines:
- Ask about customer needs
- Recommend suitable products
- Highlight key benefits
- Address customer concerns
- Offer special deals or promotions
- Be persuasive but not pushy

[ADD YOUR BUSINESS DETAILS HERE]
- Company name: 
- Main products: 
- Price range: 
- Special offers available: 
- Shipping details: 
- Return policy: 
- Best seller products: `
    },
    restaurant: {
        id: 'restaurant',
        name: 'Restaurant Bot',
        description: 'Orders, reservations, and menu inquiries',
        icon: '🍽️',
        context: `You are a professional restaurant assistant. Help customers with menu inquiries, orders, and reservations.

Guidelines:
- Be friendly and welcoming
- Help customers browse the menu
- Take food orders
- Manage table reservations
- Handle dietary restrictions and preferences
- Provide delivery/pickup information

[ADD YOUR BUSINESS DETAILS HERE]
- Restaurant name: 
- Cuisine type: 
- Opening hours: 
- Delivery available: Yes/No
- Delivery radius: 
- Special dishes/signature items: 
- Reservation policy: 
- Contact for urgent orders: `
    },
    medical: {
        id: 'medical',
        name: 'Medical Center Bot',
        description: 'Appointment booking and general inquiries',
        icon: '⚕️',
        context: `You are a professional medical center assistant. Help patients with appointments and general health inquiries.

Guidelines:
- Be professional and caring
- Help schedule appointments with doctors/specialists
- Provide basic information about services
- Ask relevant health questions for appointment booking
- Never provide medical diagnosis - only schedule appointments
- Maintain patient privacy

[ADD YOUR BUSINESS DETAILS HERE]
- Medical center name: 
- Specializations: 
- Doctors available: 
- Office hours: 
- Emergency contact: 
- Insurance accepted: `
    },
    ecommerce: {
        id: 'ecommerce',
        name: 'E-Commerce Bot',
        description: 'Online store support and shopping',
        icon: '🛒',
        context: `You are an e-commerce shopping assistant. Help customers find products, place orders, and track shipments.

Guidelines:
- Help customers search and find products
- Answer questions about product specifications
- Assist with order placement
- Provide shipping and delivery information
- Handle returns and refunds
- Offer product recommendations

[ADD YOUR BUSINESS DETAILS HERE]
- Store name: 
- Product categories: 
- Shipping countries: 
- Delivery time: 
- Return window: 
- Customer service email: `
    },
    custom: {
        id: 'custom',
        name: 'Custom Template',
        description: 'Build your own automation from scratch',
        icon: '✨',
        context: `You are a helpful assistant for my business.

Guidelines:
- Be concise, clear, and friendly
- Ask clarifying questions when needed
- Use business context while replying

[ADD YOUR BUSINESS DETAILS HERE]
- Business name:
- Services:
- Tone:
- Rules:`
    },
};

function normalizeReplyScope(scope, fallbackScope) {
    const raw = String(scope ?? fallbackScope ?? '').trim().toLowerCase();
    return raw === 'individual' || raw === 'group' || raw === 'both' ? raw : 'both';
}

export default function AIAutomation() {
    const { toast } = useApp();
    const [assistants, setAssistants] = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editingAssistant, setEditingAssistant] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [records, setRecords] = useState([]);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [activePane, setActivePane] = useState('automations');
    const [formData, setFormData] = useState({
        name: '',
        context: '',
        apiProvider: 'free',
        apiKey: '',
        replyScope: 'both',
        sessionIds: [],
        templateId: 'custom'
    });

    useEffect(() => {
        loadAssistants();
        loadDevices();
        loadRecords();
    }, []);

    useEffect(() => {
        if (activePane !== 'records') return undefined;
        loadRecords(true);
        const timer = setInterval(() => {
            loadRecords(true);
        }, 5000);
        return () => clearInterval(timer);
    }, [activePane]);

    const loadDevices = async () => {
        try {
            const data = await api.getDevices();
            setDevices(Array.isArray(data) ? data : []);
        } catch (_) {
            setDevices([]);
        }
    };

    const loadAssistants = async () => {
        try {
            setLoading(true);
            const data = await api.getAIAssistants();
            setAssistants(Array.isArray(data) ? data : []);
        } catch (err) {
            toast('Failed to load assistants', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadRecords = async (silent = false) => {
        try {
            if (!silent) setRecordsLoading(true);
            const data = await api.getAIRecords();
            const sorted = (Array.isArray(data) ? data : [])
                .slice()
                .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            setRecords(sorted);
        } catch (_) {
            if (!silent) setRecords([]);
        } finally {
            if (!silent) setRecordsLoading(false);
        }
    };

    const selectTemplate = (templateId) => {
        const tmpl = TEMPLATES[templateId];
        setSelectedTemplate(templateId);
        setEditingAssistant(null);
        setFormData({
            name: tmpl.name,
            context: tmpl.context,
            apiProvider: 'free',
            apiKey: '',
            replyScope: 'both',
            sessionIds: devices.map(d => d.id),
            templateId: tmpl.id || 'custom'
        });
        setShowModal(true);
    };

    const editAssistant = (assistant) => {
        setSelectedTemplate(null);
        setEditingAssistant(assistant);
        const replyScope = normalizeReplyScope(assistant.replyScope, assistant.targetType);
        setFormData({
            name: assistant.name || '',
            context: assistant.context || assistant.systemPrompt || '',
            apiProvider: assistant.apiProvider || 'free',
            apiKey: assistant.apiKey || '',
            replyScope,
            sessionIds: Array.isArray(assistant.sessionIds) ? assistant.sessionIds : [],
            templateId: assistant.templateId || 'custom'
        });
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setFormData({ name: '', context: '', apiProvider: 'free', apiKey: '', replyScope: 'both', sessionIds: [], templateId: 'custom' });
        setSelectedTemplate(null);
        setEditingAssistant(null);
    };

    const toggleSession = (sessionId) => {
        setFormData((prev) => {
            const exists = prev.sessionIds.includes(sessionId);
            return {
                ...prev,
                sessionIds: exists
                    ? prev.sessionIds.filter(id => id !== sessionId)
                    : [...prev.sessionIds, sessionId]
            };
        });
    };

    const saveAssistant = async () => {
        if (!formData.name.trim() || !formData.context.trim()) {
            toast('Please fill in all fields', 'error');
            return;
        }
        if (!Array.isArray(formData.sessionIds) || formData.sessionIds.length === 0) {
            toast('Please select at least one session', 'error');
            return;
        }
        if (formData.apiProvider !== 'free' && !String(formData.apiKey || '').trim()) {
            toast('Please enter API key for selected provider', 'error');
            return;
        }

        try {
            setLoading(true);
            let createdOrUpdated = null;
            if (editingAssistant) {
                createdOrUpdated = await api.updateAIAssistant(editingAssistant.id, {
                    ...formData,
                    active: editingAssistant.active
                });
                closeModal();
                toast('Automation updated successfully', 'success');
            } else {
                const response = await api.createAIAssistant({
                    ...formData,
                    active: true
                });
                createdOrUpdated = response;
                setAssistants((prev) => [response, ...prev]);
                closeModal();
                toast('AI automation created successfully', 'success');
            }
            if (createdOrUpdated) {
                try {
                    await loadAssistants();
                    await loadRecords();
                } catch (_) {}
            }
        } catch (err) {
            toast(err?.message || 'Failed to create assistant', 'error');
        } finally {
            setLoading(false);
        }
    };

    const deleteAssistant = async (id) => {
        if (!confirm('Are you sure? This will delete the bot and its conversation history.')) return;
        try {
            await api.deleteAIAssistant(id);
            setAssistants(assistants.filter(a => a.id !== id));
            toast('✓ Bot deleted', 'success');
        } catch (err) {
            toast('Failed to delete bot', 'error');
        }
    };

    const toggleAssistant = async (id) => {
        try {
            const updated = await api.toggleAIAssistant(id);
            setAssistants((prev) => prev.map(a => (a.id === id ? updated : a)));
            toast(updated.active ? 'Bot resumed' : 'Bot paused', 'success');
        } catch (err) {
            toast(err?.message || 'Failed to update bot status', 'error');
        }
    };

    const getContextPreview = (assistant) => {
        const raw = assistant.context || assistant.systemPrompt || '';
        return raw.replace(/\s+/g, ' ').trim();
    };

    const removeRecord = async (id) => {
        if (!confirm('Delete this local record?')) return;
        try {
            await api.deleteAIRecord(id);
            setRecords(prev => prev.filter(r => r.id !== id));
            toast('Record deleted', 'success');
        } catch (_) {
            toast('Failed to delete record', 'error');
        }
    };

    const renderField = (value) => {
        if (!value) return 'Not captured';
        return String(value);
    };

    const activeCount = assistants.filter(a => a.active).length;
    const pausedCount = Math.max(assistants.length - activeCount, 0);
    const connectedSessions = devices.filter(d => d.status === 'connected').length;
    const totalInteractions = assistants.reduce((sum, a) => sum + (a.totalInteractions || 0), 0);

    return (
        <div className="page ai-page">
            <div className="ai-hero">
                <div className="ai-hero-main">
                    <div className="ai-hero-badge">SMART ASSISTANTS</div>
                    <h1>AI Automation Studio</h1>
                    <p>Build, manage, and scale WhatsApp automations with custom business context and session-level control.</p>
                    <div className="hero-actions">
                        <button className="btn btn-primary" onClick={() => selectTemplate('custom')}>
                            + Create Custom Template
                        </button>
                    </div>
                    <div className="ollama-banner">
                        <div className="ollama-banner-info">
                            <span className="ollama-banner-icon">🦙</span>
                            <div>
                                <strong>Boost Your AI — Install Ollama</strong>
                                <span>Your personal AI assistant to manage all your needs — runs locally, responds faster.</span>
                            </div>
                        </div>
                        <a
                            href="https://ollama.com/download/windows"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ollama"
                        >
                            ⬇ Download Ollama
                        </a>
                    </div>
                </div>
                <div className="ai-hero-stats">
                    <div className="hero-stat-card">
                        <span>Total Bots</span>
                        <strong>{assistants.length}</strong>
                    </div>
                    <div className="hero-stat-card">
                        <span>Active</span>
                        <strong>{activeCount}</strong>
                    </div>
                    <div className="hero-stat-card">
                        <span>Paused</span>
                        <strong>{pausedCount}</strong>
                    </div>
                    <div className="hero-stat-card">
                        <span>Connected Sessions</span>
                        <strong>{connectedSessions}</strong>
                    </div>
                    <div className="hero-stat-card wide">
                        <span>Total Interactions</span>
                        <strong>{totalInteractions}</strong>
                    </div>
                </div>
            </div>

            <div className="section ai-panel">
                <div className="section-head-row">
                    <h2>Template Library</h2>
                    <button className="btn btn-primary" onClick={() => selectTemplate('custom')}>
                        + Create Custom Template
                    </button>
                </div>
                <div className="template-grid">
                    {Object.values(TEMPLATES).map((tmpl) => (
                        <div
                            key={tmpl.id}
                            className="template-card"
                        >
                            <div className="template-card-head">
                                <div className="tmpl-icon">{tmpl.icon}</div>
                                <span className="template-pill">Template</span>
                            </div>
                            <h3>{tmpl.name}</h3>
                            <p>{tmpl.description}</p>
                            <button className="btn btn-primary" onClick={() => selectTemplate(tmpl.id)}>Create Bot</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="section ai-panel">
                <div className="section-head-row">
                    <h2>Current Automations</h2>
                    <div className="section-head-actions">
                        <span className="section-caption">{assistants.length} configured</span>
                        <div className="pane-toggle">
                            <button
                                className={`pane-btn ${activePane === 'automations' ? 'active' : ''}`}
                                onClick={() => setActivePane('automations')}
                            >
                                Automations
                            </button>
                            <button
                                className={`pane-btn ${activePane === 'records' ? 'active' : ''}`}
                                onClick={() => setActivePane('records')}
                            >
                                Records ({records.length})
                            </button>
                        </div>
                    </div>
                </div>
                {activePane === 'automations' && (loading ? (
                    <p className="loading">Loading...</p>
                ) : assistants.length === 0 ? (
                    <p className="empty">No bots created yet. Choose a template above to get started!</p>
                ) : (
                    <div className="assistants-list">
                        {assistants.map((asst) => (
                            <div key={asst.id} className="assistant-card">
                                <div className="asst-header">
                                    <h3>{asst.name}</h3>
                                    <span className={`provider-badge ${asst.apiProvider}`}>
                                        {asst.apiProvider === 'free' ? '🔓 Free AI' : asst.apiProvider}
                                    </span>
                                </div>
                                <div className="asst-status-row">
                                    <span className={`status-pill ${asst.active ? 'on' : 'off'}`}>
                                        {asst.active ? 'Active' : 'Paused'}
                                    </span>
                                    <span className="scope-pill">
                                        {normalizeReplyScope(asst.replyScope, asst.targetType) === 'group'
                                            ? 'Group'
                                            : normalizeReplyScope(asst.replyScope, asst.targetType) === 'individual'
                                                ? 'Individual'
                                                : 'Both'}
                                    </span>
                                </div>
                                <div className="asst-context">
                                    <p><strong>Context:</strong></p>
                                    <p className="asst-context-text">{getContextPreview(asst) || 'No context set'}</p>
                                </div>
                                <div className="asst-footer">
                                    <span className="stat">
                                        💬 {asst.totalInteractions || 0} messages
                                    </span>
                                    <div className="asst-actions">
                                        <button className="btn btn-secondary btn-sm" onClick={() => editAssistant(asst)}>
                                            Edit
                                        </button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => toggleAssistant(asst.id)}>
                                            {asst.active ? 'Pause' : 'Resume'}
                                        </button>
                                        <button className="btn btn-danger btn-sm" onClick={() => deleteAssistant(asst.id)}>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}

                {activePane === 'records' && (recordsLoading ? (
                    <p className="loading">Loading records...</p>
                ) : records.length === 0 ? (
                    <p className="empty">No records captured yet. Once users start chatting, their inputs will appear here.</p>
                ) : (
                    <div className="records-list">
                        {records.map((rec) => (
                            <div key={rec.id} className="record-card">
                                <div className="record-head">
                                    <div>
                                        <h3>{rec.assistantName || 'AI Assistant'}</h3>
                                        <p>{rec.phone || rec.jid || 'Unknown contact'}</p>
                                    </div>
                                    <span className="record-template-pill">{rec.templateId || 'custom'}</span>
                                </div>

                                <div className="record-grid">
                                    <div><strong>Name</strong><span>{renderField(rec.fields?.name)}</span></div>
                                    <div><strong>Mobile</strong><span>{renderField(rec.fields?.mobile || rec.phone)}</span></div>
                                    <div><strong>Email</strong><span>{renderField(rec.fields?.email)}</span></div>
                                    <div><strong>Location</strong><span>{renderField(rec.fields?.location)}</span></div>
                                    <div><strong>Date & Time</strong><span>{renderField(rec.fields?.dateTime)}</span></div>
                                    <div><strong>Service</strong><span>{renderField(rec.fields?.service)}</span></div>
                                </div>

                                {rec.customFields && Object.keys(rec.customFields).length > 0 && (
                                    <div className="record-custom">
                                        <strong>Custom Captured Fields</strong>
                                        <div className="custom-tags">
                                            {Object.entries(rec.customFields).map(([k, v]) => (
                                                <span key={k} className="custom-tag">{k}: {String(v)}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="record-footer">
                                    <span>Updated: {rec.updatedAt ? new Date(rec.updatedAt).toLocaleString() : 'N/A'}</span>
                                    <button className="btn btn-danger btn-sm" onClick={() => removeRecord(rec.id)}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {showModal && <Modal onClose={closeModal}>
                <h2>{editingAssistant ? 'Edit Automation' : 'Create AI Automation'}</h2>
                <div className="modal-form">
                    <div className="form-group">
                        <label>Automation Name</label>
                        <input
                            type="text"
                            placeholder="e.g., Support Bot, Sales Assistant"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Context / Instructions</label>
                        <p style={{ fontSize: '12px', color: 'var(--txt3)', marginBottom: '8px' }}>
                            Replace [ADD YOUR BUSINESS DETAILS HERE] with your specific information
                        </p>
                        <textarea
                            placeholder="System prompt for your AI bot..."
                            value={formData.context}
                            onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                            rows="15"
                        />
                    </div>

                    <div className="form-group">
                        <label>AI Provider</label>
                        <select
                            value={formData.apiProvider}
                            onChange={(e) => setFormData({ ...formData, apiProvider: e.target.value, apiKey: e.target.value === 'free' ? '' : formData.apiKey })}
                        >
                            <option value="free">🔓 Free AI (No API key needed)</option>
                            <option value="groq">⚡ Groq (Fast, Requires API key)</option>
                            <option value="openai">🤖 OpenAI (Requires API key)</option>
                            <option value="claude">🧠 Claude (Requires API key)</option>
                            <option value="gemini">✨ Gemini (Requires API key)</option>
                        </select>
                    </div>

                    {formData.apiProvider !== 'free' && (
                        <div className="form-group">
                            <label>{formData.apiProvider.toUpperCase()} API Key</label>
                            <input
                                type="password"
                                placeholder="Enter API key"
                                value={formData.apiKey}
                                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                            />
                            <p className="field-help">Key is saved locally on this client machine only.</p>
                        </div>
                    )}

                    <div className="form-group">
                        <label>AI Reply Scope</label>
                        <select
                            value={formData.replyScope}
                            onChange={(e) => setFormData({ ...formData, replyScope: e.target.value })}
                        >
                            <option value="individual">Individual only</option>
                            <option value="group">Group only</option>
                            <option value="both">Individual and Group both</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Run On Sessions</label>
                        <div className="session-list">
                            {devices.length === 0 ? (
                                <div className="session-empty">No sessions found. Connect device first.</div>
                            ) : devices.map((d) => (
                                <label key={d.id} className="session-item">
                                    <input
                                        type="checkbox"
                                        checked={formData.sessionIds.includes(d.id)}
                                        onChange={() => toggleSession(d.id)}
                                    />
                                    <span>{d.name || d.id}</span>
                                    <span className={`session-status ${d.status === 'connected' ? 'ok' : 'off'}`}>
                                        {d.status || 'unknown'}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" onClick={closeModal}>
                            Cancel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={saveAssistant}
                            disabled={loading}
                        >
                            {loading ? 'Saving...' : editingAssistant ? 'Save Changes' : 'Create Automation'}
                        </button>
                    </div>
                </div>
            </Modal>}

            <style>{`
                .ai-hero {
                    display: grid;
                    grid-template-columns: 1.45fr 1fr;
                    gap: 16px;
                    margin-bottom: 18px;
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    background:
                        radial-gradient(circle at 20% -10%, rgba(74, 158, 255, 0.25), transparent 46%),
                        radial-gradient(circle at 80% 120%, rgba(37, 211, 102, 0.16), transparent 52%),
                        var(--bg2);
                    overflow: hidden;
                    box-shadow: var(--shadow-sm);
                }

                .ai-hero-main {
                    padding: 22px;
                    border-right: 1px solid var(--border);
                }

                .ai-hero-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 10px;
                    border-radius: 999px;
                    background: rgba(74, 158, 255, 0.16);
                    color: #7ab6ff;
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                }

                .ai-hero-main h1 {
                    margin: 10px 0 8px;
                    font-size: 30px;
                    letter-spacing: -0.03em;
                    line-height: 1.1;
                }

                .ai-hero-main p {
                    color: var(--txt2);
                    font-size: 14px;
                    max-width: 62ch;
                }

                .hero-actions {
                    margin-top: 16px;
                }

                .ollama-banner {
                    margin-top: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 14px;
                    background: color-mix(in srgb, var(--accent) 8%, var(--bg2));
                    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
                    border-radius: 12px;
                    padding: 12px 16px;
                    max-width: 520px;
                }

                .ollama-banner-info {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                }

                .ollama-banner-icon {
                    font-size: 22px;
                    line-height: 1;
                    flex-shrink: 0;
                }

                .ollama-banner-info div {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .ollama-banner-info strong {
                    font-size: 13px;
                    color: var(--txt1);
                }

                .ollama-banner-info span {
                    font-size: 12px;
                    color: var(--txt2);
                    line-height: 1.4;
                }

                .btn-ollama {
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    border-radius: 8px;
                    background: var(--accent);
                    color: #fff;
                    font-size: 13px;
                    font-weight: 600;
                    text-decoration: none;
                    border: none;
                    cursor: pointer;
                    transition: opacity 0.15s;
                    white-space: nowrap;
                }

                .btn-ollama:hover {
                    opacity: 0.85;
                    color: #fff;
                }

                .ai-hero-stats {
                    padding: 16px;
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                    align-content: center;
                }

                .hero-stat-card {
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    background: color-mix(in srgb, var(--bg3) 82%, transparent);
                    padding: 10px 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .hero-stat-card.wide {
                    grid-column: span 2;
                }

                .hero-stat-card span {
                    color: var(--txt3);
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .hero-stat-card strong {
                    font-size: 20px;
                    line-height: 1;
                    color: var(--txt);
                }

                .section-head-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .section-head-row h2 {
                    font-size: 18px;
                    letter-spacing: -0.01em;
                }

                .section-caption {
                    color: var(--txt3);
                    font-size: 12px;
                }

                .section-head-actions {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }

                .pane-toggle {
                    display: inline-flex;
                    padding: 3px;
                    border: 1px solid var(--border);
                    border-radius: 999px;
                    background: var(--bg3);
                    gap: 4px;
                }

                .pane-btn {
                    border: none;
                    border-radius: 999px;
                    padding: 5px 12px;
                    font-size: 11px;
                    font-weight: 700;
                    color: var(--txt2);
                    background: transparent;
                }

                .pane-btn.active {
                    background: var(--blue);
                    color: white;
                }

                .ai-page {
                    height: calc(100vh - 72px);
                    overflow-y: auto;
                    padding-bottom: 24px;
                }

                .ai-panel {
                    border: 1px solid var(--border);
                    border-radius: 14px;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--bg2) 93%, #4a9eff 7%), var(--bg2));
                    padding: 16px;
                    box-shadow: var(--shadow-sm);
                    margin-bottom: 14px;
                }

                .template-grid {
                    display: flex;
                    flex-wrap: nowrap;
                    overflow-x: auto;
                    gap: 12px;
                    margin: 16px 0 6px;
                    padding-bottom: 8px;
                }

                .template-card {
                    min-width: 195px;
                    flex: 0 0 195px;
                    padding: 12px;
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    transition: all 0.25s;
                    text-align: left;
                    background: color-mix(in srgb, var(--bg3) 76%, transparent);
                }

                .template-card:hover {
                    border-color: var(--blue);
                    background: var(--bg2);
                    transform: translateY(-3px);
                    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.22);
                }

                .template-card-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .tmpl-icon {
                    font-size: 25px;
                }

                .template-pill {
                    font-size: 10px;
                    color: var(--txt2);
                    border: 1px solid var(--border2);
                    border-radius: 999px;
                    padding: 2px 7px;
                }

                .template-card h3 {
                    font-size: 15px;
                    font-weight: 650;
                    margin-bottom: 6px;
                }

                .template-card p {
                    font-size: 12px;
                    color: var(--txt2);
                    margin-bottom: 10px;
                    min-height: 36px;
                }

                .template-card .btn {
                    width: 100%;
                    padding: 8px 10px;
                    font-size: 11px;
                }

                .assistants-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 12px;
                    margin: 20px 0;
                }

                .records-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
                    gap: 12px;
                    margin-top: 14px;
                }

                .record-card {
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    padding: 12px;
                    background: color-mix(in srgb, var(--bg3) 76%, transparent);
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .record-head {
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                    align-items: flex-start;
                }

                .record-head h3 {
                    margin: 0;
                    font-size: 14px;
                }

                .record-head p {
                    margin: 3px 0 0;
                    color: var(--txt3);
                    font-size: 12px;
                }

                .record-template-pill {
                    font-size: 10px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: #7ab6ff;
                    border: 1px solid rgba(74, 158, 255, 0.4);
                    border-radius: 999px;
                    padding: 3px 8px;
                    flex-shrink: 0;
                }

                .record-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }

                .record-grid div {
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 7px 8px;
                    background: var(--bg);
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .record-grid strong {
                    font-size: 10px;
                    color: var(--txt3);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .record-grid span {
                    font-size: 12px;
                    color: var(--txt2);
                    word-break: break-word;
                }

                .record-custom {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .record-custom > strong {
                    font-size: 11px;
                    color: var(--txt3);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .custom-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .custom-tag {
                    font-size: 11px;
                    color: var(--txt2);
                    border: 1px solid var(--border);
                    border-radius: 999px;
                    padding: 3px 8px;
                    background: var(--bg);
                }

                .record-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-top: 1px solid var(--border);
                    padding-top: 8px;
                    margin-top: 2px;
                    font-size: 11px;
                    color: var(--txt3);
                    gap: 8px;
                }

                .assistant-card {
                    border: 1px solid var(--border);
                    border-radius: 10px;
                    padding: 12px;
                    background: color-mix(in srgb, var(--bg3) 76%, transparent);
                    transition: border-color .2s, transform .2s;
                }

                .assistant-card:hover {
                    border-color: var(--border2);
                    transform: translateY(-2px);
                }

                .asst-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    gap: 8px;
                }

                .asst-header h3 {
                    margin: 0;
                    font-size: 15px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .provider-badge {
                    font-size: 10px;
                    padding: 3px 7px;
                    border-radius: 999px;
                    background: rgba(34, 197, 94, 0.1);
                    color: #22c55e;
                    font-weight: 600;
                    flex-shrink: 0;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .provider-badge.groq {
                    background: rgba(168, 85, 247, 0.1);
                    color: #a855f7;
                }

                .asst-context {
                    margin: 8px 0;
                    font-size: 12px;
                }

                .asst-context p {
                    margin: 0;
                }

                .asst-status-row {
                    margin-bottom: 8px;
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    flex-wrap: wrap;
                }

                .scope-pill {
                    display: inline-block;
                    font-size: 10px;
                    padding: 3px 8px;
                    border-radius: 999px;
                    border: 1px solid var(--border2);
                    color: var(--txt2);
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    background: var(--bg3);
                }

                .status-pill {
                    display: inline-block;
                    font-size: 11px;
                    padding: 3px 8px;
                    border-radius: 999px;
                    font-weight: 700;
                }

                .status-pill.on {
                    background: rgba(34, 197, 94, 0.12);
                    color: #22c55e;
                }

                .status-pill.off {
                    background: rgba(251, 191, 36, 0.14);
                    color: #f59e0b;
                }

                .asst-context-text {
                    background: var(--bg);
                    padding: 7px 8px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    line-height: 1.35;
                    min-height: 48px;
                    margin: 8px 0 0;
                    color: var(--txt2);
                }

                .asst-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid var(--border);
                    font-size: 12px;
                    gap: 8px;
                }

                .asst-actions {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                }

                .stat {
                    color: var(--txt3);
                }

                .modal-form {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    margin: 20px 0;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-group label {
                    font-weight: 600;
                    font-size: 14px;
                }

                .field-help {
                    margin: 4px 0 0;
                    font-size: 11px;
                    color: var(--txt3);
                }

                .form-group input,
                .form-group textarea,
                .form-group select {
                    padding: 10px 12px;
                    border: 1px solid var(--border);
                    border-radius: 6px;
                    background: var(--bg);
                    color: var(--txt);
                    font-family: inherit;
                    font-size: 13px;
                }

                .form-group textarea {
                    font-family: 'Courier New', monospace;
                    resize: vertical;
                    min-height: 200px;
                }

                .form-group input:focus,
                .form-group textarea:focus,
                .form-group select:focus {
                    outline: none;
                    border-color: var(--blue);
                    box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.1);
                }

                .modal-footer {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }

                .session-list {
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    max-height: 180px;
                    overflow-y: auto;
                    background: var(--bg);
                }

                .session-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    border-bottom: 1px solid var(--border);
                    font-size: 13px;
                }

                .session-item:last-child {
                    border-bottom: none;
                }

                .session-item input {
                    width: 14px;
                    height: 14px;
                }

                .session-status {
                    margin-left: auto;
                    font-size: 11px;
                    padding: 2px 7px;
                    border-radius: 999px;
                    font-weight: 700;
                }

                .session-status.ok {
                    background: rgba(34, 197, 94, 0.12);
                    color: #22c55e;
                }

                .session-status.off {
                    background: rgba(251, 191, 36, 0.14);
                    color: #f59e0b;
                }

                .session-empty {
                    padding: 10px 12px;
                    color: var(--txt3);
                    font-size: 12px;
                }

                .btn {
                    padding: 10px 16px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 13px;
                    transition: all 0.18s;
                }

                .btn-primary {
                    background: linear-gradient(135deg, #3b82f6, #2563eb);
                    color: white;
                    box-shadow: 0 6px 12px rgba(37, 99, 235, 0.28);
                }

                .btn-primary:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.03);
                }

                .btn-secondary {
                    background: var(--bg3);
                    color: var(--txt);
                    border: 1px solid var(--border);
                }

                .btn-secondary:hover {
                    background: var(--border);
                }

                .btn-danger {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .btn-danger:hover {
                    background: rgba(239, 68, 68, 0.2);
                }

                .btn-sm {
                    padding: 5px 10px;
                    font-size: 11px;
                }

                @media (max-width: 700px) {
                    .ai-hero {
                        grid-template-columns: 1fr;
                    }

                    .ai-hero-main {
                        border-right: none;
                        border-bottom: 1px solid var(--border);
                        padding: 16px;
                    }

                    .ai-hero-main h1 {
                        font-size: 24px;
                    }

                    .ollama-banner {
                        flex-direction: column;
                        align-items: flex-start;
                        max-width: 100%;
                    }

                    .btn-ollama {
                        width: 100%;
                        justify-content: center;
                    }

                    .ai-hero-stats {
                        padding: 12px;
                    }

                    .assistants-list {
                        grid-template-columns: 1fr;
                    }

                    .records-list {
                        grid-template-columns: 1fr;
                    }

                    .asst-footer {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .asst-actions {
                        width: 100%;
                    }

                    .section-head-row {
                        flex-wrap: wrap;
                    }

                    .record-grid {
                        grid-template-columns: 1fr;
                    }
                }

                .btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .empty {
                    text-align: center;
                    color: var(--txt3);
                    padding: 40px 20px;
                }

                .loading {
                    text-align: center;
                    color: var(--txt3);
                    padding: 20px;
                }
            `}</style>
        </div>
    );
}
