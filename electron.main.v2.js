import { app, BrowserWindow } from 'electron';
import process from 'node:process';

const REMOTE_URL = 'https://www.carefone.de/terminal-access-v1';
const PARTITION_NAME = 'nopersist:carefone-salesman-v2';

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-features', 'BackForwardCache');

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

function getLaunchUrl() {
  const separator = REMOTE_URL.includes('?') ? '&' : '?';
  return `${REMOTE_URL}${separator}desktop_session=${Date.now()}`;
}

function isAdminPath(rawUrl = '') {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const host = parsed.hostname.toLowerCase();
    const isCarefoneHost = host === 'carefone.de' || host === 'www.carefone.de';
    return isCarefoneHost && parsed.pathname.toLowerCase().startsWith('/admin');
  } catch {
    return false;
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
      backgroundThrottling: false,
      partition: PARTITION_NAME,
    },
  });

  const appSession = window.webContents.session;
  await clearSessionData(appSession);

  const forceSalesmanHome = () => {
    if (!window.isDestroyed()) {
      window.loadURL(getLaunchUrl()).catch(() => undefined);
    }
  };

  const loadErrorFallback = (reason = '') => {
    if (window.isDestroyed()) return;
    const safeReason = String(reason || '').replace(/[<>&"']/g, ' ');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>CareFone Load Error</title><style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.card{max-width:680px;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px}.btn{margin-top:14px;padding:10px 14px;background:#2563eb;color:#fff;border:none;border-radius:8px;cursor:pointer}</style></head><body><div class="card"><h2>Unable to open CareFone</h2><p>App could not load https://www.carefone.de/ right now.</p><p style="color:#94a3b8;font-size:12px">${safeReason}</p><button class="btn" onclick="location.reload()">Retry</button></div></body></html>`;
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
  };

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    loadErrorFallback(`${errorCode} ${errorDescription} ${validatedURL || ''}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    loadErrorFallback(`Renderer process gone: ${details?.reason || 'unknown'}`);
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
      callback({ redirectURL: getLaunchUrl() });
      return;
    }
    callback({ cancel: false });
  });

  await window.loadURL(getLaunchUrl());

  window.on('close', () => {
    clearSessionData(appSession).catch(() => undefined);
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
