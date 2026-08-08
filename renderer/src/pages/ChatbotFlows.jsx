import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';

// ── Style helpers ─────────────────────────────────────────────────────────────
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 6 };
const inp = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const sel = (hasVal) => ({ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#181d27', color: hasVal ? '#e2e8f0' : '#8892aa', fontSize: 13, cursor: 'pointer', colorScheme: 'dark', boxSizing: 'border-box' });

function uid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

const EMPTY_FLOW = { name: '', description: '', sessionIds: [], targetType: 'all', triggerKeywords: '', matchType: 'exact', matchCase: false, cooldownMinutes: 0, messageDelaySeconds: 0, skipOptedOut: false };
const EMPTY_NODE = { name: '', messageType: 'text', content: '', templateId: '', attachmentType: 'image', attachmentFile: null, _localFileName: null, nextNode: 'auto' };

export default function ChatbotFlows() {
    const { showToast, showConfirm } = useApp();
    const [flows,     setFlows]     = useState([]);
    const [devices,   setDevices]   = useState([]);
    const [templates, setTemplates] = useState([]);
    const [search,    setSearch]    = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [refreshing,   setRefreshing]   = useState(false);

    // Create/Edit panel
    const [panel,       setPanel]       = useState(null); // null | 'create' | 'edit'
    const [editingFlow, setEditingFlow] = useState(null);
    const [flowForm,    setFlowForm]    = useState({ ...EMPTY_FLOW });
    const [flowNodes,   setFlowNodes]   = useState([]);
    const [flowSaving,  setFlowSaving]  = useState(false);
    const [flowError,   setFlowError]   = useState('');

    // Node modal
    const [nodeModal,      setNodeModal]      = useState(false);
    const [editingNodeIdx, setEditingNodeIdx] = useState(null);
    const [nodeForm,       setNodeForm]       = useState({ ...EMPTY_NODE });
    const [nodeUploading,  setNodeUploading]  = useState(false);
    const fileRef = useRef(null);

    async function load() {
        try {
            const [f, d, t] = await Promise.all([api.getChatbotFlows(), api.getDevices(), api.getTemplates()]);
            setFlows(Array.isArray(f) ? f : []);
            setDevices(Array.isArray(d) ? d : []);
            setTemplates(Array.isArray(t) ? t : []);
        } catch { /* ignore */ }
    }

    async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }
    useEffect(() => { load(); }, []);

    // ── Stats ─────────────────────────────────────────────────────────────────
    const totalFlows  = flows.length;
    const activeFlows = flows.filter(f => f.active).length;
    const totalNodes  = flows.reduce((s, f) => s + (f.nodes?.length || 0), 0);
    const totalConvs  = flows.reduce((s, f) => s + (f.totalConversations || 0), 0);

    const filtered = flows.filter(f => {
        if (statusFilter === 'active'   && !f.active) return false;
        if (statusFilter === 'inactive' &&  f.active) return false;
        if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    // ── Panel helpers ─────────────────────────────────────────────────────────
    function openCreate() {
        setFlowForm({ ...EMPTY_FLOW });
        setFlowNodes([]);
        setFlowError('');
        setEditingFlow(null);
        setPanel('create');
    }

    function openEdit(flow) {
        setFlowForm({
            name: flow.name,
            description: flow.description || '',
            sessionIds: Array.isArray(flow.sessionIds) ? flow.sessionIds : (flow.sessionId ? [flow.sessionId] : []),
            targetType: flow.targetType || 'all',
            triggerKeywords: Array.isArray(flow.triggerKeywords) ? flow.triggerKeywords.join(', ') : (flow.triggerKeywords || ''),
            matchType: flow.matchType || 'exact',
            matchCase: flow.matchCase || false,
            cooldownMinutes: flow.cooldownMinutes || 0,
            messageDelaySeconds: flow.messageDelaySeconds || 0,
            skipOptedOut: flow.skipOptedOut === true,
        });
        setFlowNodes(Array.isArray(flow.nodes) ? flow.nodes.map((n, i) => ({ ...n, order: i })) : []);
        setFlowError('');
        setEditingFlow(flow);
        setPanel('edit');
    }

    function closePanel() { setPanel(null); setEditingFlow(null); setFlowError(''); }

    function parseKeywords(text) {
        return text.split(/[\n,]/).map(k => k.trim()).filter(Boolean);
    }

    async function saveFlow() {
        if (!flowForm.name.trim())       { setFlowError('Flow name is required'); return; }
        if (!flowForm.sessionIds?.length) { setFlowError('Select at least one WhatsApp session'); return; }
        if (!flowNodes.length)             { setFlowError('Add at least one node to the flow'); return; }
        setFlowSaving(true);
        setFlowError('');
        try {
            const payload = {
                ...flowForm,
                cooldownMinutes:     Number(flowForm.cooldownMinutes) || 0,
                messageDelaySeconds: Number(flowForm.messageDelaySeconds) || 0,
                triggerKeywords: parseKeywords(flowForm.triggerKeywords),
                nodes: flowNodes.map((n, i) => {
                    const clean = { ...n, order: i };
                    delete clean._localFileName;
                    return clean;
                }),
            };
            if (panel === 'edit' && editingFlow) {
                await api.updateChatbotFlow(editingFlow.id, payload);
                showToast('Flow updated!', 'success');
            } else {
                await api.createChatbotFlow(payload);
                showToast('Flow created!', 'success');
            }
            await load();
            closePanel();
        } catch (e) {
            setFlowError(e.message || 'Failed to save flow');
        } finally {
            setFlowSaving(false);
        }
    }

    async function toggleFlow(flow) {
        try { await api.toggleChatbotFlow(flow.id); await load(); } catch { /* ignore */ }
    }

    async function deleteFlow(flow) {
        if (!await showConfirm('Delete Flow', `Delete flow "${flow.name}" and all its nodes?`, { danger: true, confirmLabel: 'Delete' })) return;
        try { await api.deleteChatbotFlow(flow.id); await load(); showToast('Flow deleted', 'success'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    async function cleanupFlows() {
        if (!await showConfirm('Cleanup Flows', 'Remove all inactive flows and flows with no nodes?', { danger: true, confirmLabel: 'Cleanup' })) return;
        try {
            const result = await api.cleanupChatbotFlows();
            await load();
            showToast(`Removed ${result.removed} flow${result.removed !== 1 ? 's' : ''}`, 'success');
        } catch (e) { showToast(e.message, 'error'); }
    }

    function exportFlows() {
        const blob = new Blob([JSON.stringify(flows, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'chatbot-flows.json'; a.click();
        URL.revokeObjectURL(url);
    }

    function importFlows() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0]; if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                if (!Array.isArray(imported)) throw new Error('Invalid format — expected an array');
                const result = await api.importChatbotFlows(imported);
                await load();
                showToast(`Imported ${result.added} flow${result.added !== 1 ? 's' : ''}`, 'success');
            } catch (err) { showToast('Import failed: ' + err.message, 'error'); }
        };
        input.click();
    }

    // ── Node helpers ──────────────────────────────────────────────────────────
    function openAddNode() {
        setNodeForm({ ...EMPTY_NODE });
        setEditingNodeIdx(null);
        setNodeModal(true);
    }

    function openEditNode(idx) {
        const n = flowNodes[idx];
        setNodeForm({ name: n.name || '', messageType: n.messageType || 'text', content: n.content || '', templateId: n.templateId || '', attachmentType: n.attachmentType || 'image', attachmentFile: n.attachmentFile || null, _localFileName: n.attachmentFile || null, nextNode: n.nextNode || 'auto' });
        setEditingNodeIdx(idx);
        setNodeModal(true);
    }

    function removeNode(idx) {
        setFlowNodes(prev => prev.filter((_, i) => i !== idx).map((n, i) => ({ ...n, order: i })));
    }

    function moveNode(idx, dir) {
        setFlowNodes(prev => {
            const arr = [...prev];
            const t = idx + dir;
            if (t < 0 || t >= arr.length) return arr;
            [arr[idx], arr[t]] = [arr[t], arr[idx]];
            return arr.map((n, i) => ({ ...n, order: i }));
        });
    }

    async function handleAttachFile(e) {
        const file = e.target.files?.[0]; if (!file) return;
        setNodeUploading(true);
        try {
            const res = await api.uploadChatbotAttachment(file);
            setNodeForm(f => ({ ...f, attachmentFile: res.filename, _localFileName: file.name }));
        } catch (err) { showToast('Upload failed: ' + err.message, 'error'); }
        finally { setNodeUploading(false); }
    }

    function saveNode() {
        if (nodeForm.messageType === 'text' && !nodeForm.content.trim()) { showToast('Message content is required', 'error'); return; }
        if (nodeForm.messageType === 'template' && !nodeForm.templateId) { showToast('Please select a template', 'error'); return; }
        const node = {
            id: editingNodeIdx !== null ? (flowNodes[editingNodeIdx].id || uid()) : uid(),
            name: nodeForm.name.trim() || `Node ${editingNodeIdx !== null ? editingNodeIdx + 1 : flowNodes.length + 1}`,
            type: 'message',
            messageType: nodeForm.messageType,
            content: nodeForm.content,
            templateId: nodeForm.templateId || null,
            attachmentType: nodeForm.messageType === 'text' && nodeForm.attachmentFile ? nodeForm.attachmentType : null,
            attachmentFile: nodeForm.messageType === 'text' ? (nodeForm.attachmentFile || null) : null,
            nextNode: nodeForm.nextNode || 'auto',
            order: editingNodeIdx !== null ? editingNodeIdx : flowNodes.length,
        };
        if (editingNodeIdx !== null) {
            setFlowNodes(prev => prev.map((n, i) => i === editingNodeIdx ? node : n));
        } else {
            setFlowNodes(prev => [...prev, node]);
        }
        setNodeModal(false);
    }

    function insertContent(text) { setNodeForm(f => ({ ...f, content: f.content + text })); }
    function insertKw(text) { setFlowForm(f => ({ ...f, triggerKeywords: f.triggerKeywords + text })); }

    function devNames(ids) { const arr = Array.isArray(ids) ? ids : (ids ? [ids] : []); if (!arr.length) return '—'; return arr.map(id => { const d = devices.find(dv => dv.id === id); return d ? d.name : id; }).join(', '); }

    const targetLabel = { all: 'All', individual: 'Individual', group: 'Groups' };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="page-content">

            {/* Header */}
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
                            <line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/>
                            <line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/>
                            <line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/>
                            <line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/>
                        </svg>
                    </div>
                    <div>
                        <h1>Chatbot Flows</h1>
                        <p className="page-sub">Create automated conversation flows with triggers and responses</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={exportFlows}>⬇ Export</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={importFlows}>⬆ Import</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={cleanupFlows}>🗑 Cleanup</button>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={refresh} disabled={refreshing}>{refreshing ? '…' : '↻'} Refresh</button>
                    <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderColor: 'transparent' }} onClick={openCreate}>+ Create Flow</button>
                </div>
            </div>

            {/* Search + Filter */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search flows..."
                        style={{ width: '100%', padding: '10px 12px 10px 34px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 14 }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, background: '#181d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                    <option value="all"      style={{ background: '#181d27', color: '#e2e8f0' }}>All Flows</option>
                    <option value="active"   style={{ background: '#181d27', color: '#e2e8f0' }}>Active Only</option>
                    <option value="inactive" style={{ background: '#181d27', color: '#e2e8f0' }}>Inactive Only</option>
                </select>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
                {[
                    { label: 'Total Flows',   value: totalFlows,  color: '#6366f1', bg: 'rgba(99,102,241,.12)',  icon: '💬' },
                    { label: 'Active Flows',  value: activeFlows, color: '#22c55e', bg: 'rgba(34,197,94,.12)',   icon: '▶' },
                    { label: 'Total Nodes',   value: totalNodes,  color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: '⚡' },
                    { label: 'Conversations', value: totalConvs,  color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  icon: '✅' },
                ].map(s => (
                    <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{s.icon}</div>
                            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{s.label}</div>
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Flows Table / Empty */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--txt2)' }}>
                    <div style={{ fontSize: 56, marginBottom: 16, opacity: .25 }}>💬</div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--txt)' }}>No chatbot flows yet</div>
                    <div style={{ fontSize: 14, marginBottom: 24 }}>Create your first chatbot flow to start automated conversations</div>
                    <button onClick={openCreate}
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', padding: '10px 22px', fontSize: 14, fontWeight: 600 }}>
                        + Create Flow
                    </button>
                </div>
            ) : (
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg)' }}>
                                {['FLOW NAME', 'SESSION', 'KEYWORDS', 'MATCH', 'NODES', 'CONVERSATIONS', 'ACTIVE', 'ACTIONS'].map(h => (
                                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: 'var(--txt3)', fontWeight: 600 }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(flow => (
                                <tr key={flow.id} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--txt)' }}>{flow.name}</div>
                                        {flow.description && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{flow.description}</div>}
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--txt2)' }}>{devNames(flow.sessionIds || (flow.sessionId ? [flow.sessionId] : []))}</td>
                                    <td style={{ padding: '12px 14px', maxWidth: 160 }}>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                            {(Array.isArray(flow.triggerKeywords) ? flow.triggerKeywords : []).slice(0, 3).map((kw, i) => (
                                                <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,.12)', color: '#6366f1', whiteSpace: 'nowrap' }}>{kw}</span>
                                            ))}
                                            {(flow.triggerKeywords?.length || 0) > 3 && <span style={{ fontSize: 10, color: 'var(--txt3)' }}>+{flow.triggerKeywords.length - 3}</span>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: 'var(--txt2)', fontSize: 12 }}>{flow.matchType || 'exact'}</td>
                                    <td style={{ padding: '12px 14px', color: 'var(--txt2)', fontWeight: 600 }}>{flow.nodes?.length || 0}</td>
                                    <td style={{ padding: '12px 14px', color: 'var(--txt)', fontWeight: 600 }}>{flow.totalConversations || 0}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => toggleFlow(flow)}
                                            style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', background: flow.active ? '#22c55e' : '#374151', transition: 'background .2s' }}>
                                            <span style={{ position: 'absolute', top: 3, left: flow.active ? 20 : 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                                        </button>
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <button onClick={() => openEdit(flow)}
                                                style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '5px 12px', fontSize: 12, color: 'var(--txt2)' }}>Edit</button>
                                            <button onClick={() => deleteFlow(flow)} title="Delete flow"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, borderRadius: 4 }}>
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Create / Edit Flow Panel ── */}
            {panel && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 940, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>

                        {/* Panel header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{panel === 'edit' ? 'Edit Chatbot Flow' : 'Create Chatbot Flow'}</h2>
                            <button onClick={closePanel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 24, lineHeight: 1 }}>×</button>
                        </div>

                        {/* Panel body — two columns */}
                        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                            {/* Left: Flow Settings */}
                            <div style={{ width: '46%', padding: '18px 22px', overflowY: 'auto', borderRight: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '.6px' }}>Flow Settings</div>

                                {flowError && (
                                    <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.35)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 14 }}>{flowError}</div>
                                )}

                                <div style={{ marginBottom: 12 }}>
                                    <label style={lbl}>Flow Name *</label>
                                    <input value={flowForm.name} onChange={e => setFlowForm(f => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g., Customer Support Bot" style={inp} />
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <label style={lbl}>Description</label>
                                    <textarea value={flowForm.description} onChange={e => setFlowForm(f => ({ ...f, description: e.target.value }))}
                                        placeholder="Describe what this chatbot flow does..."
                                        rows={2} style={{ ...inp, resize: 'none', fontFamily: 'inherit' }} />
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <label style={lbl}>WhatsApp Sessions * <span style={{ fontWeight: 400, color: 'var(--txt3)', fontSize: 11 }}>(select one or more — triggers on any)</span></label>
                                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', maxHeight: 140, overflowY: 'auto', padding: '4px 8px' }}>
                                        {devices.length === 0
                                            ? <span style={{ color: 'var(--txt3)', fontSize: 12, display: 'block', padding: '8px 4px' }}>No devices found. Add a device first.</span>
                                            : devices.map(d => (
                                                <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', userSelect: 'none' }}>
                                                    <input type="checkbox"
                                                        checked={flowForm.sessionIds.includes(d.id)}
                                                        onChange={e => setFlowForm(f => ({
                                                            ...f,
                                                            sessionIds: e.target.checked
                                                                ? [...f.sessionIds, d.id]
                                                                : f.sessionIds.filter(x => x !== d.id)
                                                        }))} />
                                                    <span style={{ color: d.status === 'connected' ? 'var(--txt)' : 'var(--txt3)', fontSize: 13 }}>{d.name}</span>
                                                    {d.status === 'connected' && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 2 }}>● online</span>}
                                                </label>
                                            ))
                                        }
                                    </div>
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <label style={lbl}>Target Type *</label>
                                    <select value={flowForm.targetType} onChange={e => setFlowForm(f => ({ ...f, targetType: e.target.value }))} style={sel(true)}>
                                        <option value="all"        style={{ background: '#181d27', color: '#e2e8f0' }}>All (Individual &amp; Groups)</option>
                                        <option value="individual" style={{ background: '#181d27', color: '#e2e8f0' }}>Individual Only</option>
                                        <option value="group"      style={{ background: '#181d27', color: '#e2e8f0' }}>Groups Only</option>
                                    </select>
                                    <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Choose where this chatbot flow should be active</p>
                                </div>

                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <label style={{ ...lbl, marginBottom: 0 }}>Trigger Keywords</label>
                                        <button type="button" onClick={() => insertKw('\n')}
                                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>
                                            ↵ Line Break
                                        </button>
                                    </div>
                                    <textarea value={flowForm.triggerKeywords} onChange={e => setFlowForm(f => ({ ...f, triggerKeywords: e.target.value }))}
                                        placeholder={'support, help, bot (comma separated) or multi-line keywords like:\nPHP\nDevelopment'}
                                        rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                                    <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Separate multiple keywords with commas, or use line breaks for multi-line keywords</p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <label style={lbl}>Match Type</label>
                                        <select value={flowForm.matchType} onChange={e => setFlowForm(f => ({ ...f, matchType: e.target.value }))} style={sel(true)}>
                                            <option value="contains"    style={{ background: '#181d27', color: '#e2e8f0' }}>Contains</option>
                                            <option value="exact"       style={{ background: '#181d27', color: '#e2e8f0' }}>Exact Match (default)</option>
                                            <option value="starts_with" style={{ background: '#181d27', color: '#e2e8f0' }}>Starts With</option>
                                            <option value="ends_with"   style={{ background: '#181d27', color: '#e2e8f0' }}>Ends With</option>
                                        </select>
                                        <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>How keywords should match the message</p>
                                    </div>
                                    <div>
                                        <label style={lbl}>Case Sensitivity</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                                            <input type="checkbox" id="flow-matchcase" checked={flowForm.matchCase}
                                                onChange={e => setFlowForm(f => ({ ...f, matchCase: e.target.checked }))}
                                                style={{ width: 15, height: 15, cursor: 'pointer' }} />
                                            <label htmlFor="flow-matchcase" style={{ fontSize: 13, color: 'var(--txt2)', cursor: 'pointer', margin: 0 }}>Match case</label>
                                        </div>
                                        <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 8 }}>Enable for case-sensitive keyword matching</p>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={lbl}>⏱ Cooldown Period (minutes)</label>
                                        <input type="number" min="0" value={flowForm.cooldownMinutes}
                                            onChange={e => setFlowForm(f => ({ ...f, cooldownMinutes: e.target.value }))} style={inp} />
                                        <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Minimum time between flow triggers for the same user (0 = no cooldown)</p>
                                    </div>
                                    <div>
                                        <label style={lbl}>⏱ Message Delay (seconds)</label>
                                        <input type="number" min="0" max="60" value={flowForm.messageDelaySeconds}
                                            onChange={e => setFlowForm(f => ({ ...f, messageDelaySeconds: e.target.value }))} style={inp} />
                                        <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>Delay before sending each message (0-60 seconds)</p>
                                    </div>
                                </div>

                                <div style={{ marginTop: 12 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={flowForm.skipOptedOut === true}
                                            onChange={e => setFlowForm(f => ({ ...f, skipOptedOut: e.target.checked }))}
                                            style={{ width: 15, height: 15, cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: 13, color: 'var(--txt2)' }}>Respect opt-out list (skip unsubscribed contacts)</span>
                                    </label>
                                    <p style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 6 }}>Off by default so chatbot can respond immediately during support conversations.</p>
                                </div>
                            </div>

                            {/* Right: Flow Nodes */}
                            <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                                        Flow Nodes ({flowNodes.length})
                                    </div>
                                    <button onClick={openAddNode}
                                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', padding: '7px 14px', fontSize: 13, fontWeight: 600 }}>
                                        + Add Node
                                    </button>
                                </div>

                                {flowNodes.length === 0 ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 44, marginBottom: 12, opacity: .25 }}>💬</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No nodes added yet</div>
                                        <div style={{ fontSize: 12 }}>Add your first node to get started</div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {flowNodes.map((node, idx) => (
                                            <div key={node.id || idx} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(99,102,241,.15)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                                                    {idx + 1}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)' }}>{node.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                                                        {node.messageType === 'template' ? '📄 Template' : '💬 Text Message'}
                                                        {node.attachmentFile && ' · 📎 Attachment'}
                                                        {node.nextNode === 'end' && ' · 🔚 End'}
                                                    </div>
                                                    {node.content && (
                                                        <div style={{ fontSize: 12, color: 'var(--txt2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                                            {node.content.slice(0, 90)}{node.content.length > 90 ? '…' : ''}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                                                    <button onClick={() => moveNode(idx, -1)} disabled={idx === 0}
                                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: idx === 0 ? 'not-allowed' : 'pointer', padding: '2px 7px', fontSize: 12, color: 'var(--txt3)', opacity: idx === 0 ? .3 : 1 }}>↑</button>
                                                    <button onClick={() => moveNode(idx, 1)} disabled={idx === flowNodes.length - 1}
                                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: idx === flowNodes.length - 1 ? 'not-allowed' : 'pointer', padding: '2px 7px', fontSize: 12, color: 'var(--txt3)', opacity: idx === flowNodes.length - 1 ? .3 : 1 }}>↓</button>
                                                    <button onClick={() => openEditNode(idx)}
                                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', padding: '3px 9px', fontSize: 12, color: 'var(--txt2)' }}>Edit</button>
                                                    <button onClick={() => removeNode(idx)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px 5px', borderRadius: 5, fontSize: 16, lineHeight: 1 }}>×</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Panel footer */}
                        <div style={{ display: 'flex', gap: 12, padding: '14px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                            <button onClick={closePanel}
                                style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 14 }}>
                                Cancel
                            </button>
                            <button onClick={saveFlow} disabled={flowSaving}
                                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: flowSaving ? .7 : 1 }}>
                                {flowSaving ? 'Saving…' : panel === 'edit' ? 'Save Changes' : 'Create Flow'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add / Edit Node Modal ── */}
            {nodeModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, width: '100%', maxWidth: 530, maxHeight: '90vh', overflowY: 'auto', padding: 24, boxShadow: '0 28px 80px rgba(0,0,0,.6)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editingNodeIdx !== null ? 'Edit Node' : 'Add Node'}</h3>
                            <button onClick={() => setNodeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 24, lineHeight: 1 }}>×</button>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={lbl}>Node Name</label>
                            <input value={nodeForm.name} onChange={e => setNodeForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g., Welcome Message" style={inp} />
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={lbl}>Node Type</label>
                            <select disabled style={{ ...sel(true), opacity: .6 }}>
                                <option>Message</option>
                            </select>
                        </div>

                        {/* Message Type picker */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={lbl}>Message Type</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                {[
                                    { value: 'text',     icon: '💬', label: 'Text Message',  sub: 'Custom text with attachments' },
                                    { value: 'template', icon: '📄', label: 'Template',       sub: 'Use predefined template' },
                                ].map(opt => (
                                    <button key={opt.value} type="button" onClick={() => setNodeForm(f => ({ ...f, messageType: opt.value }))}
                                        style={{ background: nodeForm.messageType === opt.value ? 'rgba(99,102,241,.08)' : 'var(--bg3)', border: `1.5px solid ${nodeForm.messageType === opt.value ? '#6366f1' : 'var(--border)'}`, borderRadius: 9, padding: '12px', textAlign: 'left', cursor: 'pointer', transition: 'all .15s' }}>
                                        <div style={{ fontSize: 20, marginBottom: 5 }}>{opt.icon}</div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: nodeForm.messageType === opt.value ? '#6366f1' : 'var(--txt)' }}>{opt.label}</div>
                                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{opt.sub}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Template selector */}
                        {nodeForm.messageType === 'template' && (
                            <div style={{ marginBottom: 14 }}>
                                <label style={lbl}>Template *</label>
                                <select value={nodeForm.templateId} onChange={e => setNodeForm(f => ({ ...f, templateId: e.target.value }))} style={sel(!!nodeForm.templateId)}>
                                    <option value="" style={{ background: '#181d27', color: '#8892aa' }}>Select a template</option>
                                    {templates.map(t => <option key={t.id} value={t.id} style={{ background: '#181d27', color: '#e2e8f0' }}>{t.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Text message */}
                        {nodeForm.messageType === 'text' && (
                            <>
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <label style={{ ...lbl, marginBottom: 0 }}>Message Content *</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {[
                                                { label: 'Random',      text: '{option1|option2|option3}' },
                                                { label: 'Spintax',     text: '{Hello|Hi|Hey}' },
                                                { label: '↵ Line Break', text: '\n' },
                                            ].map(btn => (
                                                <button key={btn.label} type="button" onClick={() => insertContent(btn.text)}
                                                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer' }}>
                                                    {btn.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea value={nodeForm.content} onChange={e => setNodeForm(f => ({ ...f, content: e.target.value }))}
                                        placeholder="Enter the message for this node..."
                                        rows={4} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                                </div>

                                <div style={{ marginBottom: 14 }}>
                                    <label style={lbl}>Attachment (Optional)</label>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                        <select value={nodeForm.attachmentType} onChange={e => setNodeForm(f => ({ ...f, attachmentType: e.target.value }))}
                                            style={{ ...sel(true), flex: '0 0 110px', width: '110px' }}>
                                            <option value="image"    style={{ background: '#181d27', color: '#e2e8f0' }}>Image</option>
                                            <option value="video"    style={{ background: '#181d27', color: '#e2e8f0' }}>Video</option>
                                            <option value="audio"    style={{ background: '#181d27', color: '#e2e8f0' }}>Audio</option>
                                            <option value="document" style={{ background: '#181d27', color: '#e2e8f0' }}>Document</option>
                                        </select>
                                        <div style={{ flex: 1 }}>
                                            <input type="file" ref={fileRef} onChange={handleAttachFile}
                                                style={{ color: 'var(--txt2)', fontSize: 13, width: '100%' }}
                                                accept={nodeForm.attachmentType === 'image' ? 'image/*' : nodeForm.attachmentType === 'video' ? 'video/*' : nodeForm.attachmentType === 'audio' ? 'audio/*' : '*'} />
                                            {nodeUploading && <div style={{ fontSize: 11, color: '#6366f1', marginTop: 4 }}>Uploading…</div>}
                                            {nodeForm._localFileName && !nodeUploading && (
                                                <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>✓ {nodeForm._localFileName}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Next Node */}
                        <div style={{ marginBottom: 22 }}>
                            <label style={lbl}>Next Node (Optional)</label>
                            <select value={nodeForm.nextNode} onChange={e => setNodeForm(f => ({ ...f, nextNode: e.target.value }))} style={sel(true)}>
                                <option value="auto" style={{ background: '#181d27', color: '#e2e8f0' }}>Auto (Next in sequence)</option>
                                <option value="end"  style={{ background: '#181d27', color: '#e2e8f0' }}>End Flow</option>
                                {flowNodes.filter((_, i) => i !== editingNodeIdx).map((n, i) => (
                                    <option key={n.id || i} value={n.id} style={{ background: '#181d27', color: '#e2e8f0' }}>{n.name || `Node ${i + 1}`}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: 12 }}>
                            <button onClick={() => setNodeModal(false)}
                                style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 14 }}>
                                Cancel
                            </button>
                            <button onClick={saveNode} disabled={nodeUploading}
                                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: nodeUploading ? .7 : 1 }}>
                                {editingNodeIdx !== null ? 'Save Node' : 'Add Node'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
