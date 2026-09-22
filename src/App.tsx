import React, { useState, useEffect } from 'react';
import { TabType, Note } from './types';
import { AuthProvider, useAuth } from './lib/authContext';
import { useUserData } from './lib/useUserData';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { FocusView } from './components/FocusView';
import { AiHubView } from './components/AiHubView';
import { NotesView } from './components/NotesView';
import { TeachersView } from './components/TeachersView';
import { TimetableView } from './components/TimetableView';
import { AuthModal } from './components/AuthModal';
import { PaymentModal } from './components/PaymentModal';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OfflineStatusBanner } from './components/OfflineStatusBanner';
import { CommandPaletteModal } from './components/CommandPaletteModal';

const StudiaMainApp: React.FC = () => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');

  // Modals & Triggers
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [createNoteTrigger, setCreateNoteTrigger] = useState<number>(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Authenticated user scoped data & Supabase sync
  const currentUserId = user?.id || 'guest_user';
  const {
    notes,
    sessions,
    timetable,
    teachers,
    streakStats,
    handleSaveNote,
    handleDeleteNote,
    handleSaveTimetableSlot,
    handleDeleteTimetableSlot,
    handleSaveQuiz,
    handleSessionComplete,
    handleSaveTeacher,
    handleDeleteTeacher,
  } = useUserData(currentUserId);

  const handleAiSummarizeNote = (note: Note) => {
    setCurrentTab('aihub');
  };

  // Global Keyboard Shortcuts (Ctrl+K for search, Ctrl+N for new note, Ctrl+1..5 for tabs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if target is inside an input or textarea (unless modifier key pressed)
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+K / Cmd+K: Open Search & Command Palette anywhere
      if (modKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Ctrl+N / Cmd+N: Create New Note
      if (modKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setCurrentTab('notes');
        setCreateNoteTrigger(Date.now());
        return;
      }

      // If user is actively typing in an input, don't hijack simple digit navigation unless modifier key is active
      if (modKey) {
        if (e.key === '1') {
          e.preventDefault();
          setCurrentTab('dashboard');
        } else if (e.key === '2') {
          e.preventDefault();
          setCurrentTab('aihub');
        } else if (e.key === '3') {
          e.preventDefault();
          setCurrentTab('focus');
        } else if (e.key === '4') {
          e.preventDefault();
          setCurrentTab('notes');
        } else if (e.key === '5') {
          e.preventDefault();
          setCurrentTab('timetable');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#07090e] text-zinc-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white pb-24 md:pb-8">
      {/* Offline and PWA Banner */}
      <OfflineStatusBanner />

      {/* Top Navigation Bar: Unified header with Dashboard, AI Hub, Focus Arena and grouped status elements */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={(t) => setCurrentTab(t)}
        streakStats={streakStats}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenPayment={() => setPaymentModalOpen(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-8">
        {currentTab === 'dashboard' && (
          <DashboardView
            onNavigate={(tab) => setCurrentTab(tab)}
            streakStats={streakStats}
            sessions={sessions}
            timetable={timetable}
            notes={notes}
            onOpenPayment={() => setPaymentModalOpen(true)}
            onOpenAuth={() => setAuthModalOpen(true)}
          />
        )}

        {currentTab === 'focus' && (
          <FocusView
            onSessionComplete={handleSessionComplete}
            onOpenPayment={() => setPaymentModalOpen(true)}
          />
        )}

        {/* AI Hub View (contains both "Hub" and "Tools" tabs in unified interface) */}
        {(currentTab === 'aihub' || (currentTab as string) === 'aitools') && (
          <ProtectedRoute
            featureName="AI Hub & Tools"
            featureDescription="Explore lecture summaries, AI practice quizzes, text-to-speech audio narration, and Socratic tutoring."
            featureIcon="aihub"
            onOpenAuth={() => setAuthModalOpen(true)}
          >
            <AiHubView
              notes={notes}
              onSaveQuiz={handleSaveQuiz}
              onSaveNote={handleSaveNote}
              onOpenPayment={() => setPaymentModalOpen(true)}
              onNavigate={(tab) => setCurrentTab(tab)}
              initialMode={(currentTab as string) === 'aitools' ? 'tools' : 'hub'}
            />
          </ProtectedRoute>
        )}

        {currentTab === 'notes' && (
          <ProtectedRoute
            featureName="Study Notes & Summaries"
            featureDescription="Create rich formatted markdown notes, attach syllabus references, and auto-summarize with AI."
            featureIcon="notes"
            onOpenAuth={() => setAuthModalOpen(true)}
          >
            <NotesView
              notes={notes}
              onSaveNote={handleSaveNote}
              onDeleteNote={handleDeleteNote}
              onAiSummarizeNote={handleAiSummarizeNote}
              createNoteTrigger={createNoteTrigger}
              selectedNoteId={selectedNoteId}
            />
          </ProtectedRoute>
        )}

        {currentTab === 'teachers' && (
          <TeachersView
            teachers={teachers}
            onSaveTeacher={handleSaveTeacher}
            onDeleteTeacher={handleDeleteTeacher}
          />
        )}

        {currentTab === 'timetable' && (
          <ProtectedRoute
            featureName="Academic Timetable"
            featureDescription="Organize your weekly class schedule, lecture rooms, recurring labs, and study blocks."
            featureIcon="timetable"
            onOpenAuth={() => setAuthModalOpen(true)}
          >
            <TimetableView
              slots={timetable}
              onSaveSlot={handleSaveTimetableSlot}
              onDeleteSlot={handleDeleteTimetableSlot}
            />
          </ProtectedRoute>
        )}
      </main>

      {/* Global Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(tab) => setCurrentTab(tab)}
        onNewNote={() => {
          setCurrentTab('notes');
          setCreateNoteTrigger(Date.now());
        }}
        onOpenPayment={() => setPaymentModalOpen(true)}
        notes={notes}
        onSelectNote={(note) => {
          setSelectedNoteId(note.id);
          setCurrentTab('notes');
        }}
      />

      {/* Auth Modal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Payment Modal */}
      <PaymentModal isOpen={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <StudiaMainApp />
    </AuthProvider>
  );
}

export default App;
