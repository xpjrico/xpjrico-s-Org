import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Download, CheckCircle2, Zap } from 'lucide-react';

export const OfflineStatusBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOfflineToast, setShowOfflineToast] = useState(!navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineToast(true);
    };

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-300 flex items-center justify-between z-40 sticky top-0 backdrop-blur-md">
          <div className="flex items-center gap-2 font-mono">
            <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
            <span><strong>Offline Mode Active:</strong> Reading from local cached notes & timetables.</span>
          </div>
          <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded text-amber-200 font-bold uppercase">
            Local Store Active
          </span>
        </div>
      )}

      {/* Reconnection Banner */}
      {isOnline && showOfflineToast && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between z-40 sticky top-0 backdrop-blur-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 font-mono">
            <Wifi className="w-4 h-4 text-emerald-400" />
            <span><strong>Back Online:</strong> Cloud sync re-established.</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-200 font-bold uppercase">
            Sync Ready
          </span>
        </div>
      )}

      {/* PWA Install Action Prompt if available */}
      {deferredPrompt && !isInstalled && (
        <div className="bg-indigo-950/80 border border-indigo-500/30 rounded-2xl p-3 mb-4 mx-auto max-w-5xl flex items-center justify-between gap-3 text-xs shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">Install Studia Web App</span>
              <span className="text-[11px] text-zinc-400">Add to Home Screen for fast offline revision & zero data lag.</span>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-sm transition-all"
          >
            Install App
          </button>
        </div>
      )}
    </>
  );
};
