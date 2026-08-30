import { app, BrowserWindow, session } from 'electron';
const REMOTE_URL = 'https://www.carefone.de/';

app.commandLine.appendSwitch('disable-http-cache');

async function clearSessionData(sessionInstance) {
  try {
    await sessionInstance.clearCache();
    await sessionInstance.clearStorageData({
      storages: [
        'appcache',
        'cookies',
        'filesystem',
        'indexdb',
        'localstorage',
        'serviceworkers',
        'cachestorage',
        'shadercache',
      ],
    });
  } catch {
    return;
  }
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#111827',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'nopersist',
    },
  });

  const appSession = window.webContents.session;
  await clearSessionData(appSession);

  const isAdminPath = (rawUrl = '') => {
    try {
      const parsed = new URL(String(rawUrl || ''));
      const host = parsed.hostname.toLowerCase();
      const isCarefoneHost = host === 'carefone.de' || host === 'www.carefone.de';
      return isCarefoneHost && parsed.pathname.toLowerCase().startsWith('/admin');
    } catch {
      return false;
    }
  };

  const forceSalesmanHome = () => {
    if (!window.isDestroyed()) {
      window.loadURL(REMOTE_URL).catch(() => undefined);
    }
  };

  const loadErrorFallback = () => {
    if (window.isDestroyed()) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>No Internet Connection</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}.card{max-width:420px;width:100%;background:#1e293b;border:1px solid #334155;border-radius:20px;padding:32px 28px;text-align:center;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5)}.icon{width:56px;height:56px;margin:0 auto 16px;border-radius:16px;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;color:#f87171}h2{margin:0 0 8px;font-size:20px;font-weight:700;color:#f8fafc}p{margin:0 0 24px;color:#94a3b8;font-size:14px;line-height:1.5}.btn{width:100%;padding:12px 20px;background:#2563eb;color:#fff;font-size:14px;font-weight:600;border:none;border-radius:12px;cursor:pointer;transition:background 0.2s}.btn:hover{background:#1d4ed8}</style></head><body><div class="card"><div class="icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path><path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg></div><h2>No Internet Connection</h2><p>Please check your network connection and try again.</p><button class="btn" onclick="location.reload()">Retry Connection</button></div></body></html>`;
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  };

  window.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    loadErrorFallback();
  });

  window.webContents.on('render-process-gone', () => {
    loadErrorFallback();
  });

  window.webContents.on('did-finish-load', () => {
    if (!window.isVisible()) window.show();
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!isAdminPath(url)) return;
    event.preventDefault();
    forceSalesmanHome();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAdminPath(url)) return { action: 'allow' };
    forceSalesmanHome();
    return { action: 'deny' };
  });

  appSession.webRequest.onBeforeRequest({ urls: ['https://carefone.de/admin*', 'https://www.carefone.de/admin*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      callback({ redirectURL: REMOTE_URL });
      return;
    }
    callback({ cancel: false });
  });

  await window.loadURL(REMOTE_URL);

  window.on('close', () => {
    session.defaultSession.clearStorageData().catch(() => undefined);
    session.defaultSession.clearCache().catch(() => undefined);
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  const allWindows = BrowserWindow.getAllWindows();
  await Promise.all(allWindows.map((window) => clearSessionData(window.webContents.session)));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
