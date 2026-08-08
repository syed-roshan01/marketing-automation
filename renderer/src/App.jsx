import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef, Component } from 'react';
import { useApp } from './contexts/AppContext.jsx';
import socket from './socket.js';

class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(e) { return { error: e }; }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 40, fontFamily: 'monospace', color: '#f87171', background: '#0f0f0f', minHeight: '100vh' }}>
                    <h2 style={{ color: '#fff' }}>Something went wrong</h2>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{String(this.state.error)}</pre>
                    <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 18px', cursor: 'pointer' }}>Retry</button>
                </div>
            );
        }
        return this.props.children;
    }
}
import Sidebar from './components/Sidebar.jsx';
import Topbar  from './components/Topbar.jsx';
import Toast from './components/Toast.jsx';
import LicenseGate from './pages/LicenseGate.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Devices from './pages/Devices.jsx';
import Contacts from './pages/Contacts.jsx';
import Groups from './pages/Groups.jsx';
import Templates from './pages/Templates.jsx';
import Campaigns from './pages/Campaigns.jsx';
import SingleMessage from './pages/SingleMessage.jsx';
import Settings from './pages/Settings.jsx';
import TrustBuilder from './pages/TrustBuilder.jsx';
import OptOutManagement from './pages/OptOutManagement.jsx';
import AutoReply from './pages/AutoReply.jsx';
import ChatbotFlows from './pages/ChatbotFlows.jsx';
import AIAutomation from './pages/AIAutomation.jsx';
import LiveChat from './pages/LiveChat.jsx';
import GroupGrabber from './pages/GroupGrabber.jsx';
import LicensePortal from './pages/LicensePortal.jsx';
import FeatureLocked from './pages/FeatureLocked.jsx';
import Forms from './pages/Forms.jsx';

// Renders the feature's page or a locked screen based on license.features
function FeatureRoute({ feature, element }) {
    const { license } = useApp();
    const locked = license?.features && license.features[feature] === false;
    if (locked) return <FeatureLocked feature={feature} />;
    return element;
}

export default function App() {
    const { license, toast, showToast } = useApp();
    const [splashDone, setSplashDone] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const startRef = useRef(Date.now());

    // Global device disconnect notification — fires no matter which page is open
    useEffect(() => {
        if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
        function onDisconnect({ deviceName }) {
            const msg = `"${deviceName}" disconnected`;
            showToast(`📵 ${msg}`, 'error');
            if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
                new Notification('Device Disconnected', { body: msg, icon: '/favicon.ico' });
            }
        }
        socket.on('device_disconnected', onDisconnect);
        return () => socket.off('device_disconnected', onDisconnect);
    }, [showToast]);

    useEffect(() => {
        if (license !== null && !splashDone) {
            const elapsed = Date.now() - startRef.current;
            const remaining = Math.max(0, 2500 - elapsed);
            const t = setTimeout(() => setSplashDone(true), remaining);
            return () => clearTimeout(t);
        }
    }, [license]);

    // Show splash while loading OR while the 2 s minimum hasn't elapsed
    if (license === null || !splashDone) {
        return (
            <div className="splash">
                <div className="splash-scan" />
                <div className="splash-corner splash-corner--tl" />
                <div className="splash-corner splash-corner--tr" />
                <div className="splash-corner splash-corner--bl" />
                <div className="splash-corner splash-corner--br" />
                <div className="splash-logo-wrap">
                    <img src="/zyqora-logo.png" alt="Zyqora"
                        onError={e => { e.target.style.display='none'; }}
                    />
                </div>
                <div className="splash-title">Zyqora</div>
                <div className="splash-sub">WhatsApp Desktop Automation</div>
                <div className="splash-spinner-ring"></div>
                <div className="splash-loading-text">Initializing system...</div>
                <div className="splash-progress">
                    <div className="splash-progress-bar"></div>
                </div>
            </div>
        );
    }

    if (!license?.valid) return <LicenseGate />;

    return (
        <ErrorBoundary>
        <div className="app-layout">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <main className="main-content">
                <Topbar onMenuClick={() => setSidebarOpen(o => !o)} />
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/devices"   element={<Devices />} />
                    <Route path="/contacts"  element={<Contacts />} />
                    <Route path="/groups"    element={<Groups />} />
                    <Route path="/templates" element={<Templates />} />
                    <Route path="/campaigns"       element={<Campaigns />} />
                    <Route path="/trust-builder"   element={<FeatureRoute feature="trustBuilder" element={<TrustBuilder />} />} />
                    <Route path="/opt-out"          element={<OptOutManagement />} />
                    <Route path="/auto-reply"        element={<FeatureRoute feature="autoReply" element={<AutoReply />} />} />                    <Route path="/chatbot-flows"     element={<FeatureRoute feature="chatbot" element={<ChatbotFlows />} />} />                    <Route path="/ai-automation"     element={<FeatureRoute feature="aiAutomation" element={<AIAutomation />} />} />                    <Route path="/live-chat"         element={<FeatureRoute feature="liveChat" element={<LiveChat />} />} />                    <Route path="/group-grabber"     element={<FeatureRoute feature="groupGrabber" element={<GroupGrabber />} />} />                    <Route path="/single-message"  element={<SingleMessage />} />
                    <Route path="/forms"             element={<FeatureRoute feature="forms" element={<Forms />} />} />
                    <Route path="/settings"        element={<Settings />} />
                    <Route path="/zyq"              element={<LicensePortal />} />
                    <Route path="*"          element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </main>
            {toast && <Toast />}
        </div>
        </ErrorBoundary>
    );
}
