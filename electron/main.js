'use strict';
const { app, BrowserWindow, shell, Menu, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');

// ── Keep-Awake / powerSaveBlocker ─────────────────────────────────────────────
let _psbId = null;

ipcMain.handle('set-keep-awake', (_event, enabled) => {
    if (enabled) {
        if (_psbId === null) {
            _psbId = powerSaveBlocker.start('prevent-app-suspension');
            console.log('[Zyqora] Keep-awake enabled, blocker id:', _psbId);
        }
    } else {
        if (_psbId !== null && powerSaveBlocker.isStarted(_psbId)) {
            powerSaveBlocker.stop(_psbId);
            console.log('[Zyqora] Keep-awake disabled');
        }
        _psbId = null;
    }
    return { ok: true };
});

const isDev = process.env.NODE_ENV === 'development';
const PORT  = process.env.PORT || 3000;

// ── Route all user data to AppData so updates never wipe contacts/sessions ────
if (!isDev) {
    process.env.ZYQORA_DATA = app.getPath('userData');

    // cloudflared uses __dirname to find its binary, which resolves to inside
    // app.asar (not spawnable). Override with the real unpacked path.
    const unpackedDir = app.getAppPath() + '.unpacked';
    const cloudflaredBin = path.join(
        unpackedDir,
        'node_modules', 'cloudflared', 'bin',
        process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );
    
    // Fallback to node_modules if unpacked dir doesn't exist (dev/test builds)
    const fallbackBin = path.join(
        app.getAppPath(),
        'node_modules', 'cloudflared', 'bin',
        process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
    );
    
    process.env.CLOUDFLARED_BIN = cloudflaredBin;
    console.log('[Zyqora] cloudflared binary path:', cloudflaredBin);
}

// ── Prevent multiple instances ────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// ── Start Express backend ─────────────────────────────────────────────────────
require('../server/index.js');

let mainWindow;

function createWindow() {
    const iconPath = path.join(__dirname, '..', 'renderer', 'public', 'zyqora-icon-256.png');

    mainWindow = new BrowserWindow({
        width:  1400,
        height: 900,
        minWidth:  1024,
        minHeight: 640,
        icon:  iconPath,
        title: 'Zyqora',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        backgroundColor: '#03050d',
        show:           false,
        titleBarStyle:  'default',
    });

    Menu.setApplicationMenu(null);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    // Block DevTools in production builds
    if (!isDev) {
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow.webContents.closeDevTools();
        });
    }

    const url = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`;
    loadWithRetry(mainWindow, url);
}

function loadWithRetry(win, url, retries = 20, delay = 800) {
    win.loadURL(url).catch(() => {
        if (retries > 0) setTimeout(() => loadWithRetry(win, url, retries - 1, delay), delay);
    });
}

app.whenReady().then(async () => {
    // Re-apply keep-awake setting from persisted config on every launch
    try {
        const storage = require('../src/storage');
        const sett = await storage.getSettings();
        if (sett.keepAwakeEnabled) {
            _psbId = powerSaveBlocker.start('prevent-app-suspension');
            console.log('[Zyqora] Keep-awake restored on startup, id:', _psbId);
        }
    } catch (_) {}

    setTimeout(createWindow, 1200);
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
