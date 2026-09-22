export type TabType = 'dashboard' | 'notes' | 'focus' | 'teachers' | 'timetable' | 'aihub' | 'aitools';

export type SubscriptionPlanType = 'free' | 'pro_weekly' | 'pro_monthly' | 'pro_yearly';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired' | 'trialing';

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: SubscriptionPlanType;
  status: SubscriptionStatus;
  usage_count: number;
  daily_usage_date: string; // YYYY-MM-DD
  current_period_start?: string;
  current_period_end?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VideoLecture {
  id: string;
  title: string;
  topic: string;
  subject: string;
  duration: string;
  durationSeconds: number;
  url: string;
  thumbnailUrl: string;
  description: string;
  timestamps: { time: number; label: string }[];
}

export interface AnalyticsDataPoint {
  date: string;
  displayDate: string;
  aiGenerations: number;
  studyMinutes: number;
  quizzesTaken: number;
  summariesCreated: number;
  tokensConsumed: number;
}

export interface FeatureUsageMetric {
  name: string;
  count: number;
  percentage: number;
  color: string;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  name?: string;
  photoURL?: string;
  provider: 'google' | 'email' | 'firebase';
  isPro: boolean;
  isPremium?: boolean;
  is_premium?: boolean;
  usageCount?: number;
  usage_count?: number;
  subscriptionTier?: 'free' | 'pro' | string;
  xp: number;
  sparks: number;
  level: number;
  rankTitle: string;
  dailyGoalMinutes: number;
  joinedDate: string;
  bio?: string;
  major?: string;
  phone?: string;
  phoneNumber?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
    [key: string]: any;
  };
}

export interface StudySession {
  id: string;
  userId: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  durationMinutes: number;
  tag: string;
  xpEarned: number;
  sparksEarned: number;
}

export interface DayActivity {
  dayName: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  dateStr: string; // YYYY-MM-DD
  isToday: boolean;
  isPast: boolean;
  minutes: number;
  sessionsCount: number;
  active: boolean;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  weeklyActivity: DayActivity[];
  totalStudyMinutes: number;
  totalSessions: number;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  subject: string;
  tags: string[];
  color: string;
  createdAt: number;
  updatedAt: number;
  summary?: string;
  teacherId?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  conceptTag?: string;
}

export interface Quiz {
  id: string;
  userId: string;
  noteId?: string;
  title: string;
  subject: string;
  questions: QuizQuestion[];
  createdAt: number;
  attempts: number;
  highScore: number;
  lastScore?: number;
  lastTakenAt?: number;
}

export interface Teacher {
  id: string;
  userId: string;
  name: string;
  subject: string;
  email: string;
  officeHours: string;
  officeLocation?: string;
  roomLink?: string;
  notes: string;
  rating?: number; // 1-5
  color?: string;
  department?: string;
  avatar?: string;
}

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface TimetableSlot {
  id: string;
  userId: string;
  day: DayOfWeek | string;
  startTime: string; // e.g. "09:00"
  endTime: string;   // e.g. "10:30"
  subject: string;
  room: string;
  teacherId?: string;
  instructor?: string;
  color: string;
  type?: 'Lecture' | 'Lab' | 'Study' | 'Seminar' | 'Exam';
}

export interface FocusTimerSettings {
  focusDuration: number; // minutes, default 25
  shortBreakDuration: number; // minutes, default 5
  longBreakDuration: number; // minutes, default 15
  autoStartBreaks: boolean;
  soundEnabled: boolean;
  ambientSound: 'none' | 'binaural40hz' | 'cyberpulse' | 'whitenoise' | 'lofi';
  ambientVolume: number; // 0 to 1
}

export type PricingTierId =
  | 'free'
  | 'pro_weekly'
  | 'pro_monthly'
  | 'pro_yearly'
  | 'exam_pass'
  | 'monthly_pro'
  | 'annual_pass';

export interface PricingTier {
  id: PricingTierId;
  planKey?: SubscriptionPlanType;
  name: string;
  badge?: string;
  priceKes?: number;
  priceUsd: number;
  periodLabel?: string;
  billingPeriod: string;
  durationDays?: number;
  aiGenerationsLimit: number;
  isPopular?: boolean;
  isBestValue?: boolean;
  features: string[];
  ctaText?: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planType: PricingTierId;
  planName: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  paymentMethod: 'mpesa' | 'card' | 'airtel' | 'paypal' | 'none';
  amount: number;
  currency: 'KES' | 'USD';
  phoneNumber?: string;
  mpesaReceiptNumber?: string;
  createdAt: string;
  expiresAt: string | null; // null for lifetime or date for timed pass
  aiUsageCount: number;
  aiUsageLimit: number; // 6 for free, Infinity for premium
  lastUsageResetDate: string;
}

export interface QuotaCountdownInfo {
  isUnlimited: boolean;
  limit: number;
  usageCount: number;
  remaining: number;
  msUntilReset: number;
  formattedCountdown: string; // e.g. "05:42:18"
  hours: number;
  minutes: number;
  seconds: number;
  nextResetTimestamp: number;
}

export interface CachedSummary {
  id: string;
  contentHash: string;
  title: string;
  contentPreview: string;
  summary: string;
  createdAt: number;
  cachedAt: string;
  userId?: string;
}

export interface CachedQuiz {
  id: string;
  contentHash: string;
  title: string;
  difficulty: string;
  questionCount: number;
  questions: QuizQuestion[];
  createdAt: number;
  userId?: string;
}

export interface StudyPlannerItem {
  id: string;
  userId: string;
  subject: string;
  topic: string;
  targetDate: string; // YYYY-MM-DD
  targetMinutes: number;
  completedMinutes: number;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  examDate?: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  plan: string;
  planType?: PricingTierId;
  amount: number;
  currency: 'KES' | 'USD' | string;
  date: string;
  status: 'completed' | 'pending' | 'failed';
  paymentMethod: 'mpesa' | 'card' | 'airtel' | 'paypal' | 'stripe';
  phoneNumber?: string;
  mpesaReceipt?: string;
}

