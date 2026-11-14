import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Clock,
  LogIn,
  LogOut,
  Activity,
  Cpu,
  Cloud,
} from 'lucide-react';
import {
  UserProfile,
  signInWithGoogle,
  signOutUser,
  isAdminUser,
} from '../services/firebase';
import { SUPPORTED_TIMEZONES } from '../utils/timezone';
import { MATCHDAY_DATE_LABEL } from '../services/mockHistoricalData';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMobileMenu: () => void;
  selectedTimezone: string;
  setSelectedTimezone: (tz: string) => void;
  oddsFormat: 'PROBABILITY' | 'DECIMAL';
  setOddsFormat: (fmt: 'PROBABILITY' | 'DECIMAL') => void;
  user: UserProfile | null;
  onSignOut?: () => void;
  onOpenGoogleDriveSync?: () => void;
}

const VIEW_TITLES: Record<string, string> = {
  fixtures: 'Predictions & Matchday Slate',
  scout: 'Tactical Scout (Search Grounding)',
  chat: 'AI Analyst Chat',
  veo: 'Veo Cinematic Studio',
  calibration: 'Calibration & Performance Graphs',
  methodology: 'Quantitative Methodology',
  admin: 'Admin Console',
};

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  onOpenMobileMenu,
  selectedTimezone,
  setSelectedTimezone,
  oddsFormat,
  setOddsFormat,
  user,
  onSignOut,
  onOpenGoogleDriveSync,
}) => {
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!showUserMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showUserMenu]);

  const handleSignIn = async () => {
    try {
      setIsAuthLoading(true);
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setShowUserMenu(false);
      if (onSignOut) onSignOut();
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const pageTitle = VIEW_TITLES[activeTab] || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/90 flex items-center justify-between gap-4">
      {/* Left Zone: Mobile Toggle + Breadcrumb Trail */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
          <span className="font-bold text-slate-100 whitespace-nowrap hidden sm:inline">
            FootballIQ
          </span>
          <span className="text-slate-600 hidden sm:inline">/</span>
          <span className="font-semibold text-emerald-400 truncate">{pageTitle}</span>
          <span className="text-slate-600 hidden md:inline">·</span>
          <span className="text-xs text-slate-400 font-mono whitespace-nowrap hidden md:inline">
            {MATCHDAY_DATE_LABEL}
          </span>
        </div>
      </div>

      {/* Right Zone: Timezone, Display Format, User Account */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Timezone Selector */}
        <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300">
          <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <select
            value={selectedTimezone}
            onChange={(e) => setSelectedTimezone(e.target.value)}
            className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
            aria-label="Display Timezone"
          >
            {SUPPORTED_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value} className="bg-slate-900 text-slate-200">
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Probability / Decimal Odds Toggle */}
        <button
          onClick={() =>
            setOddsFormat(oddsFormat === 'PROBABILITY' ? 'DECIMAL' : 'PROBABILITY')
          }
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-200 whitespace-nowrap transition-colors"
          title="Toggle Probability (%) or Decimal Odds"
        >
          {oddsFormat === 'PROBABILITY' ? '% Prob' : 'Dec Odds'}
        </button>

        {/* Google Drive Cloud Storage & Export */}
        <button
          onClick={onOpenGoogleDriveSync}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors cursor-pointer"
          title="Google Drive Cloud Storage & Export"
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          <span className="hidden sm:inline">Google Drive</span>
        </button>

        {/* Auth Control */}
        {user ? (
          <div className="relative" ref={menuContainerRef}>
            <button
              onClick={() => setShowUserMenu((v) => !v)}
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              {user.photoURL && !avatarError ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-6 h-6 rounded-md object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-md bg-emerald-600/25 text-emerald-300 flex items-center justify-center font-bold text-xs">
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium text-slate-200 hidden md:inline max-w-[110px] truncate">
                {user.displayName}
              </span>
            </button>

            {showUserMenu && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50"
              >
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-100 truncate">
                    {user.displayName}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    setActiveTab('fixtures');
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Predictions Dashboard
                </button>
                {isAdminUser(user) && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setActiveTab('admin');
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Cpu className="w-3.5 h-3.5 text-amber-400" />
                    Admin Console
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    onOpenGoogleDriveSync?.();
                    setShowUserMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-2"
                >
                  <Cloud className="w-3.5 h-3.5 text-blue-400" />
                  Google Drive Cloud Storage
                </button>
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40 flex items-center gap-2 border-t border-slate-800 mt-1"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={isAuthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-xs whitespace-nowrap transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{isAuthLoading ? 'Signing In...' : 'Sign In'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
