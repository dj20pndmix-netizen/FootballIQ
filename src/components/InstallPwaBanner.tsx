import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Sparkles } from 'lucide-react';
import {
  subscribeInstallPrompt,
  promptPwaInstall,
  isStandaloneMode,
} from '../services/pwaService';

export const InstallPwaBanner: React.FC = () => {
  const [canInstall, setCanInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (isStandaloneMode()) {
      setIsInstalled(true);
      return;
    }

    const unsubscribe = subscribeInstallPrompt((available) => {
      setCanInstall(available);
    });

    return () => unsubscribe();
  }, []);

  if (isInstalled || isDismissed || !canInstall) {
    return null;
  }

  const handleInstallClick = async () => {
    const accepted = await promptPwaInstall();
    if (accepted) {
      setIsInstalled(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in slide-in-from-bottom duration-300">
      <div className="p-4 rounded-3xl bg-slate-900/95 border border-emerald-500/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 p-2 flex items-center justify-center shrink-0 shadow-md shadow-emerald-950/50">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-white">Install FootballIQ App</h4>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                PWA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              Add to Home Screen for smooth standalone performance on Android &amp; mobile.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/40 transition-transform active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
