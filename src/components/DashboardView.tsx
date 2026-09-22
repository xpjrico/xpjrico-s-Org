import React, { useState, useEffect } from 'react';
import { TabType, StreakStats, StudySession, TimetableSlot, StudyPlannerItem, Note } from '../types';
import { useAuth } from '../lib/authContext';
import { getRankByXp } from '../lib/gamification';
import {
  getUserTimetable,
  getUserStudyPlanner,
  saveUserStudyPlanner,
  getAiQuotaCountdown,
  FREE_AI_LIMIT,
} from '../lib/storage';
import {
  Flame,
  Sparkles,
  Zap,
  Timer,
  BookOpen,
  Calendar,
  Users,
  Award,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  Crown,
  Plus,
  ChevronRight,
  AlertCircle,
  BookMarked,
  CheckSquare,
  Square,
  GraduationCap,
  LogOut,
  LogIn,
  Cpu,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (tab: TabType) => void;
  streakStats: StreakStats;
  sessions: StudySession[];
  timetable?: TimetableSlot[];
  notes?: Note[];
  onOpenPayment: () => void;
  onOpenAuth: () => void;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  streakStats,
  sessions,
  timetable,
  notes,
  onOpenPayment,
  onOpenAuth,
}) => {
  const { user, logout, subscription, addXpAndSparks } = useAuth();
  const currentRank = getRankByXp(user?.xp || 0);

  const isUserLoggedIn = Boolean(user && user.email);

  const userId = user?.id || 'guest_user';
  const [timetableSlots, setTimetableSlots] = useState<TimetableSlot[]>(() => timetable || getUserTimetable(userId));
  const [plannerItems, setPlannerItems] = useState<StudyPlannerItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string>(DAYS_OF_WEEK[new Date().getDay()] || 'Monday');

  // New study planner form state
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newMinutes, setNewMinutes] = useState(60);
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('high');

  useEffect(() => {
    if (timetable) {
      setTimetableSlots(timetable);
    } else {
      setTimetableSlots(getUserTimetable(userId));
    }
    setPlannerItems(getUserStudyPlanner(userId));
  }, [userId, timetable]);

  // Daily goal calculation
  const todayDate = new Date().toISOString().split('T')[0];
  const todayMinutes = sessions
    .filter((s) => s.date === todayDate)
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const goalMinutes = user?.dailyGoalMinutes || 45;
  const goalPercent = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100));

  // Next level XP
  const xpInTier = (user?.xp || 0) - currentRank.minXp;
  const tierRange = (currentRank.maxXp - currentRank.minXp) || 500;
  const rankProgressPercent = Math.min(100, Math.max(0, Math.round((xpInTier / tierRange) * 100)));

  // Timetable filter for selected day
  const daySlots = timetableSlots
    .filter((slot) => slot.day.toLowerCase() === selectedDay.toLowerCase())
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Upcoming lecture calculation
  const currentDayName = DAYS_OF_WEEK[new Date().getDay()];
  const todaySlots = timetableSlots.filter((s) => s.day.toLowerCase() === currentDayName.toLowerCase());

  // Toggle study planner item completion
  const handleTogglePlan = (planId: string) => {
    const updated = plannerItems.map((p) => {
      if (p.id === planId) {
        const nextState = !p.isCompleted;
        if (nextState) {
          addXpAndSparks(25, 5);
        }
        return {
          ...p,
          isCompleted: nextState,
          completedMinutes: nextState ? p.targetMinutes : 0,
        };
      }
      return p;
    });
    setPlannerItems(updated);
    saveUserStudyPlanner(userId, updated);
  };

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newTopic.trim()) return;

    const newItem: StudyPlannerItem = {
      id: `plan_${Date.now()}`,
      userId,
      subject: newSubject.trim(),
      topic: newTopic.trim(),
      targetDate: newTargetDate || new Date().toISOString().split('T')[0],
      targetMinutes: Number(newMinutes) || 60,
      completedMinutes: 0,
      isCompleted: false,
      priority: newPriority,
    };

    const updated = [newItem, ...plannerItems];
    setPlannerItems(updated);
    saveUserStudyPlanner(userId, updated);
    setShowAddPlan(false);
    setNewSubject('');
    setNewTopic('');
  };

  // AI Quota countdown and calculation
  const isPro = subscription?.planType && subscription.planType !== 'free';
  const [quotaCountdown, setQuotaCountdown] = useState(() => getAiQuotaCountdown(subscription));

  useEffect(() => {
    setQuotaCountdown(getAiQuotaCountdown(subscription));
    const timer = setInterval(() => {
      setQuotaCountdown(getAiQuotaCountdown(subscription));
    }, 1000);
    return () => clearInterval(timer);
  }, [subscription]);

  // Dynamic user details
  const studentName = isUserLoggedIn
    ? (user?.user_metadata?.full_name ||
       user?.user_metadata?.name ||
       user?.name ||
       user?.displayName ||
       (user?.email ? user.email.split('@')[0] : 'Student'))
    : 'Guest Student';

  const studentEmail = isUserLoggedIn ? (user?.email || '') : '';
  const studentAvatar = isUserLoggedIn
    ? (user?.photoURL || user?.user_metadata?.avatar_url || user?.user_metadata?.picture)
    : null;

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome Banner */}
      <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8 bg-zinc-900/40 border border-white/10 shadow-[0_0_35px_rgba(0,0,0,0.5)]">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border-2 border-indigo-500/50 p-0.5 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <div className="w-full h-full bg-zinc-950 rounded-2xl overflow-hidden flex items-center justify-center">
                  {studentAvatar ? (
                    <img src={studentAvatar} alt={studentName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-white text-lg">
                      {isUserLoggedIn ? studentName.slice(0, 2).toUpperCase() : 'GS'}
                    </span>
                  )}
                </div>
              </div>
              {user?.isPro && (
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 text-zinc-950 flex items-center justify-center shadow-lg font-black text-[10px] ring-2 ring-zinc-950">
                  ★
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {isUserLoggedIn ? `Welcome back, ${studentName}` : 'Welcome, Guest Student'}
                </h1>
                {isUserLoggedIn ? (
                  <>
                    {subscription?.planType && subscription.planType !== 'free' ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        {subscription.planName}
                      </span>
                    ) : (
                      <button
                        onClick={onOpenPayment}
                        className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold hover:bg-emerald-500/25 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span>Upgrade to Pro KES 380</span>
                      </button>
                    )}
                    <button
                      onClick={() => logout()}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-zinc-400 hover:text-red-300 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ml-1"
                      title="Log Out of your account"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={onOpenAuth}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 hover:opacity-95 text-xs font-bold text-white transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign In / Create Account</span>
                    </button>
                  </div>
                )}
              </div>

              <p className="text-zinc-400 text-xs sm:text-sm">
                {isUserLoggedIn
                  ? studentEmail
                  : 'Sign in to track progress, save schedules across devices & unlock AI powers.'}
              </p>

              <div className="flex items-center gap-3 pt-1 text-xs font-mono">
                <span className="text-emerald-400 font-bold uppercase">{currentRank.title}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-indigo-400 font-bold">{user?.sparks || 0} Sparks</span>
                <span className="text-zinc-600">•</span>
                <span className="text-purple-400 font-bold">{user?.xp || 0} Total XP</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full lg:w-auto shrink-0">
            <button
              onClick={() => onNavigate('focus')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2 cursor-pointer transition-transform hover:scale-[1.02]"
            >
              <Timer className="w-4 h-4 text-white" />
              Launch Focus Mode <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* AI Quota and Fast Action Strip */}
      <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {isPro ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">AI Intelligence Usage</span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  ⚡ Unlimited Pro
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Unlimited AI note summaries, quizzes, and STEM solver on your {subscription?.planName || 'Pro'} plan.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white">Free AI Trial ({FREE_AI_LIMIT} Uses / 6h)</span>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Refills in {quotaCountdown.formattedCountdown}</span>
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <div className="w-48 sm:w-64 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      quotaCountdown.remaining === 0 ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                    }`}
                    style={{ width: `${Math.min(100, ((FREE_AI_LIMIT - quotaCountdown.remaining) / FREE_AI_LIMIT) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {quotaCountdown.remaining} of {FREE_AI_LIMIT} uses available
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          {!isPro && (
            <button
              onClick={onOpenPayment}
              className="w-full md:w-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm whitespace-nowrap"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span>Upgrade to Pro (KES 380)</span>
            </button>
          )}
          <button
            id="dashboard-open-aihub-btn"
            onClick={() => onNavigate('aihub')}
            className="px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer font-mono whitespace-nowrap transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Open AI Hub</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* TWO COLUMN STUDENT CORE: Timetable Visualizer & Subject Study Planner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. CLASS TIMETABLE VISUALIZER WIDGET */}
        <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  Class Timetable Visualizer
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Today is <strong>{currentDayName}</strong> • {todaySlots.length} classes scheduled
                </p>
              </div>
              <button
                onClick={() => onNavigate('timetable')}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
              >
                Full Schedule <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Day Selector Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-white/5">
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                    selectedDay === day
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/60'
                  }`}
                >
                  {day.slice(0, 3)}
                  {day === currentDayName && ' (Today)'}
                </button>
              ))}
            </div>

            {/* Day Slots List */}
            {daySlots.length === 0 ? (
              <div className="text-center py-10 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-2">
                <Calendar className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400 font-mono">No lectures or labs scheduled for {selectedDay}.</p>
                <button
                  onClick={() => onNavigate('timetable')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 text-xs font-mono cursor-pointer"
                >
                  + Add Class Slot
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {daySlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-2.5 h-10 rounded-full shrink-0"
                        style={{ backgroundColor: slot.color || '#06b6d4' }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white">{slot.subject}</h4>
                          <span className="text-[10px] px-2 py-0.2 rounded bg-white/5 text-zinc-400 font-mono">
                            {slot.type || 'Lecture'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2 font-mono">
                          <span>📍 {slot.room}</span>
                          {slot.instructor && <span>• Prof. {slot.instructor}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono shrink-0">
                      <div className="text-xs font-bold text-cyan-400">{slot.startTime}</div>
                      <div className="text-[10px] text-zinc-500">to {slot.endTime}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>Offline Timetable Storage: <strong>IndexedDB Cached</strong></span>
            <button
              onClick={() => onNavigate('timetable')}
              className="text-cyan-400 hover:underline cursor-pointer"
            >
              Manage Slots →
            </button>
          </div>
        </div>

        {/* 2. SUBJECT STUDY PLANNER WIDGET */}
        <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-emerald-400" />
                  Subject Study Planner & Goals
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Track revision targets and exam prep checkpoints
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPlan(!showAddPlan)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Topic</span>
              </button>
            </div>

            {/* Add New Plan Mini Form */}
            {showAddPlan && (
              <form onSubmit={handleCreatePlan} className="p-4 rounded-2xl bg-zinc-950 border border-emerald-500/30 mb-3 space-y-3 animate-in fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-400 mb-1">Subject</label>
                    <input
                      type="text"
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      placeholder="e.g. Calculus II"
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-zinc-400 mb-1">Target Minutes</label>
                    <input
                      type="number"
                      value={newMinutes}
                      onChange={(e) => setNewMinutes(Number(e.target.value))}
                      min={10}
                      max={300}
                      className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 mb-1">Topic / Revision Chapter</label>
                  <input
                    type="text"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g. Integration by parts & series tests"
                    className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400">Priority:</span>
                    {(['high', 'medium', 'low'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewPriority(p)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded capitalize ${
                          newPriority === p ? 'bg-emerald-500 text-zinc-950 font-bold' : 'text-zinc-500 bg-zinc-900'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddPlan(false)}
                      className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1 rounded-lg bg-emerald-500 text-zinc-950 font-bold text-xs"
                    >
                      Save Goal
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Planner Items List */}
            {plannerItems.length === 0 ? (
              <div className="text-center py-10 bg-zinc-950/40 rounded-2xl border border-white/5 space-y-2">
                <BookMarked className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-400 font-mono">No study goals added yet. Plan your next revision chapter!</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {plannerItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleTogglePlan(item.id)}
                    className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 cursor-pointer ${
                      item.isCompleted
                        ? 'bg-zinc-950/40 border-emerald-500/20 opacity-70'
                        : 'bg-zinc-950/70 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="mt-0.5 text-emerald-400">
                      {item.isCompleted ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${item.isCompleted ? 'line-through text-zinc-400' : 'text-white'}`}>
                          {item.subject}
                        </span>
                        <span
                          className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                            item.priority === 'high'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {item.priority} Priority
                        </span>
                      </div>
                      <p className={`text-[11px] mt-0.5 ${item.isCompleted ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        {item.topic}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-zinc-400">
                        <span>⏱ {item.completedMinutes}/{item.targetMinutes}m</span>
                        {item.examDate && <span className="text-amber-400">📅 Exam: {item.examDate}</span>}
                        {item.isCompleted && <span className="text-emerald-400 font-bold">+25 XP Earned</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-zinc-500">
            <span>Completed: <strong className="text-emerald-400">{plannerItems.filter((p) => p.isCompleted).length}/{plannerItems.length}</strong></span>
            <span className="text-zinc-400">Click item to toggle done</span>
          </div>
        </div>
      </div>

      {/* Top 3 Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Dynamic Study Streak Card */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 sm:p-6 flex flex-col justify-between hover:border-white/10 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                Daily Study Streak
              </span>
              <Flame
                className={`w-4 h-4 ${
                  streakStats.currentStreak > 0 ? 'text-orange-500 animate-pulse' : 'text-zinc-600'
                }`}
              />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono">
                {streakStats.currentStreak}
              </span>
              <span className="text-sm text-orange-500 font-bold mb-1">
                {streakStats.currentStreak === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="h-1 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-500"
                style={{ width: `${Math.min(100, (streakStats.currentStreak / 7) * 100)}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>Longest Streak: <strong className="text-zinc-300">{streakStats.longestStreak}d</strong></span>
            <span>Last: {streakStats.lastActiveDate || 'None'}</span>
          </div>
        </div>

        {/* Dynamic Rank & Level Progression Card */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 sm:p-6 flex flex-col justify-between hover:border-white/10 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                Scholar Rank
              </span>
              <Award className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono">
                Lv.{currentRank.level}
              </span>
              <span className="text-sm text-purple-500 font-bold mb-1 uppercase">
                {currentRank.title}
              </span>
            </div>
            <div className="h-1 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-500"
                style={{ width: `${rankProgressPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>Tier Progress: <strong className="text-zinc-300">{rankProgressPercent}%</strong></span>
            <span>{user?.xp || 0} XP</span>
          </div>
        </div>

        {/* Daily Goal Progress Card */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-5 sm:p-6 flex flex-col justify-between hover:border-white/10 transition-all">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">
                Daily Target
              </span>
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono">
                {todayMinutes}
              </span>
              <span className="text-sm text-indigo-500 font-bold mb-1">
                / {goalMinutes} min
              </span>
            </div>
            <div className="h-1 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${goalPercent}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>Progress: <strong className="text-zinc-300">{goalPercent}%</strong></span>
            <span>{streakStats.totalSessions} sessions</span>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('notes')}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <BookOpen className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">Study Notes</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Create, organize & export markdown notes.</p>
        </button>

        <button
          onClick={() => onNavigate('aihub')}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">AI Hub & Quizzes</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Instant summaries & cached practice quizzes.</p>
        </button>

        <button
          onClick={() => onNavigate('timetable')}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Calendar className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">Class Schedule</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Schedule lectures, labs & study blocks.</p>
        </button>

        <button
          onClick={() => onNavigate('teachers')}
          className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-white/5 hover:border-white/10 transition-all text-left group cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-4 h-4" />
          </div>
          <h4 className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors">Professors</h4>
          <p className="text-[11px] text-zinc-400 mt-1">Office hours, emails & course directory.</p>
        </button>
      </div>

      {/* Recent Completed Study Sessions */}
      <div className="p-6 sm:p-8 rounded-2xl bg-zinc-900/40 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Recent Completed Study Sessions
          </h3>
          <button
            onClick={() => onNavigate('focus')}
            className="text-xs font-mono text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            + Start New Session
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs font-mono bg-zinc-950/40 rounded-xl border border-white/5">
            No study sessions logged yet. Head over to the Focus tab to complete your first session!
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {sessions.slice(0, 5).map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <div>
                    <span className="font-bold text-zinc-200">{s.tag || 'Deep Study Session'}</span>
                    <span className="text-zinc-500 text-[11px] ml-2 font-mono">{s.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-zinc-400">{s.durationMinutes} mins</span>
                  <span className="text-purple-400 font-bold">+{s.xpEarned} XP</span>
                  <span className="text-amber-400 font-bold">+{s.sparksEarned} Sparks</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
