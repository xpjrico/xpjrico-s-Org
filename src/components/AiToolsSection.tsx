import React, { useState, useRef } from 'react';
import { Note, TabType } from '../types';
import { useAuth } from '../lib/authContext';
import { LiveVoiceTutor } from './LiveVoiceTutor';
import { SearchGroundingLab } from './SearchGroundingLab';
import { PaywallModal } from './PaywallModal';
import { base64To16BitPCM, pcmToWavBlob } from '../utils/audioStream';
import {
  Volume2,
  FileText,
  HelpCircle,
  Calendar,
  Sparkles,
  Download,
  AlertCircle,
  AlertTriangle,
  Crown,
  Loader2,
  CheckCircle2,
  Languages,
  Mic,
  Search,
  ArrowRight,
  Cpu,
} from 'lucide-react';

const PREBUILT_VOICES = [
  { id: 'Kore', label: 'Kore (Calm, Natural British Female)' },
  { id: 'Puck', label: 'Puck (Engaging, Warm Male)' },
  { id: 'Charon', label: 'Charon (Deep, Authoritative Academic)' },
  { id: 'Fenrir', label: 'Fenrir (Energetic, Focused)' },
  { id: 'Aoede', label: 'Aoede (Clear, Articulate Explainer)' },
];

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English (US/UK)' },
  { code: 'sw', name: 'Swahili (Kiswahili)' },
  { code: 'fr', name: 'French (Français)' },
  { code: 'es', name: 'Spanish (Español)' },
  { code: 'de', name: 'German (Deutsch)' },
  { code: 'zh', name: 'Mandarin Chinese' },
  { code: 'ar', name: 'Arabic' },
];

interface AiToolsSectionProps {
  notes?: Note[];
  onSaveNote?: (note: Note) => void;
  onOpenPayment?: () => void;
  onNavigate?: (tab: TabType) => void;
  onSwitchToHubTab?: (tab: 'summarizer' | 'quiz' | 'tutor' | 'live' | 'grounding' | 'offline') => void;
}

export const AiToolsSection: React.FC<AiToolsSectionProps> = ({
  notes = [],
  onSaveNote,
  onOpenPayment,
  onNavigate,
  onSwitchToHubTab,
}) => {
  const { user, subscription, checkCanUseAi, recordSuccessfulAiGeneration } = useAuth();

  // TTS State
  const [ttsText, setTtsText] = useState(
    'Welcome to Studia. Select any passage from your lecture notes or paste study material to synthesize crystal-clear spoken explanations with natural intonation.'
  );
  const [ttsLanguage, setTtsLanguage] = useState('en');
  const [ttsVoice, setTtsVoice] = useState('Kore');
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [isTtsCapacityError, setIsTtsCapacityError] = useState(false);
  const [ttsSuccess, setTtsSuccess] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Paywall state
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string>('');

  // Expanded tool states
  const [activeExpandedTool, setActiveExpandedTool] = useState<'voice' | 'grounding' | null>(null);

  const usageCount = (subscription as any)?.aiUsageCount ?? (subscription as any)?.usage_count ?? 0;

  const handleGenerateVoice = async () => {
    if (!ttsText.trim()) {
      setTtsError('Please enter text to synthesize into spoken audio.');
      return;
    }

    if (checkCanUseAi && !checkCanUseAi()) {
      setPaywallReason('You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
      setShowPaywall(true);
      return;
    }

    setIsGeneratingTts(true);
    setTtsError(null);
    setIsTtsCapacityError(false);
    setTtsSuccess(false);

    try {
      const selectedVoice = PREBUILT_VOICES.find((v) => v.id === ttsVoice)?.id || 'Kore';

      const res = await fetch('/api/gemini/generate-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'guest_user',
        },
        body: JSON.stringify({
          text: ttsText.trim(),
          voiceName: selectedVoice,
          languageCode: ttsLanguage,
          userId: user?.id || 'guest_user',
        }),
      });

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        setPaywallReason(errData.error || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
        setShowPaywall(true);
        setTtsError(errData.error || 'Usage limit reached. Upgrade to Pro for unlimited audio narrations.');
        setIsGeneratingTts(false);
        return;
      }

      if (res.status === 429) {
        setIsTtsCapacityError(true);
        setTtsError('AI is at capacity. Please upgrade or try again later.');
        setIsGeneratingTts(false);
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.audioBase64) {
        if (data?.code === 'RESOURCE_EXHAUSTED' || data?.isCapacityError) {
          setIsTtsCapacityError(true);
          setTtsError('AI is at capacity. Please upgrade or try again later.');
          setIsGeneratingTts(false);
          return;
        }
        if (data?.code === 'USAGE_LIMIT_REACHED' || data?.requiresPaywall) {
          setPaywallReason(data.error || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
          setShowPaywall(true);
          setTtsError(data.error);
          setIsGeneratingTts(false);
          return;
        }
        throw new Error(data.error || 'Failed to synthesize speech audio.');
      }

      if (recordSuccessfulAiGeneration) {
        await recordSuccessfulAiGeneration();
      }

      const pcm16Data = base64To16BitPCM(data.audioBase64);
      const wavBlob = pcmToWavBlob(pcm16Data, 24000);
      const audioUrl = URL.createObjectURL(wavBlob);

      setTtsAudioUrl(audioUrl);
      setTtsSuccess(true);

      setTimeout(() => {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play().catch((e) => console.log('Auto-play prevented:', e));
        }
      }, 200);
    } catch (err: any) {
      console.error('Error generating TTS:', err);
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('capacity') || msg.includes('resource_exhausted')) {
        setIsTtsCapacityError(true);
        setTtsError('AI is at capacity. Please upgrade or try again later.');
      } else {
        setTtsError(err?.message || 'Error occurred while synthesizing speech.');
      }
    } finally {
      setIsGeneratingTts(false);
    }
  };

  const handleSaveTtsToNote = () => {
    if (!ttsText || !onSaveNote) return;
    const newNote: Note = {
      id: 'tts-note-' + Date.now(),
      userId: user?.id || 'guest_user',
      title: `TTS Audio: ${ttsText.slice(0, 30)}...`,
      content: `### 🔊 Spoken Explanation (Voice: ${ttsVoice}, Lang: ${ttsLanguage})\n\n> "${ttsText}"\n\n*Audio generated with gemini-3.1-flash-tts.*`,
      subject: 'Spoken Study',
      tags: ['Audio', 'TTS', 'Gemini AI'],
      color: '#8b5cf6',
      summary: ttsText.slice(0, 100),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onSaveNote(newNote);
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Primary Grid of Core Feature Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: TEXT-TO-SPEECH (TTS) GENERATOR */}
        <div
          id="tts-generator-card"
          className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-purple-500/30 transition-all shadow-lg flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Text-to-Speech Narration
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      gemini-3.1-flash-tts
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Transform lecture notes into natural, expressive spoken audio explanations.
                  </p>
                </div>
              </div>
            </div>

            {/* Language & Voice Selector Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5 text-purple-400" />
                  <span>Target Language</span>
                </label>
                <select
                  id="tts-language-select"
                  value={ttsLanguage}
                  onChange={(e) => setTtsLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950/80 border border-white/10 text-xs text-zinc-200 focus:border-purple-500 outline-none transition-all cursor-pointer"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-zinc-900 text-white">
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <span>Persona Voice</span>
                </label>
                <select
                  id="tts-voice-select"
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950/80 border border-white/10 text-xs text-zinc-200 focus:border-purple-500 outline-none transition-all cursor-pointer"
                >
                  {PREBUILT_VOICES.map((v) => (
                    <option key={v.id} value={v.id} className="bg-zinc-900 text-white">
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Textarea Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center justify-between">
                <span>Lecture Notes / Text to Synthesize</span>
                <span className="text-[10px] text-zinc-500">{ttsText.length} characters</span>
              </label>
              <textarea
                id="tts-input-textarea"
                rows={4}
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="Enter lecture content or key concepts to read aloud..."
                className="w-full px-4 py-3 rounded-2xl bg-zinc-950/80 border border-white/10 focus:border-purple-500 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all resize-none"
                disabled={isGeneratingTts}
              />
            </div>

            {/* Error Message */}
            {ttsError && (
              <div
                id="tts-error-alert"
                className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in ${
                  isTtsCapacityError
                    ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isTtsCapacityError ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{ttsError}</span>
                </div>
                {isTtsCapacityError && (
                  <button
                    onClick={() => {
                      setPaywallReason('AI is at capacity for free users. Upgrade to Pro for high-speed voice priority.');
                      setShowPaywall(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1 shrink-0 transition-all cursor-pointer"
                  >
                    <Crown className="w-3 h-3" />
                    <span>Upgrade</span>
                  </button>
                )}
              </div>
            )}

            {/* Action Button */}
            <div className="pt-2">
              <button
                id="tts-generate-btn"
                onClick={handleGenerateVoice}
                disabled={isGeneratingTts || !ttsText.trim()}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-[0_0_20px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {isGeneratingTts ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
                    <span>Synthesizing Voice Narration...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>Generate Spoken Audio</span>
                  </>
                )}
              </button>
            </div>

            {/* Audio Player Container */}
            <div id="tts-audio-player-container" className="pt-2">
              {ttsAudioUrl ? (
                <div className="p-4 rounded-2xl bg-zinc-950/90 border border-purple-500/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-purple-300 font-medium">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Audio Narration Ready ({ttsVoice} • {ttsLanguage.toUpperCase()})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={ttsAudioUrl}
                        download={`studia-narration-${Date.now()}.wav`}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1 border border-white/10 cursor-pointer"
                        title="Download WAV"
                      >
                        <Download className="w-3 h-3 text-purple-400" />
                        <span>WAV</span>
                      </a>
                      {onSaveNote && (
                        <button
                          onClick={handleSaveTtsToNote}
                          className="px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-[11px] font-semibold flex items-center gap-1 border border-purple-500/30 cursor-pointer"
                          title="Save to Study Notes"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Save Note</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <audio
                    id="tts-audio-element"
                    ref={audioPlayerRef}
                    controls
                    src={ttsAudioUrl}
                    className="w-full h-10 accent-purple-500"
                  />
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-zinc-950/40 border border-dashed border-white/10 text-center text-xs text-zinc-500 flex items-center justify-center min-h-[60px]">
                  <p>Synthesized audio player will appear here after clicking "Generate Spoken Audio".</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CARD 2: SMART NOTE SUMMARIZATION */}
        <div
          id="summarization-card"
          className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-emerald-500/30 transition-all shadow-lg flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Smart Note Summarizer
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      gemini-3.1-flash
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Condense long textbook chapters and lecture transcripts into structured summaries.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Extracts key definitions, formulas, and bulleted takeaways</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>LaTeX math formatting with inline and block notation</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Offline caching for instant study revision anytime</span>
              </div>
            </div>

            {/* Quick Note Context or Selector */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="font-medium">Available Saved Notes:</span>
                <span className="text-emerald-400 font-mono">{notes.length} notes ready</span>
              </div>
              {notes.length > 0 ? (
                <div className="text-xs text-zinc-200 line-clamp-2 bg-zinc-900/80 p-2 rounded-xl border border-white/5">
                  <span className="font-semibold text-emerald-300">Latest:</span> "{notes[0].title}"
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 italic">Create or import notes to generate instant summaries.</p>
              )}
            </div>

            <div className="pt-2">
              <button
                id="open-summarizer-hub-btn"
                onClick={() => onSwitchToHubTab?.('summarizer')}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.15)]"
              >
                <FileText className="w-4 h-4" />
                <span>Switch to Summarizer in Hub</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CARD 3: PRACTICE QUIZ GENERATOR */}
        <div
          id="quiz-generator-card"
          className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-amber-500/30 transition-all shadow-lg flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    AI Quiz & Flashcards
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      active-recall
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Generate diagnostic multiple-choice questions and conceptual tests with scoring.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Customizable question counts (3, 5, 10, or 15 questions)</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Immediate answer feedback with detailed conceptual rationales</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Tracks XP points and study streaks upon completion</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Quiz Modes:</span>
                <span className="text-amber-400 font-semibold">Multiple Choice • Flashcards</span>
              </div>
              <p className="text-xs text-zinc-400">
                Turn any uploaded document, lecture note, or textbook chapter into an interactive practice exam.
              </p>
            </div>

            <div className="pt-2">
              <button
                id="open-quiz-maker-btn"
                onClick={() => onSwitchToHubTab?.('quiz')}
                className="w-full py-3 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(245,158,11,0.15)]"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Switch to Quiz Maker in Hub</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CARD 4: SMART TIMETABLE */}
        <div
          id="timetable-planner-card"
          className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-indigo-500/30 transition-all shadow-lg flex flex-col justify-between relative overflow-hidden group"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Smart Study Timetable
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      schedule-ai
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Automate revision schedules, manage study blocks, and balance exam preparation.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs text-zinc-300">
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Spaced repetition algorithm to prevent last-minute cramming</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Weekly calendar visualization with subject color codes</span>
              </div>
              <div className="flex items-center gap-2 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Integrated focus timers and task completion tracking</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Optimization Goal:</span>
                <span className="text-indigo-400 font-semibold">High Retention & Low Fatigue</span>
              </div>
              <p className="text-xs text-zinc-400">
                Structure your study hours around peak alertness times and balance complex coursework automatically.
              </p>
            </div>

            <div className="pt-2">
              <button
                id="open-timetable-view-btn"
                onClick={() => onNavigate?.('timetable')}
                className="w-full py-3 px-4 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(99,102,241,0.15)]"
              >
                <Calendar className="w-4 h-4" />
                <span>Open Smart Timetable</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CARD 5: LIVE SOCRATIC VOICE TUTOR */}
        <div className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-cyan-500/30 transition-all shadow-lg flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Live Socratic Voice Tutor
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      gemini-3.8-live
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Real-time bidirectional 16kHz/24kHz voice conversations with instant interruption handling.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Practice oral exam questions, debate academic concepts, or ask spontaneous questions.
              The AI tutor pauses instantly when you speak and guides you using the Socratic method.
            </p>

            <button
              id="open-live-voice-suite-btn"
              onClick={() => setActiveExpandedTool(activeExpandedTool === 'voice' ? null : 'voice')}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              <span>{activeExpandedTool === 'voice' ? 'Hide Voice Interface' : 'Launch Real-Time Voice Tutor'}</span>
            </button>
          </div>

          {activeExpandedTool === 'voice' && (
            <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in duration-300">
              <LiveVoiceTutor
                currentNotesContext={notes[0]?.content}
                onSaveNote={onSaveNote}
              />
            </div>
          )}
        </div>

        {/* CARD 6: GOOGLE SEARCH GROUNDED RESEARCH */}
        <div className="p-6 sm:p-7 rounded-3xl bg-zinc-900/60 border border-white/10 hover:border-blue-500/30 transition-all shadow-lg flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Google Search Grounded Research
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      gemini-3.5-flash + Search
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Live-fact-check formulas, cite contemporary discoveries, and explore clickable web sources.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Verify textbook claims against recent publications, discover up-to-the-minute historical context,
              and inspect clickable verified sources grounded directly by the Google Search engine.
            </p>

            <button
              id="open-grounding-lab-suite-btn"
              onClick={() => setActiveExpandedTool(activeExpandedTool === 'grounding' ? null : 'grounding')}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span>{activeExpandedTool === 'grounding' ? 'Hide Search Grounding' : 'Launch Grounded Research Lab'}</span>
            </button>
          </div>

          {activeExpandedTool === 'grounding' && (
            <div className="mt-4 pt-4 border-t border-white/10 animate-in fade-in duration-300">
              <SearchGroundingLab
                currentNotesContext={notes[0]?.content}
                onSaveNote={onSaveNote}
              />
            </div>
          )}
        </div>
      </div>

      {/* Paywall & Usage Limit Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason={paywallReason}
        onSuccess={() => {
          setTtsError(null);
          setIsTtsCapacityError(false);
        }}
      />
    </div>
  );
};
