import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

// ── Template type definitions ─────────────────────────────────────────────────
const TEMPLATE_TYPES = [
    {
        key: 'text', label: 'Text Message', desc: 'Simple text message with variables',
        buttonType: 'none', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    },
    {
        key: 'image', label: 'Message + Image', desc: 'Text with an image attachment',
        buttonType: 'none', mediaType: 'image', supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    },
    {
        key: 'document', label: 'Message + Document', desc: 'Text with a document file',
        buttonType: 'none', mediaType: 'document', supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
    },
    {
        key: 'contact', label: 'Message + Contact', desc: 'Share a contact card',
        buttonType: 'none', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    },
    {
        key: 'poll', label: 'Message + Poll', desc: 'Create a poll for recipients',
        buttonType: 'none', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    },
    {
        key: 'buttons', label: 'Message + Buttons', desc: 'Quick reply button options',
        buttonType: 'quick-reply', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="2" y="7" width="20" height="4" rx="1"/><rect x="2" y="14" width="20" height="4" rx="1"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="16" x2="17" y2="16"/></svg>,
    },
    {
        key: 'list', label: 'Message + List', desc: 'Scrollable list of options',
        buttonType: 'list', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>,
    },
    {
        key: 'location', label: 'Message + Location', desc: 'Share a map location',
        buttonType: 'none', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
    },
    {
        key: 'video', label: 'Message + Video', desc: 'Text with a video attachment',
        buttonType: 'none', mediaType: 'video', supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
    },
    {
        key: 'audio', label: 'Message + Audio', desc: 'Text with an audio file',
        buttonType: 'none', mediaType: 'audio', supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
    },
    {
        key: 'interactive', label: 'Mixed Interactive Buttons', desc: 'Image header with quick reply buttons',
        buttonType: 'quick-reply', mediaType: 'image', supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    },
    {
        key: 'carousel', label: 'Message + Carousel', desc: 'Swipeable card carousel with images & buttons',
        buttonType: 'none', mediaType: null, supported: true,
        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><rect x="5" y="4" width="14" height="16" rx="2"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><polyline points="2 10 1 12 2 14"/><polyline points="22 10 23 12 22 14"/></svg>,
    },
];

const BUTTON_TYPES = [
    { type: 'quick_reply', label: 'Quick Reply', desc: 'Standard interactive button', icon: '💬', color: 'rgba(74,158,255,.15)', tc: '#4a9eff' },
    { type: 'cta_url',     label: 'CTA URL',     desc: 'Clickable website link',      icon: '🔗', color: 'rgba(34,197,94,.15)',  tc: '#22c55e' },
    { type: 'cta_phone',   label: 'CTA Phone',   desc: 'Call phone number',           icon: '📞', color: 'rgba(251,191,36,.15)', tc: '#fbbf24' },
    { type: 'copy_code',   label: 'Copy Code',   desc: 'Copy text to clipboard',      icon: '📋', color: 'rgba(168,85,247,.15)', tc: '#a855f7' },
];

function inferTemplateType(t) {
    if (t.templateType) return t.templateType;
    if (t.buttonType === 'quick-reply') return (t.mediaType === 'image') ? 'interactive' : 'buttons';
    if (t.buttonType === 'list') return 'list';
    if (t.mediaType === 'video') return 'video';
    if (t.mediaType === 'audio') return 'audio';
    if (t.mediaType === 'document') return 'document';
    if (t.mediaType === 'image' || t.imageFile) return 'image';
    return 'text';
}

const TYPE_BADGE = {
    text: null,
    image: { label: '🖼 Image', color: 'var(--blue-dim, rgba(74,158,255,.15))', text: '#4a9eff' },
    document: { label: '📎 Document', color: 'rgba(251,191,36,.15)', text: '#fbbf24' },
    video: { label: '🎬 Video', color: 'rgba(168,85,247,.15)', text: '#a855f7' },
    audio: { label: '🔊 Audio', color: 'rgba(236,72,153,.15)', text: '#ec4899' },
    buttons: { label: '🔲 Buttons', color: 'var(--green-dim)', text: 'var(--green)' },
    list: { label: '📋 List', color: 'var(--green-dim)', text: 'var(--green)' },
    interactive: { label: '🖼+🔲 Interactive', color: 'var(--green-dim)', text: 'var(--green)' },
    carousel: { label: '🎠 Carousel', color: 'rgba(251,191,36,.15)', text: '#fbbf24' },
    contact: { label: '👤 Contact', color: 'rgba(74,158,255,.15)', text: '#4a9eff' },
    poll: { label: '📊 Poll', color: 'rgba(74,158,255,.15)', text: '#4a9eff' },
    location: { label: '📍 Location', color: 'rgba(34,197,94,.15)', text: '#22c55e' },
};

const EMPTY_FORM = {
    templateType: 'text',
    name: '', content: '',
    buttonType: 'none', mediaType: null,
    buttons: [],
    listButtonText: 'View Options',
    listSections: [],
    cards: [],
    carouselTitle: '', carouselSubtitle: '', carouselFooter: '',
    pollQuestion: '', pollOptions: ['', ''],
    variables: [],
    contactName: '', contactPhone: '',
    locationName: '', locationAddress: '', locationLat: '', locationLng: '',
};

function emptyCard() { return { text: '', footer: '', buttons: ['', ''], imageFile: null }; }

function emptySection() { return { title: 'Section', rows: [{ title: '', description: '' }] }; }

export default function Templates() {
    const { showToast, showConfirm } = useApp();
    const [templates, setTemplates] = useState([]);
    const [modal,     setModal]     = useState(null);
    const [form,      setForm]      = useState(EMPTY_FORM);
    const [pendingImg, setPending]  = useState(null);
    const [removeImg,  setRemove]   = useState(false);
    const [imgPreview, setPreview]  = useState(null);
    const [saving,    setSaving]    = useState(false);
    const [search,    setSearch]    = useState('');
    const [filterType,   setFilterType]   = useState('all');
    const [previewModal, setPreviewModal] = useState(null);
    const imgRef = useRef();
    const contentRef = useRef();
    const [showVarAdd, setShowVarAdd] = useState(false);
    const [varForm,    setVarForm]   = useState({ name: '', values: '' });
    const [showBtnTypeMenu, setShowBtnTypeMenu] = useState(false);

    function insertAtContent(ins) {
        const ta = contentRef.current;
        if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const nv = form.content.slice(0, s) + ins + form.content.slice(e);
        setForm(p => ({ ...p, content: nv }));
        setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + ins.length; ta.focus(); }, 0);
    }

    function addTemplateVariable() {
        const name = varForm.name.trim().replace(/\s+/g, '_');
        const vals = varForm.values.split(',').map(v => v.trim()).filter(Boolean);
        if (!name || !vals.length) return;
        setForm(p => ({ ...p, variables: [...(p.variables || []), { name, values: vals }] }));
        setVarForm({ name: '', values: '' });
        setShowVarAdd(false);
    }

    // ── Media file state (video / audio / document) ───────────────────────────
    const [pendingMedia, setPendingMedia] = useState(null);
    const [removeMedia,  setRemoveMedia]  = useState(false);
    const [mediaName,    setMediaName]    = useState(null); // display name
    const mediaRef = useRef();

    // ── Carousel card image state ─────────────────────────────────────────────
    const [cardPending, setCardPending] = useState([]); // File|null per card
    const [cardPreview, setCardPreview] = useState([]); // string|null per card
    const [cardRemove,  setCardRemove]  = useState([]); // bool per card
    const cardImgRefs = useRef([]);

    useEffect(() => { load(); }, []);

    async function load() {
        try { setTemplates(await api.getTemplates()); } catch { /* ignore */ }
    }

    function openAdd() {
        setForm({ ...EMPTY_FORM, cards: [emptyCard(), emptyCard()] });
        setPending(null); setRemove(false); setPreview(null);
        setPendingMedia(null); setRemoveMedia(false); setMediaName(null);
        setCardPending([]); setCardPreview([]); setCardRemove([]);
        setShowBtnTypeMenu(false);
        setModal({ mode: 'add' });
    }

    function openEdit(t) {
        const tType = inferTemplateType(t);
        const existingCards = t.cards && t.cards.length ? JSON.parse(JSON.stringify(t.cards)) : [emptyCard(), emptyCard()];
        setForm({
            templateType: tType,
            name: t.name, content: t.content || '',
            buttonType: t.buttonType || 'none',
            mediaType: t.mediaType || null,
            buttons: (() => {
                const b = (t.buttons || []).map(btn =>
                    typeof btn === 'string'
                        ? { type: 'quick_reply', label: btn, url: '', phone: '', copyCode: '' }
                        : { type: btn.type || 'quick_reply', label: btn.label || '', url: btn.url || '', phone: btn.phone || '', copyCode: btn.copyCode || '' }
                );
                return b;
            })(),
            listButtonText: t.listButtonText || 'View Options',
            listSections: t.listSections ? JSON.parse(JSON.stringify(t.listSections)) : [],
            cards: existingCards,
            carouselTitle: t.carouselTitle || '',
            carouselSubtitle: t.carouselSubtitle || '',
            carouselFooter: t.carouselFooter || '',
            pollQuestion: t.pollQuestion || '',
            pollOptions: (() => { const o = [...(t.pollOptions || [])]; while (o.length < 2) o.push(''); return o; })(),
            variables: Array.isArray(t.variables) ? t.variables : [],
            contactName: t.contactName || '', contactPhone: t.contactPhone || '',
            locationName: t.locationName || '', locationAddress: t.locationAddress || '',
            locationLat: t.locationLat || '', locationLng: t.locationLng || '',
        });
        setPending(null); setRemove(false);
        setPreview(t.imageFile ? `/data/images/${t.imageFile}` : null);
        setPendingMedia(null); setRemoveMedia(false);
        setMediaName(t.mediaOriginalName || t.mediaFile || null);
        setCardPending(existingCards.map(() => null));
        setCardPreview(existingCards.map(c => c.imageFile ? `/data/images/${c.imageFile}` : null));
        setCardRemove(existingCards.map(() => false));
        setShowBtnTypeMenu(false);
        setModal({ mode: 'edit', template: t });
    }

    function closeModal() { setModal(null); setSaving(false); setShowBtnTypeMenu(false); }

    function selectType(typeDef) {
        if (!typeDef.supported) return;
        setForm(p => {
            const newCards = typeDef.key === 'carousel'
                ? (p.cards.length >= 2 ? p.cards : [emptyCard(), emptyCard()])
                : p.cards;
            return { ...p, templateType: typeDef.key, buttonType: typeDef.buttonType, mediaType: typeDef.mediaType, cards: newCards };
        });
        // Clear single image if switching away from image-based type
        if (typeDef.mediaType !== 'image') {
            setPending(null); setRemove(true); setPreview(null);
        }
        // Reset card image state when switching to carousel
        if (typeDef.key === 'carousel') {
            const count = Math.max(2, form.cards.length);
            setCardPending(Array(count).fill(null));
            setCardPreview(Array(count).fill(null));
            setCardRemove(Array(count).fill(false));
        }
    }

    function onImagePick(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        setPending(file); setRemove(false);
        const reader = new FileReader();
        reader.onload = ev => setPreview(ev.target.result);
        reader.readAsDataURL(file);
    }

    function clearImage() { setPending(null); setRemove(true); setPreview(null); }

    // ── Carousel card helpers ─────────────────────────────────────────────────
    function addCard() {
        setForm(p => ({ ...p, cards: [...p.cards, emptyCard()] }));
        setCardPending(p => [...p, null]);
        setCardPreview(p => [...p, null]);
        setCardRemove(p => [...p, false]);
    }
    function remCard(ci) {
        setForm(p => ({ ...p, cards: p.cards.filter((_, i) => i !== ci) }));
        setCardPending(p => p.filter((_, i) => i !== ci));
        setCardPreview(p => p.filter((_, i) => i !== ci));
        setCardRemove(p => p.filter((_, i) => i !== ci));
    }
    function setCardField(ci, field, value) {
        setForm(p => {
            const cards = [...p.cards];
            cards[ci] = { ...cards[ci], [field]: value };
            return { ...p, cards };
        });
    }
    function setCardButtonLabel(ci, bi, value) {
        setForm(p => {
            const cards = [...p.cards];
            const btns = [...(cards[ci].buttons || ['', ''])];
            btns[bi] = value;
            cards[ci] = { ...cards[ci], buttons: btns };
            return { ...p, cards };
        });
    }
    function onCardImagePick(ci, e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        setCardPending(p => { const a = [...p]; a[ci] = file; return a; });
        setCardRemove(p => { const a = [...p]; a[ci] = false; return a; });
        const reader = new FileReader();
        reader.onload = ev => setCardPreview(p => { const a = [...p]; a[ci] = ev.target.result; return a; });
        reader.readAsDataURL(file);
    }
    function clearCardImage(ci) {
        setCardPending(p => { const a = [...p]; a[ci] = null; return a; });
        setCardPreview(p => { const a = [...p]; a[ci] = null; return a; });
        setCardRemove(p => { const a = [...p]; a[ci] = true; return a; });
        setForm(p => {
            const cards = [...p.cards];
            cards[ci] = { ...cards[ci], imageFile: null };
            return { ...p, cards };
        });
    }

    function addSection() { setForm(p => ({ ...p, listSections: [...p.listSections, emptySection()] })); }
    function remSection(i) { setForm(p => ({ ...p, listSections: p.listSections.filter((_, idx) => idx !== i) })); }
    function setSectionTitle(i, v) {
        setForm(p => { const s = [...p.listSections]; s[i] = { ...s[i], title: v }; return { ...p, listSections: s }; });
    }
    function addRow(si) {
        setForm(p => { const s = [...p.listSections]; s[si] = { ...s[si], rows: [...s[si].rows, { title: '', description: '' }] }; return { ...p, listSections: s }; });
    }
    function remRow(si, ri) {
        setForm(p => { const s = [...p.listSections]; s[si] = { ...s[si], rows: s[si].rows.filter((_, idx) => idx !== ri) }; return { ...p, listSections: s }; });
    }
    function setRowField(si, ri, field, v) {
        setForm(p => {
            const s = [...p.listSections];
            const rows = [...s[si].rows]; rows[ri] = { ...rows[ri], [field]: v };
            s[si] = { ...s[si], rows };
            return { ...p, listSections: s };
        });
    }

    async function save() {
        if (!form.name.trim()) return showToast('Template name required', 'error');
        const contentOptional = ['carousel', 'poll', 'contact', 'location'].includes(form.templateType);
        if (!contentOptional && !form.content.trim())
            return showToast('Message content required', 'error');
        if (form.templateType === 'contact' && !form.contactName.trim())
            return showToast('Contact name is required', 'error');
        if (form.templateType === 'location' && !form.locationName.trim())
            return showToast('Location name is required', 'error');
        if (form.templateType === 'carousel' && form.cards.length < 2)
            return showToast('Carousel needs at least 2 cards', 'error');
        if (form.templateType === 'poll' && !form.pollQuestion.trim())
            return showToast('Poll question is required', 'error');
        if (form.templateType === 'poll' && form.pollOptions.filter(o => o.trim()).length < 2)
            return showToast('Poll needs at least 2 options', 'error');
        if (form.buttonType === 'list' && form.listSections.length === 0)
            return showToast('Add at least one list section', 'error');
        setSaving(true);
        try {
            const payload = {
                name:           form.name.trim(),
                content:        form.content,
                templateType:   form.templateType,
                mediaType:      form.mediaType || null,
                buttonType:     form.buttonType,
                buttons:        form.buttonType === 'quick-reply' ? form.buttons.filter(b => typeof b === 'string' ? b.trim() : (b?.label || '').trim()) : [],
                listButtonText: form.listButtonText,
                listSections:   form.buttonType === 'list' ? form.listSections : [],
                cards:          form.templateType === 'carousel'
                    ? form.cards.map(c => ({ text: c.text || '', footer: c.footer || '', buttons: (c.buttons || []).filter(Boolean), imageFile: c.imageFile || null }))
                    : [],
                carouselTitle:    form.templateType === 'carousel' ? form.carouselTitle    : '',
                carouselSubtitle: form.templateType === 'carousel' ? form.carouselSubtitle : '',
                carouselFooter:   form.templateType === 'carousel' ? form.carouselFooter   : '',
                pollQuestion: form.templateType === 'poll' ? form.pollQuestion : '',
                pollOptions:  form.templateType === 'poll' ? form.pollOptions.filter(o => o.trim()) : [],
                variables: form.variables || [],
                contactName:    form.templateType === 'contact'  ? form.contactName.trim()    : '',
                contactPhone:   form.templateType === 'contact'  ? form.contactPhone.trim()   : '',
                locationName:   form.templateType === 'location' ? form.locationName.trim()   : '',
                locationAddress:form.templateType === 'location' ? form.locationAddress.trim(): '',
                locationLat:    form.templateType === 'location' ? form.locationLat.trim()    : '',
                locationLng:    form.templateType === 'location' ? form.locationLng.trim()    : '',
            };
            let t;
            if (modal.mode === 'add') {
                t = await api.createTemplate(payload);
                // Upload single image (non-carousel)
                if (pendingImg) {
                    const res = await api.uploadTemplateImage(t.id, pendingImg);
                    t.imageFile = res.imageFile;
                }
                // Upload media file (video / audio / document — also interactive with non-image media)
                const needsMediaUpload = ['video','audio','document','poll'].includes(form.templateType) ||
                    (form.templateType === 'interactive' && ['video','audio','document'].includes(form.mediaType));
                if (needsMediaUpload && pendingMedia) {
                    const res = await api.uploadTemplateMedia(t.id, pendingMedia);
                    t.mediaFile = res.mediaFile;
                    t.mediaOriginalName = res.originalName;
                }
                // Upload carousel card images
                if (form.templateType === 'carousel') {
                    for (let ci = 0; ci < form.cards.length; ci++) {
                        if (cardPending[ci]) {
                            const res = await api.uploadCardImage(t.id, ci, cardPending[ci]);
                            t.cards[ci].imageFile = res.imageFile;
                        }
                    }
                }
                setTemplates(prev => [...prev, t]);
                showToast('Template created');
            } else {
                t = await api.updateTemplate(modal.template.id, payload);
                // Handle single image
                if (removeImg) await api.deleteTemplateImage(t.id).catch(() => {});
                if (pendingImg) {
                    const res = await api.uploadTemplateImage(t.id, pendingImg);
                    t.imageFile = res.imageFile;
                } else if (removeImg) {
                    t.imageFile = null;
                } else {
                    t.imageFile = modal.template.imageFile;
                }
                // Handle media file (video / audio / document — also interactive with non-image media)
                const needsMedia = ['video','audio','document','poll'].includes(form.templateType) ||
                    (form.templateType === 'interactive' && ['video','audio','document'].includes(form.mediaType));
                if (needsMedia) {
                    if (pendingMedia) {
                        const res = await api.uploadTemplateMedia(t.id, pendingMedia);
                        t.mediaFile = res.mediaFile;
                        t.mediaOriginalName = res.originalName;
                    } else if (removeMedia) {
                        await api.deleteTemplateMedia(t.id).catch(() => {});
                        t.mediaFile = null;
                        t.mediaOriginalName = null;
                    } else {
                        t.mediaFile = modal.template.mediaFile;
                        t.mediaOriginalName = modal.template.mediaOriginalName;
                    }
                }
                // Handle carousel card images
                if (form.templateType === 'carousel') {
                    for (let ci = 0; ci < form.cards.length; ci++) {
                        if (cardPending[ci]) {
                            const res = await api.uploadCardImage(t.id, ci, cardPending[ci]);
                            if (t.cards) t.cards[ci].imageFile = res.imageFile;
                        } else if (cardRemove[ci]) {
                            await api.deleteCardImage(t.id, ci).catch(() => {});
                            if (t.cards) t.cards[ci].imageFile = null;
                        }
                    }
                }
                setTemplates(prev => prev.map(x => x.id === t.id ? t : x));
                showToast('Template updated');
            }
            closeModal();
        } catch (e) { showToast(e.message, 'error'); } finally { setSaving(false); }
    }

    async function del(id) {
        if (!await showConfirm('Delete Template', 'Are you sure you want to delete this template?', { danger: true, confirmLabel: 'Delete' })) return;
        try { await api.deleteTemplate(id); setTemplates(prev => prev.filter(t => t.id !== id)); showToast('Template deleted'); }
        catch (e) { showToast(e.message, 'error'); }
    }

    function openPreview(t) { setPreviewModal(t); }

    function renderContent(content, vars) {
        if (!content) return <span style={{ color: 'rgba(255,255,255,.3)', fontStyle: 'italic' }}>No message content</span>;
        const parts = content.split(/(\{[^{}]+\})/g);
        return parts.map((part, i) =>
            /^\{[^{}]+\}$/.test(part)
                ? <span key={i} style={{ color: '#ffd54f', fontWeight: 600, background: 'rgba(255,213,79,.12)', borderRadius: 3, padding: '0 2px' }}>{part}</span>
                : part
        );
    }

    const usedTypes = [...new Set(templates.map(t => inferTemplateType(t)))];
    const filtered = templates
        .filter(t => {
            const tType = inferTemplateType(t);
            const matchesType = filterType === 'all' || tType === filterType;
            const matchesSearch = !search ||
                (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
                (t.content || '').toLowerCase().includes(search.toLowerCase());
            return matchesType && matchesSearch;
        })
        .sort((a, b) => (b.id || 0) - (a.id || 0));

    const selectedTypeDef = TEMPLATE_TYPES.find(x => x.key === form.templateType) || TEMPLATE_TYPES[0];
    const showImageUpload     = form.mediaType === 'image';
    const mediaFileType       = form.templateType === 'interactive' ? form.mediaType : form.templateType;
    const showMediaFilePicker = ['video', 'audio', 'document'].includes(mediaFileType);
    const btnMax              = 5;

    function onMediaPick(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';
        setPendingMedia(file); setRemoveMedia(false); setMediaName(file.name);
    }
    function clearMedia() { setPendingMedia(null); setRemoveMedia(true); setMediaName(null); }
    function selectInteractiveMedia(mType) {
        setForm(p => ({ ...p, mediaType: mType }));
        setPending(null); setRemove(true); setPreview(null);
        setPendingMedia(null); setRemoveMedia(false); setMediaName(null);
    }

    return (
        <div className="page-content">
            {/* ── Header ── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Message Templates</h1>
                    <p className="page-sub">Create and manage reusable message templates</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
                        Import
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Export
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}>+ Create Template</button>
                </div>
            </div>

            {/* ── Search / Filter bar ── */}
            {templates.length > 0 && (
                <div style={{ marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"
                            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)', pointerEvents: 'none' }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input type="text" placeholder="Search templates…" value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ paddingLeft: 34, width: '100%' }} />
                    </div>
                    {usedTypes.length > 1 && (
                        <select value={filterType} onChange={e => setFilterType(e.target.value)}
                            style={{ padding: '7px 10px', fontSize: 13, borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--txt1)', width: 150, cursor: 'pointer', flexShrink: 0 }}>
                            <option value="all">All Types</option>
                            {usedTypes.map(k => {
                                const def = TEMPLATE_TYPES.find(x => x.key === k);
                                const cnt = templates.filter(t => inferTemplateType(t) === k).length;
                                return <option key={k} value={k}>{def?.label || k} ({cnt})</option>;
                            })}
                        </select>
                    )}
                </div>
            )}

            {/* ── Grid / Empty state ── */}
            {filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 16 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64" style={{ color: 'var(--txt3)' }}>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: 18 }}>No templates yet</h3>
                        <p style={{ color: 'var(--txt3)', fontSize: 14, margin: 0 }}>Create your first message template to get started</p>
                    </div>
                    <button className="btn btn-primary" onClick={openAdd}>+ Create Template</button>
                </div>
            ) : (
                <div className="templates-grid">
                    {filtered.map(t => {
                        const tType = inferTemplateType(t);
                        const badge = TYPE_BADGE[tType];
                        const typeDef = TEMPLATE_TYPES.find(x => x.key === tType);
                        return (
                            <div key={t.id} className="template-card">
                                {t.imageFile && (
                                    <div className="template-card-img-wrap">
                                        <img src={`/data/images/${t.imageFile}`} alt="" className="template-card-img template-card-img-loading"
                                            onLoad={e => e.currentTarget.classList.remove('template-card-img-loading')} />
                                    </div>
                                )}
                                <div className="template-card-body">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                                        <span style={{ color: 'var(--txt3)', flexShrink: 0, marginTop: 1 }}>{typeDef?.icon}</span>
                                        <div className="template-card-name">{t.name}</div>
                                    </div>
                                    <div className="template-card-preview">{t.content?.slice(0, 80)}{t.content?.length > 80 ? '…' : ''}</div>
                                    {badge && (
                                        <div style={{
                                            display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 600,
                                            padding: '2px 8px', borderRadius: 20,
                                            background: badge.color, color: badge.text,
                                        }}>{badge.label}{tType === 'carousel' && Array.isArray(t.cards) ? ` · ${t.cards.length} cards` : ''}</div>
                                    )}
                                </div>
                                <div className="template-card-actions">
                                    <button className="btn btn-ghost btn-xs" onClick={() => openPreview(t)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12" style={{ marginRight: 4 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        Preview
                                    </button>
                                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>Edit</button>
                                    <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => del(t.id)}>Delete</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Create / Edit Modal ── */}
            {modal && (
                <Modal title={modal.mode === 'add' ? 'Create Template' : 'Edit Template'} onClose={closeModal} size="xl">

                    {/* Template Type Picker */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            Template Type
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {TEMPLATE_TYPES.map(typeDef => {
                                const selected = form.templateType === typeDef.key;
                                return (
                                    <button key={typeDef.key}
                                        onClick={() => selectType(typeDef)}
                                        title={typeDef.supported ? typeDef.desc : 'Coming soon'}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            justifyContent: 'center', gap: 7, padding: '12px 6px',
                                            borderRadius: 'var(--radius)',
                                            border: `2px solid ${selected ? 'var(--blue, #4a9eff)' : 'var(--border)'}`,
                                            background: selected ? 'rgba(74,158,255,.12)' : 'var(--bg2)',
                                            cursor: typeDef.supported ? 'pointer' : 'not-allowed',
                                            opacity: typeDef.supported ? 1 : 0.38,
                                            transition: 'border-color .15s, background .15s',
                                            color: selected ? '#4a9eff' : 'var(--txt2)',
                                            fontSize: 11, fontWeight: 500, textAlign: 'center', lineHeight: 1.35,
                                            minHeight: 80,
                                        }}>
                                        <span style={{ color: 'inherit', display: 'flex' }}>{typeDef.icon}</span>
                                        <span>{typeDef.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedTypeDef && (
                            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--txt3)' }}>{selectedTypeDef.desc}</p>
                        )}
                    </div>

                    {/* Template Name */}
                    <div className="form-group">
                        <label>Template Name</label>
                        <input type="text" value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="e.g. Welcome Message" />
                    </div>

                    {/* Message Content */}
                    <div className="form-group">
                        <label>
                            {['carousel','poll','contact','location'].includes(form.templateType) ? 'Intro Message' : 'Message Content'}
                            <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                                {form.templateType === 'carousel'
                                    ? '— shown above the carousel'
                                    : form.templateType === 'poll'
                                        ? '— optional text shown before the poll'
                                        : form.templateType === 'contact' || form.templateType === 'location'
                                            ? '— optional text shown above the card'
                                            : "— use {{name}} for personalization"}
                            </span>
                        </label>
                        <textarea rows={['carousel','poll','contact','location'].includes(form.templateType) ? 3 : 5} ref={contentRef} value={form.content}
                            onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                            placeholder={form.templateType === 'carousel'
                                ? "Check out our latest offers!"
                                : form.templateType === 'poll'
                                    ? "(optional intro message)"
                                    : form.templateType === 'contact' || form.templateType === 'location'
                                        ? "(optional intro message)"
                                        : "Hi {{name}}, thanks for your interest!"} />

                        {/* ── Sequential Variables ── */}
                        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)' }}>🔄 Sequential Variables</span>
                                <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11 }} onClick={() => setShowVarAdd(p => !p)}>+ Add Variable</button>
                            </div>
                            {(form.variables || []).length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: showVarAdd ? 8 : 0 }}>
                                    {(form.variables || []).map((v, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg)', borderRadius: 5, fontSize: 12 }}>
                                            <code style={{ color: 'var(--green)', flex: '0 0 auto', fontSize: 12 }}>{'{' + v.name + '}'}</code>
                                            <span style={{ flex: 1, color: 'var(--txt3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.values.join(', ')}</span>
                                            <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11 }} onClick={() => insertAtContent(`{${v.name}}`)}>Insert</button>
                                            <button type="button" className="btn btn-ghost btn-xs" style={{ fontSize: 11, color: 'var(--red)' }} onClick={() => setForm(p => ({ ...p, variables: p.variables.filter((_, i) => i !== idx) }))}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {showVarAdd ? (
                                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 4 }}>
                                    <input type="text" value={varForm.name} onChange={e => setVarForm(p => ({ ...p, name: e.target.value }))} placeholder="var_name" style={{ width: 90, fontSize: 12, padding: '4px 7px' }} />
                                    <input type="text" value={varForm.values} onChange={e => setVarForm(p => ({ ...p, values: e.target.value }))} placeholder="Hi, Hello, Good morning" style={{ flex: 1, fontSize: 12, padding: '4px 7px' }} />
                                    <button type="button" className="btn btn-primary btn-xs" onClick={addTemplateVariable}>Add</button>
                                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => { setShowVarAdd(false); setVarForm({ name: '', values: '' }); }}>Cancel</button>
                                </div>
                            ) : !(form.variables || []).length && (
                                <p style={{ fontSize: 11, color: 'var(--txt3)', margin: 0 }}>Variables cycle through values per contact. Use <code style={{ color: 'var(--txt2)' }}>{'{varname}'}</code> in your message.</p>
                            )}
                        </div>
                    </div>

                    {/* Carousel Settings */}
                    {form.templateType === 'carousel' && (
                        <div className="form-group" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 14px 10px' }}>
                            <label style={{ marginBottom: 12, fontWeight: 600 }}>Carousel Settings</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Title <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                    <input type="text" value={form.carouselTitle}
                                        onChange={e => setForm(p => ({ ...p, carouselTitle: e.target.value }))}
                                        placeholder="Carousel title" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Subtitle <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                    <input type="text" value={form.carouselSubtitle}
                                        onChange={e => setForm(p => ({ ...p, carouselSubtitle: e.target.value }))}
                                        placeholder="Carousel subtitle" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Footer <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                    <input type="text" value={form.carouselFooter}
                                        onChange={e => setForm(p => ({ ...p, carouselFooter: e.target.value }))}
                                        placeholder="Carousel footer" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Contact fields */}
                    {form.templateType === 'contact' && (
                        <div className="form-group" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 14px 10px' }}>
                            <label style={{ marginBottom: 12, fontWeight: 600 }}>👤 Contact Details</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Contact Name <span style={{ color: 'var(--red)' }}>*</span></div>
                                    <input type="text" value={form.contactName}
                                        onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))}
                                        placeholder="e.g. John Doe" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Phone Number <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                    <input type="text" value={form.contactPhone}
                                        onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))}
                                        placeholder="e.g. +1 234 567 8900" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Location fields */}
                    {form.templateType === 'location' && (
                        <div className="form-group" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 14px 10px' }}>
                            <label style={{ marginBottom: 12, fontWeight: 600 }}>📍 Location Details</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Location Name <span style={{ color: 'var(--red)' }}>*</span></div>
                                    <input type="text" value={form.locationName}
                                        onChange={e => setForm(p => ({ ...p, locationName: e.target.value }))}
                                        placeholder="e.g. Our Main Office" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Address <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                    <input type="text" value={form.locationAddress}
                                        onChange={e => setForm(p => ({ ...p, locationAddress: e.target.value }))}
                                        placeholder="e.g. 123 Main Street, City" />
                                </div>
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Latitude <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                        <input type="text" value={form.locationLat}
                                            onChange={e => setForm(p => ({ ...p, locationLat: e.target.value }))}
                                            placeholder="e.g. 37.7749" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Longitude <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                                        <input type="text" value={form.locationLng}
                                            onChange={e => setForm(p => ({ ...p, locationLng: e.target.value }))}
                                            placeholder="e.g. -122.4194" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Poll builder */}
                    {form.templateType === 'poll' && (<>
                        <div className="form-group">
                            <label>Poll Question</label>
                            <input type="text" value={form.pollQuestion}
                                onChange={e => setForm(p => ({ ...p, pollQuestion: e.target.value }))}
                                placeholder="e.g. What is your favorite color?" />
                        </div>

                        <div className="form-group">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <label style={{ marginBottom: 0 }}>
                                    Poll Options
                                    <span style={{ color: 'var(--txt3)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>(2–12)</span>
                                </label>
                                {form.pollOptions.length < 12 && (
                                    <button type="button" className="btn btn-primary btn-sm"
                                        onClick={() => setForm(p => ({ ...p, pollOptions: [...p.pollOptions, ''] }))}>
                                        Add Option
                                    </button>
                                )}
                            </div>
                            {form.pollOptions.map((opt, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <input type="text" value={opt}
                                        onChange={e => { const o = [...form.pollOptions]; o[i] = e.target.value; setForm(p => ({ ...p, pollOptions: o })); }}
                                        placeholder={`Option ${i + 1}`}
                                        style={{ flex: 1, marginBottom: 0 }} />
                                    {form.pollOptions.length > 2 && (
                                        <button type="button" className="btn btn-ghost btn-xs"
                                            style={{ color: 'var(--red)', flexShrink: 0, padding: '4px 8px' }}
                                            onClick={() => setForm(p => ({ ...p, pollOptions: p.pollOptions.filter((_, j) => j !== i) }))}>
                                            🗑
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="form-group">
                            <label>
                                📎 Media Attachment
                                <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(Optional)</span>
                            </label>
                            <p style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>Add an image, video, audio, or document to your poll message</p>
                            {mediaName ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaName}</span>
                                    <button type="button" className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', flexShrink: 0 }} onClick={clearMedia}>Remove</button>
                                </div>
                            ) : (
                                <div onClick={() => mediaRef.current.click()}
                                    style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius)', padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg2)' }}>
                                    <div style={{ fontSize: 22, marginBottom: 8 }}>📎</div>
                                    <div style={{ color: 'var(--blue, #4a9eff)', fontWeight: 500, marginBottom: 4 }}>Click to upload media</div>
                                    <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Images, videos, audio, or documents</div>
                                </div>
                            )}
                            <input ref={mediaRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                style={{ display: 'none' }} onChange={onMediaPick} />
                        </div>
                    </>)}

                    {/* Media type picker for interactive type */}
                    {form.templateType === 'interactive' && (
                        <div className="form-group">
                            <label>Media Type</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {[
                                    { key: 'image', icon: '🖼', label: 'Image' },
                                    { key: 'document', icon: '📎', label: 'Document' },
                                    { key: 'audio', icon: '🔊', label: 'Audio' },
                                    { key: 'video', icon: '🎬', label: 'Video' },
                                ].map(m => (
                                    <button key={m.key} type="button"
                                        className={`btn btn-sm ${form.mediaType === m.key ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => selectInteractiveMedia(m.key)}>
                                        {m.icon} {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Image upload (image / interactive types) */}
                    {showImageUpload && (
                        <div className="form-group">
                            <label>Image</label>
                            {imgPreview ? (
                                <div className="image-preview-wrap">
                                    <img src={imgPreview} alt="" className="image-preview-img" />
                                    <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', marginLeft: 8 }} onClick={clearImage}>Remove</button>
                                </div>
                            ) : (
                                <button className="btn btn-ghost btn-sm" onClick={() => imgRef.current.click()}>📷 Attach Image</button>
                            )}
                            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onImagePick} />
                        </div>
                    )}

                    {/* Media file picker for video / audio / document (also interactive with non-image media) */}
                    {showMediaFilePicker && (
                        <div className="form-group">
                            <label>
                                {mediaFileType === 'video' ? '🎬' : mediaFileType === 'audio' ? '🔊' : '📎'}{' '}
                                Attach {mediaFileType.charAt(0).toUpperCase() + mediaFileType.slice(1)} File
                                <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400, marginLeft: 6 }}>(optional — saved with template)</span>
                            </label>
                            {mediaName ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mediaName}</span>
                                    <button type="button" className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', flexShrink: 0 }} onClick={clearMedia}>Remove</button>
                                </div>
                            ) : (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => mediaRef.current.click()}>
                                    📂 Attach {mediaFileType} file
                                </button>
                            )}
                            <input ref={mediaRef} type="file"
                                accept={mediaFileType === 'video' ? 'video/*' : mediaFileType === 'audio' ? 'audio/*' : '*/*'}
                                style={{ display: 'none' }} onChange={onMediaPick} />
                        </div>
                    )}

                    {/* Buttons — Quick Reply / CTA URL / CTA Phone / Copy Code */}
                    {form.buttonType === 'quick-reply' && (
                        <div className="form-group">
                            <label>Buttons <span style={{ color: 'var(--txt3)', fontSize: 11, fontWeight: 400 }}>(max {btnMax})</span></label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {form.buttons.map((btn, i) => {
                                    const bType = typeof btn === 'string' ? 'quick_reply' : (btn.type || 'quick_reply');
                                    const bLabel = typeof btn === 'string' ? btn : (btn.label || '');
                                    const typeDef = BUTTON_TYPES.find(x => x.type === bType) || BUTTON_TYPES[0];
                                    const canRemove = form.buttons.length > 2;
                                    function updateBtn(field, value) {
                                        setForm(p => {
                                            const btns = [...p.buttons];
                                            const existing = typeof btns[i] === 'string' ? { type: 'quick_reply', label: btns[i], url: '', phone: '', copyCode: '' } : { ...btns[i] };
                                            btns[i] = { ...existing, [field]: value };
                                            return { ...p, buttons: btns };
                                        });
                                    }
                                    return (
                                        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', background: 'var(--bg2)' }}>
                                            {/* Type badge + label row */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: bType !== 'quick_reply' ? 8 : 0 }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: typeDef.color, color: typeDef.tc, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                    {typeDef.icon} {typeDef.label}
                                                </span>
                                                <input type="text" value={bLabel}
                                                    onChange={e => updateBtn('label', e.target.value)}
                                                    placeholder="Button label"
                                                    style={{ flex: 1, marginBottom: 0 }} />
                                                {canRemove && (
                                                    <button type="button" className="btn btn-ghost btn-xs"
                                                        style={{ color: 'var(--red)', flexShrink: 0, padding: '4px 8px' }}
                                                        onClick={() => setForm(p => ({ ...p, buttons: p.buttons.filter((_, j) => j !== i) }))}>
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                            {/* Extra field per type */}
                                            {bType === 'cta_url' && (
                                                <input type="url" value={btn.url || ''}
                                                    onChange={e => updateBtn('url', e.target.value)}
                                                    placeholder="https://example.com"
                                                    style={{ marginBottom: 0, fontSize: 12 }} />
                                            )}
                                            {bType === 'cta_phone' && (
                                                <input type="tel" value={btn.phone || ''}
                                                    onChange={e => updateBtn('phone', e.target.value)}
                                                    placeholder="+1 234 567 8900"
                                                    style={{ marginBottom: 0, fontSize: 12 }} />
                                            )}
                                            {bType === 'copy_code' && (
                                                <input type="text" value={btn.copyCode || ''}
                                                    onChange={e => updateBtn('copyCode', e.target.value)}
                                                    placeholder="e.g. PROMO2026"
                                                    style={{ marginBottom: 0, fontSize: 12 }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Add Button dropdown */}
                            {form.buttons.length < btnMax && (
                                <div style={{ position: 'relative', marginTop: 10, display: 'inline-block' }}>
                                    <button type="button" className="btn btn-primary btn-sm"
                                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                        onClick={() => setShowBtnTypeMenu(p => !p)}>
                                        + Add Button
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>
                                    </button>
                                    {showBtnTypeMenu && (<>
                                        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowBtnTypeMenu(false)} />
                                        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 100, minWidth: 230, overflow: 'hidden' }}>
                                            {BUTTON_TYPES.map(bt => (
                                                <div key={bt.type}
                                                    onClick={() => {
                                                        setForm(p => ({ ...p, buttons: [...p.buttons, { type: bt.type, label: '', url: '', phone: '', copyCode: '' }] }));
                                                        setShowBtnTypeMenu(false);
                                                    }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{bt.icon}</span>
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt1)' }}>{bt.label}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{bt.desc}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* List builder */}
                    {form.buttonType === 'list' && (
                        <div className="form-group">
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <label>List Button Label</label>
                                <input type="text" value={form.listButtonText}
                                    onChange={e => setForm(p => ({ ...p, listButtonText: e.target.value }))}
                                    placeholder="View Options" />
                            </div>
                            {form.listSections.map((sec, si) => (
                                <div key={si} className="list-section-block">
                                    <div className="list-section-header">
                                        <input type="text" value={sec.title} onChange={e => setSectionTitle(si, e.target.value)} placeholder="Section Title" />
                                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => remSection(si)}>✕</button>
                                    </div>
                                    {sec.rows.map((row, ri) => (
                                        <div key={ri} className="list-row-item">
                                            <input type="text" value={row.title} onChange={e => setRowField(si, ri, 'title', e.target.value)} placeholder="Row title" />
                                            <input type="text" value={row.description} onChange={e => setRowField(si, ri, 'description', e.target.value)} placeholder="Description (optional)" />
                                            {sec.rows.length > 1 && <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => remRow(si, ri)}>✕</button>}
                                        </div>
                                    ))}
                                    <button className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => addRow(si)}>+ Add Row</button>
                                </div>
                            ))}
                            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addSection}>+ Add Section</button>
                        </div>
                    )}

                    {/* Carousel card builder */}
                    {form.templateType === 'carousel' && (
                        <div className="form-group">
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ marginBottom: 0 }}>
                                    Carousel Cards
                                    <span style={{ color: 'var(--txt3)', fontWeight: 400, marginLeft: 6 }}>
                                        ({form.cards.length} card{form.cards.length !== 1 ? 's' : ''} · min 2, max 10)
                                    </span>
                                </label>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {form.cards.map((card, ci) => (
                                    <div key={ci} style={{
                                        border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
                                        padding: '14px 14px 10px', background: 'var(--bg2)', position: 'relative',
                                    }}>
                                        {/* Card header */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                                Card {ci + 1}
                                            </span>
                                            {form.cards.length > 2 && (
                                                <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => remCard(ci)}>✕ Remove</button>
                                            )}
                                        </div>

                                        {/* Card image */}
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 6 }}>Image (optional)</div>
                                            {cardPreview[ci] ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <img src={cardPreview[ci]} alt="" style={{ height: 56, width: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                                                    <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => clearCardImage(ci)}>Remove</button>
                                                </div>
                                            ) : (
                                                <button className="btn btn-ghost btn-sm" onClick={() => { if (!cardImgRefs.current[ci]) cardImgRefs.current[ci] = document.createElement('input'); cardImgRefs.current[ci].type = 'file'; cardImgRefs.current[ci].accept = 'image/*'; cardImgRefs.current[ci].onchange = e => onCardImagePick(ci, e); cardImgRefs.current[ci].click(); }}>
                                                    📷 Attach Image
                                                </button>
                                            )}
                                        </div>

                                        {/* Card body text */}
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Card Text</div>
                                            <textarea rows={2} value={card.text}
                                                onChange={e => setCardField(ci, 'text', e.target.value)}
                                                placeholder="Product name or description…"
                                                style={{ resize: 'vertical', minHeight: 48 }} />
                                        </div>

                                        {/* Card footer */}
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Footer (optional)</div>
                                            <input type="text" value={card.footer}
                                                onChange={e => setCardField(ci, 'footer', e.target.value)}
                                                placeholder="e.g. Starting from $99" />
                                        </div>

                                        {/* Card buttons (max 2) */}
                                        <div>
                                            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 4 }}>Buttons (max 2, optional)</div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {[0, 1].map(bi => (
                                                    <input key={bi} type="text"
                                                        value={(card.buttons || ['', ''])[bi] || ''}
                                                        onChange={e => setCardButtonLabel(ci, bi, e.target.value)}
                                                        placeholder={`Button ${bi + 1}`}
                                                        style={{ flex: 1 }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {form.cards.length < 10 && (
                                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={addCard}>+ Add Card</button>
                            )}
                        </div>
                    )}

                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button>
                    </div>
                </Modal>
            )}

            {/* ── Preview Modal ── */}
            {previewModal && (() => {
                const pt = previewModal;
                const pType = inferTemplateType(pt);
                const pBadge = TYPE_BADGE[pType];
                const pTypeDef = TEMPLATE_TYPES.find(x => x.key === pType);
                const hasButtons = pt.buttonType === 'quick-reply' && pt.buttons?.some(Boolean);
                const hasList = pt.buttonType === 'list';
                const isPoll = pType === 'poll';
                const isCarousel = pType === 'carousel';
                const hasHeaderImg = (pType === 'image' || pType === 'interactive') && pt.imageFile;
                return (
                    <Modal title={`Preview — ${pt.name}`} onClose={() => setPreviewModal(null)} size="lg">
                        {/* Type info bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 20 }}>
                            <span style={{ color: 'var(--txt3)', display: 'flex', flexShrink: 0 }}>{pTypeDef?.icon}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14 }}>{pTypeDef?.label}</div>
                                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>{pTypeDef?.desc}</div>
                            </div>
                            {pBadge && (
                                <div style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: pBadge.color, color: pBadge.text, flexShrink: 0 }}>
                                    {pBadge.label}{isCarousel && Array.isArray(pt.cards) ? ` · ${pt.cards.length} cards` : ''}
                                </div>
                            )}
                        </div>

                        {/* WhatsApp dark chat preview */}
                        <div style={{ background: '#0b141a', borderRadius: 12, padding: '20px 16px', marginBottom: 16, backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M0 0h20L0 20z\'/%3E%3C/g%3E%3C/svg%3E")' }}>

                            {/* Carousel layout */}
                            {isCarousel && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {pt.content && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <div style={{ maxWidth: '75%', background: '#025c4c', borderRadius: '12px 2px 12px 12px', padding: '8px 12px' }}>
                                                <div style={{ fontSize: 14, lineHeight: 1.5, color: '#fff', whiteSpace: 'pre-wrap' }}>{renderContent(pt.content, pt.variables)}</div>
                                                <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>12:34 ✓✓</div>
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
                                        {(pt.cards || []).map((card, ci) => (
                                            <div key={ci} style={{ flex: '0 0 190px', background: '#1a2c38', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,.1)' }}>
                                                {card.imageFile
                                                    ? <img src={`/data/images/${card.imageFile}`} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                                                    : <div style={{ height: 80, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🖼</div>
                                                }
                                                <div style={{ padding: '8px 10px' }}>
                                                    {card.text && <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.4, marginBottom: card.footer ? 3 : 0 }}>{card.text}</div>}
                                                    {card.footer && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>{card.footer}</div>}
                                                    {card.buttons?.filter(Boolean).length > 0 && (
                                                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                            {card.buttons.filter(Boolean).map((b, bi) => (
                                                                <div key={bi} style={{ textAlign: 'center', padding: '5px', borderTop: '1px solid rgba(255,255,255,.1)', fontSize: 12, color: '#4fc3f7' }}>{typeof b === 'string' ? b : b.label}</div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Poll layout */}
                            {isPoll && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                    {pt.content && (
                                        <div style={{ maxWidth: '75%', background: '#025c4c', borderRadius: '12px 2px 12px 12px', padding: '8px 12px' }}>
                                            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#fff', whiteSpace: 'pre-wrap' }}>{renderContent(pt.content, pt.variables)}</div>
                                            <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>12:34 ✓✓</div>
                                        </div>
                                    )}
                                    {pt.pollQuestion && (
                                        <div style={{ maxWidth: '75%', background: '#025c4c', borderRadius: '12px 2px 12px 12px', padding: '12px 14px', minWidth: 200 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>📊 {pt.pollQuestion}</div>
                                            {(pt.pollOptions || []).map((opt, oi) => (
                                                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.12)' }}>
                                                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,.45)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, color: '#fff' }}>{opt}</span>
                                                </div>
                                            ))}
                                            <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 6 }}>12:34 ✓✓</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* All other types */}
                            {!isCarousel && !isPoll && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>

                                    {/* Contact card */}
                                    {pType === 'contact' && (
                                        <div style={{ maxWidth: '75%', width: '100%', display: 'flex', flexDirection: 'column' }}>
                                            {pt.content && (
                                                <div style={{ background: '#025c4c', borderRadius: '12px 2px 0 0', padding: '8px 12px' }}>
                                                    <div style={{ fontSize: 14, lineHeight: 1.6, color: '#fff', whiteSpace: 'pre-wrap' }}>{renderContent(pt.content, pt.variables)}</div>
                                                </div>
                                            )}
                                            <div style={{ background: '#025c4c', borderRadius: pt.content ? '0' : '12px 2px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(74,158,255,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#4a9eff" strokeWidth="2" width="20" height="20"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{pt.contactName || 'Contact Name'}</div>
                                                    {pt.contactPhone && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 1 }}>{pt.contactPhone}</div>}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', alignSelf: 'flex-end' }}>12:34 ✓✓</div>
                                            </div>
                                            <div style={{ background: '#0a2331', borderTop: '1px solid rgba(255,255,255,.1)', borderRadius: '0 0 12px 12px', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" strokeWidth="2" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                                <span style={{ color: '#53bdeb', fontSize: 13, fontWeight: 500 }}>View contact</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Location card */}
                                    {pType === 'location' && (
                                        <div style={{ maxWidth: '75%', width: '100%', display: 'flex', flexDirection: 'column' }}>
                                            {pt.content && (
                                                <div style={{ background: '#025c4c', borderRadius: '12px 2px 0 0', padding: '8px 12px' }}>
                                                    <div style={{ fontSize: 14, lineHeight: 1.6, color: '#fff', whiteSpace: 'pre-wrap' }}>{renderContent(pt.content, pt.variables)}</div>
                                                </div>
                                            )}
                                            <div style={{ background: '#025c4c', borderRadius: pt.content ? '0' : '12px 2px 0 0', overflow: 'hidden' }}>
                                                <div style={{ height: 110, background: 'linear-gradient(135deg,#1a3a2a 0%,#0d2b1f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 19px,rgba(255,255,255,.05) 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,rgba(255,255,255,.05) 20px)' }} />
                                                    <svg viewBox="0 0 24 24" fill="#e53935" stroke="#c62828" strokeWidth="0.5" width="32" height="32" style={{ position: 'relative' }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white"/></svg>
                                                </div>
                                                <div style={{ padding: '8px 12px' }}>
                                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{pt.locationName || 'Location'}</div>
                                                    {pt.locationAddress && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{pt.locationAddress}</div>}
                                                    <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>12:34 ✓✓</div>
                                                </div>
                                            </div>
                                            <div style={{ background: '#0a2331', borderTop: '1px solid rgba(255,255,255,.1)', borderRadius: '0 0 12px 12px', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" strokeWidth="2" width="14" height="14"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                                <span style={{ color: '#53bdeb', fontSize: 13, fontWeight: 500 }}>Get Directions</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Standard types (text, image, document, video, audio, buttons, list, interactive) */}
                                    {pType !== 'contact' && pType !== 'location' && (<>
                                        {/* Media indicators for doc/video/audio */}
                                        {(pType === 'document' || pType === 'video' || pType === 'audio') && (
                                            <div style={{ maxWidth: '75%', background: '#025c4c', borderRadius: '12px 2px 0 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                                <span style={{ fontSize: 22, flexShrink: 0 }}>
                                                    {pType === 'video' ? '🎬' : pType === 'audio' ? '🔊' : '📎'}
                                                </span>
                                                <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {pt.mediaOriginalName || pt.mediaFile || `${pType} attachment`}
                                                </span>
                                            </div>
                                        )}

                                        {/* Header image */}
                                        {hasHeaderImg && (
                                            <div style={{ maxWidth: '75%', borderRadius: '12px 2px 0 0', overflow: 'hidden', width: '100%' }}>
                                                <img src={`/data/images/${pt.imageFile}`} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', display: 'block' }} />
                                            </div>
                                        )}

                                        {/* Message bubble + attached buttons as one WhatsApp-style card */}
                                        <div style={{ maxWidth: '75%', width: hasHeaderImg || hasButtons || hasList ? '100%' : undefined, display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ background: '#025c4c', borderRadius: hasHeaderImg ? (hasButtons || hasList ? '0' : '0 0 12px 12px') : (hasButtons || hasList ? '12px 2px 0 0' : '12px 2px 12px 12px'), padding: '8px 12px' }}>
                                                <div style={{ fontSize: 14, lineHeight: 1.6, color: '#fff', whiteSpace: 'pre-wrap' }}>
                                                    {renderContent(pt.content, pt.variables)}
                                                </div>
                                                <div style={{ textAlign: 'right', fontSize: 10, color: 'rgba(255,255,255,.35)', marginTop: 4 }}>12:34 ✓✓</div>
                                            </div>
                                            {/* Quick-reply button rows */}
                                            {hasButtons && pt.buttons.filter(Boolean).map((b, bi, arr) => (
                                                <div key={bi} style={{ background: '#0a2331', borderTop: '1px solid rgba(255,255,255,.1)', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: bi === arr.length - 1 ? '0 0 12px 12px' : 0 }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" strokeWidth="2.5" width="13" height="13"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                                                    <span style={{ color: '#53bdeb', fontSize: 13, fontWeight: 500 }}>{typeof b === 'string' ? b : b.label}</span>
                                                </div>
                                            ))}
                                            {/* List button */}
                                            {hasList && (
                                                <div style={{ background: '#0a2331', borderTop: '1px solid rgba(255,255,255,.1)', padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: '0 0 12px 12px' }}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="#53bdeb" strokeWidth="2" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
                                                    <span style={{ color: '#53bdeb', fontSize: 13, fontWeight: 500 }}>{pt.listButtonText || 'View Options'}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* List sections preview */}
                                        {hasList && pt.listSections?.length > 0 && (
                                            <div style={{ width: '75%', background: '#1d2d38', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', overflow: 'hidden' }}>
                                                {pt.listSections.map((sec, si) => (
                                                    <div key={si}>
                                                        <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.07em', background: 'rgba(0,0,0,.25)' }}>{sec.title}</div>
                                                        {sec.rows.map((row, ri) => (
                                                            <div key={ri} style={{ padding: '9px 14px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                                                                <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{row.title}</div>
                                                                {row.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>{row.description}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>)}
                                </div>
                            )}
                        </div>

                        {/* Variables info */}
                        {pt.variables?.length > 0 && (
                            <div style={{ padding: '12px 14px', background: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: 8 }}>🔄 Sequential Variables</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {pt.variables.map((v, vi) => (
                                        <div key={vi} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                            <code style={{ color: 'var(--green)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{'{' + v.name + '}'}</code>
                                            <span style={{ color: 'var(--txt3)' }}>→</span>
                                            <span style={{ color: 'var(--txt2)' }}>{v.values.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setPreviewModal(null)}>Close</button>
                            <button className="btn btn-primary" onClick={() => { setPreviewModal(null); openEdit(pt); }}>Edit Template</button>
                        </div>
                    </Modal>
                );
            })()}
        </div>
    );
}
