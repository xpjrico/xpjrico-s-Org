import React, { useState, useEffect, useRef } from 'react';
import { TabType, Note } from '../types';
import {
  Search,
  LayoutDashboard,
  Sparkles,
  Timer,
  BookOpen,
  Calendar,
  Users,
  Plus,
  Crown,
  FileText,
  ArrowRight,
  Command,
  X,
} from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: TabType) => void;
  onNewNote: () => void;
  onOpenPayment: () => void;
  notes: Note[];
  onSelectNote: (note: Note) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onNewNote,
  onOpenPayment,
  notes,
  onSelectNote,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Build items list based on query
  const navActions = [
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      subtitle: 'Overview, analytics & streak stats',
      icon: LayoutDashboard,
      shortcut: '1',
      action: () => {
        onNavigate('dashboard');
        onClose();
      },
    },
    {
      id: 'nav-aihub',
      title: 'Open AI Hub',
      subtitle: 'Summarizer, Quizzes & Socratic Tutor',
      icon: Sparkles,
      shortcut: '2',
      action: () => {
        onNavigate('aihub');
        onClose();
      },
    },
    {
      id: 'nav-focus',
      title: 'Launch Focus Arena',
      subtitle: 'Binaural beats, timer & drone flight',
      icon: Timer,
      shortcut: '3',
      action: () => {
        onNavigate('focus');
        onClose();
      },
    },
    {
      id: 'nav-notes',
      title: 'View Study Notes',
      subtitle: 'Browse syllabus documents & transcripts',
      icon: BookOpen,
      shortcut: '4',
      action: () => {
        onNavigate('notes');
        onClose();
      },
    },
    {
      id: 'nav-timetable',
      title: 'Open Timetable Planner',
      subtitle: 'Weekly schedule & class blocks',
      icon: Calendar,
      shortcut: '5',
      action: () => {
        onNavigate('timetable');
        onClose();
      },
    },
    {
      id: 'action-new-note',
      title: 'Create New Note',
      subtitle: 'Write or paste new lecture study notes',
      icon: Plus,
      shortcut: 'N',
      action: () => {
        onNewNote();
        onClose();
      },
    },
    {
      id: 'action-upgrade',
      title: 'Upgrade to Pro (KES 380)',
      subtitle: 'Unlock unlimited AI generations & priority speed',
      icon: Crown,
      shortcut: 'P',
      action: () => {
        onOpenPayment();
        onClose();
      },
    },
  ];

  // Filter notes matching query
  const matchingNotes = query.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query.toLowerCase()) ||
          n.subject.toLowerCase().includes(query.toLowerCase()) ||
          n.content.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  const filteredNav = query.trim()
    ? navActions.filter(
        (a) =>
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : navActions;

  const totalItems = matchingNotes.length + filteredNav.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (totalItems > 0 ? (prev + 1) % totalItems : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (totalItems > 0 ? (prev - 1 + totalItems) % totalItems : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < matchingNotes.length) {
        const selectedNote = matchingNotes[selectedIndex];
        onSelectNote(selectedNote);
        onClose();
      } else {
        const actionIdx = selectedIndex - matchingNotes.length;
        if (filteredNav[actionIdx]) {
          filteredNav[actionIdx].action();
        }
      }
    }
  };

  return (
    <div
      id="command-palette-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 pt-16 sm:pt-24 animate-in fade-in duration-200"
    >
      <div
        id="command-palette-container"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
      >
        {/* Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-zinc-950/60">
          <Search className="w-5 h-5 text-purple-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, navigate, or search notes (Ctrl+K)..."
            className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded border border-white/10">
            <span>ESC</span>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Notes Section (if search matches notes) */}
          {matchingNotes.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                Matching Study Notes ({matchingNotes.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchingNotes.map((note, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={note.id}
                      onClick={() => {
                        onSelectNote(note);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600/20 text-white border border-purple-500/40'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate text-white">{note.title}</p>
                          <p className="text-[11px] text-zinc-400 truncate font-mono">
                            {note.subject} • {new Date(note.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation & Commands Section */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                Actions & Quick Navigation
              </div>
              <div className="space-y-1 mt-1">
                {filteredNav.map((action, idx) => {
                  const globalIdx = matchingNotes.length + idx;
                  const isSelected = selectedIndex === globalIdx;
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={action.action}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600/20 text-white border border-purple-500/40'
                          : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center text-purple-400 shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white">{action.title}</p>
                          <p className="text-[11px] text-zinc-400">{action.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-white/10 shrink-0">
                        <span>Ctrl+{action.shortcut}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {totalItems === 0 && (
            <div className="p-8 text-center text-xs text-zinc-500">
              No matching commands or study notes found for "{query}".
            </div>
          )}
        </div>

        {/* Footer with Hint */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-zinc-950/40 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-zinc-500">
            <Command className="w-3 h-3" />
            <span>Studia Global Shortcuts</span>
          </div>
        </div>
      </div>
    </div>
  );
};
