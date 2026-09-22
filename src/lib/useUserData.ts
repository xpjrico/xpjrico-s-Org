import { useState, useEffect, useMemo, useCallback } from 'react';
import { Note, TimetableSlot, Quiz, StudySession, Teacher, StreakStats } from '../types';
import {
  getUserSessions,
  saveUserSessions,
  getUserNotes,
  saveUserNotes,
  getUserTeachers,
  saveUserTeachers,
  getUserTimetable,
  saveUserTimetable,
  getUserQuizzes,
  saveUserQuizzes,
} from './storage';
import { calculateDynamicStreak } from './gamification';
import {
  getAuthUser,
  fetchNotesFromSupabase,
  saveNoteToSupabase,
  deleteNoteFromSupabase,
  fetchTimetablesFromSupabase,
  saveTimetableSlotToSupabase,
  deleteTimetableSlotFromSupabase,
  fetchQuizzesFromSupabase,
  saveQuizToSupabase,
  fetchStudySessionsFromSupabase,
  saveStudySessionToSupabase,
  syncStudyStreakToSupabase,
} from './supabaseSync';

export interface UseUserDataReturn {
  notes: Note[];
  sessions: StudySession[];
  timetable: TimetableSlot[];
  quizzes: Quiz[];
  teachers: Teacher[];
  streakStats: StreakStats;
  isSyncing: boolean;
  handleSaveNote: (note: Note) => Promise<void>;
  handleDeleteNote: (id: string) => Promise<void>;
  handleSaveTimetableSlot: (slot: TimetableSlot) => Promise<void>;
  handleDeleteTimetableSlot: (id: string) => Promise<void>;
  handleSaveQuiz: (quiz: Quiz) => Promise<void>;
  handleSessionComplete: (session: StudySession) => Promise<void>;
  handleSaveTeacher: (teacher: Teacher) => void;
  handleDeleteTeacher: (id: string) => void;
  refreshFromSupabase: () => Promise<void>;
}

export function useUserData(userId: string): UseUserDataReturn {
  const currentUserId = userId || 'guest_user';

  // Local state initialized instantly from local storage cache
  const [sessions, setSessions] = useState<StudySession[]>(() => getUserSessions(currentUserId));
  const [notes, setNotes] = useState<Note[]>(() => getUserNotes(currentUserId));
  const [teachers, setTeachers] = useState<Teacher[]>(() => getUserTeachers(currentUserId));
  const [timetable, setTimetable] = useState<TimetableSlot[]>(() => getUserTimetable(currentUserId));
  const [quizzes, setQuizzes] = useState<Quiz[]>(() => getUserQuizzes(currentUserId));
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Synchronize with Supabase data bound to supabase.auth.getUser().id
  const refreshFromSupabase = useCallback(async () => {
    try {
      setIsSyncing(true);
      const authUser = await getAuthUser();
      const activeId = authUser?.id || currentUserId;

      if (!activeId || activeId === 'guest_user') {
        setIsSyncing(false);
        return;
      }

      // Fetch in parallel from Supabase tables with RLS bound to user_id
      const [remoteNotes, remoteTimetable, remoteQuizzes, remoteSessions] = await Promise.all([
        fetchNotesFromSupabase(activeId),
        fetchTimetablesFromSupabase(activeId),
        fetchQuizzesFromSupabase(activeId),
        fetchStudySessionsFromSupabase(activeId),
      ]);

      if (remoteNotes !== null) {
        setNotes(remoteNotes);
        saveUserNotes(activeId, remoteNotes);
      }
      if (remoteTimetable !== null) {
        setTimetable(remoteTimetable);
        saveUserTimetable(activeId, remoteTimetable);
      }
      if (remoteQuizzes !== null) {
        setQuizzes(remoteQuizzes);
        saveUserQuizzes(activeId, remoteQuizzes);
      }
      if (remoteSessions !== null) {
        setSessions(remoteSessions);
        saveUserSessions(activeId, remoteSessions);
      }
    } catch (err) {
      console.warn('[useUserData] Background sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [currentUserId]);

  // When active user ID changes, load local cache then sync with Supabase
  useEffect(() => {
    setSessions(getUserSessions(currentUserId));
    setNotes(getUserNotes(currentUserId));
    setTeachers(getUserTeachers(currentUserId));
    setTimetable(getUserTimetable(currentUserId));
    setQuizzes(getUserQuizzes(currentUserId));

    refreshFromSupabase();
  }, [currentUserId, refreshFromSupabase]);

  // Streak Stats computed dynamically from real completed sessions
  const streakStats = useMemo(() => {
    const stats = calculateDynamicStreak(sessions);
    // Background sync streak to Supabase study_streaks table
    if (currentUserId && currentUserId !== 'guest_user') {
      syncStudyStreakToSupabase(stats, currentUserId).catch(() => {});
    }
    return stats;
  }, [sessions, currentUserId]);

  // Note insertion & update hook bound to supabase.auth.getUser().id
  const handleSaveNote = useCallback(async (note: Note) => {
    const exists = notes.some((n) => n.id === note.id);
    const updated = exists ? notes.map((n) => (n.id === note.id ? note : n)) : [note, ...notes];

    // Optimistic local update
    setNotes(updated);
    saveUserNotes(currentUserId, updated);

    // Sync to Supabase bound to auth user
    await saveNoteToSupabase({ ...note, userId: currentUserId });
  }, [notes, currentUserId]);

  // Note deletion hook bound to supabase.auth.getUser().id
  const handleDeleteNote = useCallback(async (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveUserNotes(currentUserId, updated);

    await deleteNoteFromSupabase(id);
  }, [notes, currentUserId]);

  // Timetable insertion & update hook bound to supabase.auth.getUser().id
  const handleSaveTimetableSlot = useCallback(async (slot: TimetableSlot) => {
    const exists = timetable.some((s) => s.id === slot.id);
    const updated = exists ? timetable.map((s) => (s.id === slot.id ? slot : s)) : [slot, ...timetable];

    // Optimistic local update
    setTimetable(updated);
    saveUserTimetable(currentUserId, updated);

    // Sync to Supabase
    await saveTimetableSlotToSupabase({ ...slot, userId: currentUserId });
  }, [timetable, currentUserId]);

  // Timetable deletion hook bound to supabase.auth.getUser().id
  const handleDeleteTimetableSlot = useCallback(async (id: string) => {
    const updated = timetable.filter((s) => s.id !== id);
    setTimetable(updated);
    saveUserTimetable(currentUserId, updated);

    await deleteTimetableSlotFromSupabase(id);
  }, [timetable, currentUserId]);

  // Quiz insertion & update hook bound to supabase.auth.getUser().id
  const handleSaveQuiz = useCallback(async (quiz: Quiz) => {
    const exists = quizzes.some((q) => q.id === quiz.id);
    const updated = exists ? quizzes.map((q) => (q.id === quiz.id ? quiz : q)) : [quiz, ...quizzes];

    setQuizzes(updated);
    saveUserQuizzes(currentUserId, updated);

    await saveQuizToSupabase({ ...quiz, userId: currentUserId });
  }, [quizzes, currentUserId]);

  // Study session completion hook bound to supabase.auth.getUser().id
  const handleSessionComplete = useCallback(async (newSession: StudySession) => {
    const updated = [newSession, ...sessions];
    setSessions(updated);
    saveUserSessions(currentUserId, updated);

    await saveStudySessionToSupabase({ ...newSession, userId: currentUserId });
  }, [sessions, currentUserId]);

  // Teachers handlers
  const handleSaveTeacher = useCallback((teacher: Teacher) => {
    const exists = teachers.some((t) => t.id === teacher.id);
    const updated = exists ? teachers.map((t) => (t.id === teacher.id ? teacher : t)) : [teacher, ...teachers];
    setTeachers(updated);
    saveUserTeachers(currentUserId, updated);
  }, [teachers, currentUserId]);

  const handleDeleteTeacher = useCallback((id: string) => {
    const updated = teachers.filter((t) => t.id !== id);
    setTeachers(updated);
    saveUserTeachers(currentUserId, updated);
  }, [teachers, currentUserId]);

  return {
    notes,
    sessions,
    timetable,
    quizzes,
    teachers,
    streakStats,
    isSyncing,
    handleSaveNote,
    handleDeleteNote,
    handleSaveTimetableSlot,
    handleDeleteTimetableSlot,
    handleSaveQuiz,
    handleSessionComplete,
    handleSaveTeacher,
    handleDeleteTeacher,
    refreshFromSupabase,
  };
}
