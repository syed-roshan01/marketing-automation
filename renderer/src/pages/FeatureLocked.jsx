const FEATURE_NAMES = {
    mobile:       'Open on Mobile',
    trustBuilder: 'Trust Builder',
    autoReply:    'Auto Reply',
    chatbot:      'Chatbot Flows',
    liveChat:     'Live Chat',
    groupGrabber: 'Group Grabber',
    forms:        'Interactive Forms',
};

export default function FeatureLocked({ feature }) {
    const name = FEATURE_NAMES[feature] || 'This feature';
    return (
        <div className="page-content" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
            <div style={{ textAlign: 'center', padding: '40px 24px', maxWidth: 380 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(139,92,246,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                </div>
                <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 700, color: 'var(--txt)' }}>
                    Feature Not Included
                </h2>
                <p style={{ color: 'var(--txt3)', fontSize: 13.5, margin: '0 0 8px', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--txt2)' }}>{name}</strong> is not enabled in your current license plan.
                </p>
                <p style={{ color: 'var(--txt3)', fontSize: 12.5, lineHeight: 1.5 }}>
                    Contact your provider to upgrade your license and unlock this feature.
                </p>
            </div>
        </div>
    );
}
