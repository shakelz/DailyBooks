const { ipcRenderer, contextBridge, webFrame } = require('electron');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    fixFocus: () => ipcRenderer.send('fix-window-focus'),
  });
} catch (_) {}

try {
  // Inject script to ensure any native dialog in the main world notifies the main process
  webFrame.executeJavaScript(`
    (function() {
      if (window.__electron_focus_hook_installed) return;
      window.__electron_focus_hook_installed = true;

      const _origConfirm = window.confirm ? window.confirm.bind(window) : null;
      const _origAlert = window.alert ? window.alert.bind(window) : null;

      if (_origConfirm) {
        window.confirm = function(...args) {
          const res = _origConfirm(...args);
          window.dispatchEvent(new CustomEvent('electron-native-dialog-closed'));
          return res;
        };
      }

      if (_origAlert) {
        window.alert = function(...args) {
          const res = _origAlert(...args);
          window.dispatchEvent(new CustomEvent('electron-native-dialog-closed'));
          return res;
        };
      }
    })();
  `).catch(() => {});

  window.addEventListener('electron-native-dialog-closed', () => {
    try {
      ipcRenderer.send('fix-window-focus');
    } catch (_) {}
  });
} catch (_) {}
