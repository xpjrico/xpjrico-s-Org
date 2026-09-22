import {
  UserProfile,
  StudySession,
  Note,
  Teacher,
  TimetableSlot,
  Quiz,
  PaymentRecord,
  SubscriptionRecord,
  QuotaCountdownInfo,
  CachedSummary,
  CachedQuiz,
  StudyPlannerItem,
  PricingTierId,
} from '../types';

const PREFIX = 'studia_v1_';

export const FREE_AI_LIMIT = 5;
export const FREE_AI_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily reset)

/**
 * Calculates countdown until next quota reset (every 6 hours for free users; infinite for premium)
 */
export function getAiQuotaCountdown(sub: SubscriptionRecord | null): QuotaCountdownInfo {
  if (!sub || (sub.planType && sub.planType !== 'free' && sub.status === 'active')) {
    return {
      isUnlimited: true,
      limit: Infinity,
      usageCount: sub?.aiUsageCount || 0,
      remaining: Infinity,
      msUntilReset: 0,
      formattedCountdown: 'Unlimited',
      hours: 0,
      minutes: 0,
      seconds: 0,
      nextResetTimestamp: 0,
    };
  }

  const now = Date.now();
  const lastReset = new Date(sub.lastUsageResetDate || sub.createdAt).getTime();
  const validLastReset = isNaN(lastReset) ? now : lastReset;
  const elapsed = now - validLastReset;

  if (elapsed >= FREE_AI_RESET_INTERVAL_MS) {
    return {
      isUnlimited: false,
      limit: FREE_AI_LIMIT,
      usageCount: 0,
      remaining: FREE_AI_LIMIT,
      msUntilReset: FREE_AI_RESET_INTERVAL_MS,
      formattedCountdown: '06:00:00',
      hours: 6,
      minutes: 0,
      seconds: 0,
      nextResetTimestamp: now + FREE_AI_RESET_INTERVAL_MS,
    };
  }

  const msRemaining = Math.max(0, FREE_AI_RESET_INTERVAL_MS - elapsed);
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedCountdown = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return {
    isUnlimited: false,
    limit: FREE_AI_LIMIT,
    usageCount: sub.aiUsageCount || 0,
    remaining: Math.max(0, FREE_AI_LIMIT - (sub.aiUsageCount || 0)),
    msUntilReset: msRemaining,
    formattedCountdown,
    hours,
    minutes,
    seconds,
    nextResetTimestamp: validLastReset + FREE_AI_RESET_INTERVAL_MS,
  };
}

/**
 * Fast content hash generator (djb2 algorithm variant) to uniquely identify identical note texts
 */
export function generateContentHash(text: string, extraParam = ''): string {
  const normalized = (text + '__' + extraParam).trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return 'hash_' + (hash >>> 0).toString(16) + '_' + normalized.length;
}

// Safe storage helpers with try/catch blocks to avoid crashing in Safari/iOS iframes where localStorage access throws SecurityError
const inMemoryAppStore = new Map<string, string>();

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    }
  } catch { }
  return inMemoryAppStore.get(key) || null;
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch { }
  inMemoryAppStore.set(key, value);
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch { }
  inMemoryAppStore.delete(key);
}

export function getStoredActiveUserId(): string | null {
  try {
    const activeId = safeStorageGet(`${PREFIX}active_user_id`);
    if (!activeId) return null;
    const users = getStoredUsers();
    const exists = users.some((u) => u.id === activeId);
    if (!exists) {
      safeStorageRemove(`${PREFIX}active_user_id`);
      return null;
    }
    return activeId;
  } catch {
    return null;
  }
}

export function setStoredActiveUserId(userId: string | null) {
  if (userId) {
    safeStorageSet(`${PREFIX}active_user_id`, userId);
  } else {
    safeStorageRemove(`${PREFIX}active_user_id`);
  }
}

export function getStoredUsers(): UserProfile[] {
  try {
    const raw = safeStorageGet(`${PREFIX}users_list`);
    if (!raw) return [];
    const parsed: UserProfile[] = JSON.parse(raw);
    const validUsers = parsed.filter((u) => u && u.id && u.email);
    if (validUsers.length !== parsed.length) {
      safeStorageSet(`${PREFIX}users_list`, JSON.stringify(validUsers));
    }
    return validUsers;
  } catch {
    return [];
  }
}

export function saveStoredUsers(users: UserProfile[]) {
  safeStorageSet(`${PREFIX}users_list`, JSON.stringify(users));
}

// User-scoped data loaders and savers
export function getUserSessions(userId: string): StudySession[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_sessions`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserSessions(userId: string, sessions: StudySession[]) {
  safeStorageSet(`${PREFIX}${userId}_sessions`, JSON.stringify(sessions));
}

export function getUserNotes(userId: string): Note[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_notes`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserNotes(userId: string, notes: Note[]) {
  safeStorageSet(`${PREFIX}${userId}_notes`, JSON.stringify(notes));
}

export function getUserTeachers(userId: string): Teacher[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_teachers`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserTeachers(userId: string, teachers: Teacher[]) {
  safeStorageSet(`${PREFIX}${userId}_teachers`, JSON.stringify(teachers));
}

export function getUserTimetable(userId: string): TimetableSlot[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_timetable`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserTimetable(userId: string, slots: TimetableSlot[]) {
  safeStorageSet(`${PREFIX}${userId}_timetable`, JSON.stringify(slots));
}

export function getUserQuizzes(userId: string): Quiz[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_quizzes`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserQuizzes(userId: string, quizzes: Quiz[]) {
  safeStorageSet(`${PREFIX}${userId}_quizzes`, JSON.stringify(quizzes));
}

export function getUserPayments(userId: string): PaymentRecord[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_payments`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserPayments(userId: string, payments: PaymentRecord[]) {
  safeStorageSet(`${PREFIX}${userId}_payments`, JSON.stringify(payments));
}

// -------------------------------------------------------------
// SUBSCRIPTIONS & AI USAGE GUARDRAILS
// -------------------------------------------------------------
export function getUserSubscription(userId: string): SubscriptionRecord {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_subscription`);
    if (raw) {
      const sub: SubscriptionRecord = JSON.parse(raw);

      // Handle Paid Premium Subscriptions: UNLIMITED AI USES
      if (sub.planType && sub.planType !== 'free') {
        if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
          sub.status = 'expired';
          sub.planType = 'free';
          sub.planName = 'Free Scholar';
          sub.aiUsageCount = 0;
          sub.aiUsageLimit = FREE_AI_LIMIT;
          sub.lastUsageResetDate = new Date().toISOString();
          saveUserSubscription(userId, sub);
          return sub;
        }

        // Ensure active premium users have Unlimited limits
        if (sub.aiUsageLimit !== Infinity) {
          sub.aiUsageLimit = Infinity;
          saveUserSubscription(userId, sub);
        }
        return sub;
      }

      // Handle Free Tier: 6 AI uses with 6-hour reset countdown
      sub.aiUsageLimit = FREE_AI_LIMIT;
      const now = Date.now();
      const lastReset = new Date(sub.lastUsageResetDate || sub.createdAt).getTime();
      const validLastReset = isNaN(lastReset) ? now : lastReset;

      if (now - validLastReset >= FREE_AI_RESET_INTERVAL_MS) {
        sub.aiUsageCount = 0;
        sub.lastUsageResetDate = new Date(now).toISOString();
        saveUserSubscription(userId, sub);
      }
      return sub;
    }
  } catch (e) {
    console.warn('Error reading subscription:', e);
  }

  // Default Free Tier: 6 uses, 6-hour countdown cycle
  const defaultSub: SubscriptionRecord = {
    id: `sub_free_${userId}`,
    userId,
    planType: 'free',
    planName: 'Free Scholar',
    status: 'active',
    paymentMethod: 'none',
    amount: 0,
    currency: 'KES',
    createdAt: new Date().toISOString(),
    expiresAt: null,
    aiUsageCount: 0,
    aiUsageLimit: FREE_AI_LIMIT,
    lastUsageResetDate: new Date().toISOString(),
  };
  saveUserSubscription(userId, defaultSub);
  return defaultSub;
}

export function saveUserSubscription(userId: string, sub: SubscriptionRecord) {
  safeStorageSet(`${PREFIX}${userId}_subscription`, JSON.stringify(sub));
}

export function incrementUserAiUsage(userId: string): {
  allowed: boolean;
  usageCount: number;
  limit: number;
  remaining: number;
  isUnlimited?: boolean;
  reason?: string;
  nextResetFormatted?: string;
} {
  const sub = getUserSubscription(userId);

  // Check expiration if timed pass
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() < Date.now()) {
    sub.status = 'expired';
    sub.planType = 'free';
    sub.planName = 'Free Scholar';
    sub.aiUsageLimit = FREE_AI_LIMIT;
    sub.aiUsageCount = 0;
    sub.lastUsageResetDate = new Date().toISOString();
    saveUserSubscription(userId, sub);
    return {
      allowed: false,
      usageCount: 0,
      limit: FREE_AI_LIMIT,
      remaining: FREE_AI_LIMIT,
      reason: 'Your exam pass has expired. You have been switched back to the Free plan (6 uses every 6 hours).',
    };
  }

  // PREMIUM IS UNLIMITED: Never block or restrict active paid users
  if (sub.planType && sub.planType !== 'free' && sub.status === 'active') {
    sub.aiUsageCount = (sub.aiUsageCount || 0) + 1;
    saveUserSubscription(userId, sub);
    return {
      allowed: true,
      usageCount: sub.aiUsageCount,
      limit: Infinity,
      remaining: Infinity,
      isUnlimited: true,
    };
  }

  // FREE PLAN: 6 AI uses with 6h countdown refill
  const now = Date.now();
  const lastReset = new Date(sub.lastUsageResetDate || sub.createdAt).getTime();
  const validLastReset = isNaN(lastReset) ? now : lastReset;

  if (now - validLastReset >= FREE_AI_RESET_INTERVAL_MS) {
    sub.aiUsageCount = 0;
    sub.lastUsageResetDate = new Date(now).toISOString();
  }

  const countdown = getAiQuotaCountdown(sub);

  if (sub.aiUsageCount >= FREE_AI_LIMIT) {
    return {
      allowed: false,
      usageCount: sub.aiUsageCount,
      limit: FREE_AI_LIMIT,
      remaining: 0,
      isUnlimited: false,
      reason: `You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.`,
      nextResetFormatted: countdown.formattedCountdown,
    };
  }

  sub.aiUsageCount += 1;
  saveUserSubscription(userId, sub);

  return {
    allowed: true,
    usageCount: sub.aiUsageCount,
    limit: FREE_AI_LIMIT,
    remaining: Math.max(0, FREE_AI_LIMIT - sub.aiUsageCount),
    isUnlimited: false,
    nextResetFormatted: countdown.formattedCountdown,
  };
}

// -------------------------------------------------------------
// CACHED SUMMARIES & QUIZZES (Content-hash based instant recall)
// -------------------------------------------------------------
export function getCachedSummaries(): CachedSummary[] {
  try {
    const raw = safeStorageGet(`${PREFIX}cached_summaries`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function findCachedSummary(contentHash: string): CachedSummary | undefined {
  const all = getCachedSummaries();
  return all.find((c) => c.contentHash === contentHash);
}

export function saveCachedSummary(item: CachedSummary) {
  const all = getCachedSummaries();
  const filtered = all.filter((c) => c.contentHash !== item.contentHash);
  safeStorageSet(`${PREFIX}cached_summaries`, JSON.stringify([item, ...filtered].slice(0, 50)));
}

export function getCachedQuizzes(): CachedQuiz[] {
  try {
    const raw = safeStorageGet(`${PREFIX}cached_quizzes`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function findCachedQuiz(contentHash: string): CachedQuiz | undefined {
  const all = getCachedQuizzes();
  return all.find((c) => c.contentHash === contentHash);
}

export function saveCachedQuiz(item: CachedQuiz) {
  const all = getCachedQuizzes();
  const filtered = all.filter((c) => c.contentHash !== item.contentHash);
  safeStorageSet(`${PREFIX}cached_quizzes`, JSON.stringify([item, ...filtered].slice(0, 50)));
}

// -------------------------------------------------------------
// SUBJECT STUDY PLANNER
// -------------------------------------------------------------
export function getUserStudyPlanner(userId: string): StudyPlannerItem[] {
  try {
    const raw = safeStorageGet(`${PREFIX}${userId}_study_planner`);
    return raw ? JSON.parse(raw) : getDefaultStudyPlanner(userId);
  } catch {
    return getDefaultStudyPlanner(userId);
  }
}

export function saveUserStudyPlanner(userId: string, items: StudyPlannerItem[]) {
  safeStorageSet(`${PREFIX}${userId}_study_planner`, JSON.stringify(items));
}

function getDefaultStudyPlanner(userId: string): StudyPlannerItem[] {
  const today = new Date();
  const in3Days = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return [
    {
      id: 'plan_1',
      userId,
      subject: 'Calculus & Linear Algebra',
      topic: 'Vector spaces, eigenvalues & matrix diagonalization',
      targetDate: in3Days,
      targetMinutes: 90,
      completedMinutes: 45,
      isCompleted: false,
      priority: 'high',
      examDate: in7Days,
    },
    {
      id: 'plan_2',
      userId,
      subject: 'Computer Systems & Architecture',
      topic: 'CPU pipelining hazards and cache hierarchies',
      targetDate: in7Days,
      targetMinutes: 60,
      completedMinutes: 60,
      isCompleted: true,
      priority: 'medium',
      examDate: in7Days,
    },
  ];
}

