import React, { useState } from 'react';
import { TabType, StreakStats } from '../types';
import { useAuth } from '../lib/authContext';
import {
  LayoutDashboard,
  Sparkles,
  Timer,
  BookOpen,
  Users,
  Calendar,
  Zap,
  Crown,
  LogOut,
  ChevronDown,
  User,
  Flame,
  MoreHorizontal,
} from 'lucide-react';

interface NavbarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  streakStats: StreakStats;
  onOpenAuth: () => void;
  onOpenPayment: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  streakStats,
  onOpenAuth,
  onOpenPayment,
}) => {
  const { user, logout } = useAuth();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const navUserName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.name ||
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'Student';

  const navAvatar = user?.photoURL || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const handleLogout = async () => {
    setProfileDropdownOpen(false);
    await logout();
    onSelectTab('dashboard');
  };

  // Primary top navigation bar tabs: Strictly Dashboard, AI Hub, Focus Arena
  const primaryTabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'aihub', label: 'AI Hub', icon: Sparkles },
    { id: 'focus', label: 'Focus Arena', icon: Timer },
  ];

  // Secondary auxiliary tabs accessed via "More"
  const secondaryTabs: { id: TabType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'notes', label: 'Notes', icon: BookOpen },
    { id: 'teachers', label: 'Teachers', icon: Users },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
  ];

  const allMobileTabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'aihub' as TabType, label: 'AI Hub', icon: Sparkles },
    { id: 'focus' as TabType, label: 'Focus Arena', icon: Timer },
    { id: 'notes' as TabType, label: 'Notes', icon: BookOpen },
    { id: 'timetable' as TabType, label: 'Timetable', icon: Calendar },
  ];

  const isPro = Boolean(user?.isPro);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#09090b]/90 backdrop-blur-md border-b border-white/10 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* LEFT / CENTER: Brand Logo and Main Navigation Tabs */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          {/* Brand Logo */}
          <div
            id="nav-brand-logo"
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-amber-500 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.35)] group-hover:scale-105 transition-transform">
              <span className="font-black text-white italic text-sm">S</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black tracking-tight text-white font-mono">STUDIA</span>
              <span className="hidden xl:inline text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10 uppercase">
                v1.0
              </span>
            </div>
          </div>

          {/* Primary Top Navigation Tabs: Dashboard, AI Hub, Focus Arena */}
          <nav
            id="main-top-navigation-tabs"
            className="hidden md:flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-white/10"
          >
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => onSelectTab(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {/* "More" Menu for Notes, Teachers, Timetable */}
            <div className="relative">
              <button
                id="nav-tab-more-dropdown-trigger"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  secondaryTabs.some((t) => t.id === currentTab)
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
                title="More Study Sections (Notes, Teachers, Timetable)"
              >
                <MoreHorizontal className="w-4 h-4" />
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {moreMenuOpen && (
                <div
                  id="nav-secondary-dropdown"
                  className="absolute left-0 mt-2 w-44 p-1.5 bg-[#0d1017] border border-white/10 rounded-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2"
                >
                  {secondaryTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = currentTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          onSelectTab(tab.id);
                          setMoreMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-purple-600 text-white'
                            : 'text-zinc-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* FAR RIGHT: Grouped User Profile Elements (Welcome, Sparks, Total XP, Upgrade button, Log Out) */}
        <div
          id="user-profile-status-group"
          className="flex items-center gap-1.5 sm:gap-2.5 shrink-0"
        >
          {/* Welcome Greeting message (compact) */}
          {user && (
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-white/5 text-xs">
              <span className="text-zinc-400 font-medium">Welcome,</span>
              <span className="font-bold text-white max-w-[100px] truncate">{navUserName}</span>
            </div>
          )}

          {/* Sparks Counter */}
          <div
            id="header-sparks-badge"
            title="Study Sparks Balance"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-mono font-bold shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>{user?.sparks || 0}</span>
            <span className="hidden sm:inline text-[10px] text-purple-400 font-normal">Sparks</span>
          </div>

          {/* Total XP Counter */}
          <div
            id="header-xp-badge"
            title={`Total Experience Points: ${user?.xp || 0} XP (Level ${user?.level || 1})`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-mono font-bold shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{user?.xp || 0}</span>
            <span className="hidden sm:inline text-[10px] text-amber-400/80 font-normal">XP</span>
          </div>

          {/* Upgrade to Pro (KES 380) Button or PRO Badge */}
          {isPro ? (
            <div
              id="header-pro-active-badge"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-mono font-bold shadow-sm"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>PRO ACTIVE</span>
            </div>
          ) : (
            <button
              id="header-upgrade-pro-btn"
              onClick={onOpenPayment}
              className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-xs shadow-[0_0_15px_rgba(16,185,129,0.25)] flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 shrink-0 whitespace-nowrap"
              title="Upgrade to Pro (KES 380)"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="hidden sm:inline">Upgrade to Pro</span>
              <span className="text-[11px] font-mono opacity-90 sm:opacity-100">KES 380</span>
            </button>
          )}

          {/* User Account Avatar & Profile Menu */}
          {user ? (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  id="user-profile-menu-button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-1.5 p-1 bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 rounded-xl transition-all cursor-pointer"
                  title="View Account Details"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-purple-500/40 shrink-0">
                    {navAvatar ? (
                      <img
                        src={navAvatar}
                        alt={navUserName}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-black">
                        {navUserName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <ChevronDown className="w-3 h-3 text-zinc-400" />
                </button>

                {/* Profile Dropdown */}
                {profileDropdownOpen && (
                  <div
                    id="user-profile-dropdown-card"
                    className="absolute right-0 mt-2 w-64 p-3.5 bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2"
                  >
                    <div className="flex items-center gap-3 pb-3 mb-3 border-b border-white/10">
                      <div className="w-10 h-10 rounded-xl border border-purple-500/40 overflow-hidden shrink-0">
                        {navAvatar ? (
                          <img
                            src={navAvatar}
                            alt={navUserName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white">
                            {navUserName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{navUserName}</p>
                        <p className="text-[11px] font-mono text-zinc-400 truncate">{user.email}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                            Level {user.level || 1}
                          </span>
                          {isPro && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                              Pro Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-950 p-2.5 rounded-xl border border-white/5 mb-3 text-xs">
                      <div className="flex justify-between font-mono text-[11px] mb-1">
                        <span className="text-zinc-400">Total XP</span>
                        <span className="text-amber-400 font-bold">{user.xp || 0} XP</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-amber-500"
                          style={{ width: `${Math.min(100, (((user.xp || 0) % 500) / 500) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {!isPro && (
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenPayment();
                        }}
                        className="w-full mb-2 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all hover:opacity-95"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-300" />
                        <span>Upgrade to Pro (KES 380)</span>
                      </button>
                    )}

                    <button
                      onClick={handleLogout}
                      className="w-full py-2 px-3 rounded-xl bg-zinc-900 hover:bg-rose-950/40 text-zinc-300 hover:text-rose-300 border border-white/5 hover:border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Direct Quick Log Out Button on far right */}
              <button
                id="header-direct-logout-btn"
                onClick={handleLogout}
                title="Log Out of Studia"
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-zinc-900/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden md:inline">Log Out</span>
              </button>
            </div>
          ) : (
            <button
              id="header-signin-btn"
              onClick={onOpenAuth}
              className="py-1 px-3 sm:py-1.5 sm:px-4 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-500 hover:opacity-90 text-white font-bold text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar: Clean 5 tabs */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-white/10 backdrop-blur-xl px-1 pt-1 pb-2 safe-bottom flex items-center justify-around">
        {allMobileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-lg transition-all cursor-pointer ${
                isActive ? 'text-purple-400 font-bold bg-white/5' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium tracking-tight mt-0.5 whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
