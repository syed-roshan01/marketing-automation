import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

export default function Groups() {
    const { showToast, showConfirm } = useApp();
    const [groups,   setGroups]   = useState([]);
    const [contacts, setContacts] = useState([]);
    const [modal,    setModal]    = useState(null); // null | { mode, group? }
    const [form,     setForm]     = useState({ name: '', contactIds: [] });
    const [search,   setSearch]   = useState('');
    const [saving,   setSaving]   = useState(false);
    const [csvMsg,   setCsvMsg]   = useState(null); // { text, ok }
    const [manualIn, setManualIn] = useState('');
    const [importing, setImporting] = useState(false);

    useEffect(() => { load(); }, []);

    async function load() {
        try {
            const [g, c] = await Promise.all([api.getGroups(), api.getContacts()]);
            setGroups(Array.isArray(g) ? g : []); setContacts(Array.isArray(c) ? c : []);
        } catch { /* ignore */ }
    }

    function openAdd()    { setForm({ name: '', contactIds: [] }); setSearch(''); setCsvMsg(null); setManualIn(''); setModal({ mode: 'add' }); }
    function openEdit(g)  { setForm({ name: g.name, contactIds: g.contactIds || [] }); setSearch(''); setCsvMsg(null); setManualIn(''); setModal({ mode: 'edit', group: g }); }
    function closeModal() { setModal(null); setSaving(false); }

    function toggleContact(id) {
        setForm(p => ({
            ...p,
            contactIds: p.contactIds.includes(id) ? p.contactIds.filter(x => x !== id) : [...p.contactIds, id],
        }));
    }

    // Normalize a raw string to a WhatsApp-ready number.
    // 10-digit numbers starting with 6-9 → auto-prepend 91 (India).
    // Numbers already with country code are kept as-is.
    function normalizeNumber(raw) {
        let n = raw.replace(/[^\d]/g, '');
        if (/^[6-9]\d{9}$/.test(n)) n = '91' + n;
        return n;
    }

    // Core import: takes an array of raw number strings, creates missing contacts,
    // then adds all to the group form.
    async function importNumbers(rawList) {
        setImporting(true);
        setCsvMsg(null);
        let added = 0, created = 0, skipped = 0;
        const newContactIds = [];
        const allContacts = [...contacts]; // local snapshot we'll extend

        for (const entry of rawList) {
            const rawStr  = typeof entry === 'string' ? entry : entry.raw;
            const nameStr = typeof entry === 'string' ? '' : (entry.name || '');
            const num = normalizeNumber(rawStr.trim());
            if (num.length < 7) { skipped++; continue; }

            // check existing contacts
            let contact = allContacts.find(c => c.number.replace(/[^\d]/g, '') === num);
            if (!contact) {
                // auto-create — use extracted name, fall back to number
                try {
                    contact = await api.createContact({ name: nameStr || num, number: num });
                    allContacts.push(contact);
                    created++;
                } catch { skipped++; continue; }
            }
            if (!newContactIds.includes(contact.id)) newContactIds.push(contact.id);
            added++;
        }

        // Update contacts state so picker reflects new ones
        setContacts(allContacts);
        setForm(p => ({ ...p, contactIds: [...new Set([...p.contactIds, ...newContactIds])] }));
        setImporting(false);

        const parts = [];
        parts.push(`${added} number${added !== 1 ? 's' : ''} added to group`);
        if (created > 0) parts.push(`${created} new contact${created !== 1 ? 's' : ''} created`);
        if (skipped > 0) parts.push(`${skipped} skipped (invalid)`);
        setCsvMsg({ text: parts.join(' · '), ok: skipped === 0 || added > 0 });
    }

    function handleCsvUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const lines = ev.target.result.split(/\r?\n/).filter(l => l.trim());
            const entries = [];
            for (const line of lines) {
                if (/^(name|number|phone|mobile)/i.test(line.trim())) continue; // header
                const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/["'=]/g, ''));
                // pick the column most likely to be a phone number
                const rawIdx = cols.findIndex(c => /^[\+\d][\d\s\-().]{4,}$/.test(c));
                let raw, name;
                if (rawIdx >= 0) {
                    raw  = cols[rawIdx];
                    // if phone is not the first column, the column before it is likely the name
                    name = rawIdx > 0 ? (cols[rawIdx - 1] || '') : '';
                } else {
                    // fallback: col 0 = phone (or col 1 if col 0 looks like a name)
                    raw  = cols[1] || cols[0];
                    name = cols[1] ? (cols[0] || '') : '';
                }
                if (raw) entries.push({ raw, name });
            }
            importNumbers(entries);
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    function handleManualAdd() {
        const raw = manualIn.split(',').map(s => s.trim()).filter(Boolean);
        if (!raw.length) return;
        importNumbers(raw);
        setManualIn('');
    }

    async function save() {
        if (!form.name.trim()) return showToast('Group name required', 'error');
        setSaving(true);
        try {
            if (modal.mode === 'add') {
                const g = await api.createGroup({ name: form.name.trim(), contactIds: form.contactIds });
                setGroups(prev => [...prev, g]);
                showToast('Group created');
            } else {
                const g = await api.updateGroup(modal.group.id, { name: form.name.trim(), contactIds: form.contactIds });
                setGroups(prev => prev.map(x => x.id === g.id ? g : x));
                showToast('Group updated');
            }
            closeModal();
        } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
    }

    async function del(id) {
        if (!await showConfirm('Delete Group', 'Are you sure you want to delete this group?', { danger: true, confirmLabel: 'Delete' })) return;
        try { await api.deleteGroup(id); setGroups(prev => prev.filter(g => g.id !== id)); showToast('Group deleted'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    const baseContacts = modal?.mode === 'edit'
        ? contacts.filter(c => form.contactIds.includes(c.id))
        : contacts;

    const filteredContacts = baseContacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) || c.number.includes(search)
    );

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1>Groups</h1>
                    <p className="page-sub">{groups.length} total</p>
                </div>
                <button className="btn btn-primary" onClick={openAdd}>+ New Group</button>
            </div>

            {groups.length === 0
                ? <p className="empty-state">No groups yet. Create a group to target contacts in a campaign.</p>
                : (
                    <div className="groups-grid">
                        {groups.map(g => {
                            const memberCount = (g.contactIds || []).length;
                            return (
                                <div key={g.id} className="group-card">
                                    <div className="group-card-icon">👥</div>
                                    <div className="group-card-info">
                                        <div className="group-card-name">{g.name}</div>
                                        <div className="group-card-count">{memberCount} contact{memberCount !== 1 ? 's' : ''}</div>
                                    </div>
                                    <div className="group-card-actions">
                                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(g)}>Edit</button>
                                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => del(g.id)}>Delete</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            {modal && (
                <Modal title={modal.mode === 'add' ? 'New Group' : 'Edit Group'} onClose={closeModal} size="lg">
                    <div className="form-group">
                        <label>Group Name</label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. VIP Customers" autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Add Numbers</label>
                        <div className="csv-upload-row">
                            <label className="btn btn-ghost btn-sm csv-upload-btn">
                                📂 Import CSV
                                <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCsvUpload} />
                            </label>
                            <span className="csv-hint">or type numbers below (comma-separated)</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                type="text"
                                placeholder="9876543210, 9123456789, …"
                                value={manualIn}
                                onChange={e => setManualIn(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                                style={{ flex: 1 }}
                            />
                            <button className="btn btn-ghost btn-sm" onClick={handleManualAdd} disabled={importing || !manualIn.trim()}>
                                {importing ? '…' : '+ Add'}
                            </button>
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 5 }}>
                            10-digit numbers get <strong>91</strong> prepended automatically. Numbers not in contacts are created on the fly.
                        </p>
                        {csvMsg && (
                            <div className={`csv-feedback ${csvMsg.ok ? 'csv-feedback-ok' : 'csv-feedback-warn'}`}>
                                {csvMsg.ok ? '✓ ' : '⚠ '}{csvMsg.text}
                            </div>
                        )}
                    </div>
                    <div className="form-group">
                        <label>
                            {modal.mode === 'edit'
                                ? `Members (${form.contactIds.length}) — uncheck to remove`
                                : `Contacts (${form.contactIds.length} selected)`}
                        </label>
                        <div className="search-bar" style={{ marginBottom: 8 }}>
                            <input type="text" placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="contact-picker">
                            {filteredContacts.length === 0 && <p style={{ color: 'var(--txt3)', padding: 12 }}>No contacts found.</p>}
                            {filteredContacts.map(c => (
                                <label key={c.id} className="contact-picker-item">
                                    <input type="checkbox" checked={form.contactIds.includes(c.id)} onChange={() => toggleContact(c.id)} />
                                    <span className="contact-picker-name">{c.name}</span>
                                    <span className="contact-picker-num">{c.number}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Group'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
