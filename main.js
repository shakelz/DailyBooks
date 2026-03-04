import { app, BrowserWindow } from 'electron';
const REMOTE_URL = 'https://carefone.de';
const TEMP_PARTITION = 'temp:carefone-online';

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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: TEMP_PARTITION,
    },
  });

  const appSession = window.webContents.session;
  await clearSessionData(appSession);

  const isAdminPath = (rawUrl = '') => {
    try {
      const parsed = new URL(String(rawUrl || ''));
      return parsed.hostname === 'carefone.de' && parsed.pathname.toLowerCase().startsWith('/admin');
    } catch {
      return false;
    }
  };

  const forceSalesmanHome = () => {
    if (!window.isDestroyed()) {
      window.loadURL(REMOTE_URL, { userAgent: 'CareFoneDesktop/1.0' }).catch(() => undefined);
    }
  };

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

  appSession.webRequest.onBeforeRequest({ urls: ['https://carefone.de/admin*'] }, (details, callback) => {
    if (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame') {
      callback({ redirectURL: REMOTE_URL });
      return;
    }
    callback({ cancel: false });
  });

  await window.loadURL(REMOTE_URL, { userAgent: 'CareFoneDesktop/1.0' });
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