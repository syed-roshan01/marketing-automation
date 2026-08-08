import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../contexts/AppContext.jsx';

const ROLE_STYLE = {
    superadmin: { bg: 'rgba(139,92,246,.18)', color: '#8b5cf6', label: 'Super Admin' },
    admin:      { bg: 'rgba(59,130,246,.18)',  color: '#3b82f6', label: 'Admin' },
    member:     { bg: 'rgba(100,116,139,.18)', color: '#94a3b8', label: 'Member' },
};

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// Escape a value for CSV; wrap phone numbers as =" " to prevent Excel scientific notation
function csvVal(v) {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}
function csvPhone(phone) {
    // Forces Excel to treat the cell as text — avoids 9.19E+11 style display
    return '="' + phone + '"';
}

function downloadBlob(content, filename, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

export default function GroupGrabber() {
    const { showToast } = useApp();

    const [devices, setDevices]         = useState([]);
    const [deviceId, setDeviceId]       = useState('');
    const [groups, setGroups]           = useState([]);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');
    const [viewMode, setViewMode]       = useState('groups'); // groups | communities | labels
    const [search, setSearch]           = useState('');
    const [roleFilter, setRoleFilter]   = useState('all');   // all | admin | member
    const [sortBy, setSortBy]           = useState('name');  // name | size | date
    const [selected, setSelected]       = useState(new Set());
    const [detailGroup, setDetailGroup] = useState(null);
    const [modalParticipants, setModalParticipants] = useState(null);  // null=not loaded, []=loaded
    const [modalLoading, setModalLoading]     = useState(false);
    const [genLinkLoading, setGenLinkLoading] = useState(false);
    const [inviteLinks, setInviteLinks] = useState({}); // jid → link
    const [labels, setLabels]           = useState([]); // WhatsApp Business labels
    const [labelsLoading, setLabelsLoading] = useState(false);
    const [labelsError, setLabelsError]     = useState('');
    const [selectedLabel, setSelectedLabel] = useState(null); // label id to drill into

    // Load devices
    useEffect(() => {
        fetch('/api/devices').then(r => r.json()).then(d => {
            const connected = d.filter(dv => dv.status === 'connected');
            setDevices(connected);
            if (connected.length > 0) setDeviceId(connected[0].id);
        }).catch(() => {});
    }, []);

    // Fetch groups when device changes
    useEffect(() => {
        if (!deviceId) return;
        fetchGroups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceId]);

    // Fetch labels when Labels tab is opened
    useEffect(() => {
        if (viewMode === 'labels' && deviceId) fetchLabels();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, deviceId]);

    async function fetchLabels() {
        setLabelsLoading(true);
        setLabelsError('');
        try {
            const res = await fetch(`/api/group-grabber/labels?deviceId=${deviceId}`);
            let data;
            try { data = await res.json(); } catch (_) { data = null; }
            if (!res.ok || !data) {
                // 400 = device not ready, 404 = route not found (old server), parse fail = HTML
                setLabels([]);
                if (res.status !== 400) setLabelsError(data?.error || 'Could not load labels');
            } else {
                setLabels(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            setLabels([]);
            setLabelsError(e.message);
        } finally {
            setLabelsLoading(false);
        }
    }

    async function fetchGroups() {
        setLoading(true); setError('');
        try {
            const res = await fetch(`/api/group-grabber?deviceId=${deviceId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch groups');
            setGroups(Array.isArray(data) ? data : []);
            setSelected(new Set());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    // Derived lists
    const allGroups      = useMemo(() => groups.filter(g => !g.isCommunity && !g.isCommunityAnnounce), [groups]);
    const allCommunities = useMemo(() => groups.filter(g => g.isCommunity || g.isCommunityAnnounce), [groups]);

    const displayList = useMemo(() => {
        let list = viewMode === 'communities' ? allCommunities : allGroups;
        if (search) list = list.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.id.includes(search));
        if (roleFilter === 'admin') list = list.filter(g => g.myRole === 'admin' || g.myRole === 'superadmin');
        if (roleFilter === 'member') list = list.filter(g => g.myRole === 'member');
        list = [...list].sort((a, b) => {
            if (sortBy === 'size') return b.size - a.size;
            if (sortBy === 'date') return new Date(b.creation||0) - new Date(a.creation||0);
            return a.name.localeCompare(b.name);
        });
        return list;
    }, [viewMode, allGroups, allCommunities, search, roleFilter, sortBy]);

    // Stats
    const stats = useMemo(() => {
        const totalParticipants = groups.reduce((s, g) => s + (g.size || 0), 0);
        const adminGroups  = groups.filter(g => g.myRole === 'admin' || g.myRole === 'superadmin').length;
        const memberGroups = groups.filter(g => g.myRole === 'member').length;
        const avgSize = allGroups.length > 0 ? Math.round(allGroups.reduce((s,g)=>s+g.size,0)/allGroups.length) : 0;
        const adminRatio = groups.length > 0 ? Math.round((adminGroups / groups.length) * 100) : 0;
        const largest = allGroups.reduce((mx, g) => g.size > (mx?.size||0) ? g : mx, null);
        return { totalParticipants, adminGroups, memberGroups, avgSize, adminRatio, largest };
    }, [groups, allGroups]);

    function toggleSelect(id) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    function selectAll() {
        if (selected.size === displayList.length) { setSelected(new Set()); }
        else { setSelected(new Set(displayList.map(g => g.id))); }
    }

    async function openDetail(g) {
        setDetailGroup(g);
        setModalParticipants(null);
        setModalLoading(true);
        try {
            const res = await fetch(`/api/group-grabber/metadata?deviceId=${deviceId}&groupJid=${encodeURIComponent(g.id)}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setModalParticipants(data.participants || []);
        } catch (err) {
            showToast('Could not load participants: ' + err.message, 'error');
            setModalParticipants([]);
        } finally {
            setModalLoading(false);
        }
    }

    async function generateInviteLink(g, e) {
        e.stopPropagation();
        setGenLinkLoading(g.id);
        try {
            const res = await fetch('/api/group-grabber/invite-link', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, groupJid: g.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setInviteLinks(prev => ({ ...prev, [g.id]: data.link }));
            await navigator.clipboard.writeText(data.link);
            showToast('Invite link copied!', 'success');
        } catch (e) { showToast(e.message, 'error'); }
        finally { setGenLinkLoading(false); }
    }

    function copyGroupId(g, e) {
        e.stopPropagation();
        navigator.clipboard.writeText(g.id).then(() => showToast('Group ID copied!', 'success'));
    }

    function copySelectedIDs() {
        const ids = displayList.filter(g => selected.has(g.id)).map(g => g.id);
        if (!ids.length) { showToast('No groups selected', 'error'); return; }
        navigator.clipboard.writeText(ids.join('\n')).then(() => showToast(`${ids.length} group IDs copied!`, 'success'));
    }

    async function generateAllInviteLinks() {
        const targets = displayList.filter(g => selected.size ? selected.has(g.id) : true).slice(0, 20);
        if (!targets.length) { showToast('No groups to generate links for', 'error'); return; }
        showToast(`Generating ${targets.length} invite links…`, 'info');
        const results = [];
        for (const g of targets) {
            try {
                const res = await fetch('/api/group-grabber/invite-link', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ deviceId, groupJid: g.id }),
                });
                const data = await res.json();
                if (res.ok) { results.push(`${g.name}: ${data.link}`); setInviteLinks(prev => ({ ...prev, [g.id]: data.link })); }
            } catch (_) {}
        }
        downloadBlob(results.join('\n'), 'invite_links.txt');
        showToast(`${results.length} invite links exported!`, 'success');
    }

    function exportSummary() {
        const list = displayList.filter(g => selected.size ? selected.has(g.id) : true);
        const rows = [['Group Name','Group ID','Participants','Role','Created','Community']];
        list.forEach(g => rows.push([csvVal(g.name), csvVal(g.id), g.size, g.myRole, fmtDate(g.creation), g.isCommunity ? 'Yes' : 'No']));
        downloadBlob('\uFEFF' + rows.map(r => r.join(',')).join('\n'), 'groups_summary.csv', 'text/csv');
        showToast('Summary exported!', 'success');
    }

    function exportParticipants() {
        const list = displayList.filter(g => selected.size ? selected.has(g.id) : true);
        const rows = [['Group Name','Group ID','Phone','Role']];
        list.forEach(g => (g.participants||[]).forEach(p => rows.push([csvVal(g.name), csvVal(g.id), csvPhone(p.phone), p.admin || 'member'])));
        downloadBlob('\uFEFF' + rows.map(r => r.join(',')).join('\n'), 'participants.csv', 'text/csv');
        showToast('Participants exported!', 'success');
    }

    function exportJSON() {
        const list = displayList.filter(g => selected.size ? selected.has(g.id) : true);
        downloadBlob(JSON.stringify(list, null, 2), 'groups.json', 'application/json');
        showToast('JSON exported!', 'success');
    }

    function exportGroupDetails(g, parts) {
        const list = parts || g.participants || [];
        const rows = [['Phone','Role']];
        list.forEach(p => rows.push([p.isLid ? csvVal(p.phone) : csvPhone(p.phone), p.admin || 'member']));
        const csv = '\uFEFF' + `Group: ${g.name}\nID: ${g.id}\nDescription: ${g.desc||'None'}\nCreated: ${fmtDate(g.creation)}\nYour Role: ${g.myRole}\nParticipants: ${list.length}\n\n` + rows.map(r=>r.join(',')).join('\n');
        downloadBlob(csv, `${g.name.replace(/[^a-z0-9]/gi,'_')}_details.csv`, 'text/csv');
        showToast('Details exported!', 'success');
    }

    const connectedDevice = devices.find(d => d.id === deviceId);

    return (
        <div className="page-content">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><rect x="16" y="12" width="6" height="8" rx="1"/><line x1="19" y1="12" x2="19" y2="8"/></svg>
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Group Grabber</h1>
                        <p style={{ margin: 0, color: 'var(--txt3)', fontSize: 13 }}>Extract and manage WhatsApp groups and communities data</p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={fetchGroups} disabled={loading || !deviceId}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        Refresh
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', fontSize: 12.5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: connectedDevice ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                        {connectedDevice ? `Connected: ${connectedDevice.name}` : 'Not connected'}
                    </div>
                </div>
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                <button onClick={copySelectedIDs} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg2)',color:'var(--txt)',cursor:'pointer',fontSize:12.5,fontWeight:500 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
                    Copy Group IDs
                </button>
                <button onClick={generateAllInviteLinks} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg2)',color:'var(--txt)',cursor:'pointer',fontSize:12.5,fontWeight:500 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Generate Invite Links
                </button>
                <button onClick={exportSummary} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,background:'#3b82f6',color:'#fff',border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    Export Summary
                </button>
                <button onClick={exportParticipants} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,background:'#8b5cf6',color:'#fff',border:'none',cursor:'pointer',fontSize:12.5,fontWeight:600 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Export Participants
                </button>
                <button onClick={exportJSON} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg2)',color:'var(--txt)',cursor:'pointer',fontSize:12.5,fontWeight:500 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                    Export JSON
                </button>
            </div>

            {/* Device selector */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 6, fontWeight: 500 }}>Select Device</div>
                        <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13.5, colorScheme: 'dark', cursor: 'pointer' }}>
                            <option value="">— Select a device —</option>
                            {devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` (${d.phone})` : ''}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '12px 16px', color: '#f87171', marginBottom: 18, fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* Loading spinner */}
            {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: 'var(--txt3)', gap: 12 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    Fetching groups from WhatsApp…
                </div>
            )}

            {/* Stats cards */}
            {!loading && groups.length > 0 && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 18 }}>
                        {[
                            { label: 'Total Groups',        val: allGroups.length,           bg: '#3b82f6', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                            { label: 'Communities',         val: allCommunities.length,      bg: '#8b5cf6', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
                            { label: 'Total Participants',  val: stats.totalParticipants,    bg: '#10b981', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                            { label: 'Admin Groups',        val: stats.adminGroups,          bg: '#f59e0b', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
                            { label: 'Member Groups',       val: stats.memberGroups,         bg: '#6366f1', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                        ].map(({ label, val, bg, icon }) => (
                            <div key={label} style={{ background: bg, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>{label}</div>
                                    <div style={{ opacity: .7 }}>{icon}</div>
                                </div>
                                <div style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>{val.toLocaleString()}</div>
                            </div>
                        ))}
                    </div>

                    {/* Quick Analytics */}
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Quick Analytics</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                            {[
                                { label: 'Average Group Size', val: `${stats.avgSize} participants` },
                                { label: 'Admin Ratio',        val: `${stats.adminRatio}%` },
                                { label: 'Largest Group',      val: stats.largest ? `${stats.largest.size} participants` : '—', sub: stats.largest?.name },
                            ].map(({ label, val, sub }) => (
                                <div key={label} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '14px 16px' }}>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 6 }}>{label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)' }}>{val}</div>
                                    {sub && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* View mode tabs + filters */}
            {!loading && (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* View mode */}
                        <div style={{ display: 'flex', gap: 4, background: 'var(--bg3)', borderRadius: 8, padding: 4 }}>
                            {[['groups','Groups',allGroups.length],['communities','Communities',allCommunities.length],['labels','Labels',labels.length]].map(([key, label, count]) => (
                                <button key={key} onClick={() => { setViewMode(key); setSelected(new Set()); }}
                                    style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                                        background: viewMode === key ? 'var(--accent, #3b82f6)' : 'transparent',
                                        color: viewMode === key ? '#fff' : 'var(--txt2)' }}>
                                    {label} ({count})
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Groups…"
                                style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                        </div>

                        {/* Role filter */}
                        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                            style={{ padding: '8px 28px 8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value="all">All</option>
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                        </select>

                        {/* Sort */}
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                            style={{ padding: '8px 28px 8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13, cursor: 'pointer', colorScheme: 'dark' }}>
                            <option value="name">Name</option>
                            <option value="size">Size</option>
                            <option value="date">Date</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Select All */}
            {!loading && displayList.length > 0 && (
                <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={selectAll} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
                        {selected.size === displayList.length ? 'Deselect All' : 'Select All'}
                    </button>
                    {selected.size > 0 && <span style={{ fontSize: 12.5, color: 'var(--txt3)' }}>{selected.size} selected</span>}
                </div>
            )}

            {/* Group list */}
            {!loading && (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{viewMode === 'communities' ? 'Communities' : viewMode === 'labels' ? 'Labels' : 'Groups'}</div>
                        <div style={{ fontSize: 13, color: 'var(--txt3)' }}>
                            {viewMode === 'labels' ? `${labels.length} label${labels.length !== 1 ? 's' : ''} found` : `${displayList.length} ${viewMode === 'communities' ? 'communities' : 'groups'} found`}
                        </div>
                    </div>

                    {viewMode === 'labels' ? (
                        labelsLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', color: 'var(--txt3)', gap: 12 }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                Loading labels…
                            </div>
                        ) : labels.length === 0 ? (
                            <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--txt3)' }}>
                                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .25, display: 'block', margin: '0 auto 12px' }}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                                <div style={{ fontSize: 14, fontWeight: 500 }}>No labels found</div>
                                <div style={{ fontSize: 12, marginTop: 4 }}>
                                    {labelsError ? labelsError : 'Labels are only available on WhatsApp Business accounts'}
                                </div>
                                <button onClick={fetchLabels} style={{ marginTop: 14, padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13 }}>Retry</button>
                            </div>
                        ) : selectedLabel ? (
                            <LabelsDetailView
                                label={labels.find(l => l.id === selectedLabel)}
                                groups={groups}
                                onBack={() => setSelectedLabel(null)}
                            />
                        ) : (
                            <LabelsListView labels={labels} onSelect={setSelectedLabel} />
                        )
                    ) : displayList.length === 0 ? (
                        <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--txt3)' }}>
                            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: .25, display: 'block', margin: '0 auto 12px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{groups.length === 0 ? 'No groups fetched yet' : 'No groups match your filter'}</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>{groups.length === 0 ? 'Select a device and click Refresh' : 'Try changing the filter or search'}</div>
                        </div>
                    ) : displayList.map(g => (
                        <div key={g.id} onClick={() => openDetail(g)}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                background: selected.has(g.id) ? 'rgba(59,130,246,.07)' : 'transparent',
                                borderLeft: selected.has(g.id) ? '3px solid #3b82f6' : '3px solid transparent' }}>
                            {/* Checkbox */}
                            <div onClick={e => { e.stopPropagation(); toggleSelect(g.id); }}
                                style={{ width: 16, height: 16, borderRadius: 4, border: selected.has(g.id) ? '2px solid #3b82f6' : '2px solid var(--border)', background: selected.has(g.id) ? '#3b82f6' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                {selected.has(g.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                            </div>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt)' }}>{g.name}</span>
                                    {g.isCommunity && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, background: 'rgba(139,92,246,.18)', color: '#8b5cf6', fontWeight: 600 }}>Community</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                                    <span style={{ color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                        {g.size} Participants
                                    </span>
                                    <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                        background: ROLE_STYLE[g.myRole]?.bg || ROLE_STYLE.member.bg,
                                        color: ROLE_STYLE[g.myRole]?.color || ROLE_STYLE.member.color }}>
                                        {ROLE_STYLE[g.myRole]?.label || 'Member'}
                                    </span>
                                    {g.creation && (
                                        <span style={{ color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                            Created {fmtDate(g.creation)}
                                        </span>
                                    )}
                                    <span style={{ color: 'var(--txt3)', fontFamily: 'monospace', fontSize: 11 }}>{g.id}</span>
                                </div>
                            </div>

                            {/* Action icons */}
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                <button title="View Details" onClick={e => { e.stopPropagation(); openDetail(g); }}
                                    style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                </button>
                                <button title="Generate Invite Link" onClick={e => generateInviteLink(g, e)} disabled={genLinkLoading === g.id}
                                    style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 7, background: inviteLinks[g.id] ? 'rgba(37,211,102,.15)' : 'var(--bg3)', color: inviteLinks[g.id] ? '#25D366' : 'var(--txt3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                </button>
                                <button title="Copy Group ID" onClick={e => copyGroupId(g, e)}
                                    style={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg3)', color: 'var(--txt3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Group Details Modal */}
            {detailGroup && (
                <div onClick={() => setDetailGroup(null)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
                    <div onClick={e => e.stopPropagation()}
                        style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                        {/* Modal header */}
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 17 }}>Group Details</div>
                            <button onClick={() => setDetailGroup(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
                        </div>

                        {/* Modal body */}
                        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                            {/* Left: Info */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: 22, borderRight: '1px solid var(--border)' }}>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: 'var(--txt2)' }}>Group Information</div>

                                {[
                                    { label: 'Name', val: detailGroup.name },
                                    { label: 'Description', val: detailGroup.desc || 'No description' },
                                    { label: 'Group ID', val: detailGroup.id, mono: true },
                                ].map(({ label, val, mono }) => (
                                    <div key={label} style={{ marginBottom: 14 }}>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 5 }}>{label}</div>
                                        <input readOnly value={val}
                                            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: mono ? 12 : 13.5, fontFamily: mono ? 'monospace' : 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                                    </div>
                                ))}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 5 }}>Created</div>
                                        <input readOnly value={fmtDate(detailGroup.creation)}
                                            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', fontSize: 13.5, boxSizing: 'border-box', outline: 'none' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 5 }}>Your Role</div>
                                        <input readOnly value={ROLE_STYLE[detailGroup.myRole]?.label || 'Member'}
                                            style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)',
                                                color: ROLE_STYLE[detailGroup.myRole]?.color || 'var(--txt)', fontSize: 13.5, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }} />
                                    </div>
                                </div>

                                <div style={{ fontWeight: 700, fontSize: 14, margin: '18px 0 12px', color: 'var(--txt2)' }}>Settings</div>
                                <div style={{ background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    {[
                                        { label: 'Announcement Mode', val: detailGroup.announce ? 'Admins only' : 'Everyone' },
                                        { label: 'Edit Group Info',   val: detailGroup.restrict ? 'Admins only' : 'Everyone' },
                                    ].map(({ label, val }, i, arr) => (
                                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px',
                                            borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{label}</span>
                                            <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{val}</span>
                                        </div>
                                    ))}
                                </div>

                                {inviteLinks[detailGroup.id] && (
                                    <div style={{ marginTop: 14 }}>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 5 }}>Invite Link</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input readOnly value={inviteLinks[detailGroup.id]}
                                                style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: '#25D366', fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
                                            <button onClick={() => navigator.clipboard.writeText(inviteLinks[detailGroup.id]).then(() => showToast('Copied!','success'))}
                                                style={{ padding: '9px 14px', borderRadius: 8, background: 'rgba(37,211,102,.15)', color: '#25D366', border: '1px solid rgba(37,211,102,.3)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Right: Participants */}
                            <div style={{ width: 290, overflowY: 'auto', padding: 22, flexShrink: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: 'var(--txt2)' }}>
                                    Participants List ({modalParticipants ? modalParticipants.length : '…'})
                                </div>
                                {modalLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--txt3)', fontSize: 13 }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                        Loading participants…
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {(modalParticipants || []).length === 0 && (
                                            <div style={{ color: 'var(--txt3)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>No participants found</div>
                                        )}
                                        {(modalParticipants || []).map(p => (
                                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                background: 'var(--bg3)', borderRadius: 8, padding: '9px 12px', border: '1px solid var(--border)' }}>
                                                <span style={{ fontSize: 12.5, fontFamily: 'monospace', color: p.isLid ? 'var(--txt3)' : 'var(--txt)' }}>
                                                    {p.isLid ? p.phone : `+${p.phone}`}
                                                </span>
                                                {p.admin && (
                                                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 4, fontWeight: 600, flexShrink: 0, marginLeft: 4,
                                                        background: ROLE_STYLE[p.admin]?.bg || ROLE_STYLE.admin.bg,
                                                        color: ROLE_STYLE[p.admin]?.color || ROLE_STYLE.admin.color }}>
                                                        {ROLE_STYLE[p.admin]?.label || p.admin}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--bg2)' }}>
                            <button onClick={() => exportGroupDetails(detailGroup, modalParticipants)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg3)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                Export Details
                            </button>
                            <button onClick={() => { generateInviteLink(detailGroup, { stopPropagation: ()=>{} }); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: 'rgba(37,211,102,.18)', color: '#25D366', border: '1px solid rgba(37,211,102,.3)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                Get Invite Link
                            </button>
                            <button onClick={() => setDetailGroup(null)}
                                style={{ padding: '9px 22px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--txt)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

// ── WhatsApp label color palette ────────────────────────────────────────────
const LABEL_COLORS = [
    '#FF6B6B','#FF8E53','#FFCA28','#A8E063','#43E97B',
    '#38F9D7','#4FACFE','#6A85B6','#A18CD1','#FDA085',
    '#FDDB92','#96FBC4','#F093FB','#C471F5','#FA709A',
    '#F5576C','#FEB47B','#86A8E7','#91EAE4','#2AF598',
];
function labelColor(colorIndex) {
    return LABEL_COLORS[colorIndex % LABEL_COLORS.length] || '#6366f1';
}

function LabelsListView({ labels, onSelect }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {labels.map((lbl) => (
                <div key={lbl.id} onClick={() => onSelect(lbl.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: labelColor(lbl.color), flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--txt)' }}>{lbl.name || `Label #${lbl.id}`}</div>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{(lbl.chats || lbl.groups || []).length} chat{(lbl.chats || lbl.groups || []).length !== 1 ? 's' : ''}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            ))}
        </div>
    );
}

function LabelsDetailView({ label, groups, onBack }) {
    if (!label) return null;
    // Use new 'chats' array (individual contacts + groups) with fallback to old 'groups' array
    const chats = Array.isArray(label.chats) && label.chats.length > 0
        ? label.chats
        : (label.groups || []).map(chatId => ({
            chatId,
            phone: chatId.split('@')[0].split(':')[0],
            isGroup: chatId.includes('@g.us'),
        }));
    // For group chats, try to resolve name from fetched groups list
    const groupsById = Object.fromEntries(groups.map(g => [g.id, g]));
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                    All Labels
                </button>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: labelColor(label.color) }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{label.name || `Label #${label.id}`}</span>
                <span style={{ fontSize: 12, color: 'var(--txt3)' }}>({chats.length} chat{chats.length !== 1 ? 's' : ''})</span>
            </div>
            {chats.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--txt3)', fontSize: 13 }}>No chats found with this label</div>
            ) : chats.map(c => {
                const grpInfo = c.isGroup ? groupsById[c.chatId] : null;
                const displayName = grpInfo ? grpInfo.name : c.isGroup ? `Group ${c.phone}` : c.phone ? `+${c.phone}` : c.chatId;
                return (
                    <div key={c.chatId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: c.isGroup ? 'rgba(59,130,246,.15)' : 'rgba(34,197,94,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                            {c.isGroup ? '👥' : '👤'}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{displayName}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 2, fontFamily: 'monospace' }}>
                                {c.chatId.endsWith('@lid') ? `LID contact · ${c.chatId}` : c.chatId}
                            </div>
                        </div>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: c.isGroup ? 'rgba(59,130,246,.12)' : 'rgba(34,197,94,.12)', color: c.isGroup ? '#3b82f6' : '#22c55e', fontWeight: 600 }}>
                            {c.isGroup ? 'Group' : 'Contact'}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
