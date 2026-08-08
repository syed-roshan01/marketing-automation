import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import socket from '../socket.js';

/* ─── constants ────────────────────────────────────────────────────────────── */
const FIELD_TYPES = [
    { value:'text',         label:'Text Input',          icon:'✏️' },
    { value:'number',       label:'Number',              icon:'🔢' },
    { value:'email',        label:'Email',               icon:'📧' },
    { value:'phone',        label:'Phone Number',        icon:'📱' },
    { value:'textarea',     label:'Multi-line Text',     icon:'📝' },
    { value:'multi',        label:'Multi-Input',         icon:'📦' },
    { value:'dropdown',     label:'Dropdown Select',     icon:'▾' },
    { value:'radio',        label:'Radio Buttons',       icon:'🔘' },
    { value:'checkbox',     label:'Checkbox (multi)',    icon:'☑️' },
    { value:'date',         label:'Date Picker',         icon:'📅' },
    { value:'time',         label:'Time Picker',         icon:'🕐' },
    { value:'confirmation', label:'Confirmation Screen', icon:'✅' },
];
const TYPE_COLOR = {
    text:'#3b82f6',number:'#f59e0b',email:'#10b981',phone:'#8b5cf6',
    textarea:'#6366f1',multi:'#0ea5e9',dropdown:'#ec4899',radio:'#f97316',checkbox:'#14b8a6',
    date:'#a78bfa',time:'#fb923c',confirmation:'#22c55e',
};
const FORM_TEMPLATES = [
    {
        name:'Lead Capture',emoji:'🎯',
        description:'Capture prospect name, email, phone and interest area.',
        fields:[
            {type:'text', label:'What is your full name?',placeholder:'Full name',required:true},
            {type:'email',label:'Your email address?',placeholder:'you@example.com',required:true},
            {type:'phone',label:'Your phone number?',placeholder:'+91 9999999999',required:true},
            {type:'dropdown',label:'What are you interested in?',required:true,options:['Product Demo','Pricing Info','Partnership','Other']},
            {type:'confirmation',label:'Confirm your details',required:false},
        ],
        successMessage:'Thank you! Our team will reach out to you shortly.',
        triggerKeywords:['lead','interested'],
    },
    {
        name:'Appointment Booking',emoji:'📅',
        description:'Collect service, date & time for appointment scheduling.',
        fields:[
            {type:'text',label:'Your full name',placeholder:'Enter your name',required:true},
            {type:'phone',label:'Your phone number',placeholder:'+91 9999999999',required:true},
            {type:'dropdown',label:'Select service',required:true,options:['Consultation','Demo','Support','Onboarding']},
            {type:'date',label:'Preferred date',placeholder:'25 March 2026',required:true},
            {type:'time',label:'Preferred time',placeholder:'10:30 AM',required:true},
            {type:'textarea',label:'Additional notes',placeholder:'Any special requirements?',required:false},
            {type:'confirmation',label:'Confirm booking',required:false},
        ],
        successMessage:'✅ Appointment booked! We will confirm shortly.',
        triggerKeywords:['book','appointment','schedule'],
    },
    {
        name:'Demo Request',emoji:'🚀',
        description:'Gather company info and schedule a product demonstration.',
        fields:[
            {type:'text',label:'Your name',placeholder:'Full name',required:true},
            {type:'text',label:'Company name',placeholder:'Your company',required:true},
            {type:'email',label:'Business email',placeholder:'you@company.com',required:true},
            {type:'phone',label:'Contact number',placeholder:'+91 9999999999',required:true},
            {type:'dropdown',label:'Company size',required:true,options:['1-10','11-50','51-200','200+']},
            {type:'date',label:'Preferred demo date',placeholder:'25 March 2026',required:true},
            {type:'confirmation',label:'Confirm request',required:false},
        ],
        successMessage:'🎯 Demo request received! Our sales team will schedule your session.',
        triggerKeywords:['demo','request demo'],
    },
    {
        name:'Internship Application',emoji:'🎓',
        description:'Collect internship applications from candidates.',
        fields:[
            {type:'text',label:'Full name',placeholder:'Your full name',required:true},
            {type:'email',label:'Email address',placeholder:'you@example.com',required:true},
            {type:'phone',label:'Mobile number',placeholder:'+91 9999999999',required:true},
            {type:'dropdown',label:'Department applying for',required:true,options:['Engineering','Marketing','Sales','Design','HR','Operations']},
            {type:'dropdown',label:'Availability duration',required:true,options:['1 Month','2 Months','3 Months','6 Months']},
            {type:'textarea',label:'Why do you want this internship?',placeholder:'Brief description...',required:true},
            {type:'confirmation',label:'Submit application',required:false},
        ],
        successMessage:'📋 Application submitted! We will review and contact you soon.',
        triggerKeywords:['internship','apply','application'],
    },
    {
        name:'Event Registration',emoji:'📋',
        description:'Register attendees for events, workshops or webinars.',
        fields:[
            {type:'text',label:'Full name',placeholder:'Your full name',required:true},
            {type:'email',label:'Email address',placeholder:'you@example.com',required:true},
            {type:'phone',label:'Phone number',placeholder:'+91 9999999999',required:true},
            {type:'dropdown',label:'Select event',required:true,options:['Webinar – April 5','Workshop – April 12','Conference – April 20']},
            {type:'radio',label:'Attendance mode',required:true,options:['Online','In-person']},
            {type:'number',label:'Number of seats',placeholder:'1',required:true},
            {type:'confirmation',label:'Confirm registration',required:false},
        ],
        successMessage:'🎉 You are registered! Check your email for confirmation.',
        triggerKeywords:['register','event','webinar'],
    },
];

function uid() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ─── TypeBadge ─────────────────────────────────────────────────────────────── */
function TypeBadge({ type }) {
    const c = TYPE_COLOR[type] || '#64748b';
    return (
        <span style={{
            display:'inline-flex',alignItems:'center',gap:3,fontSize:10,
            padding:'2px 7px',borderRadius:999,background:c+'22',color:c,
            fontWeight:700,letterSpacing:.3,textTransform:'uppercase',whiteSpace:'nowrap',
        }}>
            {FIELD_TYPES.find(t => t.value === type)?.icon} {type}
        </span>
    );
}

/* ─── FieldModal ─────────────────────────────────────────────────────────────── */
function FieldModal({ field, onSave, onClose }) {
    const [f, setF]       = useState({ type:'text', label:'', placeholder:'', required:true, options:[], subFields:[], ...field });
    const [opt, setOpt]   = useState('');
    const [sfLabel, setSfLabel] = useState('');
    const [sfType,  setSfType]  = useState('text');
    const [err, setErr]   = useState('');
    const optRef          = useRef(null);
    const sfLabelRef      = useRef(null);
    const needsOpts       = ['dropdown','radio','checkbox'].includes(f.type);
    const upd = (k, v) => setF(p => ({ ...p, [k]: v }));

    function addOpt() {
        const o = String(opt).trim(); if (!o) return;
        setF(p => ({ ...p, options: [...(p.options || []), o] }));
        setOpt('');
        setTimeout(() => optRef.current?.focus(), 0);
    }
    function delOpt(i) {
        setF(p => ({ ...p, options: p.options.filter((_, x) => x !== i) }));
    }
    function moveOpt(i, d) {
        setF(p => {
            const a = [...(p.options || [])], j = i + d;
            if (j < 0 || j >= a.length) return p;
            [a[i], a[j]] = [a[j], a[i]];
            return { ...p, options: a };
        });
    }
    function addSubField() {
        const l = sfLabel.trim(); if (!l) return;
        setF(p => ({ ...p, subFields: [...(p.subFields || []), { id: uid(), label: l, type: sfType, required: true }] }));
        setSfLabel(''); setSfType('text');
        setTimeout(() => sfLabelRef.current?.focus(), 0);
    }
    function delSubField(i) {
        setF(p => ({ ...p, subFields: (p.subFields || []).filter((_, x) => x !== i) }));
    }
    function moveSubField(i, d) {
        setF(p => {
            const a = [...(p.subFields || [])], j = i + d;
            if (j < 0 || j >= a.length) return p;
            [a[i], a[j]] = [a[j], a[i]];
            return { ...p, subFields: a };
        });
    }
    function save() {
        if (f.type !== 'confirmation' && !String(f.label || '').trim()) { setErr('Question label is required.'); return; }
        if (needsOpts && (f.options || []).length < 2) { setErr('Add at least 2 options.'); return; }
        if (f.type === 'multi' && (f.subFields || []).length < 1) { setErr('Add at least 1 sub-field.'); return; }
        setErr('');
        onSave({ ...f, id: field?.id || uid(), options: (f.options || []).map(String) });
    }

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{ zIndex:1200 }}>
            <div className="modal modal-md">
                <div className="modal-header">
                    <span className="modal-title">{field?.id ? 'Edit Field' : 'Add Field'}</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ overflowY:'auto', maxHeight:'65vh' }}>
                    {/* field type grid */}
                    <div className="form-group">
                        <label>Field Type</label>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:6, marginTop:6 }}>
                            {FIELD_TYPES.map(t => {
                                const active = f.type === t.value;
                                const c = TYPE_COLOR[t.value] || '#64748b';
                                return (
                                    <button key={t.value} onClick={() => upd('type', t.value)} style={{
                                        padding:'8px 10px',borderRadius:8,cursor:'pointer',fontSize:12,
                                        fontWeight:active?700:400,textAlign:'left',
                                        display:'flex',alignItems:'center',gap:5,transition:'all .12s',
                                        border:`1.5px solid ${active ? c : 'var(--border)'}`,
                                        background:active ? c+'18' : 'var(--bg3)',
                                        color:active ? c : 'var(--txt2)',
                                    }}>
                                        <span>{t.icon}</span>{t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {f.type === 'confirmation' ? (
                        <div>
                            <div style={{ padding:'10px 14px', background:'#22c55e10', border:'1px solid #22c55e30', borderRadius:10, fontSize:13, color:'var(--txt2)', lineHeight:1.5, marginBottom:14 }}>
                                <strong style={{ color:'#22c55e' }}>✅ Confirmation Screen</strong><br />
                                Shows a summary of answers then presents two buttons for the user to confirm or restart.
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>✅ Confirm Button Label</label>
                                    <input
                                        value={f.confirmLabel ?? '✅ Yes, Confirm'}
                                        onChange={e => upd('confirmLabel', e.target.value)}
                                        placeholder="✅ Yes, Confirm" />
                                </div>
                                <div className="form-group">
                                    <label>🔄 Restart Button Label</label>
                                    <input
                                        value={f.restartLabel ?? '🔄 No, Restart'}
                                        onChange={e => upd('restartLabel', e.target.value)}
                                        placeholder="🔄 No, Restart" />
                                </div>
                            </div>
                            <p style={{ margin:'-6px 0 0', fontSize:11, color:'var(--txt3)' }}>
                                These are the button labels shown to the user on WhatsApp. Keep them short (max ~20 characters).
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="form-group">
                                <label>Question / Label *</label>
                                <input value={f.label} onChange={e => upd('label', e.target.value)}
                                    placeholder="e.g. What is your full name?" autoFocus />
                            </div>
                            <div className="form-group">
                                <label>Placeholder / Hint</label>
                                <input value={f.placeholder} onChange={e => upd('placeholder', e.target.value)}
                                    placeholder="Optional hint shown to user" />
                            </div>
                            <div className="form-group" style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <input type="checkbox" checked={f.required} onChange={e => upd('required', e.target.checked)}
                                    style={{ width:'auto', accentColor:'var(--green)' }} />
                                <label style={{ margin:0, cursor:'pointer' }}>Required field</label>
                            </div>
                        </>
                    )}

                    {needsOpts && (
                        <div className="form-group">
                            <label>Options <span style={{ color:'var(--txt3)', fontSize:10, fontWeight:400, textTransform:'none' }}>(min 2)</span></label>
                            <div style={{ marginBottom:8 }}>
                                {(f.options || []).map((o, i) => (
                                    <div key={i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5,
                                        padding:'7px 10px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border)' }}>
                                        <span style={{ flex:1, fontSize:13, color:'var(--txt)' }}>{String(o)}</span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveOpt(i, -1)} disabled={i === 0}>↑</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveOpt(i, 1)} disabled={i === (f.options || []).length - 1}>↓</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => delOpt(i)}>✕</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display:'flex', gap:8 }}>
                                <input ref={optRef} value={opt} onChange={e => setOpt(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addOpt()}
                                    placeholder="Type option, press Enter…" style={{ flex:1 }} />
                                <button className="btn btn-ghost" style={{ flexShrink:0 }} onClick={addOpt}>Add</button>
                            </div>
                        </div>
                    )}

                    {f.type === 'multi' && (
                        <div className="form-group">
                            <label>Sub-fields <span style={{ color:'var(--txt3)', fontSize:10, fontWeight:400, textTransform:'none' }}>(min 1)</span></label>
                            <div style={{ padding:'9px 13px', background:'#0ea5e910', border:'1px solid #0ea5e930', borderRadius:9, fontSize:12, color:'#0ea5e9', marginBottom:10, lineHeight:1.5 }}>
                                📦 The user replies in a single message with all values separated by commas, in the order defined below.
                            </div>
                            <div style={{ marginBottom:8 }}>
                                {(f.subFields || []).map((sf, i) => (
                                    <div key={sf.id || i} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5,
                                        padding:'7px 10px', background:'var(--bg3)', borderRadius:8, border:'1px solid var(--border)' }}>
                                        <span style={{ flex:1, fontSize:13, color:'var(--txt)' }}>
                                            <strong>{i + 1}. {sf.label}</strong>
                                            <span style={{ color:'var(--txt3)', marginLeft:6, fontSize:11 }}>({sf.type})</span>
                                            {sf.required === false && <span style={{ color:'var(--txt3)', marginLeft:4, fontSize:10 }}>optional</span>}
                                        </span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveSubField(i, -1)} disabled={i === 0}>↑</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveSubField(i, 1)} disabled={i === (f.subFields||[]).length - 1}>↓</button>
                                        <button className="btn btn-danger btn-sm" onClick={() => delSubField(i)}>✕</button>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 110px auto', gap:6 }}>
                                <input ref={sfLabelRef} value={sfLabel} onChange={e => setSfLabel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addSubField()}
                                    placeholder="Sub-field label (e.g. Name)" />
                                <select value={sfType} onChange={e => setSfType(e.target.value)}>
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="email">Email</option>
                                    <option value="phone">Phone</option>
                                    <option value="date">Date</option>
                                    <option value="time">Time</option>
                                </select>
                                <button className="btn btn-ghost" style={{ flexShrink:0 }} onClick={addSubField}>Add</button>
                            </div>
                        </div>
                    )}
                </div>

                {err && <div style={{ padding:'0 22px 10px', color:'var(--red)', fontSize:12 }}>⚠️ {err}</div>}
                <div className="modal-footer">
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={save}>
                        {field?.id ? 'Update Field' : 'Add Field'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── FormDrawer ─────────────────────────────────────────────────────────────── */
function FormDrawer({ form: init, devices, onSave, onClose }) {
    const blank = { name:'', description:'', sessionIds:[], targetType:'all', triggerKeywords:'', matchType:'exact', successMessage:'', webhookUrl:'', active:true };
    const [meta, setMeta] = useState(init ? {
        ...blank,
        name: init.name || '',
        description: init.description || '',
        sessionIds: init.sessionIds || [],
        targetType: init.targetType || 'all',
        triggerKeywords: (init.triggerKeywords || []).join(', '),
        matchType: init.matchType || 'exact',
        successMessage: init.successMessage || '',
        webhookUrl: init.webhookUrl || '',
        active: init.active !== false,
    } : blank);

    const [fields, setFields]   = useState(init?.fields || []);
    const [modal, setModal]     = useState(null);
    const [saving, setSaving]   = useState(false);
    const [err, setErr]         = useState('');
    const [section, setSection] = useState('settings');

    const M   = (k, v) => setMeta(p => ({ ...p, [k]: v }));
    const connected = devices.filter(d => d.status === 'connected');

    function fieldSaved(saved) {
        setFields(fs => modal?.field ? fs.map(f => f.id === saved.id ? saved : f) : [...fs, { ...saved, order: fs.length }]);
        setModal(null);
    }
    function removeField(id) { setFields(fs => fs.filter(f => f.id !== id)); }
    function moveField(i, d) {
        const a = [...fields], j = i + d;
        if (j < 0 || j >= a.length) return;
        [a[i], a[j]] = [a[j], a[i]]; setFields(a);
    }
    async function save() {
        setErr('');
        if (!meta.name.trim()) { setErr('Form name is required.'); return; }
        if (fields.length === 0) { setErr('Add at least one field.'); return; }
        setSaving(true);
        try {
            await onSave({
                ...meta,
                triggerKeywords: meta.triggerKeywords.split(',').map(k => k.trim()).filter(Boolean),
                fields: fields.map((f, i) => ({ ...f, order: i })),
            });
        } catch (e) { setErr(e.message || 'Save failed'); } finally { setSaving(false); }
    }

    const TABS = [{ key:'settings', label:'⚙️  Settings' }, { key:'fields', label:`📋  Fields (${fields.length})` }];

    return (
        <>
            {modal && <FieldModal field={modal.field || null} onSave={fieldSaved} onClose={() => setModal(null)} />}
            {/* backdrop */}
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:600 }} onClick={onClose} />
            {/* panel */}
            <div style={{
                position:'fixed', top:0, right:0, zIndex:700,
                width:'min(580px,100vw)', height:'100dvh',
                background:'var(--bg2)', borderLeft:'1.5px solid var(--border)',
                boxShadow:'-8px 0 40px rgba(0,0,0,.35)',
                display:'flex', flexDirection:'column',
            }}>
                {/* header */}
                <div style={{ padding:'18px 22px', borderBottom:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <div>
                        <h2 style={{ margin:'0 0 2px', fontSize:17, fontWeight:700, color:'var(--txt)' }}>{init ? 'Edit Form' : 'New Form'}</h2>
                        <p style={{ margin:0, fontSize:12, color:'var(--txt3)' }}>Configure this conversational WhatsApp form</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
                </div>

                {/* section tabs */}
                <div style={{ display:'flex', borderBottom:'1.5px solid var(--border)', padding:'0 22px', flexShrink:0 }}>
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => setSection(t.key)} style={{
                            padding:'10px 16px', background:'none', border:'none', cursor:'pointer',
                            fontSize:13, fontWeight:section === t.key ? 700 : 400,
                            color:section === t.key ? 'var(--green)' : 'var(--txt3)',
                            borderBottom:section === t.key ? '2px solid var(--green)' : '2px solid transparent',
                            marginBottom:-1, transition:'color .12s',
                        }}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* body */}
                <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
                    {err && (
                        <div style={{ background:'var(--red-dim)', border:'1px solid rgba(249,96,96,.3)', borderRadius:8, padding:'10px 14px', color:'var(--red)', fontSize:13, marginBottom:14 }}>
                            {err}
                        </div>
                    )}

                    {section === 'settings' && (
                        <div>
                            <div className="form-group">
                                <label>Form Name *</label>
                                <input value={meta.name} onChange={e => M('name', e.target.value)} placeholder="e.g. Lead Capture Form" />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input value={meta.description} onChange={e => M('description', e.target.value)} placeholder="Shown to user when the form starts" />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Trigger Keywords</label>
                                    <input value={meta.triggerKeywords} onChange={e => M('triggerKeywords', e.target.value)} placeholder="book, apply, register" />
                                    <p style={{ margin:'3px 0 0', fontSize:11, color:'var(--txt3)' }}>Comma-separated</p>
                                </div>
                                <div className="form-group">
                                    <label>Match Type</label>
                                    <select value={meta.matchType} onChange={e => M('matchType', e.target.value)}>
                                        <option value="exact">Exact match</option>
                                        <option value="contains">Contains keyword</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Target Chat</label>
                                    <select value={meta.targetType} onChange={e => M('targetType', e.target.value)}>
                                        <option value="all">All chats</option>
                                        <option value="individual">Individual only</option>
                                        <option value="group">Group only</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Status</label>
                                    <select value={meta.active ? 'active' : 'inactive'} onChange={e => M('active', e.target.value === 'active')}>
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Devices</label>
                                {connected.length === 0
                                    ? <p style={{ fontSize:13, color:'var(--txt3)', margin:'4px 0 0' }}>No connected devices — form will apply to all</p>
                                    : <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
                                        {connected.map(d => (
                                            <label key={d.id} style={{
                                                display:'flex', alignItems:'center', gap:6, cursor:'pointer',
                                                background:'var(--bg3)', padding:'7px 12px', borderRadius:8,
                                                border:`1.5px solid ${(meta.sessionIds || []).includes(d.id) ? 'var(--green)' : 'var(--border)'}`,
                                                fontSize:13, color:'var(--txt)', transition:'border-color .12s',
                                            }}>
                                                <input type="checkbox" style={{ width:'auto', accentColor:'var(--green)', margin:0 }}
                                                    checked={(meta.sessionIds || []).includes(d.id)}
                                                    onChange={e => M('sessionIds', e.target.checked
                                                        ? [...(meta.sessionIds || []), d.id]
                                                        : (meta.sessionIds || []).filter(id => id !== d.id))} />
                                                📱 {d.name}
                                            </label>
                                        ))}
                                    </div>
                                }
                            </div>
                            <div className="form-group">
                                <label>Success Message</label>
                                <textarea value={meta.successMessage} onChange={e => M('successMessage', e.target.value)} rows={2}
                                    placeholder="Thank you! Your response has been recorded." />
                            </div>
                            <div className="form-group">
                                <label>Webhook URL <span style={{ color:'var(--txt3)', fontSize:10, textTransform:'none', fontWeight:400 }}>optional</span></label>
                                <input value={meta.webhookUrl} onChange={e => M('webhookUrl', e.target.value)} placeholder="https://your-server.com/webhook" />
                                <p style={{ margin:'3px 0 0', fontSize:11, color:'var(--txt3)' }}>POSTs the full submission as JSON when completed</p>
                            </div>
                        </div>
                    )}

                    {section === 'fields' && (
                        <div>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                                <p style={{ margin:0, fontSize:12, color:'var(--txt3)' }}>Click to edit · reorder with arrows</p>
                                <button className="btn btn-primary btn-sm" onClick={() => setModal({ field:null })}>+ Add Field</button>
                            </div>

                            {fields.length === 0 && (
                                <div onClick={() => setModal({ field:null })} className="empty-state" style={{
                                    border:'2px dashed var(--border)', borderRadius:12, cursor:'pointer', transition:'border-color .15s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--green)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                                    <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
                                    <p style={{ margin:0 }}>No fields yet — click to add your first</p>
                                </div>
                            )}

                            {fields.map((field, i) => (
                                <div key={field.id || i} style={{
                                    display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
                                    background:'var(--bg3)', borderRadius:10, border:'1px solid var(--border)',
                                    marginBottom:7, transition:'box-shadow .12s',
                                }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                    <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveField(i, -1)} disabled={i === 0} style={{ padding:'1px 5px', fontSize:10 }}>▲</button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} style={{ padding:'1px 5px', fontSize:10 }}>▼</button>
                                    </div>
                                    <span style={{ fontSize:11, fontWeight:700, color:'var(--txt3)', minWidth:18, textAlign:'center' }}>{i + 1}</span>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3, flexWrap:'wrap' }}>
                                            <TypeBadge type={field.type} />
                                            {field.required && <span style={{ fontSize:10, color:'var(--red)', fontWeight:600 }}>required</span>}
                                        </div>
                                        <p style={{ margin:0, fontSize:13, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                            {field.type === 'confirmation'
                                                ? <span style={{ color:'#22c55e' }}>✅ Confirmation Screen</span>
                                                : (field.label || <em style={{ color:'var(--txt3)' }}>Untitled field</em>)}
                                        </p>
                                        {field.options?.length > 0 && (
                                            <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--txt3)' }}>
                                                {field.options.slice(0, 3).map(String).join(' · ')}{field.options.length > 3 ? ` +${field.options.length - 3} more` : ''}
                                            </p>
                                        )}
                                        {field.type === 'multi' && field.subFields?.length > 0 && (
                                            <p style={{ margin:'2px 0 0', fontSize:11, color:'var(--txt3)' }}>
                                                📦 {field.subFields.slice(0, 3).map(sf => sf.label).join(' · ')}{field.subFields.length > 3 ? ` +${field.subFields.length - 3} more` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <button className="btn btn-blue btn-sm" style={{ flexShrink:0 }} onClick={() => setModal({ field })}>Edit</button>
                                    <button className="btn btn-danger btn-sm" style={{ flexShrink:0 }} onClick={() => removeField(field.id)}>✕</button>
                                </div>
                            ))}

                            {fields.length > 0 && (
                                <div style={{ marginTop:10, padding:'10px 14px', background:'var(--blue-dim)', border:'1px solid rgba(74,158,255,.25)', borderRadius:9, fontSize:12, color:'var(--blue)' }}>
                                    💡 Add a <strong>Confirmation Screen</strong> as the last field so users can review before submitting.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* footer */}
                <div style={{ padding:'14px 22px', borderTop:'1.5px solid var(--border)', display:'flex', gap:10, flexShrink:0 }}>
                    <button className="btn btn-primary" style={{ flex:1 }} onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : (init ? 'Update Form' : 'Create Form')}
                    </button>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </>
    );
}

/* ─── FormCard ───────────────────────────────────────────────────────────────── */
function FormCard({ form, onEdit, onToggle, onDelete }) {
    return (
        <div className="card" style={{ display:'flex', flexDirection:'column' }}>
            <div className="card-header">
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <h3 style={{ margin:0, fontSize:14, fontWeight:700, color:'var(--txt)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {form.name}
                        </h3>
                        <span className={`status-badge ${form.active ? 'connected' : 'disconnected'}`}>
                            <span className="status-dot" style={{ width:6, height:6, borderRadius:'50%', background:'currentColor' }} />
                            {form.active ? 'Live' : 'Off'}
                        </span>
                    </div>
                    {form.description && (
                        <p style={{ margin:'3px 0 0', fontSize:12, color:'var(--txt3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {form.description}
                        </p>
                    )}
                </div>
            </div>
            <div className="card-body" style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
                {/* stats row */}
                <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--txt3)', flexWrap:'wrap' }}>
                    <span>🧩 {form.fields?.length || 0} fields</span>
                    <span>📊 {form.totalSubmissions || 0} submissions</span>
                    {form.triggerKeywords?.length > 0 && (
                        <span>🔑 {form.triggerKeywords.slice(0, 2).join(', ')}{form.triggerKeywords.length > 2 ? ` +${form.triggerKeywords.length - 2}` : ''}</span>
                    )}
                </div>
                {/* type badges */}
                {form.fields?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {form.fields.slice(0, 6).map((f, i) => <TypeBadge key={i} type={f.type} />)}
                        {form.fields.length > 6 && <span style={{ fontSize:10, color:'var(--txt3)', alignSelf:'center' }}>+{form.fields.length - 6}</span>}
                    </div>
                )}
                {/* actions */}
                <div style={{ display:'flex', gap:7, marginTop:'auto', flexWrap:'wrap' }}>
                    <button className={`btn btn-sm ${form.active ? 'btn-danger' : 'btn-success'}`} onClick={onToggle}>
                        {form.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn btn-blue btn-sm" onClick={onEdit}>Edit</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft:'auto' }} onClick={onDelete}>Delete</button>
                </div>
            </div>
        </div>
    );
}

/* ─── ResponsesView ──────────────────────────────────────────────────────────── */
function ResponsesView({ forms }) {
    const { showToast, showConfirm } = useApp();
    const [subs,      setSubs]      = useState([]);
    const [total,     setTotal]     = useState(0);
    const [page,      setPage]      = useState(1);
    const [loading,   setLoading]   = useState(false);
    const [fFilt,     setFFilt]     = useState('all');
    const [sFilt,     setSFilt]     = useState('all');
    const [q,         setQ]         = useState('');
    const [expanded,  setExpanded]  = useState(null);
    const [newBanner, setNewBanner] = useState(0);
    const [newIds,    setNewIds]    = useState(new Set());
    const [updatedAt, setUpdatedAt] = useState(null);
    const LIMIT = 25;

    // Refs so the socket callback always sees latest state without re-registering
    const fFiltRef = useRef('all'), sFiltRef = useRef('all'), qRef = useRef(''), pageRef = useRef(1);
    useEffect(() => { fFiltRef.current = fFilt; }, [fFilt]);
    useEffect(() => { sFiltRef.current = sFilt; }, [sFilt]);
    useEffect(() => { qRef.current = q; }, [q]);
    useEffect(() => { pageRef.current = page; }, [page]);

    async function load(pg = 1, silent = false) {
        if (!silent) setLoading(true);
        try {
            const p = { page: pg, limit: LIMIT };
            if (fFiltRef.current !== 'all') p.formId = fFiltRef.current;
            if (sFiltRef.current !== 'all') p.status = sFiltRef.current;
            if (qRef.current.trim()) p.search = qRef.current.trim();
            const d = await api.getFormSubmissions(p);
            setSubs(d.items || []); setTotal(d.total || 0); setPage(pg);
            setUpdatedAt(Date.now()); setNewBanner(0); setNewIds(new Set());
        } catch { } finally { if (!silent) setLoading(false); }
    }

    useEffect(() => { load(1); }, [fFilt, sFilt]);

    // Silent background poll every 30s
    useEffect(() => {
        const t = setInterval(() => load(pageRef.current, true), 30_000);
        return () => clearInterval(t);
    }, []);

    // Socket: instant update when a new submission arrives
    useEffect(() => {
        function onNew({ submission }) {
            const ff = fFiltRef.current, sf = sFiltRef.current;
            const sq = qRef.current.trim().toLowerCase();
            const matchesForm   = ff === 'all' || ff === submission.formId;
            const matchesStatus = sf === 'all' || sf === submission.status;
            const matchesSearch = !sq ||
                (submission.phone || '').toLowerCase().includes(sq) ||
                (submission.formName || '').toLowerCase().includes(sq);
            if (pageRef.current === 1 && matchesForm && matchesStatus && matchesSearch) {
                setSubs(prev => prev.some(s => s.id === submission.id) ? prev : [submission, ...prev.slice(0, LIMIT - 1)]);
                setTotal(t => t + 1);
                setUpdatedAt(Date.now());
                setNewIds(prev => new Set([...prev, submission.id]));
                setTimeout(() => setNewIds(prev => { const n = new Set(prev); n.delete(submission.id); return n; }), 8000);
            } else {
                setNewBanner(b => b + 1);
            }
        }
        socket.on('form_new_submission', onNew);
        return () => socket.off('form_new_submission', onNew);
    }, []);

    async function del(id) {
        if (!(await showConfirm('Delete Submission', 'Remove this submission permanently?', { danger:true, confirmLabel:'Delete' }))) return;
        try { await api.deleteFormSubmission(id); await load(page); showToast('Deleted'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    function fmtTime(ts) {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) +
               ', ' + d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
    }

    const pages = Math.max(1, Math.ceil(total / LIMIT));

    return (
        <div>
            {/* ── Top bar: live indicator + refresh */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'var(--green)', fontWeight:600 }}>
                        <span className="status-dot" style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 5px var(--green)', animation:'glow 2s ease-in-out infinite', display:'inline-block', flexShrink:0 }} />
                        Live
                    </div>
                    {updatedAt && (
                        <span style={{ fontSize:12, color:'var(--txt3)' }}>
                            Updated {new Date(updatedAt).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })}
                        </span>
                    )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => load(page)} disabled={loading}>↺ Refresh</button>
            </div>

            {/* ── Filter bar */}
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                <select value={fFilt} onChange={e => setFFilt(e.target.value)} style={{ width:180 }}>
                    <option value="all">All Forms</option>
                    {forms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <select value={sFilt} onChange={e => setSFilt(e.target.value)} style={{ width:150 }}>
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="abandoned">Abandoned</option>
                </select>
                <div style={{ display:'flex', gap:8, flex:1, minWidth:180 }}>
                    <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
                        placeholder="Search phone or answer…" style={{ flex:1 }} />
                    <button className="btn btn-ghost btn-sm" onClick={() => load(1)}>Search</button>
                </div>
            </div>

            {/* ── New-arrivals banner */}
            {newBanner > 0 && (
                <div onClick={() => load(1)} style={{
                    background:'var(--green-dim)', border:'1px solid rgba(37,211,102,.3)', borderRadius:10,
                    padding:'10px 16px', fontSize:13, color:'var(--green)', fontWeight:600,
                    marginBottom:12, cursor:'pointer', display:'flex', alignItems:'center', gap:8,
                }}>
                    <span style={{ fontSize:16 }}>↑</span>
                    {newBanner} new response{newBanner !== 1 ? 's' : ''} arrived — click to show
                </div>
            )}

            {/* ── Count + clear */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontSize:13, color:'var(--txt3)' }}>{total} submission{total !== 1 ? 's' : ''}</span>
                {total > 0 && (
                    <button className="btn btn-danger btn-sm" onClick={async () => {
                        if (await showConfirm('Clear All', 'Delete all submissions for current filters?', { danger:true, confirmLabel:'Clear All' })) {
                            try { await api.clearFormSubmissions(fFilt !== 'all' ? fFilt : undefined); await load(1); showToast('Cleared'); }
                            catch (e) { showToast(e.message, 'error'); }
                        }
                    }}>Clear All</button>
                )}
            </div>

            {loading && <div className="empty-state">Loading…</div>}
            {!loading && subs.length === 0 && (
                <div className="empty-state">
                    <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
                    No submissions found
                </div>
            )}

            {/* ── Submission rows */}
            {subs.map(s => {
                const form     = forms.find(f => f.id === s.formId);
                const entries  = Object.entries(s.responses || {});
                const isOpen   = expanded === s.id;
                const isNew    = newIds.has(s.id);
                const isDone   = s.status === 'completed';
                const accentColor = isDone ? 'var(--green)' : '#f97316';
                return (
                    <div key={s.id} style={{
                        marginBottom:10, borderRadius:12,
                        border:`1px solid ${isNew ? 'rgba(37,211,102,.5)' : 'var(--border)'}`,
                        borderLeft:`3px solid ${accentColor}`,
                        background:'var(--bg2)',
                        boxShadow: isNew ? '0 0 0 3px rgba(37,211,102,.08)' : 'none',
                        transition:'box-shadow .4s, border-color .4s',
                        overflow:'hidden',
                    }}>
                        {/* ── Header row */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: isOpen ? '1px solid var(--border)' : 'none', background:'var(--bg3)', cursor:'pointer' }} onClick={() => setExpanded(isOpen ? null : s.id)}>
                            {/* Avatar */}
                            <div style={{
                                width:34, height:34, borderRadius:'50%', flexShrink:0,
                                background: isDone ? 'var(--green-dim)' : 'rgba(249,115,22,.1)',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontSize:11, fontWeight:800, color:accentColor,
                            }}>
                                {(s.phone || '?').slice(-2)}
                            </div>
                            <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                <span style={{ fontWeight:700, fontSize:13, color:'var(--txt)' }}>{s.phone}</span>
                                {isNew && (
                                    <span style={{
                                        fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:99,
                                        background:'var(--green)', color:'#fff', letterSpacing:.6, textTransform:'uppercase',
                                    }}>NEW</span>
                                )}
                                <span style={{
                                    fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:99, textTransform:'uppercase', letterSpacing:.3,
                                    background: isDone ? 'var(--green-dim)' : 'rgba(249,115,22,.1)',
                                    color:accentColor,
                                }}>{s.status}</span>
                                {(s.formName || form?.name) && (
                                    <span style={{ fontSize:11, color:'var(--txt3)', background:'var(--bg2)', padding:'2px 9px', borderRadius:99, border:'1px solid var(--border)' }}>
                                        {s.formName || form?.name}
                                    </span>
                                )}
                                <span style={{ fontSize:11, color:'var(--txt3)', marginLeft:'auto' }} title={new Date(s.timestamp).toLocaleString()}>
                                    🕐 {fmtTime(s.timestamp)}
                                </span>
                            </div>
                            <div style={{ display:'flex', gap:7, alignItems:'center', flexShrink:0 }}>
                                <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); del(s.id); }}>Delete</button>
                                <span style={{ fontSize:11, color:'var(--txt3)', userSelect:'none' }}>{isOpen ? '▲' : '▼'}</span>
                            </div>
                        </div>

                        {/* ── Answers grid (expanded) */}
                        {isOpen && entries.length === 0 ? (
                            <div style={{ padding:'12px 16px', fontSize:12, color:'var(--txt3)', fontStyle:'italic' }}>No answers recorded</div>
                        ) : isOpen ? (
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:0 }}>
                                {entries.map(([fid, val], i) => {
                                    const fl = form?.fields?.find(f => f.id === fid);
                                    let flLabel = fl?.label;
                                    if (!flLabel) {
                                        for (const mf of (form?.fields || [])) {
                                            if (mf.type === 'multi') {
                                                const sf = (mf.subFields || []).find(s => s.id === fid);
                                                if (sf) { flLabel = sf.label; break; }
                                            }
                                        }
                                    }
                                    const isLast = i === entries.length - 1;
                                    const col = i % 2 === 0;
                                    return (
                                        <div key={fid} style={{
                                            padding:'10px 14px',
                                            borderRight:'1px solid var(--border)',
                                            borderBottom: isLast && entries.length % 2 !== 0 ? 'none' : '1px solid var(--border)',
                                            background: col ? 'var(--bg2)' : 'var(--bg)',
                                        }}>
                                            <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:.5, color:'var(--txt3)', marginBottom:4 }}>
                                                {flLabel || fid}
                                            </div>
                                            <div style={{ fontSize:13, color:'var(--txt)', wordBreak:'break-word', lineHeight:1.4 }}>
                                                {val || <em style={{ color:'var(--txt3)' }}>—</em>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                );
            })}

            {/* ── Pagination */}
            {pages > 1 && (
                <div style={{ display:'flex', gap:8, justifyContent:'center', alignItems:'center', marginTop:18 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => load(page - 1)} disabled={page <= 1}>← Prev</button>
                    <span style={{ fontSize:13, color:'var(--txt3)' }}>Page {page} of {pages}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => load(page + 1)} disabled={page >= pages}>Next →</button>
                </div>
            )}
        </div>
    );
}

/* ─── TemplatesGallery ───────────────────────────────────────────────────────── */
function TemplatesGallery({ onCreated }) {
    const { showToast } = useApp();
    const [creating, setCreating] = useState(null);

    async function use(tpl) {
        setCreating(tpl.name);
        try {
            await api.createForm({
                name: tpl.name, description: tpl.description,
                fields: tpl.fields.map((f, i) => ({ ...f, id: uid(), order: i })),
                successMessage: tpl.successMessage, triggerKeywords: tpl.triggerKeywords,
                matchType:'exact', sessionIds:[], targetType:'all', webhookUrl:'', active:true,
            });
            showToast(`"${tpl.name}" created!`); onCreated();
        } catch (e) { showToast(e.message, 'error'); } finally { setCreating(null); }
    }

    return (
        <div>
            <p style={{ marginBottom:20, color:'var(--txt3)', fontSize:13 }}>
                Ready-made form templates — one click to create and customise.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                {FORM_TEMPLATES.map(tpl => (
                    <div key={tpl.name} className="card" style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
                        {/* accent header */}
                        <div style={{
                            background:'linear-gradient(135deg,rgba(37,211,102,.08),rgba(37,211,102,.02))',
                            padding:'18px 18px 14px', borderBottom:'1px solid var(--border)',
                        }}>
                            <div style={{ fontSize:30, marginBottom:6 }}>{tpl.emoji}</div>
                            <h3 style={{ margin:'0 0 4px', fontSize:14.5, fontWeight:700, color:'var(--txt)' }}>{tpl.name}</h3>
                            <p style={{ margin:0, fontSize:12, color:'var(--txt3)', lineHeight:1.5 }}>{tpl.description}</p>
                        </div>
                        <div className="card-body" style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
                            <div>
                                <label style={{ marginBottom:6 }}>Fields included</label>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                    {tpl.fields.map((f, i) => <TypeBadge key={i} type={f.type} />)}
                                </div>
                            </div>
                            <div>
                                <label style={{ marginBottom:6 }}>Trigger keywords</label>
                                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                                    {tpl.triggerKeywords.map(k => (
                                        <span key={k} style={{ background:'var(--green-dim)', color:'var(--green)', fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:600 }}>
                                            {k}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <button className="btn btn-primary btn-sm" style={{ marginTop:'auto', width:'100%', justifyContent:'center' }}
                                onClick={() => use(tpl)} disabled={creating === tpl.name}>
                                {creating === tpl.name ? 'Creating…' : 'Use Template →'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Forms (main page) ──────────────────────────────────────────────────────── */
export default function Forms() {
    const { showToast, showConfirm } = useApp();
    const [forms,   setForms]   = useState([]);
    const [devices, setDevices] = useState([]);
    const [tab,     setTab]     = useState('forms');
    const [q,       setQ]       = useState('');
    const [panel,   setPanel]   = useState(null); // null | 'create' | { form }
    const [loading, setLoading] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const [f, d] = await Promise.all([api.getForms(), api.getDevices()]);
            setForms(Array.isArray(f) ? f : []);
            setDevices(Array.isArray(d) ? d : []);
        } catch { } finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []);

    async function handleSave(payload) {
        if (panel === 'create') {
            const created = await api.createForm(payload);
            setForms(fs => [created, ...fs]);
            showToast('Form created!');
        } else {
            const updated = await api.updateForm(panel.form.id, payload);
            setForms(fs => fs.map(f => f.id === updated.id ? updated : f));
            showToast('Form updated!');
        }
        setPanel(null);
    }
    async function toggleForm(id) {
        try {
            const u = await api.toggleForm(id);
            setForms(fs => fs.map(f => f.id === u.id ? u : f));
        } catch (e) { showToast(e.message, 'error'); }
    }
    async function deleteForm(id, name) {
        if (!(await showConfirm('Delete Form', `Delete "${name}" and all its submissions?`, { danger:true, confirmLabel:'Delete' }))) return;
        try { await api.deleteForm(id); setForms(fs => fs.filter(f => f.id !== id)); showToast('Deleted'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    const filtered  = forms.filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    const active    = forms.filter(f => f.active).length;
    const totalSubs = forms.reduce((a, f) => a + (f.totalSubmissions || 0), 0);

    const STATS = [
        { label:'Total Forms',  value:forms.length,          color:'var(--purple)', bg:'var(--purple-dim)', icon:'📝' },
        { label:'Active',       value:active,                color:'var(--green)',  bg:'var(--green-dim)',  icon:'🟢' },
        { label:'Inactive',     value:forms.length - active, color:'var(--txt3)',   bg:'var(--bg4)',        icon:'⏸️' },
        { label:'Submissions',  value:totalSubs,             color:'var(--blue)',   bg:'var(--blue-dim)',   icon:'📊' },
    ];

    const TABS = [
        { key:'forms',     label:'My Forms',   count:forms.length },
        { key:'responses', label:'Responses',  count:totalSubs },
        { key:'templates', label:'Templates',  count:null },
    ];

    return (
        <div className="page-content">

            {/* ── Header */}
            <div className="page-header">
                <div>
                    <h1>Interactive Forms</h1>
                    <p className="page-sub">Build conversational WhatsApp flows to collect structured data from users</p>
                </div>
                <button className="btn btn-primary" onClick={() => setPanel('create')}>+ Create Form</button>
            </div>

            {/* ── Stats */}
            <div className="stats-grid" style={{ marginBottom:24 }}>
                {STATS.map(s => (
                    <div key={s.label} className="stat-card">
                        <div className="stat-icon-wrap" style={{ background:s.bg, fontSize:20 }}>{s.icon}</div>
                        <div>
                            <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
                            <div className="stat-label">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Tabs */}
            <div style={{ display:'flex', borderBottom:'1.5px solid var(--border)', marginBottom:22 }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding:'9px 18px', background:'none', border:'none',
                        cursor:'pointer', fontSize:13, fontWeight:tab === t.key ? 700 : 400,
                        color:tab === t.key ? 'var(--green)' : 'var(--txt3)',
                        borderBottom:tab === t.key ? '2px solid var(--green)' : '2px solid transparent',
                        marginBottom:-1.5, display:'flex', alignItems:'center', gap:6,
                        transition:'color .12s', whiteSpace:'nowrap',
                    }}>
                        {t.label}
                        {t.count !== null && (
                            <span style={{
                                fontSize:11, padding:'1px 7px', borderRadius:99,
                                background:tab === t.key ? 'var(--green-dim)' : 'var(--bg3)',
                                color:tab === t.key ? 'var(--green)' : 'var(--txt3)', fontWeight:700,
                            }}>
                                {t.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Forms tab */}
            {tab === 'forms' && (
                <div>
                    <div className="search-bar" style={{ display:'flex', gap:8, marginBottom:18 }}>
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search forms…" style={{ maxWidth:300 }} />
                    </div>

                    {loading && <div className="empty-state">Loading…</div>}

                    {!loading && filtered.length === 0 && (
                        <div className="empty-state" style={{ border:'2px dashed var(--border)', borderRadius:12 }}>
                            <div style={{ fontSize:44, marginBottom:12 }}>📝</div>
                            <p style={{ margin:'0 0 18px' }}>No forms yet. Start with a template or build from scratch.</p>
                            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                                <button className="btn btn-primary" onClick={() => setPanel('create')}>+ Create Form</button>
                                <button className="btn btn-ghost" onClick={() => setTab('templates')}>Browse Templates</button>
                            </div>
                        </div>
                    )}

                    {!loading && filtered.length > 0 && (
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
                            {filtered.map(form => (
                                <FormCard key={form.id} form={form}
                                    onEdit={() => setPanel({ form })}
                                    onToggle={() => toggleForm(form.id)}
                                    onDelete={() => deleteForm(form.id, form.name)} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Responses tab */}
            {tab === 'responses' && <ResponsesView forms={forms} />}

            {/* ── Templates tab */}
            {tab === 'templates' && (
                <TemplatesGallery onCreated={() => { load(); setTab('forms'); }} />
            )}

            {/* ── Drawer */}
            {panel && (
                <FormDrawer
                    form={panel === 'create' ? null : panel.form}
                    devices={devices}
                    onSave={handleSave}
                    onClose={() => setPanel(null)} />
            )}
        </div>
    );
}

