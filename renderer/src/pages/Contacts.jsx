import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const EMPTY_FORM = { name: '', number: '' };

export default function Contacts() {
    const { showToast, showConfirm } = useApp();
    const [contacts, setContacts] = useState([]);
    const [search,   setSearch]   = useState('');
    const [modal,    setModal]    = useState(null); // null | { mode:'add'|'edit', contact? }
    const [form,     setForm]     = useState(EMPTY_FORM);
    const [saving,   setSaving]   = useState(false);
    const [selected, setSelected] = useState(new Set());
    const csvRef = useRef();

    useEffect(() => { load(); }, []);

    async function load() {
        try { const r = await api.getContacts(); setContacts(Array.isArray(r) ? r : []); setSelected(new Set()); } catch { /* ignore */ }
    }

    function openAdd()  { setForm(EMPTY_FORM); setModal({ mode: 'add' }); }
    function openEdit(c){ setForm({ name: c.name, number: c.number }); setModal({ mode: 'edit', contact: c }); }
    function closeModal(){ setModal(null); setSaving(false); }

    // ── selection helpers ──────────────────────────────────────────────────
    function toggleOne(id) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (selected.size === filtered.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map(c => c.id)));
        }
    }

    async function delSelected() {
        if (selected.size === 0) return;
        if (!await showConfirm(
            'Delete Contacts',
            `Delete ${selected.size} selected contact${selected.size > 1 ? 's' : ''}? This cannot be undone.`,
            { danger: true, confirmLabel: 'Delete' }
        )) return;
        try {
            await api.bulkDeleteContacts([...selected]);
            setContacts(prev => prev.filter(c => !selected.has(c.id)));
            setSelected(new Set());
            showToast(`Deleted ${selected.size} contact${selected.size > 1 ? 's' : ''}`);
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function save(andAnother = false) {
        const name = form.name.trim(), number = form.number.trim().replace(/\s+/g, '');
        if (!name) return showToast('Name is required', 'error');
        if (!number) return showToast('Number is required', 'error');
        const digits = number.replace(/\D/g, '');
        if (digits.length < 11) return showToast('Number must include country code (min 11 digits, e.g. 919876543210)', 'error');
        setSaving(true);
        try {
            if (modal.mode === 'add') {
                const c = await api.createContact({ name, number });
                setContacts(prev => [...prev, c]);
                if (andAnother) {
                    setForm(EMPTY_FORM);
                    showToast('Contact added — add another!');
                } else {
                    showToast('Contact added');
                    closeModal();
                }
            } else {
                const c = await api.updateContact(modal.contact.id, { name, number });
                setContacts(prev => prev.map(x => x.id === c.id ? c : x));
                showToast('Contact updated');
                closeModal();
            }
        } catch (e) {
            showToast(e.message, 'error');
        } finally {
            setSaving(false);
        }
    }

    async function del(id) {
        if (!await showConfirm('Delete Contact', 'Are you sure you want to delete this contact?', { danger: true, confirmLabel: 'Delete' })) return;
        try {
            await api.deleteContact(id);
            setContacts(prev => prev.filter(c => c.id !== id));
            showToast('Contact deleted');
        } catch (e) { showToast(e.message, 'error'); }
    }

    async function handleCSV(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        try {
            const res = await api.importContacts(file);
            showToast(`Imported ${res.imported} contacts (${res.skipped} skipped)`);
            load();
        } catch (e) { showToast(e.message, 'error'); }
    }

    const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.number.includes(search)
    );

    const allChecked  = filtered.length > 0 && selected.size === filtered.length;
    const someChecked = selected.size > 0 && !allChecked;

    return (
        <div className="page-content">
            <div className="page-header">
                <div>
                    <h1>Contacts</h1>
                    <p className="page-sub">{contacts.length} total</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {selected.size > 0 && (
                        <button className="btn btn-danger" onClick={delSelected}>
                            🗑 Delete {selected.size} Selected
                        </button>
                    )}
                    <button className="btn btn-ghost" onClick={() => csvRef.current.click()}>
                        📂 Import CSV
                    </button>
                    <input ref={csvRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCSV} />
                    <button className="btn btn-primary" onClick={openAdd}>+ Add Contact</button>
                </div>
            </div>

            <div className="card">
                <div className="search-bar">
                    <input type="text" placeholder="Search contacts…" value={search}
                           onChange={e => setSearch(e.target.value)} />
                </div>
                {filtered.length === 0
                    ? <p className="empty-state">{contacts.length === 0 ? 'No contacts yet.' : 'No results.'}</p>
                    : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 36 }}>
                                        <input
                                            type="checkbox"
                                            checked={allChecked}
                                            ref={el => { if (el) el.indeterminate = someChecked; }}
                                            onChange={toggleAll}
                                        />
                                    </th>
                                    <th>Name</th>
                                    <th>Number</th>
                                    <th style={{ width: 100 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(c => (
                                    <tr key={c.id} style={{ background: selected.has(c.id) ? 'var(--bg3)' : undefined }}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selected.has(c.id)}
                                                onChange={() => toggleOne(c.id)}
                                            />
                                        </td>
                                        <td>{c.name}</td>
                                        <td style={{ fontFamily: 'monospace', color: 'var(--txt2)' }}>{c.number}</td>
                                        <td>
                                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c)}>Edit</button>
                                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', marginLeft: 4 }} onClick={() => del(c.id)}>Del</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>

            {modal && (
                <Modal title={modal.mode === 'add' ? 'Add Contact' : 'Edit Contact'} onClose={closeModal}>
                    <div className="form-group">
                        <label>Full Name</label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="John Doe" autoFocus />
                    </div>
                    <div className="form-group">
                        <label>WhatsApp Number <span style={{ color: 'var(--txt3)', fontSize: 11 }}>(with country code)</span></label>
                        <input type="text" value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} placeholder="e.g. 919876543210" />
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                        {modal.mode === 'add' && (
                            <button className="btn btn-ghost" onClick={() => save(true)} disabled={saving}>
                                {saving ? 'Saving…' : '+ Add Another'}
                            </button>
                        )}
                        <button className="btn btn-primary" onClick={() => save(false)} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
