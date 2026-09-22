import { supabase, isSupabaseConfigured } from './supabase';
import { Note, TimetableSlot, Quiz, StudySession, StreakStats, UserProfile } from '../types';

/**
 * Retrieves the currently authenticated Supabase user via supabase.auth.getUser()
 */
export async function getAuthUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (err) {
    console.warn('[Supabase Sync] Error checking auth user:', err);
    return null;
  }
}

/**
 * Retrieves the active user ID from Supabase auth
 */
export async function getAuthUserId(): Promise<string | null> {
  const user = await getAuthUser();
  return user ? user.id : null;
}

// ============================================================================
// 1. AUTOMATIC PROFILE SYNC (profiles table)
// ============================================================================
export async function syncProfileToSupabase(profile: {
  id: string;
  email: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string;
  photo_url?: string;
  is_pro?: boolean;
  is_premium?: boolean;
  usage_count?: number;
  usageCount?: number;
  subscription_tier?: string;
  xp?: number;
  sparks?: number;
  level?: number;
  rank_title?: string;
  daily_goal_minutes?: number;
}) {
  if (!isSupabaseConfigured) return;
  try {
    const isPremium = profile.is_premium ?? (profile.is_pro || profile.subscription_tier === 'pro') ?? false;
    const usageCount = profile.usage_count ?? profile.usageCount ?? 0;

    const payload: any = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name || profile.display_name || profile.email.split('@')[0],
      display_name: profile.display_name || profile.full_name || profile.email.split('@')[0],
      avatar_url: profile.avatar_url || profile.photo_url || '',
      photo_url: profile.photo_url || profile.avatar_url || '',
      is_pro: isPremium,
      is_premium: isPremium,
      usage_count: usageCount,
      subscription_tier: profile.subscription_tier ?? (isPremium ? 'pro' : 'free'),
      xp: profile.xp ?? 0,
      sparks: profile.sparks ?? 0,
      level: profile.level ?? 1,
      rank_title: profile.rank_title ?? 'Novice Scholar',
      daily_goal_minutes: profile.daily_goal_minutes ?? 45,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase Sync] Notice updating profiles table:', error.message);
    }
  } catch (err) {
    console.warn('[Supabase Sync] Exception syncing profile:', err);
  }
}

/**
 * Retrieves the current usage_count and is_premium status for an authenticated user from Supabase.
 */
export async function getUserUsageAndPremium(userId: string): Promise<{ usage_count: number; is_premium: boolean }> {
  if (!isSupabaseConfigured || !userId || userId === 'guest_user') {
    return { usage_count: 0, is_premium: false };
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('usage_count, is_premium, is_pro, subscription_tier')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return { usage_count: 0, is_premium: false };
    }

    const isPremium = Boolean(data.is_premium || data.is_pro || data.subscription_tier === 'pro');
    const usageCount = typeof data.usage_count === 'number' ? data.usage_count : 0;

    return {
      usage_count: usageCount,
      is_premium: isPremium,
    };
  } catch (err) {
    console.warn('[Supabase Sync] Error fetching usage_count and is_premium:', err);
    return { usage_count: 0, is_premium: false };
  }
}

/**
 * Increments the user's usage_count counter in Supabase upon every successful AI generation.
 */
export async function incrementUsageCountInSupabase(userId: string): Promise<number> {
  if (!isSupabaseConfigured || !userId || userId === 'guest_user') {
    return 1;
  }

  try {
    // 1. Fetch current usage count
    const { data } = await supabase
      .from('profiles')
      .select('usage_count')
      .eq('id', userId)
      .single();

    const currentCount = typeof data?.usage_count === 'number' ? data.usage_count : 0;
    const newCount = currentCount + 1;

    // 2. Increment usage_count in Supabase
    const { error } = await supabase
      .from('profiles')
      .update({
        usage_count: newCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Supabase Sync] Notice incrementing usage_count:', error.message);
    } else {
      console.log(`[Supabase Sync] Successfully incremented usage_count to ${newCount} for user ${userId}`);
    }

    return newCount;
  } catch (err) {
    console.warn('[Supabase Sync] Exception incrementing usage_count:', err);
    return 1;
  }
}

/**
 * Updates a user's row in public.profiles and public.users:
 * sets is_premium = true, is_pro = true, subscription_tier = 'pro'
 * Also calls the RPC function upgrade_user_to_pro if available.
 */
export async function upgradeUserToProInSupabase(
  userId: string,
  tier: string = 'pro',
  receipt?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !userId || userId === 'guest_user') return false;

  try {
    // 1. Try calling the custom RPC function first
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('upgrade_user_to_pro', {
        target_user_id: userId,
        p_tier: tier,
        p_receipt: receipt || null,
      });
      if (!rpcError && rpcData) {
        console.log('[Supabase Sync] User upgraded via RPC upgrade_user_to_pro:', rpcData);
      }
    } catch (rpcErr) {
      console.warn('[Supabase Sync] RPC attempt failed, falling back to direct table update:', rpcErr);
    }

    // 2. Direct update on public.profiles table: set is_premium = true & is_pro = true
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        is_premium: true,
        is_pro: true,
        subscription_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.warn('[Supabase Sync] Error updating profiles table:', profileError.message);
    } else {
      console.log(`[Supabase Sync] Successfully set is_premium = true for user ${userId}`);
    }

    // 3. Update public.users compatibility table
    await supabase
      .from('users')
      .update({
        is_premium: true,
        is_pro: true,
        subscription_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .then(() => {})
      .catch(() => {});

    // 4. Record active subscription in public.subscriptions
    await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        plan_type: 'monthly_pro',
        plan_name: 'Monthly Pro Plan',
        status: 'active',
        payment_method: 'paystack',
        amount: 500,
        currency: 'KES',
        mpesa_receipt_number: receipt || null,
        ai_usage_limit: 999999,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id' })
      .then(() => {})
      .catch(() => {});

    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception upgrading user to pro:', err);
    return false;
  }
}

/**
 * Convenience alias for setting is_premium in Supabase
 */
export async function updateUserPremiumInSupabase(
  userId: string,
  isPremium: boolean = true,
  receipt?: string
): Promise<boolean> {
  return upgradeUserToProInSupabase(userId, isPremium ? 'pro' : 'free', receipt);
}

// ============================================================================
// 2. NOTES SYNC (notes table bound to user_id = auth.users(id))
// ============================================================================
export async function fetchNotesFromSupabase(fallbackUserId?: string): Promise<Note[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const authUser = await getAuthUser();
    const userId = authUser?.id || fallbackUserId;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase Sync] Error fetching notes:', error.message);
      return null;
    }

    if (!Array.isArray(data)) return null;

    return data.map((row: any): Note => ({
      id: row.id,
      userId: row.user_id,
      title: row.title || 'Untitled Note',
      content: row.content || '',
      subject: row.subject || 'General',
      tags: Array.isArray(row.tags) ? row.tags : [],
      color: row.color || '#6366f1',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
      summary: row.summary || undefined,
      teacherId: row.teacher_id || undefined,
    }));
  } catch (err) {
    console.warn('[Supabase Sync] Exception fetching notes:', err);
    return null;
  }
}

export async function saveNoteToSupabase(note: Note): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    const targetUserId = authUser?.id || note.userId;
    if (!targetUserId) return false;

    const { error } = await supabase
      .from('notes')
      .upsert({
        id: note.id,
        user_id: targetUserId,
        title: note.title,
        content: note.content,
        subject: note.subject,
        tags: note.tags,
        color: note.color,
        summary: note.summary || null,
        teacher_id: note.teacherId || null,
        created_at: new Date(note.createdAt || Date.now()).toISOString(),
        updated_at: new Date(note.updatedAt || Date.now()).toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase Sync] Error saving note:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception saving note:', err);
    return false;
  }
}

export async function deleteNoteFromSupabase(noteId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    if (!authUser?.id) return false;

    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('id', noteId)
      .eq('user_id', authUser.id);

    if (error) {
      console.warn('[Supabase Sync] Error deleting note:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception deleting note:', err);
    return false;
  }
}

// ============================================================================
// 3. TIMETABLES SYNC (timetables / timetable_slots table bound to user_id)
// ============================================================================
export async function fetchTimetablesFromSupabase(fallbackUserId?: string): Promise<TimetableSlot[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const authUser = await getAuthUser();
    const userId = authUser?.id || fallbackUserId;
    if (!userId) return null;

    // Primary query on timetables
    let { data, error } = await supabase
      .from('timetables')
      .select('*')
      .eq('user_id', userId);

    // Fallback query to timetable_slots if timetables returned error or was empty
    if (error || !data || data.length === 0) {
      const fallbackRes = await supabase
        .from('timetable_slots')
        .select('*')
        .eq('user_id', userId);

      if (!fallbackRes.error && Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
        data = fallbackRes.data;
        error = null;
      }
    }

    if (error || !Array.isArray(data)) {
      return null;
    }

    return data.map((row: any): TimetableSlot => ({
      id: row.id,
      userId: row.user_id,
      day: row.day,
      startTime: row.start_time || '09:00',
      endTime: row.end_time || '10:30',
      subject: row.subject || 'Lecture',
      room: row.room || 'Room 101',
      instructor: row.instructor || undefined,
      teacherId: row.teacher_id || undefined,
      color: row.color || '#6366f1',
      type: row.type || 'Lecture',
    }));
  } catch (err) {
    console.warn('[Supabase Sync] Exception fetching timetable:', err);
    return null;
  }
}

export async function saveTimetableSlotToSupabase(slot: TimetableSlot): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    const targetUserId = authUser?.id || slot.userId;
    if (!targetUserId) return false;

    const payload = {
      id: slot.id,
      user_id: targetUserId,
      day: slot.day,
      start_time: slot.startTime,
      end_time: slot.endTime,
      subject: slot.subject,
      room: slot.room,
      instructor: slot.instructor || null,
      teacher_id: slot.teacherId || null,
      color: slot.color,
      type: slot.type || 'Lecture',
      updated_at: new Date().toISOString(),
    };

    // Save to timetables
    const { error: err1 } = await supabase
      .from('timetables')
      .upsert(payload, { onConflict: 'id' });

    // Also attempt write to timetable_slots for complete compatibility
    await supabase
      .from('timetable_slots')
      .upsert(payload, { onConflict: 'id' })
      .then(() => {})
      .catch(() => {});

    if (err1) {
      console.warn('[Supabase Sync] Notice saving timetable:', err1.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception saving timetable slot:', err);
    return false;
  }
}

export async function deleteTimetableSlotFromSupabase(slotId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    if (!authUser?.id) return false;

    await supabase
      .from('timetables')
      .delete()
      .eq('id', slotId)
      .eq('user_id', authUser.id);

    await supabase
      .from('timetable_slots')
      .delete()
      .eq('id', slotId)
      .eq('user_id', authUser.id);

    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception deleting timetable slot:', err);
    return false;
  }
}

// ============================================================================
// 4. QUIZZES SYNC (quizzes table bound to user_id = auth.users(id))
// ============================================================================
export async function fetchQuizzesFromSupabase(fallbackUserId?: string): Promise<Quiz[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const authUser = await getAuthUser();
    const userId = authUser?.id || fallbackUserId;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      return null;
    }

    return data.map((row: any): Quiz => ({
      id: row.id,
      userId: row.user_id,
      noteId: row.note_id || undefined,
      title: row.title || 'Untitled Quiz',
      subject: row.subject || 'General Study',
      questions: Array.isArray(row.questions) ? row.questions : [],
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      attempts: row.attempts || 0,
      highScore: row.high_score || 0,
      lastScore: row.last_score ?? undefined,
      lastTakenAt: row.last_taken_at ? new Date(row.last_taken_at).getTime() : undefined,
    }));
  } catch (err) {
    console.warn('[Supabase Sync] Exception fetching quizzes:', err);
    return null;
  }
}

export async function saveQuizToSupabase(quiz: Quiz): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    const targetUserId = authUser?.id || quiz.userId;
    if (!targetUserId) return false;

    const { error } = await supabase
      .from('quizzes')
      .upsert({
        id: quiz.id,
        user_id: targetUserId,
        note_id: quiz.noteId || null,
        title: quiz.title,
        subject: quiz.subject,
        questions: quiz.questions,
        created_at: new Date(quiz.createdAt || Date.now()).toISOString(),
        attempts: quiz.attempts,
        high_score: quiz.highScore,
        last_score: quiz.lastScore ?? null,
        last_taken_at: quiz.lastTakenAt ? new Date(quiz.lastTakenAt).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase Sync] Notice saving quiz:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception saving quiz:', err);
    return false;
  }
}

// ============================================================================
// 5. STUDY SESSIONS & STUDY STREAKS SYNC
// ============================================================================
export async function fetchStudySessionsFromSupabase(fallbackUserId?: string): Promise<StudySession[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const authUser = await getAuthUser();
    const userId = authUser?.id || fallbackUserId;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false });

    if (error || !Array.isArray(data)) {
      return null;
    }

    return data.map((row: any): StudySession => ({
      id: row.id,
      userId: row.user_id,
      timestamp: row.timestamp || (row.completed_at ? new Date(row.completed_at).getTime() : Date.now()),
      date: row.date || new Date().toISOString().split('T')[0],
      durationMinutes: row.duration_minutes || 25,
      tag: row.tag || 'General',
      xpEarned: row.xp_earned || 0,
      sparksEarned: row.sparks_earned || 0,
    }));
  } catch (err) {
    console.warn('[Supabase Sync] Exception fetching study sessions:', err);
    return null;
  }
}

export async function saveStudySessionToSupabase(session: StudySession): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    const targetUserId = authUser?.id || session.userId;
    if (!targetUserId) return false;

    const { error } = await supabase
      .from('study_sessions')
      .upsert({
        id: session.id,
        user_id: targetUserId,
        date: session.date,
        timestamp: session.timestamp,
        duration_minutes: session.durationMinutes,
        tag: session.tag,
        xp_earned: session.xpEarned,
        sparks_earned: session.sparksEarned,
        completed_at: new Date(session.timestamp || Date.now()).toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.warn('[Supabase Sync] Notice saving study session:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception saving study session:', err);
    return false;
  }
}

export async function syncStudyStreakToSupabase(stats: StreakStats, fallbackUserId?: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const authUser = await getAuthUser();
    const userId = authUser?.id || fallbackUserId;
    if (!userId || userId === 'guest_user') return false;

    const { error } = await supabase
      .from('study_streaks')
      .upsert({
        user_id: userId,
        current_streak: stats.currentStreak,
        longest_streak: stats.longestStreak,
        last_study_date: stats.lastActiveDate || null,
        total_minutes: stats.totalStudyMinutes,
        total_sessions: stats.totalSessions,
        weekly_activity: stats.weeklyActivity || [],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.warn('[Supabase Sync] Notice syncing study_streaks:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Supabase Sync] Exception syncing study streaks:', err);
    return false;
  }
}
