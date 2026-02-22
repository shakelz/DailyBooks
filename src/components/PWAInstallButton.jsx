import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';

function checkStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function PWAInstallButton() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(() => checkStandalone());

  useEffect(() => {
    const handleBeforeInstall = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleModeChange = (evt) => setIsInstalled(evt.matches || window.navigator.standalone === true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleModeChange);
    } else {
      mediaQuery.addListener(handleModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);

      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleModeChange);
      } else {
        mediaQuery.removeListener(handleModeChange);
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // ignore prompt rejection
    }
    setDeferredPrompt(null);
  };

  const hideOnLogin = location.pathname === '/';
  if (isInstalled || !deferredPrompt || hideOnLogin) return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      className="fixed right-4 bottom-20 md:bottom-6 z-[120] px-4 py-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all font-bold text-sm flex items-center gap-2"
      aria-label="Install app"
    >
      <Download size={16} />
      Install App
    </button>
  );
}
