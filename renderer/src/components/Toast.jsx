import { createPortal } from 'react-dom';
import { useApp } from '../contexts/AppContext.jsx';

const ICONS = {
    success: '✅',
    error:   '❌',
    info:    'ℹ️',
    warning: '⚠️',
};

export default function Toast() {
    const { toast } = useApp();
    if (!toast) return null;
    return createPortal(
        <div className="toast-wrap">
            <div className={`toast toast-${toast.type || 'success'}`}>
                <span className="toast-icon">{ICONS[toast.type] || ICONS.success}</span>
                <span className="toast-msg">{toast.message}</span>
            </div>
        </div>,
        document.body
    );
}
