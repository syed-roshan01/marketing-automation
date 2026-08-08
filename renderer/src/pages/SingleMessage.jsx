import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { useApp } from '../contexts/AppContext.jsx';
import socket from '../socket.js';

const MEDIA_TYPES = [
    { value: 'none',     label: 'None' },
    { value: 'image',    label: 'Image' },
    { value: 'video',    label: 'Video' },
    { value: 'audio',    label: 'Audio' },
    { value: 'document', label: 'Document' },
];

const ACCEPT_MAP = {
    image:    'image/*',
    video:    'video/*',
    audio:    'audio/*',
    document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar',
};

export default function SingleMessage() {
    const { showToast } = useApp();

    const [devices,       setDevices]       = useState([]);
    const [contacts,      setContacts]      = useState([]);
    const [groups,        setGroups]        = useState([]);
    const [templates,     setTemplates]     = useState([]);
    const [deviceId,      setDeviceId]      = useState('');
    const [recipientTab,  setRecipientTab]  = useState('contacts');
    const [selContacts,   setSelContacts]   = useState([]);
    const [selGroups,     setSelGroups]     = useState([]);
    const [manualNums,    setManualNums]    = useState('');
    const [contactSearch, setCS]            = useState('');
    const [groupSearch,   setGS]            = useState('');
    const [msgType,       setMsgType]       = useState('text');
    const [templateId,    setTemplateId]    = useState('');
    const [message,       setMessage]       = useState('');
    const [mediaType,     setMediaType]     = useState('none');
    const [file,          setFile]          = useState(null);
    const [minDelay,      setMinDelay]      = useState(1000);
    const [maxDelay,      setMaxDelay]      = useState(3000);
    const [sending,       setSending]       = useState(false);
    const [result,        setResult]        = useState(null);
    const [progress,      setProgress]      = useState(null);
    const fileRef             = useRef(null);
    const activeCampaignRef   = useRef(null);

    useEffect(() => {
        function onCampaignUpdate({ campaignId: cid, messages, status }) {
            if (cid !== activeCampaignRef.current) return;
            const sent   = messages.filter(m => m.status === 'sent').length;
            const failed = messages.filter(m => m.status === 'failed').length;
            setProgress({ sent, failed, total: messages.length, status });
        }
        socket.on('campaign_update', onCampaignUpdate);
        return () => socket.off('campaign_update', onCampaignUpdate);
    }, []);

    useEffect(() => {
        Promise.all([
            api.getDevices(),
            api.getContacts(),
            api.getGroups(),
            api.getTemplates(),
        ]).then(([d, c, g, t]) => {
            setDevices(d.filter(x => x.status === 'connected'));
            setContacts(c);
            setGroups(g);
            setTemplates(t);
        }).catch(() => {});
    }, []);

    function toggleContact(id) {
        setSelContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
    function toggleGroup(id) {
        setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
    function pickTemplate(id) {
        setTemplateId(id);
        const tpl = templates.find(t => t.id === id);
        if (tpl) setMessage(tpl.content || '');
    }
    function changeMediaType(val) {
        setMediaType(val);
        setFile(null);
        if (fileRef.current) fileRef.current.value = '';
    }
    function recipientCount() {
        if (recipientTab === 'contacts') return selContacts.length;
        if (recipientTab === 'groups')   return selGroups.length;
        return manualNums.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length;
    }

    async function handleSend() {
        if (!deviceId)                               { showToast('Please select a device', 'error'); return; }
        if (recipientCount() === 0)                  { showToast('Please select at least one recipient', 'error'); return; }
        if (msgType === 'text' && !message.trim())   { showToast('Message text is required', 'error'); return; }
        if (msgType === 'template' && !templateId)   { showToast('Please select a template', 'error'); return; }

        setSending(true);
        setResult(null);
        setProgress(null);
        activeCampaignRef.current = null;
        try {
            const fd = new FormData();
            fd.append('deviceId', deviceId);
            fd.append('messageType', msgType);
            if (msgType === 'template') fd.append('templateId', templateId);
            fd.append('message', message);
            fd.append('minDelay', minDelay);
            fd.append('maxDelay', maxDelay);
            if (mediaType !== 'none') fd.append('mediaType', mediaType);
            if (recipientTab === 'contacts') selContacts.forEach(id => fd.append('contactIds', id));
            else if (recipientTab === 'groups') selGroups.forEach(id => fd.append('groupIds', id));
            else fd.append('numbers', manualNums);
            if (file && mediaType !== 'none') fd.append('attachment', file);

            const res = await api.sendSingle(fd);
            if (res.error) throw new Error(res.error);
            activeCampaignRef.current = res.campaignId;
            setResult({ total: res.total });
            setProgress({ sent: 0, failed: 0, total: res.total, status: 'running' });
            showToast('Sending to ' + res.total + ' recipient' + (res.total !== 1 ? 's' : '') + '...', 'success');
        } catch (err) {
            showToast(err.message || 'Send failed', 'error');
        } finally {
            setSending(false);
        }
    }

    const filteredContacts = contacts.filter(c =>
        !contactSearch ||
        (c.name || '').toLowerCase().includes(contactSearch.toLowerCase()) ||
        (c.number || '').includes(contactSearch)
    );
    const filteredGroups = groups.filter(g =>
        !groupSearch || (g.name || '').toLowerCase().includes(groupSearch.toLowerCase())
    );
    const cnt = recipientCount();

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Single Message</h1>
                    <p className="page-sub">Send a message to contacts, groups, or custom numbers</p>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}>

                {/* 1 — Device */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Select Device / Instance</span>
                    </div>
                    <div className="card-body">
                        {devices.length === 0 ? (
                            <p style={{ color: 'var(--txt3)', fontSize: 13 }}>
                                No connected devices. Go to <strong>Devices</strong> and connect one first.
                            </p>
                        ) : (
                            <select value={deviceId} onChange={e => setDeviceId(e.target.value)} style={{ width: '100%' }}>
                                <option value="">-- Choose device --</option>
                                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        )}
                    </div>
                </div>

                {/* 2 — Recipients */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Select Recipients</span>
                        {cnt > 0 && (
                            <span style={{ fontSize: 12, background: 'var(--green-dim)', color: 'var(--green)', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
                                {cnt} selected
                            </span>
                        )}
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                            {['contacts', 'groups', 'manual'].map(tab => (
                                <button key={tab} onClick={() => setRecipientTab(tab)}
                                    className={'btn btn-sm ' + (recipientTab === tab ? 'btn-primary' : 'btn-ghost')}>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            ))}
                        </div>

                        {recipientTab === 'contacts' && (
                            <div>
                                <input type="text" placeholder="Search contacts..." value={contactSearch}
                                    onChange={e => setCS(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
                                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {filteredContacts.length === 0
                                        ? <p style={{ color: 'var(--txt3)', fontSize: 13 }}>No contacts found.</p>
                                        : filteredContacts.map(c => (
                                            <label key={c.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                                                borderRadius: 'var(--radius)', cursor: 'pointer',
                                                background: selContacts.includes(c.id) ? 'var(--green-dim)' : 'transparent',
                                                border: '1.5px solid ' + (selContacts.includes(c.id) ? 'rgba(37,211,102,.25)' : 'transparent'),
                                            }}>
                                                <input type="checkbox" checked={selContacts.includes(c.id)}
                                                    onChange={() => toggleContact(c.id)}
                                                    style={{ accentColor: 'var(--green)', width: 16, height: 16, flexShrink: 0 }} />
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{c.name || c.number}</span>
                                                <span style={{ color: 'var(--txt3)', fontSize: 12, marginLeft: 'auto' }}>{c.number}</span>
                                            </label>
                                        ))
                                    }
                                </div>
                                {filteredContacts.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button className="btn btn-xs btn-ghost" onClick={() => setSelContacts(filteredContacts.map(c => c.id))}>Select All</button>
                                        <button className="btn btn-xs btn-ghost" onClick={() => setSelContacts([])}>Clear</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {recipientTab === 'groups' && (
                            <div>
                                <input type="text" placeholder="Search groups..." value={groupSearch}
                                    onChange={e => setGS(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
                                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {filteredGroups.length === 0
                                        ? <p style={{ color: 'var(--txt3)', fontSize: 13 }}>No groups found.</p>
                                        : filteredGroups.map(g => (
                                            <label key={g.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                                                borderRadius: 'var(--radius)', cursor: 'pointer',
                                                background: selGroups.includes(g.id) ? 'var(--blue-dim)' : 'transparent',
                                                border: '1.5px solid ' + (selGroups.includes(g.id) ? 'rgba(74,158,255,.25)' : 'transparent'),
                                            }}>
                                                <input type="checkbox" checked={selGroups.includes(g.id)}
                                                    onChange={() => toggleGroup(g.id)}
                                                    style={{ accentColor: 'var(--blue)', width: 16, height: 16, flexShrink: 0 }} />
                                                <span style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</span>
                                                <span style={{ color: 'var(--txt3)', fontSize: 12, marginLeft: 'auto' }}>{(g.contactIds || []).length} contacts</span>
                                            </label>
                                        ))
                                    }
                                </div>
                                {filteredGroups.length > 0 && (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                        <button className="btn btn-xs btn-ghost" onClick={() => setSelGroups(filteredGroups.map(g => g.id))}>Select All</button>
                                        <button className="btn btn-xs btn-ghost" onClick={() => setSelGroups([])}>Clear</button>
                                    </div>
                                )}
                            </div>
                        )}

                        {recipientTab === 'manual' && (
                            <div>
                                <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>
                                    Phone numbers (one per line or comma-separated, digits only)
                                </label>
                                <textarea rows={7} value={manualNums} onChange={e => setManualNums(e.target.value)}
                                    placeholder="911234567890&#10;442012345678&#10;..."
                                    style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }} />
                            </div>
                        )}
                    </div>
                </div>

                {/* 3 — Message Type */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Message Type</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { key: 'text',     label: 'Text Message' },
                                { key: 'template', label: 'Template Message' },
                            ].map(opt => (
                                <button key={opt.key} onClick={() => setMsgType(opt.key)} style={{
                                    padding: '14px 12px', borderRadius: 'var(--radius)', cursor: 'pointer',
                                    border: '2px solid ' + (msgType === opt.key ? 'var(--green)' : 'var(--border)'),
                                    background: msgType === opt.key ? 'var(--green-dim)' : 'var(--bg2)',
                                    textAlign: 'center', transition: 'all .15s',
                                }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: msgType === opt.key ? 'var(--green)' : 'var(--txt2)' }}>
                                        {opt.label}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 4 — Message Content */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Message Content</span>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {msgType === 'template' && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>Template</label>
                                <select value={templateId} onChange={e => pickTemplate(e.target.value)} style={{ width: '100%' }}>
                                    <option value="">-- Select template --</option>
                                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>Message Text</label>
                            <textarea rows={5} placeholder="Type your message..." value={message}
                                onChange={e => setMessage(e.target.value)} style={{ width: '100%', resize: 'vertical' }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>Attachment Type</label>
                            <select value={mediaType} onChange={e => changeMediaType(e.target.value)}
                                style={{ width: '100%', marginBottom: mediaType !== 'none' ? 10 : 0 }}>
                                {MEDIA_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            {mediaType !== 'none' && (
                                <div style={{
                                    border: '2px dashed var(--border2)', borderRadius: 'var(--radius)',
                                    padding: '18px 16px', background: 'var(--bg2)', textAlign: 'center', cursor: 'pointer',
                                }} onClick={() => { if (fileRef.current) fileRef.current.click(); }}>
                                    {file ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontSize: 13, fontWeight: 600 }}>{file.name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                            </div>
                                            <button className="btn btn-xs btn-danger" style={{ marginLeft: 'auto' }}
                                                onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ fontSize: 13, color: 'var(--txt2)', fontWeight: 500 }}>Click to choose {mediaType} file</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 4 }}>Max 64 MB</div>
                                        </div>
                                    )}
                                    <input ref={fileRef} type="file" accept={ACCEPT_MAP[mediaType]} style={{ display: 'none' }}
                                        onChange={e => setFile(e.target.files[0] || null)} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 5 — Delay */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Message Delay Settings</span>
                    </div>
                    <div className="card-body">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>Min Delay (ms)</label>
                                <input type="number" min={0} value={minDelay}
                                    onChange={e => setMinDelay(Number(e.target.value))} style={{ width: '100%' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: 13, color: 'var(--txt2)', display: 'block', marginBottom: 6 }}>Max Delay (ms)</label>
                                <input type="number" min={0} value={maxDelay}
                                    onChange={e => setMaxDelay(Number(e.target.value))} style={{ width: '100%' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 10 }}>
                            A random delay between min and max will be applied between messages.
                        </p>
                    </div>
                </div>

                {/* Live progress bar */}
                {progress && progress.status === 'running' && (
                    <div className="card">
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--txt2)', fontWeight: 500 }}>
                                <span>Sending messages...</span>
                                <span>{progress.sent + progress.failed}&nbsp;/&nbsp;{progress.total}</span>
                            </div>
                            <div style={{ background: 'var(--border)', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                                <div style={{
                                    background: 'var(--green)', height: '100%', borderRadius: 99,
                                    width: ((progress.sent + progress.failed) / Math.max(progress.total, 1) * 100) + '%',
                                    transition: 'width .4s ease',
                                }} />
                            </div>
                            {progress.failed > 0 && (
                                <p style={{ fontSize: 12, color: '#f56565', marginTop: 6 }}>{progress.failed} failed</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Completion banner */}
                {progress && (progress.status === 'completed' || progress.status === 'failed') && (
                    <div style={{
                        background: 'var(--green-dim)', border: '1.5px solid rgba(37,211,102,.25)',
                        borderRadius: 'var(--radius)', padding: '12px 16px', color: 'var(--green)', fontSize: 14, fontWeight: 500,
                    }}>
                        Done — {progress.sent} sent{progress.failed > 0 ? `, ${progress.failed} failed` : ''}
                    </div>
                )}

                <button className="btn btn-primary" style={{ padding: '12px', fontSize: 15, fontWeight: 700 }}
                    disabled={sending || (progress && progress.status === 'running')} onClick={handleSend}>
                    {sending ? 'Queuing...' : (progress && progress.status === 'running') ? 'Sending...' : ('Send Message' + (cnt > 0 ? ' (' + cnt + ')' : ''))}
                </button>

            </div>
        </div>
    );
}
