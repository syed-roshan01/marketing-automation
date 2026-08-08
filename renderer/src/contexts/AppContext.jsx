import { createContext, useState, useEffect, useCallback, useContext } from 'react';
import socket from '../socket.js';
import { api } from '../api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

export const AppContext = createContext(null);

export function useApp() { return useContext(AppContext); }

export function AppProvider({ children }) {
    // license: null=loading, { valid:false }=needs key, { valid:true, ...data }=unlocked
    const [license, setLicense]     = useState(null);
    const [toast, setToast]         = useState(null);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [campaignUpdates, setCampaignUpdates] = useState({});

    // ── License check on boot ───────────────────────────────────────────────────
    const refreshLicense = useCallback(() => {
        api.getLicenseStatus()
            .then(data => setLicense(data))
            .catch(() => setLicense({ valid: false }));
    }, []);

    useEffect(() => { refreshLicense(); }, [refreshLicense]);

    // ── Socket listeners ────────────────────────────────────────────────────────
    useEffect(() => {
        socket.on('campaign_update', (payload) => {
            setCampaignUpdates(prev => ({ ...prev, [payload.campaignId]: payload }));
        });
        return () => { socket.off('campaign_update'); };
    }, []);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const showConfirm = useCallback((title, message, { danger = false, confirmLabel = 'Confirm' } = {}) => {
        return new Promise(resolve => {
            setConfirmDialog({ title, message, resolve, danger, confirmLabel });
        });
    }, []);

    const activateLicense = useCallback(async (key) => {
        const data = await api.activateLicense(key);
        if (data?.success) {
            await refreshLicense();
            if (!socket.connected) socket.connect();
        }
        return data;
    }, [refreshLicense]);

    return (
        <AppContext.Provider value={{
            license,
            refreshLicense,
            activateLicense,
            toast,
            campaignUpdates, setCampaignUpdates,
            showToast,
            showConfirm,
        }}>
            {children}
            {confirmDialog && (
                <ConfirmDialog
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    confirmLabel={confirmDialog.confirmLabel}
                    danger={confirmDialog.danger}
                    onConfirm={() => { confirmDialog.resolve(true);  setConfirmDialog(null); }}
                    onCancel={() =>  { confirmDialog.resolve(false); setConfirmDialog(null); }}
                />
            )}
        </AppContext.Provider>
    );
}
