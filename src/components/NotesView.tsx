import React, { useState } from 'react';
import { Note } from '../types';
import { useAuth } from '../lib/authContext';
import { playNotificationChime } from '../lib/focusAudio';
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit3,
  Sparkles,
  Download,
  Tag,
  Check,
  Calendar,
  Eye,
  FileText,
  Upload,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { parseUploadedDocumentOrPic, SCANNED_PDF_TOAST_MESSAGE } from '../lib/fileParser';
import { MarkdownRenderer } from './MarkdownRenderer';

interface NotesViewProps {
  notes: Note[];
  onSaveNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onAiSummarizeNote: (note: Note) => void;
  createNoteTrigger?: number;
  selectedNoteId?: string | null;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  onSaveNote,
  onDeleteNote,
  onAiSummarizeNote,
  createNoteTrigger,
  selectedNoteId,
}) => {
  const { user, addXpAndSparks } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  // Edit Form State
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('Computer Science');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('lecture, midterm');
  const [editColor, setEditColor] = useState('purple');
  const [isParsingNoteFile, setIsParsingNoteFile] = useState(false);
  const [noteFileError, setNoteFileError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (selectedNoteId) {
      const found = notes.find((n) => n.id === selectedNoteId);
      if (found) {
        setActiveNote(found);
        setIsEditing(false);
        setMobileShowDetail(true);
      }
    }
  }, [selectedNoteId, notes]);

  // Auto-dismiss floating toast after 8 seconds
  React.useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 8000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const handleNoteFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingNoteFile(true);
    setNoteFileError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      if (!result.text || !result.text.trim()) {
        throw new Error('No readable text or formulas could be extracted from this PDF or image.');
      }
      const cleanTitle = result.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const newNote: Note = {
        id: `note_${Date.now()}`,
        userId: user?.id || 'guest',
        title: cleanTitle,
        subject: 'Study Notes',
        content: result.text,
        tags: [result.fileType === 'image' ? 'Photo Notes' : 'PDF Import'],
        color: 'purple',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setActiveNote(newNote);
      setEditTitle(cleanTitle);
      setEditSubject('Study Notes');
      setEditContent(result.text);
      setEditTags(`${result.fileType === 'image' ? 'photo, visual' : 'pdf, document'}, imported`);
      setEditColor('purple');
      setIsEditing(true);
      setMobileShowDetail(true);
      playNotificationChime('spark');
    } catch (err: any) {
      console.error('Note file parsing error:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Could not parse the uploaded PDF or picture.');
      setNoteFileError(msg);
      if (isScanned) {
        setToastMessage(SCANNED_PDF_TOAST_MESSAGE);
      }
    } finally {
      setIsParsingNoteFile(false);
      e.target.value = '';
    }
  };

  const handleAppendFileToNote = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingNoteFile(true);
    setNoteFileError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      if (!result.text || !result.text.trim()) {
        throw new Error('No readable text could be extracted from this file.');
      }
      setEditContent((prev) => (prev ? `${prev}\n\n---\n### Content from ${file.name}\n${result.text}` : result.text));
      if (!editTitle || editTitle.trim() === '') {
        setEditTitle(result.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      playNotificationChime('spark');
    } catch (err: any) {
      console.error('Note append file error:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Could not append text from the file.');
      setNoteFileError(msg);
      if (isScanned) {
        setToastMessage(SCANNED_PDF_TOAST_MESSAGE);
      }
    } finally {
      setIsParsingNoteFile(false);
      e.target.value = '';
    }
  };

  const startNewNote = () => {
    const blank: Note = {
      id: `note_${Date.now()}`,
      userId: user?.id || 'guest',
      title: '',
      subject: 'Computer Science',
      content: '',
      tags: ['Study'],
      color: 'purple',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setActiveNote(blank);
    setEditTitle('');
    setEditSubject('Computer Science');
    setEditContent('');
    setEditTags('study, exam');
    setEditColor('purple');
    setIsEditing(true);
    setMobileShowDetail(true);
  };

  React.useEffect(() => {
    if (createNoteTrigger && createNoteTrigger > 0) {
      startNewNote();
    }
  }, [createNoteTrigger]);

  const handleEditExisting = (note: Note) => {
    setActiveNote(note);
    setEditTitle(note.title);
    setEditSubject(note.subject);
    setEditContent(note.content);
    setEditTags(note.tags.join(', '));
    setEditColor(note.color || 'purple');
    setIsEditing(true);
    setMobileShowDetail(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    const parsedTags = editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const savedNote: Note = {
      id: activeNote?.id || `note_${Date.now()}`,
      userId: user?.id || 'guest',
      title: editTitle.trim(),
      subject: editSubject.trim(),
      content: editContent,
      tags: parsedTags.length > 0 ? parsedTags : ['General'],
      color: editColor,
      createdAt: activeNote?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSaveNote(savedNote);
    setActiveNote(savedNote);
    setIsEditing(false);
    playNotificationChime('spark');
    addXpAndSparks(15, 1);
  };

  const handleDownload = (note: Note) => {
    const blob = new Blob([note.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${note.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filter notes
  const filteredNotes = notes.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag === 'all' || n.subject === selectedTag || n.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const subjects = Array.from(new Set(notes.map((n) => n.subject))).filter(Boolean);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Floating Scanned PDF / Document Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[92%] p-4 rounded-2xl bg-amber-950/95 border border-amber-500/50 text-amber-200 shadow-2xl shadow-black/80 backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs leading-relaxed font-medium">
            <span className="font-bold text-amber-300 block mb-0.5">Scanned PDF / Photo Detected</span>
            {toastMessage}
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-amber-400 hover:text-white p-1 rounded-lg hover:bg-amber-500/20 transition-colors"
            title="Dismiss Toast"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <BookOpen className="w-5 h-5" />
            </span>
            Study Notes & Knowledge Base
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Capture lecture transcripts, formulas, and generate instant AI study summaries.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <label
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
              isParsingNoteFile
                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 opacity-80 cursor-wait'
                : 'bg-zinc-900/90 hover:bg-zinc-800 border-white/10 text-zinc-200 hover:text-white cursor-pointer'
            }`}
            title="Upload PDF syllabus/slides or take a photo of handwritten notes or diagrams"
          >
            {isParsingNoteFile ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span>Extracting PDF / Pic...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-purple-400" />
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Import PDF or Pic</span>
              </>
            )}
            <input
              type="file"
              accept=".txt,.md,.pdf,.docx,.rtf,.png,.jpg,.jpeg,.webp,.bmp,.heic,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf"
              onChange={handleNoteFileUpload}
              disabled={isParsingNoteFile}
              className="hidden"
            />
          </label>

          <button
            onClick={startNewNote}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 hover:opacity-90 text-white font-bold text-xs shadow-[0_0_15px_rgba(99,102,241,0.3)] flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Study Note
          </button>
        </div>
      </div>

      {noteFileError && (
        <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{noteFileError}</span>
          </div>
          <button
            onClick={() => setNoteFileError(null)}
            className="text-xs text-zinc-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Tags Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-zinc-900/40 p-3 rounded-2xl border border-white/5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search notes by keyword, topic, or concept..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-mono">
          <button
            onClick={() => setSelectedTag('all')}
            className={`px-2.5 py-1 rounded-md border transition-all ${
              selectedTag === 'all'
                ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold'
                : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            All Notes ({notes.length})
          </button>
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedTag(sub)}
              className={`px-2.5 py-1 rounded-md border transition-all whitespace-nowrap ${
                selectedTag === sub
                  ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold'
                  : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Main Notes Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Notes List */}
        <div className={`lg:col-span-5 space-y-3 ${mobileShowDetail ? 'hidden lg:block' : 'block'}`}>
          {filteredNotes.length === 0 ? (
            <div className="text-center py-12 p-6 rounded-3xl bg-zinc-900/40 border border-white/5 text-zinc-500 text-xs">
              <BookOpen className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="font-semibold text-zinc-400">No notes found</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                Click "+ New Study Note" to create your first markdown document.
              </p>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = activeNote?.id === note.id;
              return (
                <div
                  key={note.id}
                  onClick={() => {
                    setActiveNote(note);
                    setIsEditing(false);
                    setMobileShowDetail(true);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-zinc-900 border-white/20 shadow-md'
                      : 'bg-zinc-900/40 hover:bg-zinc-900/80 border-white/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-white truncate">{note.title || 'Untitled Note'}</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">
                      {note.subject}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-2 font-mono">
                    {note.content || 'Empty note...'}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1">
                      {note.tags.slice(0, 2).map((t, idx) => (
                        <span key={idx} className="text-zinc-400">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Note Viewer or Editor */}
        <div className={`lg:col-span-7 p-4 sm:p-6 rounded-3xl bg-zinc-900/40 border border-white/5 shadow-lg ${!mobileShowDetail ? 'hidden lg:block' : 'block'}`}>
          {/* Mobile Back to List Button */}
          <div className="lg:hidden mb-4 pb-3 border-b border-white/5 flex items-center justify-between">
            <button
              onClick={() => {
                setMobileShowDetail(false);
                setIsEditing(false);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-bold cursor-pointer"
            >
              ← Back to Notes List
            </button>
          </div>

          {isEditing ? (
            /* Note Editor Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  {activeNote?.title ? 'Edit Note' : 'Create New Note'}
                </h3>
                <div className="flex items-center gap-2">
                  {activeNote && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-orange-500 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Save Note
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS201 Data Structures"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-400 mb-1">Subject / Course</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Science"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-zinc-400 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. exam, trees, algorithms"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-mono text-zinc-400">Markdown Body</label>
                  <label
                    className="text-[11px] font-mono text-purple-400 hover:text-purple-300 flex items-center gap-1.5 cursor-pointer bg-purple-500/10 hover:bg-purple-500/20 px-2 py-1 rounded-lg border border-purple-500/20 transition-all"
                    title="Append text extracted from a PDF or photo of notes"
                  >
                    {isParsingNoteFile ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                        <span>Extracting...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-3 h-3" />
                        <ImageIcon className="w-3 h-3" />
                        <span>Append from PDF / Pic</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".txt,.md,.pdf,.docx,.rtf,.png,.jpg,.jpeg,.webp,.bmp,.heic,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf"
                      onChange={handleAppendFileToNote}
                      disabled={isParsingNoteFile}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  rows={14}
                  placeholder="# Lecture Notes&#10;&#10;Write markdown notes, code blocks, definitions, and formulas here..."
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-4 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none font-mono leading-relaxed resize-none"
                />
              </div>
            </form>
          ) : activeNote ? (
            /* Note Viewer */
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {activeNote.subject}
                  </span>
                  <h2 className="text-lg font-black text-white mt-1.5">{activeNote.title}</h2>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-zinc-500">
                    <span>Updated {new Date(activeNote.updatedAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onAiSummarizeNote(activeNote)}
                    title="Summarize with AI"
                    className="p-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">AI Summarize</span>
                  </button>

                  <button
                    onClick={() => handleDownload(activeNote)}
                    title="Export Markdown"
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleEditExisting(activeNote)}
                    title="Edit Note"
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('Delete this note?')) {
                        onDeleteNote(activeNote.id);
                        setActiveNote(null);
                      }
                    }}
                    title="Delete Note"
                    className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Note Content Display */}
              <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/5 max-h-[500px] overflow-y-auto">
                {activeNote.content ? (
                  <MarkdownRenderer content={activeNote.content} />
                ) : (
                  <em className="text-zinc-600 text-xs font-mono">No content in this note.</em>
                )}
              </div>

              {/* Tags */}
              <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                <Tag className="w-3.5 h-3.5 text-zinc-500" />
                {activeNote.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-white/5"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            /* Empty state when no note is selected */
            <div className="text-center py-16 text-zinc-500 text-xs">
              <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-2" />
              <p className="font-semibold text-zinc-400">Select a note from the left to view</p>
              <p className="text-[11px] text-zinc-500 mt-1">Or create a new note to start typing your thoughts.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
