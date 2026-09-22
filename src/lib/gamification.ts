import { StudySession, StreakStats, DayActivity } from '../types';

export interface RankTier {
  level: number;
  title: string;
  minXp: number;
  maxXp: number;
  badgeColor: string;
  iconName: string;
  perks: string[];
}

export const RANK_TIERS: RankTier[] = [
  {
    level: 1,
    title: 'Novice Scholar',
    minXp: 0,
    maxXp: 499,
    badgeColor: 'from-zinc-500 to-zinc-400',
    iconName: 'GraduationCap',
    perks: ['Standard Study Timetable', 'Basic Pomodoro Sounds', 'AI Notes Summaries'],
  },
  {
    level: 2,
    title: 'Cyber Scribe',
    minXp: 500,
    maxXp: 1199,
    badgeColor: 'from-blue-600 to-cyan-400',
    iconName: 'Sparkles',
    perks: ['Custom Subject Color Matrix', 'AI Quiz Generator (5 Questions)', '+10% Bonus Sparks'],
  },
  {
    level: 3,
    title: 'Focus Striker',
    minXp: 1200,
    maxXp: 2499,
    badgeColor: 'from-purple-600 to-indigo-400',
    iconName: 'Zap',
    perks: ['Binaural 40Hz Audio Wave', 'Virtual Joystick Drone Flight', 'Detailed Exam Analytics'],
  },
  {
    level: 4,
    title: 'Knowledge Warden',
    minXp: 2500,
    maxXp: 4499,
    badgeColor: 'from-amber-500 to-orange-400',
    iconName: 'Shield',
    perks: ['AI Cyber-Tutor Unlimited Context', 'Advanced Quiz Deep Explanations', 'Neon Orange Drone Skin'],
  },
  {
    level: 5,
    title: 'Arcane Architect',
    minXp: 4500,
    maxXp: 7499,
    badgeColor: 'from-pink-600 to-rose-400',
    iconName: 'Flame',
    perks: ['Master Study Schedules Export', 'Full AI Note Synthesis', 'Supercharged Sparks Matrix'],
  },
  {
    level: 6,
    title: 'Neural Overlord',
    minXp: 7500,
    maxXp: 999999,
    badgeColor: 'from-emerald-400 via-cyan-400 to-indigo-500',
    iconName: 'Crown',
    perks: ['Omni-Focus Ascendance', 'Instant AI Exam Predictor', 'All Armory Themes Unlocked'],
  },
];

export function getRankByXp(xp: number): RankTier {
  const currentXp = Math.max(0, xp || 0);
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (currentXp >= RANK_TIERS[i].minXp) {
      return RANK_TIERS[i];
    }
  }
  return RANK_TIERS[0];
}

// Helpers for formatted date YYYY-MM-DD
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Calculate dynamic streaks and weekly calendar Mon-Sun
export function calculateStreakStats(sessions: StudySession[]): StreakStats {
  if (!sessions || sessions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      weeklyActivity: getWeeklyActivity([]),
      totalStudyMinutes: 0,
      totalSessions: 0,
    };
  }

  // Aggregate total minutes by date
  const dateMinutesMap: Record<string, number> = {};
  let totalStudyMinutes = 0;

  for (const s of sessions) {
    if (!s.date) continue;
    dateMinutesMap[s.date] = (dateMinutesMap[s.date] || 0) + (s.durationMinutes || 0);
    totalStudyMinutes += s.durationMinutes || 0;
  }

  // Unique dates where user studied at least 1 minute
  const activeDates = Object.keys(dateMinutesMap).filter((d) => dateMinutesMap[d] > 0);

  if (activeDates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      weeklyActivity: getWeeklyActivity(sessions),
      totalStudyMinutes: 0,
      totalSessions: 0,
    };
  }

  // Sort dates descending
  const sortedDates = [...activeDates].sort((a, b) => b.localeCompare(a));
  const lastActiveDate = sortedDates[0];

  const now = new Date();
  const todayStr = formatDate(now);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  // Determine current streak
  let currentStreak = 0;
  const activeSet = new Set(activeDates);

  if (activeSet.has(todayStr)) {
    currentStreak = 1;
    let checkDate = new Date(now);
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1);
      const str = formatDate(checkDate);
      if (activeSet.has(str)) {
        currentStreak++;
      } else {
        break;
      }
    }
  } else if (activeSet.has(yesterdayStr)) {
    // If today hasn't happened yet, yesterday's streak is still intact
    currentStreak = 1;
    let checkDate = new Date(yesterday);
    while (true) {
      checkDate.setDate(checkDate.getDate() - 1);
      const str = formatDate(checkDate);
      if (activeSet.has(str)) {
        currentStreak++;
      } else {
        break;
      }
    }
  } else {
    // Neither today nor yesterday had a study session => streak is 0
    currentStreak = 0;
  }

  // Calculate longest streak historically
  const sortedAsc = [...activeDates].sort((a, b) => a.localeCompare(b));
  let longestStreak = 0;
  let runningStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of sortedAsc) {
    const curDate = parseDateString(dateStr);
    if (!prevDate) {
      runningStreak = 1;
    } else {
      const diffTime = curDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
      if (diffDays === 1) {
        runningStreak++;
      } else if (diffDays > 1) {
        runningStreak = 1;
      }
    }
    prevDate = curDate;
    if (runningStreak > longestStreak) {
      longestStreak = runningStreak;
    }
  }

  return {
    currentStreak,
    longestStreak,
    lastActiveDate,
    weeklyActivity: getWeeklyActivity(sessions),
    totalStudyMinutes,
    totalSessions: sessions.length,
  };
}

export { calculateStreakStats as calculateDynamicStreak };
export function getWeeklyActivity(sessions: StudySession[]): DayActivity[] {
  const now = new Date();
  const todayStr = formatDate(now);

  // Find Monday of the current week (0 is Sunday, 1 is Monday in JS)
  const currentDayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
  // Distance from Monday: if Sunday (0), it's 6 days after Mon; otherwise (day - 1)
  const distanceToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);

  const dayNames: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun')[] = [
    'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  ];

  const weekly: DayActivity[] = [];

  // Group session data by date
  const map: Record<string, { minutes: number; count: number }> = {};
  for (const s of sessions || []) {
    if (!s.date) continue;
    if (!map[s.date]) {
      map[s.date] = { minutes: 0, count: 0 };
    }
    map[s.date].minutes += s.durationMinutes || 0;
    map[s.date].count += 1;
  }

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dateStr = formatDate(dayDate);
    const stats = map[dateStr] || { minutes: 0, count: 0 };

    weekly.push({
      dayName: dayNames[i],
      dateStr,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      minutes: stats.minutes,
      sessionsCount: stats.count,
      active: stats.minutes > 0,
    });
  }

  return weekly;
}
