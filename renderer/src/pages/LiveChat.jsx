import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../contexts/AppContext.jsx';

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#6366f1'];

function avatarColor(str) {
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return name.slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// returns true when the string is purely digits (no real name saved)
function isPhone(s) { return /^\d+$/.test(s || ''); }

function timeAgo(iso) {
    if (!iso) return '';
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_STYLE = {
    active:   { bg: 'rgba(59,130,246,.15)',   color: '#3b82f6' },
    pending:  { bg: 'rgba(234,179,8,.15)',    color: '#eab308' },
    resolved: { bg: 'rgba(34,197,94,.15)',    color: '#22c55e' },
    archived: { bg: 'rgba(100,116,139,.15)', color: '#94a3b8' },
};

export default function LiveChat() {
    const { showToast } = useApp();
    const [conversations, setConversations] = useState([]);
    const [selectedId, setSelectedId]       = useState(null);
    const [chatDetail, setChatDetail]       = useState(null);
    const [devices, setDevices]             = useState([]);
    const [deviceFilter, setDeviceFilter]   = useState('');
    const [statusFilter, setStatusFilter]   = useState('all');
    const [search, setSearch]               = useState('');
    const [msgInput, setMsgInput]           = useState('');
    const [sending, setSending]             = useState(false);
    const [noteText, setNoteText]           = useState('');
    const [addingNote, setAddingNote]       = useState(false);
    const [savingNote, setSavingNote]       = useState(false);
    const messagesEndRef = useRef(null);
    const pollRef        = useRef(null);
    const msgPollRef     = useRef(null);

    useEffect(() => {
        fetch('/api/devices').then(r => r.json()).then(d => {
            const connected = d.filter(dv => dv.status === 'connected');
            setDevices(connected);
            if (connected.length) setDeviceFilter(connected[0].id);
        }).catch(() => {});
    }, []);

    const loadConversations = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (deviceFilter) params.append('deviceId', deviceFilter);
            if (statusFilter !== 'all') params.append('status', statusFilter);
            const data = await fetch(`/api/live-chat?${params}`).then(r => r.json());
            setConversations(Array.isArray(data) ? data : []);
        } catch {}
    }, [deviceFilter, statusFilter]);

    useEffect(() => {
        loadConversations();
        pollRef.current = setInterval(loadConversations, 3000);
        return () => clearInterval(pollRef.current);
    }, [loadConversations]);

    const loadMessages = useCallback(async (id) => {
        if (!id) return;
        try {
            const data = await fetch(`/api/live-chat/${id}/messages`).then(r => r.json());
            setChatDetail(data);
        } catch {}
    }, []);

    useEffect(() => {
        if (!selectedId) return;
        loadMessages(selectedId);
        clearInterval(msgPollRef.current);
        msgPollRef.current = setInterval(() => loadMessages(selectedId), 3000);
        return () => clearInterval(msgPollRef.current);
    }, [selectedId, loadMessages]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatDetail?.messages?.length]);

    async function selectConversation(conv) {
        setSelectedId(conv.id);
        try { await fetch(`/api/live-chat/${conv.id}/read`, { method: 'PATCH' }); } catch {}
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    }

    async function sendMessage() {
        if (!msgInput.trim() || !selectedId || sending) return;
        setSending(true);
        try {
            const result = await fetch(`/api/live-chat/${selectedId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msgInput.trim() }),
            }).then(r => r.json());
            if (result.error) throw new Error(result.error);
            setMsgInput('');
            await loadMessages(selectedId);
        } catch (e) {
            showToast(e.message || 'Failed to send', 'error');
        } finally {
            setSending(false);
        }
    }

    async function setStatus(status) {
        if (!selectedId) return;
        try {
            await fetch(`/api/live-chat/${selectedId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            setChatDetail(prev => prev ? { ...prev, chat: { ...prev.chat, status } } : prev);
            setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, status } : c));
            showToast(`Marked as ${status}`, 'success');
            if (status === 'archived') { setSelectedId(null); setChatDetail(null); }
        } catch { showToast('Failed to update', 'error'); }
    }

    async function addNote() {
        if (!noteText.trim() || !selectedId) return;
        setSavingNote(true);
        try {
            const notes = await fetch(`/api/live-chat/${selectedId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: noteText.trim() }),
            }).then(r => r.json());
            setChatDetail(prev => prev ? { ...prev, chat: { ...prev.chat, notes } } : prev);
            setNoteText(''); setAddingNote(false);
        } catch {} finally { setSavingNote(false); }
    }

    async function deleteNote(noteId) {
        if (!selectedId) return;
        try {
            const notes = await fetch(`/api/live-chat/${selectedId}/notes/${noteId}`, { method: 'DELETE' }).then(r => r.json());
            setChatDetail(prev => prev ? { ...prev, chat: { ...prev.chat, notes } } : prev);
        } catch {}
    }

    // Derived
    const filtered = conversations.filter(c => {
        if (search) {
            const q = search.toLowerCase();
            if (!c.name.toLowerCase().includes(q) && !(c.phone || '').includes(q)) return false;
        }
        return true;
    });

    const counts = {
        active:   conversations.filter(c => c.status === 'active').length,
        pending:  conversations.filter(c => c.status === 'pending').length,
        resolved: conversations.filter(c => c.status === 'resolved').length,
    };

    const chat     = chatDetail?.chat || conversations.find(c => c.id === selectedId);
    const messages = chatDetail?.messages || [];

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>

            {/* ── LEFT PANEL ── */}
            <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg2)' }}>

                {/* Header */}
                <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span style={{ fontWeight: 700, fontSize: 15 }}>Live Chat</span>
                        </div>
                        <button onClick={loadConversations} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                    </div>

                    {/* Device selector */}
                    <select value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 12.5, marginBottom: 12, colorScheme: 'dark', cursor: 'pointer' }}>
                        <option value="">All Sessions</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>)}
                    </select>

                    {/* Stats bar */}
                    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        {[['Active', 'active', counts.active, '#3b82f6'], ['Pending', 'pending', counts.pending, '#eab308'], ['Resolved', 'resolved', counts.resolved, '#22c55e']].map(([label, key, val, color], i) => (
                            <div key={key} onClick={() => setStatusFilter(key)}
                                style={{ flex: 1, textAlign: 'center', padding: '8px 4px', cursor: 'pointer',
                                    borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                                    background: statusFilter === key ? `${color}22` : 'transparent', transition: 'background .15s' }}>
                                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 1 }}>{label}</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Search */}
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ position: 'relative' }}>
                        <svg style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations..."
                            style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 12.5, outline: 'none' }} />
                    </div>
                </div>

                {/* Status filter tabs */}
                <div style={{ display: 'flex', gap: 5, padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {[['all','All'],['active','Active'],['pending','Pending'],['resolved','Resolved']].map(([key, label]) => (
                        <button key={key} onClick={() => setStatusFilter(key)}
                            style={{ padding: '4px 11px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
                                background: statusFilter === key ? '#3b82f6' : 'var(--bg3)',
                                color: statusFilter === key ? '#fff' : 'var(--txt2)', transition: 'all .15s' }}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Conversation list */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--txt3)' }}>
                            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .25, display: 'block', margin: '0 auto 12px' }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>No conversations yet</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Incoming messages will appear here automatically</div>
                        </div>
                    ) : filtered.map(conv => (
                        <div key={conv.id} onClick={() => selectConversation(conv)}
                            style={{ display: 'flex', gap: 10, padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                                background: selectedId === conv.id ? 'rgba(59,130,246,.1)' : 'transparent',
                                borderLeft: selectedId === conv.id ? '3px solid #3b82f6' : '3px solid transparent',
                                transition: 'background .12s' }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{ width: 42, height: 42, borderRadius: '50%', background: avatarColor(conv.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 15 }}>
                                    {initials(conv.name)}
                                </div>
                                {conv.unreadCount > 0 && (
                                    <span style={{ position: 'absolute', top: -4, right: -4, background: '#3b82f6', color: '#fff', borderRadius: '50%', minWidth: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                    </span>
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 1 }}>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 155 }}>
                                        {isPhone(conv.name) ? `+${conv.phone}` : conv.name}
                                    </span>
                                    <span style={{ fontSize: 10.5, color: 'var(--txt3)', flexShrink: 0, marginLeft: 4 }}>{timeAgo(conv.lastMessageTime)}</span>
                                </div>
                                {!isPhone(conv.name) && (
                                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 3 }}>+{conv.phone}</div>
                                )}
                                <div style={{ fontSize: 12, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                                    {conv.lastMessage || 'No messages yet'}
                                </div>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: STATUS_STYLE[conv.status]?.bg, color: STATUS_STYLE[conv.status]?.color, fontWeight: 600 }}>
                                        {conv.status}
                                    </span>
                                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(37,211,102,.15)', color: '#25D366', fontWeight: 600 }}>WhatsApp</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── MIDDLE PANEL ── */}
            {selectedId && chat ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

                    {/* Chat header */}
                    <div style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', flexShrink: 0 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: avatarColor(chat.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                            {initials(chat.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--txt)' }}>
                                {isPhone(chat.name) ? `+${chat.phone}` : chat.name}
                            </div>
                            {!isPhone(chat.name) && (
                                <div style={{ fontSize: 11.5, color: 'var(--txt3)' }}>+{chat.phone}</div>
                            )}
                        </div>
                        <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
                            background: STATUS_STYLE[chat.status]?.bg, color: STATUS_STYLE[chat.status]?.color,
                            border: `1px solid ${STATUS_STYLE[chat.status]?.color}44`, textTransform: 'capitalize', flexShrink: 0 }}>
                            {chat.status}
                        </span>
                    </div>

                    {/* Messages area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {messages.length === 0 ? (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--txt3)' }}>
                                <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: .2 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <div style={{ fontSize: 13 }}>No messages yet</div>
                            </div>
                        ) : messages.map(msg => (
                            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.fromMe ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                                {!msg.fromMe && (
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(chat.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 10.5, flexShrink: 0 }}>
                                        {initials(chat.name)}
                                    </div>
                                )}
                                <div style={{ maxWidth: '62%' }}>
                                    <div style={{
                                        padding: '9px 13px',
                                        borderRadius: msg.fromMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                        background: msg.fromMe ? '#3b82f6' : 'var(--bg2)',
                                        border: msg.fromMe ? 'none' : '1px solid var(--border)',
                                        color: msg.fromMe ? '#fff' : 'var(--txt)',
                                        fontSize: 13.5, lineHeight: 1.55, wordBreak: 'break-word',
                                    }}>
                                        {msg.body}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 3, textAlign: msg.fromMe ? 'right' : 'left' }}>
                                        {timeAgo(msg.timestamp)}{msg.fromMe ? ' ✓' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message input */}
                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', flexShrink: 0 }}>
                        <input
                            value={msgInput}
                            onChange={e => setMsgInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                            placeholder="Type a message..."
                            style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--border)', borderRadius: 24, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13.5, outline: 'none' }}
                        />
                        <button onClick={sendMessage} disabled={sending || !msgInput.trim()}
                            style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                                background: msgInput.trim() && !sending ? '#3b82f6' : 'var(--bg3)',
                                border: msgInput.trim() ? 'none' : '1px solid var(--border)',
                                cursor: msgInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={msgInput.trim() && !sending ? '#fff' : 'var(--txt3)'} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', flexDirection: 'column', gap: 14 }}>
                    <svg width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: .18 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--txt2)' }}>Select a conversation</div>
                    <div style={{ fontSize: 13, color: 'var(--txt3)' }}>Choose a conversation from the list to start chatting</div>
                </div>
            )}

            {/* ── RIGHT PANEL ── */}
            {selectedId && chat && (
                <div style={{ width: 272, flexShrink: 0, borderLeft: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', padding: '20px 14px', gap: 14 }}>

                    {/* Avatar + Name */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
                        <div style={{ width: 70, height: 70, borderRadius: '50%', background: avatarColor(chat.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 26 }}>
                            {initials(chat.name)}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, textAlign: 'center', color: 'var(--txt)' }}>
                            {isPhone(chat.name) ? `+${chat.phone}` : chat.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.59 19.79 19.79 0 01.13 2.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/></svg>
                            +{chat.phone}
                        </div>
                    </div>

                    {/* Contact Info */}
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: 'var(--txt)' }}>Contact Info</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 5, display: 'flex', gap: 7, alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
                            No email
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', display: 'flex', gap: 7, alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>
                            No company
                        </div>
                    </div>

                    {/* Conversation Stats */}
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10, color: 'var(--txt)' }}>Conversation Stats</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>Messages</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--txt)' }}>{messages.length}</div>
                            </div>
                            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ fontSize: 10, color: 'var(--txt3)', marginBottom: 2 }}>Status</div>
                                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: STATUS_STYLE[chat.status]?.color }}>{chat.status}</div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--txt)' }}>
                            Notes
                            <button onClick={() => setAddingNote(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 20, lineHeight: 1, padding: 0 }}>+</button>
                        </div>
                        {addingNote && (
                            <div style={{ marginBottom: 8 }}>
                                <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." rows={2}
                                    style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg2)', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
                                <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                                    <button onClick={() => { setAddingNote(false); setNoteText(''); }}
                                        style={{ flex: 1, padding: '4px', border: '1px solid var(--border)', borderRadius: 5, background: 'none', color: 'var(--txt2)', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                    <button onClick={addNote} disabled={savingNote || !noteText.trim()}
                                        style={{ flex: 1, padding: '4px', border: 'none', borderRadius: 5, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: savingNote ? .7 : 1 }}>Save</button>
                                </div>
                            </div>
                        )}
                        {(chat.notes || []).length === 0 && !addingNote ? (
                            <div style={{ fontSize: 12, color: 'var(--txt3)', textAlign: 'center', padding: '6px 0' }}>No notes yet</div>
                        ) : (chat.notes || []).map(n => (
                            <div key={n.id} style={{ fontSize: 12, color: 'var(--txt2)', background: 'var(--bg2)', borderRadius: 6, padding: '6px 8px', marginBottom: 5, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                <span style={{ flex: 1, lineHeight: 1.4 }}>{n.text}</span>
                                <button onClick={() => deleteNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, fontSize: 15, lineHeight: 1, flexShrink: 0 }}>×</button>
                            </div>
                        ))}
                    </div>

                    {/* Quick Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--txt)', marginBottom: 2 }}>Quick Actions</div>
                        {chat.status !== 'resolved' && (
                            <button onClick={() => setStatus('resolved')}
                                style={{ padding: '10px', border: 'none', borderRadius: 8, background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                Mark as Resolved
                            </button>
                        )}
                        {chat.status !== 'pending' && (
                            <button onClick={() => setStatus('pending')}
                                style={{ padding: '10px', border: 'none', borderRadius: 8, background: '#ca8a04', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                Mark as Pending
                            </button>
                        )}
                        {chat.status !== 'active' && (
                            <button onClick={() => setStatus('active')}
                                style={{ padding: '10px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                Mark as Active
                            </button>
                        )}
                        <button onClick={() => setStatus('archived')}
                            style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt2)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                            Archive Conversation
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
