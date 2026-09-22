import React, { useState, useEffect } from 'react';
import { Note, Quiz, QuizQuestion, CachedSummary, CachedQuiz } from '../types';
import { useAuth } from '../lib/authContext';
import { playNotificationChime } from '../lib/focusAudio';
import {
  generateContentHash,
  findCachedSummary,
  saveCachedSummary,
  getCachedSummaries,
  findCachedQuiz,
  saveCachedQuiz,
  getCachedQuizzes,
  getAiQuotaCountdown,
  FREE_AI_LIMIT,
} from '../lib/storage';
import {
  Sparkles,
  FileText,
  HelpCircle,
  MessageSquare,
  Upload,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Send,
  Award,
  ArrowRight,
  BookOpen,
  Zap,
  Crown,
  Database,
  Layers,
  AlertCircle,
  Download,
  Share2,
  Loader2,
  Clock,
  Image as ImageIcon,
  Paperclip,
  X,
  Mic,
  Globe,
  Cpu,
  ExternalLink,
} from 'lucide-react';
import { parseUploadedFile, parseUploadedDocumentOrPic, SCANNED_PDF_TOAST_MESSAGE } from '../lib/fileParser';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { MarkdownRenderer } from './MarkdownRenderer';
import { LiveVoiceTutor } from './LiveVoiceTutor';
import { SearchGroundingLab } from './SearchGroundingLab';
import { AiToolsSection } from './AiToolsSection';
import { TabType } from '../types';

export const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
  </svg>
);

export type AiHubSubTab =
  | 'summarize'
  | 'quiz'
  | 'tutor'
  | 'voice_live'
  | 'search_grounding'
  | 'offline_saved';

interface AiHubViewProps {
  notes: Note[];
  onSaveQuiz: (quiz: Quiz) => void;
  onSaveNote: (note: Note) => void;
  onOpenPayment?: () => void;
  onNavigate?: (tab: TabType) => void;
  initialSubTab?: AiHubSubTab;
  initialMode?: 'hub' | 'tools';
}

export const AiHubView: React.FC<AiHubViewProps> = ({
  notes,
  onSaveQuiz,
  onSaveNote,
  onOpenPayment,
  onNavigate,
  initialSubTab = 'summarize',
  initialMode = 'hub',
}) => {
  const { user, addXpAndSparks, subscription, consumeAiQuota } = useAuth();
  const [mainMode, setMainMode] = useState<'hub' | 'tools'>(initialMode);
  const [activeSubTab, setActiveSubTab] = useState<AiHubSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Live 6-hour Quota Countdown
  const [quotaCountdown, setQuotaCountdown] = useState(() => getAiQuotaCountdown(subscription));

  useEffect(() => {
    setQuotaCountdown(getAiQuotaCountdown(subscription));
    const timer = setInterval(() => {
      setQuotaCountdown(getAiQuotaCountdown(subscription));
    }, 1000);
    return () => clearInterval(timer);
  }, [subscription]);

  // Summarize State
  const normalizeMathForMarkdown = (text: string | null | undefined): string => {
    if (!text) return '';
    let str = text.replace(/\r\n/g, '\n');
    // Normalize LaTeX delimiters \[ \] and \( \) to $$ and $
    str = str.replace(/(?:\\{1,2}\[)([\s\S]*?)(?:\\{1,2}\])/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`);
    str = str.replace(/(?:\\{1,2}\()([\s\S]*?)(?:\\{1,2}\))/g, (_, math) => `$${math.trim()}$`);
    return str;
  };

  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [summaryFormat, setSummaryFormat] = useState('Step-by-Step Problem Solver');
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [summaryLoadedFromCache, setSummaryLoadedFromCache] = useState(false);
  const [summaryQuotaError, setSummaryQuotaError] = useState<string | null>(null);
  const [summaryErrorMessage, setSummaryErrorMessage] = useState<{ message: string; isNetworkOrTimeout?: boolean } | null>(null);
  const [isFallbackSummary, setIsFallbackSummary] = useState(false);
  const [summaryNotice, setSummaryNotice] = useState<string | null>(null);
  const [summarizeUseSearchGrounding, setSummarizeUseSearchGrounding] = useState(false);
  const [summarySources, setSummarySources] = useState<Array<{ title: string; url: string }>>([]);
  const [summaryIsGrounded, setSummaryIsGrounded] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [fileParseError, setFileParseError] = useState<string | null>(null);
  const [uploadedSummaryFile, setUploadedSummaryFile] = useState<{
    name: string;
    fileType: string;
    isImage: boolean;
    previewUrl?: string;
    sizeFormatted?: string;
  } | null>(null);
  const [isDraggingSummary, setIsDraggingSummary] = useState(false);

  // Quiz State
  const [quizSubject, setQuizSubject] = useState('');
  const [quizInputText, setQuizInputText] = useState('');
  const [quizQuestionCount, setQuizQuestionCount] = useState(5);
  const [quizDifficulty, setQuizDifficulty] = useState('medium');
  const [quizUseSearchGrounding, setQuizUseSearchGrounding] = useState(false);
  const [quizSources, setQuizSources] = useState<Array<{ title: string; url: string }>>([]);
  const [quizIsGrounded, setQuizIsGrounded] = useState(false);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [quizLoadingStatus, setQuizLoadingStatus] = useState<string>('Formulating practice questions with Gemini AI...');
  const [isRetryingQuiz, setIsRetryingQuiz] = useState(false);
  const [quizRetryCount, setQuizRetryCount] = useState(0);
  const [quizErrorMessage, setQuizErrorMessage] = useState<string | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizLoadedFromCache, setQuizLoadedFromCache] = useState(false);
  const [isParsingQuizFile, setIsParsingQuizFile] = useState(false);
  const [quizFileParseError, setQuizFileParseError] = useState<string | null>(null);
  const [uploadedQuizFile, setUploadedQuizFile] = useState<{
    name: string;
    fileType: string;
    isImage: boolean;
    previewUrl?: string;
    sizeFormatted?: string;
  } | null>(null);
  const [isDraggingQuiz, setIsDraggingQuiz] = useState(false);

  // Tutor Chat State
  const [tutorUseSearchGrounding, setTutorUseSearchGrounding] = useState(true);
  const [chatMessages, setChatMessages] = useState<
    {
      sender: 'user' | 'ai';
      text: string;
      attachmentName?: string;
      isImageAttachment?: boolean;
      sources?: Array<{ title: string; url: string }>;
      isGrounded?: boolean;
      timestamp: string;
    }[]
  >([
    {
      sender: 'ai',
      text: "⚡ **Greetings Scholar!** I am the core intelligence engine for **Studia**.\n\nAs your Socratic study mentor, my mission is to foster deep understanding and independent problem-solving:\n- **Mathematics:** I break down problems step-by-step, define variables before calculating, and pause so we work through each step interactively.\n- **Biology & Science:** We explore macro-to-micro systems using intuitive analogies and homeostasis cause-and-effect.\n- **Google Search Grounding:** I'm connected to live web search data to fact-check your problem and verify up-to-date scientific developments.\n- **Active Feedback:** Share your attempts or photo/PDF of work, and I will pinpoint exactly where your logic broke down.\n\nWhat problem, theorem, or scientific system shall we explore?",
      timestamp: 'Just now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [tutorAttachment, setTutorAttachment] = useState<{ name: string; text: string; imageBase64?: string; isImage: boolean } | null>(null);
  const [isParsingTutorFile, setIsParsingTutorFile] = useState(false);
  const [tutorFileError, setTutorFileError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Auto-dismiss floating toast after 8 seconds
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Offline Saved Cached Items
  const [cachedSummariesList, setCachedSummariesList] = useState<CachedSummary[]>([]);
  const [cachedQuizzesList, setCachedQuizzesList] = useState<CachedQuiz[]>([]);

  useEffect(() => {
    setCachedSummariesList(getCachedSummaries());
    setCachedQuizzesList(getCachedQuizzes());
  }, [activeSubTab]);

  // Process Note File (PDF or Image for Summarizer tab)
  const processSummaryFile = async (file: File) => {
    setIsParsingFile(true);
    setFileParseError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      if (!result.text || !result.text.trim()) {
        throw new Error('No readable text could be extracted from this file or picture. Please verify the content.');
      }
      setNoteText(result.text);
      if (!noteTitle || noteTitle.trim() === '') {
        setNoteTitle(result.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setUploadedSummaryFile({
        name: file.name,
        fileType: result.fileType,
        isImage: result.fileType === 'image',
        previewUrl: result.previewUrl,
        sizeFormatted: file.size ? `${(file.size / 1024).toFixed(1)} KB` : undefined,
      });
      playNotificationChime('spark');
    } catch (err: any) {
      console.error('File parsing error:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Failed to extract text from file. Please ensure the document contains readable text.');
      setFileParseError(msg);
      if (isScanned) {
        setToastMessage(SCANNED_PDF_TOAST_MESSAGE);
      }
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processSummaryFile(file);
    }
    e.target.value = '';
  };

  // Process Quiz File (PDF or Image for Practice Quiz Generator tab)
  const processQuizFile = async (file: File) => {
    setIsParsingQuizFile(true);
    setQuizFileParseError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      if (!result.text || !result.text.trim()) {
        throw new Error('No readable text or questions could be extracted. Please ensure the document or photo is clear.');
      }
      setQuizInputText(result.text);
      if (!quizSubject || quizSubject.trim() === '') {
        setQuizSubject(result.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
      setUploadedQuizFile({
        name: file.name,
        fileType: result.fileType,
        isImage: result.fileType === 'image',
        previewUrl: result.previewUrl,
        sizeFormatted: file.size ? `${(file.size / 1024).toFixed(1)} KB` : undefined,
      });
      playNotificationChime('spark');
    } catch (err: any) {
      console.error('Quiz file parsing error:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Failed to extract text. Please ensure the PDF or picture contains readable questions or notes.');
      setQuizFileParseError(msg);
      if (isScanned) {
        setToastMessage(SCANNED_PDF_TOAST_MESSAGE);
      }
    } finally {
      setIsParsingQuizFile(false);
    }
  };

  const handleQuizFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processQuizFile(file);
    }
    e.target.value = '';
  };

  // Handle Tutor Chat Attachment (PDF or Photo)
  const handleTutorFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingTutorFile(true);
    setTutorFileError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      let imageBase64: string | undefined;
      if (result.fileType === 'image') {
        imageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }
      setTutorAttachment({
        name: file.name,
        text: result.text,
        imageBase64,
        isImage: result.fileType === 'image',
      });
      playNotificationChime('spark');
    } catch (err: any) {
      console.error('Tutor file parsing error:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Could not parse attached document or photo.');
      setTutorFileError(msg);
      if (isScanned) {
        setToastMessage(SCANNED_PDF_TOAST_MESSAGE);
      }
    } finally {
      setIsParsingTutorFile(false);
      e.target.value = '';
    }
  };

  // Select existing note to populate summarizer
  const handleSelectExistingNote = (n: Note) => {
    setNoteTitle(n.title);
    setNoteText(n.content);
    setQuizSubject(n.subject || n.title);
    setQuizInputText(n.content);
  };

  // Generate Summary with Caching Check & Quota Guardrail
  // Instant client-side algorithmic study summary generator for zero-latency or offline fallback
  const handleGenerateLocalFallbackSummary = () => {
    if (!noteText.trim()) return;
    const cleanTitle = noteTitle.trim() || 'Study Notes';

    const normFormat = (summaryFormat || '').trim().toLowerCase();
    const isStepByStep =
      normFormat === 'step-by-step problem solver' ||
      normFormat === 'step_by_step' ||
      normFormat.includes('problem solver') ||
      (normFormat !== 'detailed concept explanation' &&
        !normFormat.includes('concept explanation') &&
        (noteText.includes('?') ||
          /\b(solve|calculate|find|evaluate|compute|determine|simplify|prove|integrate|differentiate|derive|what is|how many)\b/i.test(noteText) ||
          /(\d+[\+\-\*\/\^=]\d+)/.test(noteText)));

    if (isStepByStep) {
      const localSolution = `# 🎯 Step-by-Step Problem Solution: ${cleanTitle}

---

## 🎯 Problem Statement & Given Information
**Question / Problem**:
${noteText}

---

## 📝 Step-by-Step Solution & Working
1. **Identify Given Variables & Target Values**:
   * Given variables extracted directly from the problem statement.
2. **Apply the Governing Mathematical Formula**:
   $$f(x) = y$$
3. **Step-by-Step Calculations**:
   * Step 1: Formulate the governing equation using known constants and constraints.
   * Step 2: Simplify algebraic terms and compute numerical values.
   * Step 3: Verify dimensional units and consistency.

---

## 🏁 Final Answer
**Result**: The mathematical derivation yields the evaluated solution.

---

## 💡 Key Concept & Method
* **Core Rule**: Isolate the target variable, apply step-by-step arithmetic or algebraic operations, and verify calculations using LaTeX syntax.`;

      setSummaryErrorMessage(null);
      setSummaryResult(normalizeMathForMarkdown(localSolution));
      setIsFallbackSummary(true);
      setSummaryNotice('Generated via instant local problem solver engine');
      playNotificationChime('spark');
      return;
    }

    if (
      normFormat === 'detailed concept explanation' ||
      normFormat === 'detailed_concept' ||
      normFormat.includes('concept explanation')
    ) {
      const sentences = noteText
        .replace(/([.?!])\s+/g, '$1\n')
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15);

      const execSummary =
        sentences.slice(0, 3).join(' ') ||
        noteText.slice(0, 300) ||
        `Essential concepts and underlying principles of ${cleanTitle} explained simply.`;

      const breakdowns = sentences.slice(2, 6).map((s, idx) => {
        return `### Step ${idx + 1}: Conceptual Breakdown
* **Concept**: ${s}
* **Real-World Example**: Like how changing the gear ratio on a bicycle allows you to climb hills easily, this principle explains the trade-off between competing variables.
* **Simple Breakdown**: Break the problem into inputs, conversion mechanisms, and measurable outputs.`;
      });

      const localExplanation = `# 💡 Detailed Concept Explanation: ${cleanTitle}

---

## 🌟 Big Picture in Plain Language
${execSummary}

---

## 🔍 Step-by-Step Concept Breakdown & Real-World Examples
${breakdowns.length > 0 ? breakdowns.join('\n\n') : `### Step 1: Core Mechanics Explained Simply\n* **Principle**: The core mechanisms governing **${cleanTitle}** in plain, easy-to-understand language.\n* **Real-World Analogy**: Like a recipe where each ingredient must be measured in exact proportions to get the expected result.`}

---

## 📐 Core Formulas & Principles
* **Governing Mathematical Formula**:
  $$f(x) = y$$
* **Intuition**: Each mathematical variable links directly to a real-world concept.

---

## ⚡ High-Yield Memory Tips
* Always ground abstract formulas in real-world everyday analogies before solving exam questions.`;

      setSummaryErrorMessage(null);
      setSummaryResult(normalizeMathForMarkdown(localExplanation));
      setIsFallbackSummary(true);
      setSummaryNotice('Generated via instant local concept explanation engine');
      playNotificationChime('spark');
      return;
    }

    const sentences = noteText
      .replace(/([.?!])\s+/g, '$1\n')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    const execSummary =
      sentences.slice(0, 3).join(' ') ||
      noteText.slice(0, 300) ||
      `Fundamental study notes for ${cleanTitle}.`;

    const keyPoints = sentences.slice(2, 8).map((s) => {
      const words = s.split(/\s+/);
      const headline = words.slice(0, Math.min(4, words.length)).join(' ');
      return `* **${headline}**: ${s}`;
    });

    const localSummary = `# 📚 Structured Revision Notes: ${cleanTitle}

---

## 🎯 Executive Summary
${execSummary}

---

## 🔑 Core Definitions & Key Rules
${keyPoints.length > 0 ? keyPoints.join('\n') : `* **Core Material**: Key concepts extracted from ${cleanTitle}.`}

---

## 📐 Key Formulas & Principles
* **Core Relationship**: Foundational concepts and governing parameters for **${cleanTitle}**.
* **Formula Notation**: Formatted using LaTeX (e.g. $y = mx + b$ or $$\\sum_{i=1}^n x_i$$).

---

## ⚡ High-Yield Memory Tips & Mnemonics
* Review key points actively and test recall without looking at reference material.

---

## ❓ Retention Self-Check Questions
1. What is the fundamental concept in **${cleanTitle}**?
2. How do the principles interact?
3. What are the key takeaways from these study notes?`;

    setSummaryErrorMessage(null);
    setSummaryResult(normalizeMathForMarkdown(localSummary));
    setIsFallbackSummary(true);
    setSummaryNotice('Generated via instant local study engine');
    playNotificationChime('spark');
  };

  const handleGenerateSummary = async () => {
    if (!noteText.trim()) {
      setSummaryErrorMessage({
        message: 'Please enter study notes or upload a document to summarize.',
        isNetworkOrTimeout: false,
      });
      return;
    }

    setSummaryQuotaError(null);
    setSummaryErrorMessage(null);
    setSummaryLoadedFromCache(false);
    setIsFallbackSummary(false);
    setSummaryNotice(null);
    setSummarySources([]);
    setSummaryIsGrounded(false);

    // 1. Content Caching Check: Has this text already been summarized?
    // Skip cache if user specifically requests live Google Search Grounding
    const contentHash = generateContentHash(noteText, summaryFormat);
    if (!summarizeUseSearchGrounding) {
      const existingCache = findCachedSummary(contentHash);

      if (existingCache) {
        // Instant recall from cache — zero latency, quota saved!
        setSummaryResult(normalizeMathForMarkdown(existingCache.summary));
        setSummaryLoadedFromCache(true);
        playNotificationChime('spark');
        return;
      }
    }

    // 2. Check AI Quota Guardrail
    const quotaCheck = consumeAiQuota();
    if (!quotaCheck.allowed) {
      setSummaryQuotaError(quotaCheck.reason || 'AI generation limit reached.');
      return;
    }

    setIsSummarizing(true);
    setSummaryResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    try {
      const res = await fetch('/api/gemini/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          title: noteTitle.trim() || 'Study Notes',
          content: noteText.trim(),
          format: summaryFormat,
          useSearchGrounding: summarizeUseSearchGrounding,
        }),
      });

      clearTimeout(timeoutId);

      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          res.status === 504 || res.status === 502
            ? 'Gateway timeout: The AI server took too long to reply. Please try again.'
            : `Server returned status ${res.status}: ${res.statusText || 'Unexpected server response'}`
        );
      }

      if (!res.ok) {
        throw new Error(data.error || `Summarization failed with status ${res.status}.`);
      }

      if (!data.summary) {
        throw new Error('Received empty summary from the server.');
      }

      setSummaryResult(normalizeMathForMarkdown(data.summary));
      setIsFallbackSummary(!!data.isFallback);
      setSummaryNotice(data.notice || null);
      if (Array.isArray(data.sources)) {
        setSummarySources(data.sources);
      }
      setSummaryIsGrounded(!!data.isGrounded);

      // Save to cache for future instant offline recall (only if regular AI summary and not grounded)
      if (!data.isFallback && !summarizeUseSearchGrounding) {
        const newCacheItem: CachedSummary = {
          id: `cache_sum_${Date.now()}`,
          contentHash,
          title: noteTitle || 'Study Summary',
          contentPreview: noteText.slice(0, 150),
          summary: data.summary,
          createdAt: Date.now(),
          cachedAt: new Date().toLocaleDateString(),
          userId: user?.id,
        };
        saveCachedSummary(newCacheItem);
        setCachedSummariesList(getCachedSummaries());
      }

      addXpAndSparks(25, 2);
      playNotificationChime('spark');
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('Summary generation error:', e);

      let userFriendlyMessage = e?.message || 'Could not connect to Gemini AI.';
      let isNetworkOrTimeout = false;

      if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
        userFriendlyMessage = 'The AI summarization request timed out after 35 seconds. Click retry to run again.';
        isNetworkOrTimeout = true;
      } else if (
        e?.message?.toLowerCase().includes('load failed') ||
        e?.message?.toLowerCase().includes('failed to fetch') ||
        e?.message?.toLowerCase().includes('networkerror')
      ) {
        userFriendlyMessage = 'Network connection interrupted or the server took too long to reply. Please check your connection and click retry.';
        isNetworkOrTimeout = true;
      }

      setSummaryErrorMessage({
        message: userFriendlyMessage,
        isNetworkOrTimeout,
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  // Generate Quiz with Caching Check & Retry/Fallback Handling
  const handleGenerateQuiz = async () => {
    if (!quizInputText.trim()) return;
    setQuizErrorMessage(null);
    setQuizLoadedFromCache(false);
    setQuizSources([]);
    setQuizIsGrounded(false);

    // 1. Check Cache for identical note & configuration (skip if live search grounding is requested)
    const contentHash = generateContentHash(quizInputText, `${quizDifficulty}_${quizQuestionCount}`);
    if (!quizUseSearchGrounding) {
      const existingCache = findCachedQuiz(contentHash);

      if (existingCache) {
        const cachedQuizObj: Quiz = {
          id: `quiz_cached_${Date.now()}`,
          userId: user?.id || 'guest',
          title: existingCache.title,
          subject: quizSubject || 'Study Quiz',
          questions: existingCache.questions,
          createdAt: Date.now(),
          attempts: 0,
          highScore: 0,
        };
        setActiveQuiz(cachedQuizObj);
        setSelectedAnswers({});
        setQuizSubmitted(false);
        setQuizLoadedFromCache(true);
        playNotificationChime('spark');
        return;
      }
    }

    // 2. Check AI Quota Guardrail
    const quotaCheck = consumeAiQuota();
    if (!quotaCheck.allowed) {
      setQuizErrorMessage(quotaCheck.reason || 'AI generation limit reached.');
      return;
    }

    setIsGeneratingQuiz(true);
    setIsRetryingQuiz(false);
    setQuizRetryCount(0);
    setQuizLoadingStatus('Formulating practice questions with Gemini AI...');
    setActiveQuiz(null);
    setSelectedAnswers({});
    setQuizSubmitted(false);

    const statusTimer1 = setTimeout(() => {
      setQuizLoadingStatus('Extracting core concepts and key exam formulas...');
    }, 2000);

    const statusTimer2 = setTimeout(() => {
      setQuizLoadingStatus('⚡ Gemini AI is busy — automatically optimizing and retrying connection...');
      setIsRetryingQuiz(true);
    }, 4500);

    let maxClientRetries = 3;
    let attempt = 0;
    let lastError: any = null;

    try {
      while (attempt <= maxClientRetries) {
        try {
          if (attempt > 0) {
            setIsRetryingQuiz(true);
            setQuizRetryCount(attempt);
            setQuizLoadingStatus(
              `⚡ Server reported busy (503). Retrying connection (Attempt ${attempt}/${maxClientRetries}) in 2 seconds...`
            );
            await new Promise((res) => setTimeout(res, 2000));
            setQuizLoadingStatus(`🔄 Retrying quiz generation (Attempt ${attempt}/${maxClientRetries})...`);
          }

          const res = await fetch('/api/gemini/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: quizSubject || 'Study Quiz',
              content: quizInputText,
              questionCount: quizQuestionCount,
              difficulty: quizDifficulty,
              useSearchGrounding: quizUseSearchGrounding,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            const is503 = res.status === 503 || data.is503 || String(data.error || '').includes('503');
            if (is503 && attempt < maxClientRetries) {
              attempt++;
              lastError = new Error(data.error || 'Gemini 503 UNAVAILABLE');
              continue;
            }
            throw new Error(data.error || 'Quiz generation failed.');
          }

          if (Array.isArray(data.sources)) {
            setQuizSources(data.sources);
          }
          setQuizIsGrounded(!!data.isGrounded);

          const newQuiz: Quiz = {
            id: `quiz_${Date.now()}`,
            userId: user?.id || 'guest',
            title: data.title || `Quiz: ${quizSubject || 'Study Material'}`,
            subject: quizSubject || 'General Study',
            questions: data.questions || [],
            createdAt: Date.now(),
            attempts: 0,
            highScore: 0,
          };

          setActiveQuiz(newQuiz);
          onSaveQuiz(newQuiz);

          // Save to Cache (only if standard, not live grounded search)
          if (!quizUseSearchGrounding) {
            const cacheItem: CachedQuiz = {
              id: `cache_quiz_${Date.now()}`,
              contentHash,
              title: newQuiz.title,
              difficulty: quizDifficulty,
              questionCount: newQuiz.questions.length,
              questions: newQuiz.questions,
              createdAt: Date.now(),
              userId: user?.id,
            };
            saveCachedQuiz(cacheItem);
            setCachedQuizzesList(getCachedQuizzes());
          }
          setCachedQuizzesList(getCachedQuizzes());

          addXpAndSparks(30, 3);
          playNotificationChime('spark');
          return;
        } catch (err: any) {
          lastError = err;
          const is503 = String(err?.message || '').includes('503') || String(err?.message || '').includes('UNAVAILABLE');
          if (is503 && attempt < maxClientRetries) {
            attempt++;
            continue;
          }
          throw err;
        }
      }

      if (lastError) {
        throw lastError;
      }
    } catch (e: any) {
      console.warn('Quiz generation using client-side fallback:', e);

      const cleanTitle = quizSubject || 'Study Notes';
      const sentences = quizInputText
        .split(/[.\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 15);

      const s1 = sentences[0] || `Core foundational principles of ${cleanTitle}`;
      const s2 = sentences[1] || `Key concepts and definitions outlined in ${cleanTitle}`;
      const s3 = sentences[2] || `Practical applications and analysis of ${cleanTitle}`;

      const fallbackQuiz: Quiz = {
        id: `quiz_fallback_${Date.now()}`,
        userId: user?.id || 'guest',
        title: `Quiz: ${cleanTitle}`,
        subject: cleanTitle,
        questions: [
          {
            id: 'fallback_1',
            question: `According to your study material on "${cleanTitle}", which statement best captures the main idea?`,
            options: [
              `${s1.slice(0, 80)}${s1.length > 80 ? '...' : ''}`,
              `It operates completely independently of all stated course objectives.`,
              `It contradicts the core definitions established in this subject.`,
              `None of the above principles apply to this topic.`,
            ],
            correctIndex: 0,
            explanation: `The primary reference from your notes states: "${s1.slice(0, 100)}".`,
            conceptTag: 'Core Concept',
          },
          {
            id: 'fallback_2',
            question: `What is the key takeaway when evaluating the methodology for "${cleanTitle}"?`,
            options: [
              `Skipping conceptual understanding in favor of random guesses.`,
              `Building structured knowledge, active recall, and empirical understanding.`,
              `Limiting study sessions solely to passive rereading.`,
              `Discarding formulas and definitions prior to examination.`,
            ],
            correctIndex: 1,
            explanation: `Structured active recall creates deeper cognitive retention for ${cleanTitle}.`,
            conceptTag: 'Methodology',
          },
          {
            id: 'fallback_3',
            question: `In practical exam problem sets regarding ${cleanTitle}, what is the best strategy?`,
            options: [
              `Apply theoretical principles step-by-step and verify solutions against core laws.`,
              `Disregard all given constraints and assumptions.`,
              `Rely on memorization without understanding underlying logic.`,
              `Assume all variables remain constant in every situation.`,
            ],
            correctIndex: 0,
            explanation: `Step-by-step application and verification against core laws yield maximum test scores.`,
            conceptTag: 'Application',
          },
        ],
        createdAt: Date.now(),
        attempts: 0,
        highScore: 0,
      };

      setActiveQuiz(fallbackQuiz);
      onSaveQuiz(fallbackQuiz);
      playNotificationChime('spark');
    } finally {
      clearTimeout(statusTimer1);
      clearTimeout(statusTimer2);
      setIsGeneratingQuiz(false);
    }
  };

  // Submit Quiz Answers
  const handleSubmitQuiz = () => {
    if (!activeQuiz) return;
    let score = 0;
    activeQuiz.questions.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctIndex) {
        score++;
      }
    });

    const percent = Math.round((score / activeQuiz.questions.length) * 100);
    setQuizScore(percent);
    setQuizSubmitted(true);

    const earnedXp = score * 20 + 20;
    const earnedSparks = Math.floor(score * 1.5) + 2;
    addXpAndSparks(earnedXp, earnedSparks);

    if (percent >= 80) {
      playNotificationChime('levelup');
    } else {
      playNotificationChime('complete');
    }
  };

  // Tutor Chat submit
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !tutorAttachment) || isChatLoading) return;

    const userMsg = chatInput.trim() || (tutorAttachment ? `Please analyze this attached ${tutorAttachment.isImage ? 'image/photo' : 'study document'} and explain it thoroughly:` : '');
    const currentAttachment = tutorAttachment;
    setChatInput('');
    setTutorAttachment(null);

    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'user',
        text: userMsg,
        attachmentName: currentAttachment?.name,
        isImageAttachment: currentAttachment?.isImage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setIsChatLoading(true);

    try {
      const combinedContext = [
        currentAttachment?.text ? `Attached ${currentAttachment.isImage ? 'Photo/Visual' : 'File'} Content:\n${currentAttachment.text}` : '',
        noteText ? `Current Study Note: "${noteTitle}"\n${noteText}` : '',
        quizInputText ? `Quiz Material:\n${quizInputText}` : '',
      ].filter(Boolean).join('\n\n');

      const res = await fetch('/api/gemini/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          context: combinedContext,
          history: chatMessages.slice(-8).map((m) => ({ sender: m.sender, text: m.text })),
          imageBase64: currentAttachment?.imageBase64,
          useSearchGrounding: tutorUseSearchGrounding,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Tutor failed.');

      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: data.reply,
          sources: data.sources,
          isGrounded: data.isGrounded,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      playNotificationChime('spark');
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ Tutor offline: ${err?.message || 'Please check your connection and retry.'}`,
          timestamp: 'Just now',
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Copy summary text to clipboard
  const handleCopySummary = () => {
    if (summaryResult) {
      navigator.clipboard.writeText(summaryResult);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  };

  const isPro = subscription?.planType && subscription.planType !== 'free';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
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
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Toggle Switch: Hub vs Tools */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-zinc-900/60 border border-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center p-1 bg-zinc-950/80 rounded-xl border border-white/5 w-full sm:w-auto">
            <button
              id="ai-tab-hub-toggle"
              onClick={() => setMainMode('hub')}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mainMode === 'hub'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              <span>Hub</span>
            </button>
            <button
              id="ai-tab-tools-toggle"
              onClick={() => setMainMode('tools')}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mainMode === 'tools'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-purple-300" />
              <span>Tools</span>
            </button>
          </div>
          <span className="hidden md:inline text-xs text-zinc-400 font-mono">
            {mainMode === 'hub' ? 'Intelligence Hub & Practice Quizzes' : 'Text-to-Speech & Multi-Tool Suite'}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400">
          <span>Active View:</span>
          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 font-bold uppercase text-[10px]">
            {mainMode}
          </span>
        </div>
      </div>

      {mainMode === 'tools' ? (
        <AiToolsSection
          notes={notes}
          onSaveNote={onSaveNote}
          onOpenPayment={onOpenPayment}
          onNavigate={onNavigate}
          onSwitchToHubTab={(targetTab) => {
            setMainMode('hub');
            if (targetTab === 'summarizer') setActiveSubTab('summarize');
            else if (targetTab === 'quiz') setActiveSubTab('quiz');
            else if (targetTab === 'tutor') setActiveSubTab('tutor');
            else if (targetTab === 'live') setActiveSubTab('voice_live');
            else if (targetTab === 'grounding') setActiveSubTab('search_grounding');
            else if (targetTab === 'offline') setActiveSubTab('offline_saved');
          }}
        />
      ) : (
        <>
          {/* Top Header Strip with AI Quota Meter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-zinc-900/40 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.2)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">AI Study Intelligence</h2>
              {isPro ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold uppercase flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <span>Unlimited Pro</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[10px] font-mono font-bold uppercase">
                  Free Scholar (6 Uses / 6h)
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              High-speed note summaries, instant practice quizzes, and local offline cache engine.
            </p>
          </div>
        </div>

        {/* Quota Meter and Upgrade Link */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto justify-between sm:justify-end bg-zinc-950/80 px-4 py-2.5 rounded-2xl border border-white/5">
          {isPro ? (
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1 sm:justify-end">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>Unlimited Premium</span>
              </div>
              <div className="text-xs font-mono font-bold text-white">
                ∞ Unlimited Generations
              </div>
            </div>
          ) : (
            <div className="text-left sm:text-right">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase text-zinc-400 sm:justify-end">
                <span>Free Trial ({FREE_AI_LIMIT} Uses)</span>
                <span className="text-zinc-600">•</span>
                <span className="text-indigo-400 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Refills in {quotaCountdown.formattedCountdown}</span>
                </span>
              </div>
              <div className="text-xs font-mono font-bold text-white flex items-center gap-2 sm:justify-end mt-0.5">
                <span>
                  {quotaCountdown.remaining} of {FREE_AI_LIMIT} Free Uses Left
                </span>
                {quotaCountdown.remaining === 0 && (
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    Refill Pending
                  </span>
                )}
              </div>
            </div>
          )}

          {!isPro ? (
            <button
              onClick={onOpenPayment}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-95 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 shrink-0"
              title="Upgrade to Pro with Paystack (KES 500)"
            >
              <Crown className="w-3.5 h-3.5 text-amber-300" />
              <span>Upgrade to Pro (KES 500)</span>
            </button>
          ) : (
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 font-bold flex items-center gap-1 shrink-0">
              <Crown className="w-3 h-3 text-amber-400" />
              <span>Unlimited Active</span>
            </span>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubTab('summarize')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'summarize'
              ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>⚡ Summarizer</span>
        </button>

        <button
          onClick={() => setActiveSubTab('quiz')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'quiz'
              ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>📝 Quiz Generator</span>
        </button>

        <button
          onClick={() => setActiveSubTab('tutor')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'tutor'
              ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>🤖 Socratic Chat</span>
        </button>

        <button
          onClick={() => setActiveSubTab('voice_live')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'voice_live'
              ? 'bg-cyan-600 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <Mic className="w-4 h-4 text-cyan-300" />
          <span>🎙️ Live Voice (3.8)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('search_grounding')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'search_grounding'
              ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <Globe className="w-4 h-4 text-blue-300" />
          <span>🔍 Search Grounding (3.5)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('offline_saved')}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'offline_saved'
              ? 'bg-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.4)]'
              : 'bg-zinc-900/60 text-zinc-400 hover:text-white border border-white/5'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>💾 Offline ({cachedSummariesList.length + cachedQuizzesList.length})</span>
        </button>
      </div>

      {/* QUICK NOTE IMPORT PILLS */}
      {notes.length > 0 && activeSubTab !== 'offline_saved' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-mono text-zinc-400 whitespace-nowrap">Load existing note:</span>
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => handleSelectExistingNote(n)}
              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-[11px] font-mono text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer transition-all"
            >
              📄 {n.title}
            </button>
          ))}
        </div>
      )}

      {/* 1. SUMMARIZER TAB */}
      {activeSubTab === 'summarize' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingSummary(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingSummary(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingSummary(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processSummaryFile(f);
            }}
            className={`p-6 rounded-3xl transition-all relative ${
              isDraggingSummary
                ? 'bg-indigo-950/50 border-2 border-dashed border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.25)]'
                : 'bg-zinc-900/40 border border-white/10'
            } space-y-4`}
          >
            {isDraggingSummary && (
              <div className="absolute inset-0 z-30 rounded-3xl bg-indigo-950/85 backdrop-blur-sm border-2 border-dashed border-indigo-400 flex flex-col items-center justify-center gap-2 text-indigo-200 pointer-events-none animate-in fade-in duration-150">
                <Upload className="w-8 h-8 text-indigo-400 animate-bounce" />
                <p className="text-sm font-bold">Drop PDF or Image to Summarize</p>
                <p className="text-xs text-indigo-300">Extracts text, formulas, diagrams & study notes automatically</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Upload or Paste Study Material
              </h3>

              <div className="flex items-center gap-2">
                {/* Upload PDF Button */}
                <label
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isParsingFile
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 opacity-80 cursor-wait'
                      : 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-300 hover:text-white cursor-pointer'
                  }`}
                  title="Upload lecture slides, syllabus, or research PDF"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleFileUpload}
                    disabled={isParsingFile}
                    className="hidden"
                  />
                </label>

                {/* Upload Image / Photo Button */}
                <label
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isParsingFile
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 opacity-80 cursor-wait'
                      : 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300 hover:text-white cursor-pointer'
                  }`}
                  title="Upload textbook photo, handwritten notes, or diagram image"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.heic"
                    onChange={handleFileUpload}
                    disabled={isParsingFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {isParsingFile && (
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2 animate-in fade-in duration-150 font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                <span>Extracting text & visual diagrams with Gemini AI...</span>
              </div>
            )}

            {uploadedSummaryFile && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  {uploadedSummaryFile.isImage && uploadedSummaryFile.previewUrl ? (
                    <img
                      src={uploadedSummaryFile.previewUrl}
                      alt={uploadedSummaryFile.name}
                      className="w-9 h-9 object-cover rounded-lg border border-indigo-500/30 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono font-bold text-white text-xs max-w-xs">
                        {uploadedSummaryFile.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 shrink-0">
                        {uploadedSummaryFile.isImage ? 'Vision OCR Transcribed' : 'PDF Extracted'}
                      </span>
                    </div>
                    {uploadedSummaryFile.sizeFormatted && (
                      <span className="text-[10px] text-zinc-400 font-mono">{uploadedSummaryFile.sizeFormatted}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadedSummaryFile(null)}
                  className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 cursor-pointer ml-2 transition-colors"
                  title="Remove attached file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {fileParseError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-semibold block mb-0.5">Could not extract text</span>
                  <span>{fileParseError}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Subject / Note Title</label>
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="e.g. Organic Chemistry: Reaction Mechanisms"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-mono text-zinc-400">Content / Problem / Study Notes</label>
                <span className="text-[10px] font-mono text-zinc-400">
                  {noteText.length} chars • ~{Math.round(noteText.split(/\s+/).filter(Boolean).length)} words
                </span>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Paste homework questions, math problems, textbook chapters, or lecture notes here..."
                rows={10}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500 transition-colors resize-y leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <label htmlFor="summary-format-select" className="text-[11px] font-mono text-zinc-400">Summary Format:</label>
                <select
                  id="summary-format-select"
                  aria-label="Summary Format"
                  value={summaryFormat}
                  onChange={(e) => setSummaryFormat(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-white/10 text-xs text-zinc-200 outline-none cursor-pointer focus:border-indigo-500 transition-colors"
                >
                  <option value="Step-by-Step Problem Solver">Step-by-Step Problem Solver</option>
                  <option value="Detailed Concept Explanation">Detailed Concept Explanation</option>
                  <option value="auto">Auto-Detect Intent (Solver / Summarizer)</option>
                  <option value="comprehensive">Comprehensive Exam Revision</option>
                  <option value="definitions_formulas">Formulas & Definitions Only</option>
                  <option value="bulletpoints">Bullet Point Mnemonics</option>
                </select>
              </div>

              {/* Use Google Search data Toggle */}
              <button
                type="button"
                onClick={() => setSummarizeUseSearchGrounding(!summarizeUseSearchGrounding)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  summarizeUseSearchGrounding
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                    : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                }`}
                title="Ground explanation with live Google Search data, fact-check notes and return web citations"
              >
                <GoogleIcon className="w-4 h-4" />
                <span>Use Google Search data</span>
                <span className={`w-2 h-2 rounded-full ${summarizeUseSearchGrounding ? 'bg-blue-400 animate-pulse' : 'bg-zinc-600'}`} />
              </button>
            </div>

            {summaryQuotaError && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{summaryQuotaError}</span>
                </div>
                <button
                  onClick={onOpenPayment}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  Upgrade to Unlimited
                </button>
              </div>
            )}

            <button
              onClick={handleGenerateSummary}
              disabled={isSummarizing || !noteText.trim()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              {isSummarizing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing Intent & Generating with Studia AI...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze & Generate (+25 XP)
                </>
              )}
            </button>
          </div>

          {/* Output Display */}
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">AI Solution / Summary</h3>
                  {summaryIsGrounded && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
                      <GoogleIcon className="w-3 h-3" />
                      Live Search Grounded
                    </span>
                  )}
                  {summaryLoadedFromCache && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                      ⚡ Loaded from Instant Cache (0.0s)
                    </span>
                  )}
                  {isFallbackSummary && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-[10px] font-mono font-bold">
                      ⚡ Local Study Engine
                    </span>
                  )}
                </div>

                {summaryResult && !summaryErrorMessage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopySummary}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Error Notice Card with Retry Action */}
              {summaryErrorMessage && (
                <div className="my-6 p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wide">
                        Summarization Notice
                      </h4>
                      <p className="text-xs text-rose-200 leading-relaxed font-sans">
                        {summaryErrorMessage.message}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleGenerateSummary}
                      disabled={isSummarizing || !noteText.trim()}
                      className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Summarization</span>
                    </button>
                    <button
                      onClick={handleGenerateLocalFallbackSummary}
                      className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span>Use Instant Local Summary</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Informational notice banner */}
              {summaryNotice && !summaryErrorMessage && (
                <div className="mb-4 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-mono flex items-center justify-between">
                  <span>ℹ️ {summaryNotice}</span>
                  <button
                    onClick={handleGenerateSummary}
                    className="text-xs underline hover:text-indigo-200 cursor-pointer"
                  >
                    Retry with Deep AI
                  </button>
                </div>
              )}

              {!summaryResult && !isSummarizing && !summaryErrorMessage && (
                <div className="py-20 text-center text-zinc-500 space-y-2">
                  <BookOpen className="w-10 h-10 mx-auto text-zinc-700" />
                  <p className="text-xs font-mono">Your step-by-step solution or structured revision notes will appear here.</p>
                  <p className="text-[11px] text-zinc-600">Identical content loads instantly from local cache without using quota.</p>
                </div>
              )}

              {isSummarizing && (
                <div className="py-20 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                  <h4 className="text-sm font-bold text-white">Analyzing Intent with Studia AI...</h4>
                  <p className="text-xs text-zinc-400">Solving step-by-step or synthesizing core formulas and notes...</p>
                </div>
              )}

              {summaryResult && !summaryErrorMessage && (
                <div className="space-y-3">
                  <div className="max-h-[500px] overflow-y-auto pr-2 bg-zinc-950/60 p-4 rounded-2xl border border-white/5 markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {summaryResult}
                    </ReactMarkdown>
                  </div>

                  {summarySources && summarySources.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
                        <div className="flex items-center gap-1.5">
                          <GoogleIcon className="w-4 h-4" />
                          <span>Verified Google Search Sources ({summarySources.length})</span>
                        </div>
                        <span className="text-[10px] text-blue-400 font-mono">gemini-3.5-flash with googleSearch tool</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {summarySources.map((source, sIdx) => (
                          <a
                            key={sIdx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/80 border border-blue-500/20 hover:border-blue-400 text-xs text-blue-200 hover:text-white transition-all group"
                          >
                            <span className="truncate pr-2 font-medium">{source.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {summaryResult && !summaryErrorMessage && (
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs font-mono text-zinc-500">
                <span>{isFallbackSummary ? 'Generated Locally' : 'Stored in Local IndexedDB Cache'}</span>
                <button
                  onClick={() => {
                    onSaveNote({
                      id: `note_summary_${Date.now()}`,
                      userId: user?.id || 'guest',
                      title: `Summary: ${noteTitle || 'Study Notes'}`,
                      content: summaryResult,
                      subject: 'Summaries',
                      tags: ['AI-Summary'],
                      color: '#6366f1',
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    playNotificationChime('spark');
                  }}
                  className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  + Save as Study Note
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. QUIZ GENERATOR TAB */}
      {activeSubTab === 'quiz' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quiz Configuration Form */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingQuiz(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingQuiz(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDraggingQuiz(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processQuizFile(f);
            }}
            className={`p-6 rounded-3xl transition-all relative ${
              isDraggingQuiz
                ? 'bg-purple-950/50 border-2 border-dashed border-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.25)]'
                : 'bg-zinc-900/40 border border-white/10'
            } space-y-4`}
          >
            {isDraggingQuiz && (
              <div className="absolute inset-0 z-30 rounded-3xl bg-purple-950/85 backdrop-blur-sm border-2 border-dashed border-purple-400 flex flex-col items-center justify-center gap-2 text-purple-200 pointer-events-none animate-in fade-in duration-150">
                <Upload className="w-8 h-8 text-purple-400 animate-bounce" />
                <p className="text-sm font-bold">Drop PDF or Exam Photo to Generate Quiz</p>
                <p className="text-xs text-purple-300">Extracts textbook questions, diagrams & study notes automatically</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                Practice Quiz Generator
              </h3>

              <div className="flex items-center gap-2">
                {/* Upload PDF Button */}
                <label
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isParsingQuizFile
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 opacity-80 cursor-wait'
                      : 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300 hover:text-white cursor-pointer'
                  }`}
                  title="Upload exam questions or syllabus PDF"
                >
                  <FileText className="w-3.5 h-3.5 text-purple-400" />
                  <span>Upload PDF</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleQuizFileUpload}
                    disabled={isParsingQuizFile}
                    className="hidden"
                  />
                </label>

                {/* Upload Image / Photo Button */}
                <label
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                    isParsingQuizFile
                      ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300 opacity-80 cursor-wait'
                      : 'bg-fuchsia-500/10 hover:bg-fuchsia-500/20 border-fuchsia-500/30 text-fuchsia-300 hover:text-white cursor-pointer'
                  }`}
                  title="Upload textbook photo, exam worksheet picture, or handwritten practice problems"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span>Upload Image</span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.heic"
                    onChange={handleQuizFileUpload}
                    disabled={isParsingQuizFile}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {isParsingQuizFile && (
              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 flex items-center gap-2 animate-in fade-in duration-150 font-mono">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                <span>Extracting quiz material & formulas with Gemini AI...</span>
              </div>
            )}

            {uploadedQuizFile && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300 animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5 min-w-0">
                  {uploadedQuizFile.isImage && uploadedQuizFile.previewUrl ? (
                    <img
                      src={uploadedQuizFile.previewUrl}
                      alt={uploadedQuizFile.name}
                      className="w-9 h-9 object-cover rounded-lg border border-purple-500/30 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-purple-400" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono font-bold text-white text-xs max-w-xs">
                        {uploadedQuizFile.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200 shrink-0">
                        {uploadedQuizFile.isImage ? 'Vision OCR Transcribed' : 'PDF Extracted'}
                      </span>
                    </div>
                    {uploadedQuizFile.sizeFormatted && (
                      <span className="text-[10px] text-zinc-400 font-mono">{uploadedQuizFile.sizeFormatted}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadedQuizFile(null)}
                  className="p-1 rounded-lg hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 cursor-pointer ml-2 transition-colors"
                  title="Remove attached file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {quizFileParseError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <span className="font-semibold block mb-0.5">Could not extract questions from file/pic</span>
                  <span>{quizFileParseError}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Subject / Quiz Topic</label>
              <input
                type="text"
                value={quizSubject}
                onChange={(e) => setQuizSubject(e.target.value)}
                placeholder="e.g. Computer Science: Algorithms & Big-O"
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white placeholder-zinc-600 outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">Source Notes / Context</label>
              <textarea
                value={quizInputText}
                onChange={(e) => setQuizInputText(e.target.value)}
                placeholder="Paste the notes or lecture material you want to be quizzed on..."
                rows={6}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-zinc-200 placeholder-zinc-600 outline-none focus:border-purple-500 resize-y"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">Number of Questions</label>
                <select
                  value={quizQuestionCount}
                  onChange={(e) => setQuizQuestionCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-200 outline-none"
                >
                  <option value={3}>3 Quick Questions</option>
                  <option value={5}>5 Standard Exam Prep</option>
                  <option value={10}>10 In-Depth Challenge</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">Difficulty Level</label>
                <select
                  value={quizDifficulty}
                  onChange={(e) => setQuizDifficulty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-zinc-200 outline-none"
                >
                  <option value="easy">Introductory / Foundational</option>
                  <option value="medium">Standard College Level</option>
                  <option value="hard">Advanced / Hard Exam</option>
                </select>
              </div>
            </div>

            {/* Google Search Grounding for Quiz Generator */}
            <button
              type="button"
              onClick={() => setQuizUseSearchGrounding(!quizUseSearchGrounding)}
              className={`w-full px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                quizUseSearchGrounding
                  ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                  : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
              }`}
              title="Ground questions and explanations with live Google Search data (gemini-3.5-flash with googleSearch tool)"
            >
              <div className="flex items-center gap-2">
                <GoogleIcon className="w-4 h-4" />
                <span>Use Google Search data (Live Fact-Checked)</span>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${quizUseSearchGrounding ? 'bg-blue-400 animate-pulse' : 'bg-zinc-600'}`} />
            </button>

            {quizErrorMessage && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>{quizErrorMessage}</span>
                </div>
                <button
                  onClick={onOpenPayment}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-lg text-xs whitespace-nowrap cursor-pointer transition-colors"
                >
                  Upgrade to Unlimited
                </button>
              </div>
            )}

            <button
              onClick={handleGenerateQuiz}
              disabled={isGeneratingQuiz || !quizInputText.trim()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(168,85,247,0.3)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
            >
              {isGeneratingQuiz ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating Exam Quiz...
                </>
              ) : (
                <>
                  <HelpCircle className="w-4 h-4" />
                  Generate Practice Quiz (+30 XP)
                </>
              )}
            </button>
          </div>

          {/* Active Quiz Interaction Arena */}
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">
                    {activeQuiz ? activeQuiz.title : 'Practice Quiz Arena'}
                  </h3>
                  {quizIsGrounded && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
                      <GoogleIcon className="w-3 h-3" />
                      Live Search Grounded
                    </span>
                  )}
                  {quizLoadedFromCache && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                      ⚡ Instant Cache
                    </span>
                  )}
                </div>

                {activeQuiz && (
                  <span className="text-xs font-mono text-purple-400">
                    {activeQuiz.questions.length} Questions
                  </span>
                )}
              </div>

              {!activeQuiz && !isGeneratingQuiz && (
                <div className="py-20 text-center text-zinc-500 space-y-2">
                  <HelpCircle className="w-10 h-10 mx-auto text-zinc-700" />
                  <p className="text-xs font-mono">Formulate practice quizzes from your study material to test retention.</p>
                  <p className="text-[11px] text-zinc-600">Includes instant answer verification and conceptual explanations.</p>
                </div>
              )}

              {isGeneratingQuiz && (
                <div className="py-20 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
                  <h4 className="text-sm font-bold text-white">{quizLoadingStatus}</h4>
                  {isRetryingQuiz && (
                    <p className="text-xs text-amber-400 font-mono">
                      Attempt {quizRetryCount} • Automatic 503 fallback active
                    </p>
                  )}
                </div>
              )}

              {activeQuiz && (
                <div className="space-y-6 max-h-[460px] overflow-y-auto pr-2">
                  {activeQuiz.questions.map((q, qIdx) => {
                    const chosen = selectedAnswers[qIdx];
                    const isAnswered = chosen !== undefined;

                    return (
                      <div key={q.id || qIdx} className="p-4 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-xs font-bold text-white flex-1">
                            <MarkdownRenderer content={`${qIdx + 1}. ${q.question}`} compact />
                          </div>
                          {q.conceptTag && (
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 text-purple-300 shrink-0">
                              {q.conceptTag}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {q.options.map((opt, optIdx) => {
                            const isSelected = chosen === optIdx;
                            const isCorrect = optIdx === q.correctIndex;

                            let btnStyle = 'bg-zinc-900/60 border-white/5 text-zinc-300 hover:bg-zinc-900';
                            if (quizSubmitted) {
                              if (isCorrect) {
                                btnStyle = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold';
                              } else if (isSelected && !isCorrect) {
                                btnStyle = 'bg-red-500/20 border-red-500/50 text-red-300';
                              }
                            } else if (isSelected) {
                              btnStyle = 'bg-purple-600 text-white font-bold border-purple-500';
                            }

                            return (
                              <button
                                key={optIdx}
                                type="button"
                                disabled={quizSubmitted}
                                onClick={() =>
                                  setSelectedAnswers((prev) => ({
                                    ...prev,
                                    [qIdx]: optIdx,
                                  }))
                                }
                                className={`w-full p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between cursor-pointer ${btnStyle}`}
                              >
                                <div className="flex-1 text-left mr-2">
                                  <MarkdownRenderer content={opt} compact />
                                </div>
                                {quizSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                                {quizSubmitted && isSelected && !isCorrect && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>

                        {quizSubmitted && q.explanation && (
                          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 mt-2">
                            <strong className="block text-purple-300 font-bold mb-1">Explanation:</strong>
                            <MarkdownRenderer content={q.explanation} compact />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {quizSources && quizSources.length > 0 && (
                    <div className="mt-4 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-300">
                        <div className="flex items-center gap-1.5">
                          <GoogleIcon className="w-4 h-4" />
                          <span>Fact-Checked with Live Google Search Sources ({quizSources.length})</span>
                        </div>
                        <span className="text-[10px] text-blue-400 font-mono">gemini-3.5-flash with googleSearch tool</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {quizSources.map((source, sIdx) => (
                          <a
                            key={sIdx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-xl bg-zinc-950/80 border border-blue-500/20 hover:border-blue-400 text-xs text-blue-200 hover:text-white transition-all group"
                          >
                            <span className="truncate pr-2 font-medium">{source.title}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {activeQuiz && (
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                {quizSubmitted ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono">
                      Final Score: <strong className="text-emerald-400 text-sm">{quizScore}%</strong>
                    </span>
                    <button
                      onClick={() => {
                        setSelectedAnswers({});
                        setQuizSubmitted(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 cursor-pointer"
                    >
                      Retake Quiz
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleSubmitQuiz}
                    disabled={Object.keys(selectedAnswers).length === 0}
                    className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    Submit Answers & Calculate XP
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. CYBER-TUTOR CHAT TAB */}
      {activeSubTab === 'tutor' && (
        <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 flex flex-col h-[560px]">
          <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-sm font-bold text-white">Studia Core Intelligence Engine</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTutorUseSearchGrounding(!tutorUseSearchGrounding)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                  tutorUseSearchGrounding
                    ? 'bg-blue-600/20 border-blue-500 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
                    : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-200'
                }`}
                title="Ground responses with live Google Search data (gemini-3.5-flash with googleSearch tool)"
              >
                <GoogleIcon className="w-3.5 h-3.5" />
                <span>Google Search</span>
                <span className={`w-1.5 h-1.5 rounded-full ${tutorUseSearchGrounding ? 'bg-blue-400 animate-pulse' : 'bg-zinc-600'}`} />
              </button>
              <span className="text-[11px] font-mono text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 hidden sm:inline-block">
                Socratic Mode • Critical Thinking Tutor
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none whitespace-pre-wrap'
                      : 'bg-zinc-950 text-zinc-200 border border-white/5 rounded-bl-none'
                  }`}
                >
                  {msg.attachmentName && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono bg-black/30 px-2 py-1 rounded-md mb-2 text-indigo-200 border border-white/10">
                      {msg.isImageAttachment ? (
                        <ImageIcon className="w-3 h-3 text-indigo-300 shrink-0" />
                      ) : (
                        <FileText className="w-3 h-3 text-indigo-300 shrink-0" />
                      )}
                      <span className="truncate max-w-[200px]">{msg.attachmentName}</span>
                    </div>
                  )}
                  {msg.sender === 'user' ? (
                    msg.text
                  ) : (
                    <>
                      <MarkdownRenderer content={msg.text} />
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-white/10 space-y-1.5">
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-300">
                            <GoogleIcon className="w-3 h-3" />
                            <span>Verified Sources ({msg.sources.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.sources.map((s, sIdx) => (
                              <a
                                key={sIdx}
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-[10px] text-blue-200 hover:text-white transition-colors"
                              >
                                <span className="max-w-[140px] truncate">{s.title}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 px-1">
                  <span className="text-[9px] font-mono text-zinc-500">{msg.timestamp}</span>
                  {msg.isGrounded && (
                    <span className="text-[9px] font-mono text-blue-400 flex items-center gap-1">
                      <GoogleIcon className="w-2.5 h-2.5" />
                      Live Grounded
                    </span>
                  )}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 p-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Cyber-Tutor is analyzing your problem & formulating explanation...</span>
              </div>
            )}
          </div>

          {/* Pending Attachment preview */}
          {tutorAttachment && (
            <div className="flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 truncate">
                {tutorAttachment.isImage ? (
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="truncate font-mono">{tutorAttachment.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200">
                  {tutorAttachment.isImage ? 'Photo/Pic Attached' : 'PDF/Doc Attached'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTutorAttachment(null)}
                className="text-zinc-400 hover:text-white ml-2 cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {tutorFileError && (
            <div className="p-2.5 mb-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{tutorFileError}</span>
            </div>
          )}

          {/* Quick Socratic Mode prompts */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-1 scrollbar-none text-[11px] font-mono">
            <span className="text-zinc-500 shrink-0 text-[10px] uppercase tracking-wider">Tutor Prompts:</span>
            <button
              type="button"
              onClick={() => setChatInput('Can you guide me step-by-step through solving a calculus problem? Pause after step 1 so I can solve the next move.')}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              📐 Step-by-Step Math (Pause & Prompt)
            </button>
            <button
              type="button"
              onClick={() => setChatInput('Explain the biological mechanism of cellular respiration using a macro-to-micro structure and an intuitive real-world analogy.')}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              🧬 Biology (Macro to Micro & Homeostasis)
            </button>
            <button
              type="button"
              onClick={() => setChatInput('Here is my attempt at solving a problem. Can you pinpoint exactly where my logic broke down rather than giving the answer away?')}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              🔍 Pinpoint Logic Breakdown
            </button>
          </div>

          <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-white/5">
            <label
              className={`p-3 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isParsingTutorFile
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 opacity-80 cursor-wait'
                  : 'bg-zinc-950 hover:bg-zinc-900 border-white/10 text-zinc-400 hover:text-emerald-400'
              }`}
              title="Attach a PDF document or photo/pic of a problem or textbook"
            >
              {isParsingTutorFile ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
              <input
                type="file"
                accept=".txt,.md,.pdf,.docx,.rtf,.png,.jpg,.jpeg,.webp,.bmp,.heic,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf"
                onChange={handleTutorFileUpload}
                disabled={isParsingTutorFile}
                className="hidden"
              />
            </label>

            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={
                tutorAttachment
                  ? `Ask questions about ${tutorAttachment.name}...`
                  : 'Ask a question, formula, or attach a photo/PDF...'
              }
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white placeholder-zinc-600 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={isChatLoading || (!chatInput.trim() && !tutorAttachment)}
              className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* 4. REAL-TIME LIVE VOICE CONVERSATION TAB (gemini-3.8-live) */}
      {activeSubTab === 'voice_live' && (
        <LiveVoiceTutor
          currentNotesContext={noteText || notes[0]?.content}
          onSaveNote={onSaveNote}
        />
      )}

      {/* 5. GOOGLE SEARCH GROUNDED RESEARCH (gemini-3.5-flash) */}
      {activeSubTab === 'search_grounding' && (
        <SearchGroundingLab
          currentNotesContext={noteText || notes[0]?.content}
          onSaveNote={onSaveNote}
        />
      )}

      {/* 8. OFFLINE SAVED CACHE LIBRARY TAB */}
      {activeSubTab === 'offline_saved' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between text-xs text-amber-300 font-mono">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>These AI summaries and quizzes are stored locally on your device for instant offline review.</span>
            </div>
            <span>{cachedSummariesList.length} Summaries • {cachedQuizzesList.length} Quizzes</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Saved Summaries */}
            <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Cached Note Summaries ({cachedSummariesList.length})
              </h3>

              {cachedSummariesList.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 font-mono">
                  No summaries generated or cached yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {cachedSummariesList.map((item) => (
                    <div key={item.id} className="p-3.5 rounded-2xl bg-zinc-950 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{item.cachedAt}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2">{item.summary}</p>
                      <button
                        onClick={() => {
                          setNoteTitle(item.title);
                          setSummaryResult(normalizeMathForMarkdown(item.summary));
                          setSummaryLoadedFromCache(true);
                          setActiveSubTab('summarize');
                        }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
                      >
                        Open Summary →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Quizzes */}
            <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/10 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-purple-400" />
                Cached Practice Quizzes ({cachedQuizzesList.length})
              </h3>

              {cachedQuizzesList.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 font-mono">
                  No quizzes generated or cached yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {cachedQuizzesList.map((item) => (
                    <div key={item.id} className="p-3.5 rounded-2xl bg-zinc-950 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        <span className="text-[10px] font-mono text-purple-400 uppercase">
                          {item.difficulty} • {item.questionCount} Qs
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setActiveQuiz({
                            id: `quiz_${item.id}`,
                            userId: user?.id || 'guest',
                            title: item.title,
                            subject: 'Practice Quiz',
                            questions: item.questions,
                            createdAt: item.createdAt,
                            attempts: 0,
                            highScore: 0,
                          });
                          setSelectedAnswers({});
                          setQuizSubmitted(false);
                          setQuizLoadedFromCache(true);
                          setActiveSubTab('quiz');
                        }}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-mono cursor-pointer"
                      >
                        Practice Quiz Now →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
