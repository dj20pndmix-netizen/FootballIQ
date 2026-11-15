import React from 'react';
import {
  Activity,
  Sparkles,
  MessageSquare,
  Video,
  BarChart3,
  BookOpen,
  Cpu,
  ChevronLeft,
  ChevronRight,
  Flame,
  X,
  Globe,
} from 'lucide-react';
import { UserProfile, isAdminUser } from '../services/firebase';

export interface NavItemConfig {
  id: string;
  label: string;
  group: 'Matchday' | 'AI Intelligence' | 'Analytics';
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export const SIDEBAR_NAV_ITEMS: NavItemConfig[] = [
  { id: 'fixtures', label: 'Predictions', group: 'Matchday', icon: Activity },
  { id: 'scout', label: 'Tactical Scout', group: 'AI Intelligence', icon: Sparkles },
  { id: 'chat', label: 'AI Analyst Chat', group: 'AI Intelligence', icon: MessageSquare },
  { id: 'veo', label: 'Veo Studio', group: 'AI Intelligence', icon: Video },
  { id: 'calibration', label: 'Calibration & Graphs', group: 'Analytics', icon: BarChart3 },
  { id: 'opta-coverage', label: 'Opta Coverage', group: 'Analytics', icon: Globe },
  { id: 'methodology', label: 'Methodology', group: 'Analytics', icon: BookOpen },
  { id: 'admin', label: 'Admin Console', group: 'Analytics', icon: Cpu, adminOnly: true },
];

interface SidebarNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  user: UserProfile | null;
  liveCount: number;
}

const GROUPS: ('Matchday' | 'AI Intelligence' | 'Analytics')[] = [
  'Matchday',
  'AI Intelligence',
  'Analytics',
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  user,
  liveCount,
}) => {
  const isAdmin = isAdminUser(user);

  const renderNavContent = (isMobileDrawer: boolean) => {
    const isNarrow = !isMobileDrawer && collapsed;

    return (
      <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800/90 text-slate-200 select-none">
        {/* Brand Row */}
        <div
          className={`h-14 px-4 flex items-center border-b border-slate-800/90 ${
            isNarrow ? 'justify-center' : 'justify-between'
          }`}
        >
          <button
            onClick={() => {
              onSelectTab('fixtures');
              if (isMobileDrawer) onCloseMobile();
            }}
            className="flex items-center gap-2.5 min-w-0 text-left"
            title="FootballIQ Dashboard"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4 text-emerald-400" />
            </div>
            {!isNarrow && (
              <span className="font-extrabold text-base tracking-tight text-white whitespace-nowrap truncate">
                FootballIQ
              </span>
            )}
          </button>

          {isMobileDrawer && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900"
              aria-label="Close navigation menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Grouped Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5" aria-label="Primary Sidebar">
          {GROUPS.map((group) => {
            const items = SIDEBAR_NAV_ITEMS.filter(
              (it) => it.group === group && (!it.adminOnly || isAdmin)
            );
            if (items.length === 0) return null;

            return (
              <div key={group} className="space-y-1">
                {!isNarrow && (
                  <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-500">
                    {group}
                  </div>
                )}

                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectTab(item.id);
                        if (isMobileDrawer) onCloseMobile();
                      }}
                      title={isNarrow ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        isNarrow ? 'justify-center' : 'justify-between'
                      } ${
                        isActive
                          ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        />
                        {!isNarrow && <span className="truncate">{item.label}</span>}
                      </span>

                      {!isNarrow && item.id === 'fixtures' && liveCount > 0 && (
                        <span className="text-[11px] font-mono tabular-nums text-rose-400 font-bold">
                          {liveCount} live
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Bottom Collapse Toggle & Transparency Note */}
        <div className="p-2.5 border-t border-slate-800/90 space-y-2">
          {!isNarrow && (
            <p className="px-2 text-[11px] text-slate-500 leading-relaxed">
              Probabilistic Poisson &amp; Dixon-Coles research. Outcomes are never guaranteed.
            </p>
          )}

          {!isMobileDrawer && (
            <button
              onClick={onToggleCollapse}
              className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
                  <span>Collapse Sidebar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sticky Collapsible Rail */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Slide-Out Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 max-w-[82vw] h-full shadow-2xl">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
