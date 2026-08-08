import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

/* ── Custom calendar picker ── */
function CalendarPicker({ value, onChange, minDate }) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const min = minDate ? (() => { const d = new Date(minDate); d.setHours(0,0,0,0); return d; })() : today;
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => {
        const d = value ? new Date(value + 'T00:00:00') : new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    });
    const ref = useRef(null);
    useEffect(() => {
        function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    function getDays() {
        const first = new Date(view.year, view.month, 1);
        const last  = new Date(view.year, view.month + 1, 0);
        const cells = [];
        for (let i = 0; i < first.getDay(); i++) cells.push(null);
        for (let d = 1; d <= last.getDate(); d++) cells.push(d);
        return cells;
    }
    function pick(d) {
        if (!d) return;
        const date = new Date(view.year, view.month, d); date.setHours(0,0,0,0);
        if (date < min) return;
        onChange(`${view.year}-${String(view.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
        setOpen(false);
    }
    const selDate = value ? new Date(value + 'T00:00:00') : null;
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button type="button" onClick={() => setOpen(o => !o)} style={{
                width: '100%', textAlign: 'left', padding: '8px 12px', background: 'var(--bg)',
                border: '1.5px solid rgba(168,85,247,.55)', borderRadius: 'var(--radius)',
                color: value ? 'var(--txt)' : 'var(--txt3)', cursor: 'pointer', fontSize: 13.5,
            }}>
                {value ? new Date(value + 'T00:00:00').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '📅 Pick a date'}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
                    background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
                    boxShadow: '0 8px 32px rgba(0,0,0,.4)', padding: '12px 10px', width: 252,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <button type="button" onClick={() => setView(v => { const d = new Date(v.year, v.month-1,1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                            style={{ background: 'none', border: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 6px' }}>‹</button>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)' }}>{MONTHS[view.month]} {view.year}</span>
                        <button type="button" onClick={() => setView(v => { const d = new Date(v.year, v.month+1,1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                            style={{ background: 'none', border: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 6px' }}>›</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
                        {DAYS.map(d => <div key={d} style={{ fontSize: 10, color: 'var(--txt3)', padding: '2px 0', fontWeight: 700 }}>{d}</div>)}
                        {getDays().map((d, i) => {
                            if (!d) return <div key={`e${i}`} />;
                            const date = new Date(view.year, view.month, d); date.setHours(0,0,0,0);
                            const disabled = date < min;
                            const selected = selDate && selDate.getFullYear() === view.year && selDate.getMonth() === view.month && selDate.getDate() === d;
                            const isToday  = date.getTime() === today.getTime();
                            return (
                                <div key={d} onClick={() => !disabled && pick(d)}
                                    onMouseEnter={e => { if (!disabled && !selected) e.currentTarget.style.background = 'var(--bg3)'; }}
                                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = selected ? '#a855f7' : 'transparent'; }}
                                    style={{
                                        padding: '5px 2px', borderRadius: 6, fontSize: 12,
                                        cursor: disabled ? 'default' : 'pointer', boxSizing: 'border-box',
                                        color: disabled ? 'var(--txt3)' : selected ? '#fff' : isToday ? '#a855f7' : 'var(--txt)',
                                        background: selected ? '#a855f7' : 'transparent',
                                        fontWeight: selected || isToday ? 700 : 400,
                                        opacity: disabled ? 0.35 : 1,
                                    }}>{d}</div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── Custom time picker ── */
function TimePicker({ value, onChange }) {
    // value is stored as 24h "HH:MM"; internally we work in 12h display
    function to12(hh24) {
        if (hh24 === '' || hh24 === undefined) return { h: '', ampm: 'AM' };
        const n = parseInt(hh24, 10);
        if (n === 0)  return { h: '12', ampm: 'AM' };
        if (n < 12)   return { h: String(n), ampm: 'AM' };
        if (n === 12) return { h: '12', ampm: 'PM' };
        return { h: String(n - 12), ampm: 'PM' };
    }
    function to24(h12, ampm) {
        const n = parseInt(h12, 10);
        if (ampm === 'AM') return n === 12 ? '00' : String(n).padStart(2, '0');
        return n === 12 ? '12' : String(n + 12).padStart(2, '0');
    }
    const [hh24, mm] = value ? value.split(':') : ['', ''];
    const { h, ampm } = to12(hh24);
    const hours12 = ['1','2','3','4','5','6','7','8','9','10','11','12'];
    const sel = { borderColor: 'rgba(168,85,247,.55)' };
    function update(newH, newM, newAmpm) {
        if (newH !== '' && newM !== '') onChange(`${to24(newH, newAmpm)}:${newM}`);
        else onChange('');
    }
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select value={h} onChange={e => update(e.target.value, mm || '00', ampm || 'AM')}
                style={{ ...sel, flex: 1, color: h ? 'var(--txt)' : 'var(--txt3)' }}>
                <option value="">HH</option>
                {hours12.map(hr => <option key={hr} value={hr}>{hr}</option>)}
            </select>
            <span style={{ color: 'var(--txt2)', fontWeight: 700, fontSize: 16 }}>:</span>
            <input
                type="number" min="0" max="59" placeholder="MM"
                value={mm}
                onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
                    const clamped = raw === '' ? '' : String(Math.min(59, parseInt(raw, 10)));
                    update(h || '12', clamped.padStart(2, '0') || '00', ampm || 'AM');
                    if (raw === '') update(h || '12', '', ampm || 'AM');
                }}
                onBlur={e => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n)) update(h || '12', String(Math.min(59, n)).padStart(2, '0'), ampm || 'AM');
                }}
                style={{ ...sel, flex: 1, textAlign: 'center' }}
            />
            <select value={ampm} onChange={e => update(h || '12', mm || '00', e.target.value)}
                style={{ ...sel, width: 60, color: 'var(--txt)' }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}

const STATUS_COLOR = {
    draft: 'var(--txt3)', running: 'var(--orange)',
    completed: 'var(--green)', failed: 'var(--red)', paused: 'var(--orange)',
    scheduled: '#a855f7',
};

export default function Campaigns() {
    const { showToast, showConfirm, campaignUpdates, setCampaignUpdates } = useApp();
    const [campaigns,  setCampaigns]  = useState([]);
    const [templates,  setTemplates]  = useState([]);
    const [contacts,   setContacts]   = useState([]);
    const [groups,     setGroups]     = useState([]);
    const [devices,    setDevices]    = useState([]);
    const [modal,      setModal]      = useState(false);
    const [detailModal,setDetail]     = useState(null); // campaign
    const EMPTY_FORM = {
        name: '', deviceIds: [],
        msgType: 'template',
        templateIds: [], textMessage: '',
        contactMethod: 'groups',
        selectedGroupIds: [], contactIds: [], pastedNumbers: '',
        sendMode: 'safe',
        variables: [],
        scheduleEnabled: false,
        scheduledAt: '',
        scheduleDate: '',
        scheduleTime: ''
    };
    const [form,       setForm]       = useState(EMPTY_FORM);
    const [saving,     setSaving]     = useState(false);
    const [contactSearch, setCS]      = useState('');
    const [mergedCampaigns, setMerged] = useState([]);
    const [showVarAdd, setShowVarAdd]  = useState(false);
    const [varForm,    setVarForm]     = useState({ name: '', values: '' });
    const msgRef = useRef(null);

    function insertAtCursor(ins) {
        const ta = msgRef.current;
        if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const nv = form.textMessage.slice(0, s) + ins + form.textMessage.slice(e);
        setForm(p => ({ ...p, textMessage: nv }));
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + ins.length; ta.focus(); }, 0);
    }

    function addVariable() {
        const name = varForm.name.trim().replace(/\s+/g, '_');
        const vals = varForm.values.split(',').map(v => v.trim()).filter(Boolean);
        if (!name || !vals.length) return;
        setForm(p => ({ ...p, variables: [...p.variables, { name, values: vals }] }));
        setVarForm({ name: '', values: '' });
        setShowVarAdd(false);
    }

    async function load() {
        try {
            const [c, t, co, g, d] = await Promise.all([api.getCampaigns(), api.getTemplates(), api.getContacts(), api.getGroups(), api.getDevices()]);
            setCampaigns(Array.isArray(c) ? c : []); setTemplates(Array.isArray(t) ? t : []); setContacts(Array.isArray(co) ? co : []); setGroups(Array.isArray(g) ? g : []);
            setDevices(Array.isArray(d) ? d.filter(x => x.status === 'connected') : []);
        } catch { /* ignore */ }
    }

    useEffect(() => { load(); }, []);

    // Merge live socket updates into campaign list (newest first)
    useEffect(() => {
        const merged = campaigns.map(c => {
            const upd = campaignUpdates[c.id];
            if (!upd) return c;
            return { ...c, messages: upd.messages, status: upd.status, safetyNote: upd.safetyNote };
        });
        setMerged([...merged].reverse());
    }, [campaigns, campaignUpdates]);

    function toggleTemplate(id) {
        setForm(p => ({ ...p, templateIds: p.templateIds.includes(id) ? p.templateIds.filter(x => x !== id) : [...p.templateIds, id] }));
    }

    function toggleContact(id) {
        setForm(p => ({ ...p, contactIds: p.contactIds.includes(id) ? p.contactIds.filter(x => x !== id) : [...p.contactIds, id] }));
    }

    function resolvedCount() {
        if (form.contactMethod === 'all') return contacts.length;
        if (form.contactMethod === 'manual') return form.contactIds.length;
        if (form.contactMethod === 'paste')
            return form.pastedNumbers.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length;
        // groups
        const ids = new Set();
        form.selectedGroupIds.forEach(gid => {
            const g = groups.find(x => x.id === gid);
            if (g) (g.contactIds || []).forEach(id => ids.add(id));
        });
        return ids.size;
    }

    async function save() {
        if (!form.name.trim()) return showToast('Campaign name required', 'error');
        if (form.deviceIds.length === 0) return showToast('Select at least one WhatsApp session', 'error');
        if (form.msgType === 'template' && form.templateIds.length === 0) return showToast('Select at least one template', 'error');
        if (form.msgType === 'text' && !form.textMessage.trim()) return showToast('Message content is required', 'error');

        let contactIds = [];
        let numbers = [];
        if (form.contactMethod === 'groups') {
            const ids = new Set();
            form.selectedGroupIds.forEach(gid => {
                const g = groups.find(x => x.id === gid);
                if (g) (g.contactIds || []).forEach(id => ids.add(id));
            });
            contactIds = [...ids];
        } else if (form.contactMethod === 'all') {
            contactIds = contacts.map(c => c.id);
        } else if (form.contactMethod === 'manual') {
            contactIds = form.contactIds;
        } else if (form.contactMethod === 'paste') {
            numbers = form.pastedNumbers.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        }
        if (!contactIds.length && !numbers.length) return showToast('Select at least one recipient', 'error');

        if (form.scheduleEnabled) {
            if (!form.scheduleDate || !form.scheduleTime) return showToast('Please select a date and time', 'error');
            const combinedDt = new Date(`${form.scheduleDate}T${form.scheduleTime}`);
            if (combinedDt.getTime() <= Date.now()) return showToast('Scheduled time must be in the future', 'error');
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                msgType: form.msgType,
                templateIds: form.msgType === 'template' ? form.templateIds : [],
                textMessage: form.msgType === 'text' ? form.textMessage : '',
                variables: form.variables || [],
                deviceIds: form.deviceIds,
                sendMode: form.sendMode || 'safe',
                ...(form.scheduleEnabled && form.scheduleDate && form.scheduleTime
                    ? { scheduledAt: new Date(`${form.scheduleDate}T${form.scheduleTime}`).toISOString() }
                    : {}),
                ...(contactIds.length ? { contactIds } : {}),
                ...(numbers.length ? { numbers } : {}),
            };
            const c = await api.createCampaign(payload);
            setCampaigns(prev => [...prev, c]);
            setModal(false);
            showToast('Campaign created');
        } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
    }

    async function scheduleCampaign(id, scheduledAt) {
        try {
            const updated = await api.scheduleCampaign(id, scheduledAt);
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
            showToast('Campaign scheduled', 'success');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function cancelSchedule(id) {
        try {
            const updated = await api.cancelSchedule(id);
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...updated } : c));
            showToast('Schedule cancelled', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function resendCampaign(id) {
        try {
            const clone = await api.resendCampaign(id);
            setCampaigns(prev => [...prev, clone]);
            showToast('Campaign cloned — click Send to start', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function retryFailed(id) {
        try {
            const clone = await api.retryFailedCampaign(id);
            setCampaigns(prev => [...prev, clone]);
            showToast('Retry campaign created — click Send to start', 'info');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function sendCampaign(id) {
        // Optimistically mark as running so button flips immediately
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'running' } : c));
        try { await api.sendCampaign(id); showToast('Campaign started!', 'info'); }
        catch (e) {
            // Revert on error
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'draft' } : c));
            showToast(e.message, 'error');
        }
    }

    async function pauseCampaign(id) {
        // Optimistically mark as paused so button flips immediately
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' } : c));
        try { await api.pauseCampaign(id); showToast('Campaign paused', 'info'); }
        catch (e) {
            setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'running' } : c));
            showToast(e.message, 'error');
        }
    }

    async function del(id) {
        if (!await showConfirm('Delete Campaign', 'Are you sure you want to delete this campaign?', { danger: true, confirmLabel: 'Delete' })) return;
        try { 
            await api.deleteCampaign(id); 
            setCampaigns(prev => prev.filter(c => c.id !== id));
            // Also clear campaign updates from socket data to prevent ghost campaigns
            setCampaignUpdates(prev => {
                const updated = { ...prev };
                delete updated[id];
                return updated;
            });
            showToast('Campaign deleted'); 
        }
        catch (e) { showToast(e.message, 'error'); }
    }

    const filteredContacts = contacts.filter(c =>
        c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.number.includes(contactSearch)
    );

    // Aggregate stats
    const allCampaigns = mergedCampaigns;
    const totalCampaigns  = allCampaigns.length;
    const runningCount    = allCampaigns.filter(c => c.status === 'running').length;
    const scheduledCount  = allCampaigns.filter(c => c.status === 'scheduled').length;
    const completedCount  = allCampaigns.filter(c => c.status === 'completed').length;
    const totalSent       = allCampaigns.reduce((s, c) => s + (c.messages?.filter(m => m.status === 'sent').length || 0), 0);
    const totalFailed     = allCampaigns.reduce((s, c) => s + (c.messages?.filter(m => m.status === 'failed').length || 0), 0);
    const totalMsgs       = allCampaigns.reduce((s, c) => s + (c.messages?.length || 0), 0);
    const successRate     = totalMsgs > 0 ? Math.round((totalSent / totalMsgs) * 100) : 0;

    const [campaignSearch, setCampaignSearch] = useState('');
    const [campaignFilter, setCampaignFilter] = useState('all');

    const visibleCampaigns = mergedCampaigns.filter(c => {
        const matchSearch = !campaignSearch || c.name.toLowerCase().includes(campaignSearch.toLowerCase());
        const matchFilter = campaignFilter === 'all' || c.status === campaignFilter;
        return matchSearch && matchFilter;
    });

    const STAT_CARDS = [
        { label: 'Total Campaigns', value: totalCampaigns, color: '#4a9eff', bg: 'rgba(74,158,255,.12)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> },
        { label: 'Running',         value: runningCount,   color: '#22c55e', bg: 'rgba(34,197,94,.12)',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> },
        { label: 'Scheduled',       value: scheduledCount, color: '#a855f7', bg: 'rgba(168,85,247,.12)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
        { label: 'Completed',       value: completedCount, color: '#06b6d4', bg: 'rgba(6,182,212,.12)',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="9 12 12 15 16 10"/></svg> },
        { label: 'Messages Sent',   value: totalSent,      color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> },
        { label: 'Success Rate',    value: `${successRate}%`, color: '#22c55e', bg: 'rgba(34,197,94,.12)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg> },
        { label: 'Failed Messages', value: totalFailed,    color: '#ef4444', bg: 'rgba(239,68,68,.12)',   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
    ];

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ background: 'linear-gradient(135deg,#e040fb,#ff4081)', borderRadius: 10, width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </span>
                        Bulk Messages
                    </h1>
                    <p className="page-sub">Send messages to multiple contacts at once</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <svg style={{ animation: 'spin 1.4s linear infinite' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        Auto-refresh ON
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>☰ Queue ({runningCount})</button>
                    <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setCS(''); setModal(true); load(); }}>
                        + Create Campaign
                    </button>
                </div>
            </div>

            {/* Search + filter */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input style={{ paddingLeft: 32, width: '100%' }} placeholder="Search campaigns..." value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)} />
                </div>
                <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} style={{ minWidth: 150 }}>
                    <option value="all">All Campaigns</option>
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="running">Running</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Stats cards */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
                {STAT_CARDS.map(s => (
                    <div key={s.label} style={{ minWidth: 140, flex: '1 0 130px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>{s.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--txt)' }}>{s.value}</div>
                            </div>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {s.icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {visibleCampaigns.length === 0
                ? <p className="empty-state">{campaignSearch || campaignFilter !== 'all' ? 'No campaigns match your filter.' : 'No campaigns yet.'}</p>
                : (
                    <div className="campaigns-list">
                        {visibleCampaigns.map(c => {
                            const sent    = c.messages?.filter(m => m.status === 'sent').length || 0;
                            const failed  = c.messages?.filter(m => m.status === 'failed').length || 0;
                            const total   = c.messages?.length || 0;
                            const pending = total - sent - failed;
                            const pct     = total > 0 ? Math.round((sent / total) * 100) : 0;
                            const isRun   = c.status === 'running';
                            const statusColor = STATUS_COLOR[c.status] || 'var(--txt3)';
                            // Bar: show sent (green) + failed (red) as stacked via gradient, or solid
                            const sentPct   = total > 0 ? (sent   / total) * 100 : 0;
                            const failedPct = total > 0 ? (failed / total) * 100 : 0;
                            const barStyle = failed > 0
                                ? { width: `${sentPct + failedPct}%`, background: `linear-gradient(90deg, var(--green) ${sentPct / (sentPct + failedPct) * 100}%, var(--red) 0%)` }
                                : { width: `${sentPct}%`, background: isRun ? 'var(--blue)' : 'var(--green)' };
                            const templateNames = (c.templateIds || []).map(tid => {
                                const t = templates.find(t => t.id === tid);
                                return t ? t.name : null;
                            }).filter(Boolean).join(', ');
                            return (
                                <div key={c.id} className="campaign-card">
                                    <div className="campaign-card-top">
                                        <div className="campaign-card-name">{c.name}</div>
                                        <span className="campaign-status-badge" style={{ color: statusColor, background: `${statusColor}18`, borderColor: `${statusColor}40` }}>
                                            {c.status === 'running' ? '⚡' : c.status === 'completed' ? '✓' : c.status === 'failed' ? '✕' : c.status === 'paused' ? '⏸' : '○'} {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                                        </span>
                                    </div>
                                    <div className="campaign-card-chips">
                                        {c.sendMode === 'safest' && <span className="campaign-chip" style={{ color: '#22c55e', background: 'rgba(34,197,94,.1)', borderColor: 'rgba(34,197,94,.25)' }}>🛡️ Safest Send</span>}
                                        {(c.sendMode === 'instant' || (!c.sendMode && c.instantSend)) && <span className="campaign-chip" style={{ color: 'var(--orange)', background: 'rgba(245,166,35,.1)', borderColor: 'rgba(245,166,35,.25)' }}>⚡ Instant Send</span>}
                                        {templateNames && <span className="campaign-chip">📋 {templateNames}</span>}
                                        <span className="campaign-chip">👥 {total} contacts</span>
                                        <span className="campaign-chip">✅ {sent} sent</span>
                                        {failed > 0 && <span className="campaign-chip campaign-chip-red">✕ {failed} failed</span>}
                                        {c.scheduledAt && <span className="campaign-chip" style={{ color: '#a855f7', background: 'rgba(168,85,247,.1)', borderColor: 'rgba(168,85,247,.3)' }}>🗓️ {new Date(c.scheduledAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                                    {c.createdAt && <span className="campaign-chip">🕐 {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                                    </div>
                                    {total > 0 && (
                                        <>
                                            <div className="progress-bar-wrap">
                                                <div className="progress-bar" style={barStyle} />
                                            </div>
                                            <div className="campaign-progress-label">
                                                {isRun
                                                    ? <span style={{ color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                        <svg style={{ animation: 'spin .8s linear infinite', flexShrink: 0 }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                                        Sending… {sent} / {total}{failed > 0 ? ` · ${failed} failed` : ''}
                                                      </span>
                                                    : <span>{sent} / {total} sent ({pct}%){failed > 0 ? <span style={{ color: 'var(--red)', marginLeft: 8 }}>· {failed} failed</span> : ''}{pending > 0 ? <span style={{ color: 'var(--txt3)', marginLeft: 8 }}>· {pending} pending</span> : ''}</span>}
                                            </div>
                                        </>
                                    )}
                                    {c.safetyNote && <div className="safety-note">{c.safetyNote}</div>}
                                    <div className="campaign-card-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={() => setDetail(c)}>View Details</button>
                                        {c.status === 'running' && (
                                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--orange)', borderColor: 'var(--orange)' }} onClick={() => pauseCampaign(c.id)}>
                                                ⏸ Pause
                                            </button>
                                        )}
                                        {(c.status === 'draft' || c.status === 'paused') && (
                                            <button className="btn btn-success btn-sm" onClick={() => sendCampaign(c.id)}>
                                                {c.status === 'paused' ? '▶ Resume' : '▶ Send'}
                                            </button>
                                        )}
                                        {c.status === 'scheduled' && (
                                            <>
                                                <button className="btn btn-success btn-sm" onClick={() => sendCampaign(c.id)}>▶ Send Now</button>
                                                <button className="btn btn-ghost btn-sm" style={{ color: '#a855f7', borderColor: 'rgba(168,85,247,.4)' }} onClick={() => cancelSchedule(c.id)}>✕ Cancel Schedule</button>
                                            </>
                                        )}
                                        {(c.status === 'completed' || c.status === 'failed') && (
                                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--blue)', borderColor: 'var(--blue)' }} onClick={() => resendCampaign(c.id)}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                                Resend
                                            </button>
                                        )}
                                        {(c.status === 'completed' || c.status === 'failed') && failed > 0 && (
                                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,.4)' }} onClick={() => retryFailed(c.id)}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 .49-3"/></svg>
                                                Retry Failed ({failed})
                                            </button>
                                        )}
                                        {!isRun && (
                                            <button className="campaign-del-btn" title="Delete campaign" onClick={() => del(c.id)}>
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/></svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            {/* Create modal */}
            {modal && (
                <Modal title="Create Bulk Campaign" onClose={() => setModal(false)} size="xl">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                        {/* ── Left: Campaign Settings ── */}
                        <div>
                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--txt)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Campaign Settings</h3>

                            <div className="form-group">
                                <label>Campaign Name</label>
                                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                    placeholder="e.g. Product Launch Announcement" autoFocus />
                            </div>

                            <div className="form-group">
                                <label>WhatsApp Sessions *
                                    <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(Select multiple for device rotation)</span>
                                </label>
                                {devices.length === 0
                                    ? <p style={{ fontSize: 13, color: 'var(--txt3)' }}>No connected devices.</p>
                                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {devices.map(d => (
                                            <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 8px', borderRadius: 6, background: form.deviceIds.includes(d.id) ? 'rgba(74,158,255,.08)' : 'transparent' }}>
                                                <input type="checkbox" checked={form.deviceIds.includes(d.id)}
                                                    onChange={() => setForm(p => ({ ...p, deviceIds: p.deviceIds.includes(d.id) ? p.deviceIds.filter(x => x !== d.id) : [...p.deviceIds, d.id] }))} />
                                                <span style={{ fontSize: 13 }}>{d.name}{d.number ? ` (+${String(d.number).replace(/^\+/, '')})` : ''}</span>
                                            </label>
                                        ))}
                                    </div>
                                }
                            </div>

                            <div className="form-group">
                                <label>Message Type</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    {[{ key: 'text', icon: '💬', label: 'Text Message', desc: 'Text with optional attachment' },
                                      { key: 'template', icon: '📋', label: 'Template Message', desc: 'Use saved template' }]
                                      .map(t => (
                                        <button key={t.key} type="button" onClick={() => setForm(p => ({ ...p, msgType: t.key }))}
                                            style={{ padding: '12px 8px', borderRadius: 'var(--radius)', border: `2px solid ${form.msgType === t.key ? 'var(--blue)' : 'var(--border)'}`, background: form.msgType === t.key ? 'rgba(74,158,255,.08)' : 'var(--bg)', cursor: 'pointer', textAlign: 'center', transition: 'all .12s' }}>
                                            <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                                            <div style={{ fontWeight: 600, fontSize: 12, color: form.msgType === t.key ? 'var(--blue)' : 'var(--txt)' }}>{t.label}</div>
                                            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>{t.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ── Send Mode ── */}
                            <div className="form-group">
                                <label>Send Mode</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                    <button type="button" onClick={() => setForm(p => ({ ...p, sendMode: 'safest' }))}
                                        style={{ padding: '12px 6px', borderRadius: 'var(--radius)', border: `2px solid ${form.sendMode === 'safest' ? '#22c55e' : 'var(--border)'}`, background: form.sendMode === 'safest' ? 'rgba(34,197,94,.1)' : 'var(--bg)', cursor: 'pointer', textAlign: 'center', transition: 'all .12s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: form.sendMode === 'safest' ? '#22c55e' : 'var(--txt3)' }}>🛡️</div>
                                        <div style={{ fontWeight: 700, fontSize: 12, color: form.sendMode === 'safest' ? '#22c55e' : 'var(--txt)' }}>Safest Send</div>
                                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>55–75 sec/msg</div>
                                    </button>
                                    <button type="button" onClick={() => setForm(p => ({ ...p, sendMode: 'safe' }))}
                                        style={{ padding: '12px 6px', borderRadius: 'var(--radius)', border: `2px solid ${form.sendMode === 'safe' ? 'var(--green)' : 'var(--border)'}`, background: form.sendMode === 'safe' ? 'rgba(37,211,102,.08)' : 'var(--bg)', cursor: 'pointer', textAlign: 'center', transition: 'all .12s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: form.sendMode === 'safe' ? 'var(--green)' : 'var(--txt3)' }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: 12, color: form.sendMode === 'safe' ? 'var(--green)' : 'var(--txt)' }}>Safe Send</div>
                                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>Follows settings</div>
                                    </button>
                                    <button type="button" onClick={() => setForm(p => ({ ...p, sendMode: 'instant' }))}
                                        style={{ padding: '12px 6px', borderRadius: 'var(--radius)', border: `2px solid ${form.sendMode === 'instant' ? 'var(--orange)' : 'var(--border)'}`, background: form.sendMode === 'instant' ? 'rgba(245,166,35,.08)' : 'var(--bg)', cursor: 'pointer', textAlign: 'center', transition: 'all .12s' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4, color: form.sendMode === 'instant' ? 'var(--orange)' : 'var(--txt3)' }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: 12, color: form.sendMode === 'instant' ? 'var(--orange)' : 'var(--txt)' }}>Instant Send</div>
                                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>3–6 sec/msg</div>
                                    </button>
                                </div>
                                {form.sendMode === 'safest' && (
                                    <div style={{ marginTop: 7, padding: '7px 10px', background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 'var(--radius)', fontSize: 12, color: '#22c55e' }}>
                                        🛡️ Safest Send: 55–75 sec per message, 3–5 min deep rest every 10 messages. Typing simulation always active (4–10 sec).
                                    </div>
                                )}
                                {form.sendMode === 'instant' && (
                                    <div style={{ marginTop: 7, padding: '7px 10px', background: 'rgba(245,166,35,.07)', border: '1px solid rgba(245,166,35,.25)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--orange)' }}>
                                        ⚡ Instant Send: 3–6 sec per message, 60 sec rest after each batch. Typing simulation still active.
                                    </div>
                                )}
                            </div>

                            {form.msgType === 'text' ? (
                                <div className="form-group">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <label style={{ marginBottom: 0 }}>Message Content *</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            {[{ label: 'Random', ins: '{{random}}' }, { label: 'Name', ins: '{{name}}' }, { label: '↵ Line Break', ins: '\n' }].map(b => (
                                                <button key={b.label} type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11 }}
                                                    onClick={() => insertAtCursor(b.ins)}>{b.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea ref={msgRef} rows={5} value={form.textMessage}
                                        onChange={e => setForm(p => ({ ...p, textMessage: e.target.value }))}
                                        placeholder="Enter your message content here... Use {{variable}} for dynamic content" />
                                    {/* ── Sequential Variables ── */}
                                    <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)' }}>🔄 Sequential Variables</span>
                                            <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11 }} onClick={() => setShowVarAdd(p => !p)}>+ Add Variable</button>
                                        </div>
                                        {form.variables.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: showVarAdd ? 8 : 0 }}>
                                                {form.variables.map((v, idx) => (
                                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg)', borderRadius: 5, fontSize: 12 }}>
                                                        <code style={{ color: 'var(--green)', flex: '0 0 auto', fontSize: 12 }}>{'{' + v.name + '}'}</code>
                                                        <span style={{ flex: 1, color: 'var(--txt3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.values.join(', ')}</span>
                                                        <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11 }} onClick={() => insertAtCursor(`{${v.name}}`)}>Insert</button>
                                                        <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11, color: 'var(--red)' }} onClick={() => setForm(p => ({ ...p, variables: p.variables.filter((_, i) => i !== idx) }))}>✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {showVarAdd ? (
                                            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
                                                <input type="text" value={varForm.name} onChange={e => setVarForm(p => ({ ...p, name: e.target.value }))} placeholder="var_name" style={{ width: 90, fontSize: 12, padding: '4px 7px' }} />
                                                <input type="text" value={varForm.values} onChange={e => setVarForm(p => ({ ...p, values: e.target.value }))} placeholder="Hi, Hello, Good morning" style={{ flex: 1, fontSize: 12, padding: '4px 7px' }} />
                                                <button type="button" className="btn btn-primary btn-xs" onClick={addVariable}>Add</button>
                                                <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setShowVarAdd(false); setVarForm({ name: '', values: '' }); }}>Cancel</button>
                                            </div>
                                        ) : !form.variables.length && (
                                            <p style={{ fontSize: 11, color: 'var(--txt3)', margin: 0 }}>Define variables that cycle through values per contact. Use <code style={{ color: 'var(--txt2)' }}>{'{varname}'}</code> in your message.</p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label>Templates ({form.templateIds.length} selected) — multiple = random rotation</label>
                                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6 }}>
                                        {templates.length === 0
                                            ? <p style={{ fontSize: 13, color: 'var(--txt3)', padding: 8 }}>No templates yet.</p>
                                            : templates.map(t => (
                                                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer', borderRadius: 5, background: form.templateIds.includes(t.id) ? 'rgba(74,158,255,.08)' : 'transparent' }}>
                                                    <input type="checkbox" checked={form.templateIds.includes(t.id)} onChange={() => toggleTemplate(t.id)} />
                                                    <span style={{ fontSize: 13, flex: 1 }}>{t.name}</span>
                                                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{t.templateType || 'text'}</span>
                                                </label>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right: Contact Selection ── */}
                        <div>
                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14, color: 'var(--txt)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Contact Selection</h3>

                            <div className="form-group">
                                <label>Selection Method</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                                    {[{ key: 'groups', label: 'Contact Groups', note: '(Recommended)' },
                                      { key: 'all', label: 'All Verified Contacts' },
                                      { key: 'manual', label: 'Manual Selection' },
                                      { key: 'paste', label: 'Paste Phone Numbers' }].map(m => (
                                        <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                            <input type="radio" name="contactMethod" value={m.key} checked={form.contactMethod === m.key}
                                                onChange={() => setForm(p => ({ ...p, contactMethod: m.key }))} />
                                            <span style={{ fontSize: 13 }}>{m.label}{m.note && <span style={{ color: 'var(--txt3)', fontSize: 11, marginLeft: 4 }}>{m.note}</span>}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {form.contactMethod === 'groups' && (
                                <div className="form-group">
                                    <label>Select Contact Groups</label>
                                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6 }}>
                                        {groups.length === 0
                                            ? <p style={{ fontSize: 13, color: 'var(--txt3)', padding: 8 }}>No groups yet.</p>
                                            : groups.map(g => (
                                                <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={form.selectedGroupIds.includes(g.id)}
                                                        onChange={() => setForm(p => ({ ...p, selectedGroupIds: p.selectedGroupIds.includes(g.id) ? p.selectedGroupIds.filter(x => x !== g.id) : [...p.selectedGroupIds, g.id] }))} />
                                                    <span style={{ fontSize: 13, flex: 1 }}>{g.name}</span>
                                                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{(g.contactIds || []).length} verified / {(g.contactIds || []).length} total</span>
                                                </label>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {form.contactMethod === 'all' && (
                                <div style={{ padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--txt2)', marginBottom: 12 }}>
                                    All <strong>{contacts.length}</strong> contacts will be targeted.
                                </div>
                            )}

                            {form.contactMethod === 'manual' && (
                                <div className="form-group">
                                    <input type="text" placeholder="Search contacts..." value={contactSearch}
                                        onChange={e => setCS(e.target.value)} style={{ marginBottom: 8 }} />
                                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 6 }}>
                                        {filteredContacts.map(c => (
                                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={form.contactIds.includes(c.id)} onChange={() => toggleContact(c.id)} />
                                                <span style={{ fontSize: 13, flex: 1 }}>{c.name}</span>
                                                <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace' }}>{c.number}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {form.contactMethod === 'paste' && (
                                <div className="form-group">
                                    <textarea rows={7} value={form.pastedNumbers}
                                        onChange={e => setForm(p => ({ ...p, pastedNumbers: e.target.value }))}
                                        placeholder={'+1234567890\n+0987654321\nOne number per line or comma-separated'} />
                                </div>
                            )}

                            <div style={{ padding: '10px 14px', background: 'rgba(74,158,255,.1)', border: '1px solid rgba(74,158,255,.25)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                                <strong style={{ color: 'var(--blue, #4a9eff)' }}>{resolvedCount()}</strong>
                                <span style={{ color: 'var(--txt2)', marginLeft: 4 }}>contacts will receive this message</span>
                            </div>
                        </div>
                    </div>

                            {/* ── Schedule ── */}
                            <div className="form-group" style={{ marginTop: 8 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={form.scheduleEnabled}
                                        onChange={e => setForm(p => ({ ...p, scheduleEnabled: e.target.checked, scheduledAt: '', scheduleDate: '', scheduleTime: '' }))} />
                                    <span style={{ color: '#a855f7', fontWeight: 600 }}>🗓️ Schedule Campaign</span>
                                    <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400 }}>Auto-run at a specific date & time</span>
                                </label>
                                {form.scheduleEnabled && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4, display: 'block' }}>Date</label>
                                            <CalendarPicker
                                                value={form.scheduleDate}
                                                minDate={new Date(Date.now() + 60_000).toISOString().slice(0, 10)}
                                                onChange={v => setForm(p => ({ ...p, scheduleDate: v }))}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4, display: 'block' }}>Time</label>
                                            <TimePicker
                                                value={form.scheduleTime}
                                                onChange={v => setForm(p => ({ ...p, scheduleTime: v }))}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                    <div className="modal-footer" style={{ marginTop: 16 }}>
                        <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={save} disabled={saving}>
                            {saving ? 'Creating…' : form.scheduleEnabled ? '🗓️ Schedule Campaign' : 'Create Campaign'}
                        </button>
                    </div>
                </Modal>
            )}

            {/* Detail modal */}
            {detailModal && (
                <Modal title={`Campaign: ${detailModal.name}`} onClose={() => setDetail(null)} size="xl">
                    <table className="data-table">
                        <thead><tr><th>Name</th><th>Number</th><th>Status</th><th>Sent At</th><th>Error</th></tr></thead>
                        <tbody>
                            {(mergedCampaigns.find(c => c.id === detailModal.id)?.messages || detailModal.messages || []).map((m, i) => (
                                <tr key={i}>
                                    <td>{m.contactName}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.number}</td>
                                    <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                                    <td style={{ fontSize: 12, color: 'var(--txt3)' }}>{m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : '—'}</td>
                                    <td style={{ fontSize: 12, color: 'var(--red)' }}>{m.error || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
