import React, { useState, useRef } from 'react';
import {
  Search,
  Globe,
  ExternalLink,
  Sparkles,
  BookOpen,
  Check,
  AlertCircle,
  AlertTriangle,
  Crown,
  FileText,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  X,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note } from '../types';
import { useAuth } from '../lib/authContext';
import { PaywallModal } from './PaywallModal';
import { parseUploadedDocumentOrPic, SCANNED_PDF_TOAST_MESSAGE, ParsedDocumentResult } from '../lib/fileParser';

interface SearchGroundingLabProps {
  currentNotesContext?: string;
  onSaveNote?: (note: Note) => void;
}

export const SearchGroundingLab: React.FC<SearchGroundingLabProps> = ({ currentNotesContext, onSaveNote }) => {
  const { user, checkCanUseAi, recordSuccessfulAiGeneration } = useAuth();
  const [query, setQuery] = useState('');
  const [useContext, setUseContext] = useState(Boolean(currentNotesContext));
  const [isSearching, setIsSearching] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ title: string; url: string }>>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCapacityError, setIsCapacityError] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState('');

  // Uploaded PDF / Image Grounding State
  const [uploadedFile, setUploadedFile] = useState<
    (ParsedDocumentResult & { name: string; isImage: boolean; sizeFormatted?: string }) | null
  >(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [fileParseError, setFileParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showExtractedPreview, setShowExtractedPreview] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFile = async (file: File) => {
    setIsParsingFile(true);
    setFileParseError(null);

    try {
      const result = await parseUploadedDocumentOrPic(file);
      if (!result.text || !result.text.trim()) {
        throw new Error('No readable text could be extracted from this file or image. Please verify the content.');
      }

      setUploadedFile({
        ...result,
        name: file.name,
        isImage: result.fileType === 'image',
        sizeFormatted: formatFileSize(file.size),
      });

      // Auto-populate query if empty or generic
      if (!query.trim()) {
        setQuery(`Verify, explain, and find latest research on: ${result.title}`);
      }
    } catch (err: any) {
      console.error('File parsing error in search grounding:', err);
      const isScanned =
        err?.message === SCANNED_PDF_TOAST_MESSAGE ||
        err?.message?.includes('scanned image or photo');
      const msg = isScanned
        ? SCANNED_PDF_TOAST_MESSAGE
        : (err?.message || 'Failed to extract text from file. Please ensure document/photo is clear.');
      setFileParseError(msg);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q.trim() && !uploadedFile) {
      setErrorMsg('Please enter a research topic or upload a PDF / Image diagram to ground your search.');
      return;
    }

    // Usage check (5-use limit)
    if (checkCanUseAi && !checkCanUseAi()) {
      setPaywallReason('You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
      setShowPaywall(true);
      return;
    }

    setIsSearching(true);
    setErrorMsg(null);
    setIsCapacityError(false);
    setSavedSuccess(false);

    try {
      const activeContext = uploadedFile
        ? uploadedFile.text
        : (useContext ? currentNotesContext : undefined);

      const res = await fetch('/api/gemini/search-grounding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'guest_user',
        },
        body: JSON.stringify({
          query: q.trim() || `Fact-check and research findings for: ${uploadedFile?.title || 'Uploaded Document'}`,
          context: activeContext,
          documentTitle: uploadedFile?.title,
          userId: user?.id || 'guest_user',
        }),
      });

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        setPaywallReason(errData.error || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
        setShowPaywall(true);
        setErrorMsg(errData.error || 'Free usage limit reached.');
        return;
      }

      if (res.status === 429) {
        setIsCapacityError(true);
        setErrorMsg('AI is at capacity. Please upgrade or try again later.');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'RESOURCE_EXHAUSTED' || data?.isCapacityError) {
          setIsCapacityError(true);
          setErrorMsg('AI is at capacity. Please upgrade or try again later.');
          return;
        }
        if (data?.code === 'USAGE_LIMIT_REACHED' || data?.requiresPaywall) {
          setPaywallReason(data.error || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.');
          setShowPaywall(true);
          setErrorMsg(data.error);
          return;
        }
        throw new Error(data.error || 'Failed to fetch search-grounded data.');
      }

      if (recordSuccessfulAiGeneration) {
        await recordSuccessfulAiGeneration();
      }

      setResultText(data.text);
      setSources(data.sources || []);
      setSearchQueries(data.searchQueries || []);
    } catch (err: any) {
      console.error('Search grounding error:', err);
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('429') || msg.includes('capacity') || msg.includes('resource_exhausted')) {
        setIsCapacityError(true);
        setErrorMsg('AI is at capacity. Please upgrade or try again later.');
      } else {
        setErrorMsg(err?.message || 'Failed to complete search-grounded research.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveToNotes = () => {
    if (!resultText || !onSaveNote) return;

    const sourcesList = sources.length > 0
      ? `\n\n### 🔗 Verified Web Sources & Citations:\n` + sources.map((s) => `- [${s.title}](${s.url})`).join('\n')
      : '';

    const newNote: Note = {
      id: 'search-note-' + Date.now(),
      userId: 'user',
      title: query.slice(0, 45) || 'Grounded Research Notes',
      content: `# ${query}\n\n${resultText}${sourcesList}`,
      subject: 'Academic Research',
      tags: ['Google Search', 'Fact-Checked', 'gemini-3.5-flash'],
      color: '#3b82f6',
      summary: resultText.slice(0, 160) + '...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSaveNote(newNote);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const topicPresets = [
    'Latest discoveries by the James Webb Space Telescope in 2025/2026',
    'Current clinical trial status of CRISPR base editing for sickle cell anemia',
    'Recent breakthroughs in quantum error correction and topological qubits',
    'Global renewable energy generation statistics and transition milestones',
  ];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`p-6 rounded-3xl transition-all ${
        isDragging
          ? 'bg-blue-950/40 border-2 border-dashed border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)]'
          : 'bg-zinc-900/40 border border-white/10'
      } flex flex-col space-y-6 relative`}
    >
      {/* Hidden File Inputs */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.heic"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Dragging Overlay Indicator */}
      {isDragging && (
        <div className="absolute inset-0 z-40 rounded-3xl bg-blue-950/80 backdrop-blur-sm border-2 border-dashed border-blue-400 flex flex-col items-center justify-center gap-3 text-blue-200 pointer-events-none animate-in fade-in duration-150">
          <Upload className="w-10 h-10 text-blue-400 animate-bounce" />
          <p className="text-sm font-bold">Drop PDF or Image to Fact-Check with Google Search</p>
          <p className="text-xs text-blue-300">Extracts formulas, diagrams, questions, and claims automatically</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Google Search Grounded Research</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                gemini-3.5-flash + googleSearch
              </span>
            </h3>
          </div>
          <p className="text-xs text-zinc-400">
            Real-time web verification and up-to-date scientific grounding. Backed by live Google Search indexes and verifiable source links.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Dedicated Upload Buttons */}
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            disabled={isParsingFile}
            className="px-3.5 py-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/50 text-blue-300 hover:text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 shrink-0"
            title="Upload research paper, article, or slide deck PDF"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Upload PDF</span>
          </button>

          <button
            type="button"
            onClick={() => imgInputRef.current?.click()}
            disabled={isParsingFile}
            className="px-3.5 py-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-300 hover:text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 shrink-0"
            title="Upload photo of textbook, diagram, chart, or handwritten notes"
          >
            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload Image</span>
          </button>

          {onSaveNote && resultText && (
            <button
              onClick={handleSaveToNotes}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm shrink-0 ml-2"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <FileText className="w-4 h-4" />}
              <span>{savedSuccess ? 'Saved to Notes!' : 'Save Research'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Parsing File Indicator */}
      {isParsingFile && (
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2.5 animate-in fade-in duration-200">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
          <span className="font-mono">Extracting text, formulas & diagrams from file for Google Search grounding...</span>
        </div>
      )}

      {/* File Parsing Error Alert */}
      {fileParseError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start justify-between gap-2 animate-in fade-in duration-150">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Could not extract document</span>
              <span>{fileParseError}</span>
            </div>
          </div>
          <button
            onClick={() => setFileParseError(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Uploaded File Grounding Context Card */}
      {uploadedFile && (
        <div className="p-3.5 rounded-2xl bg-blue-950/30 border border-blue-500/30 space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {uploadedFile.isImage && uploadedFile.previewUrl ? (
                <img
                  src={uploadedFile.previewUrl}
                  alt={uploadedFile.name}
                  className="w-10 h-10 object-cover rounded-lg border border-blue-500/30 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white truncate max-w-xs sm:max-w-md font-mono">
                    {uploadedFile.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0 font-medium">
                    {uploadedFile.isImage ? 'Vision OCR Grounded' : 'PDF Grounded'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-2 mt-0.5 font-mono">
                  {uploadedFile.sizeFormatted && <span>{uploadedFile.sizeFormatted}</span>}
                  <span>•</span>
                  <span>{uploadedFile.text.length.toLocaleString()} characters extracted</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowExtractedPreview(!showExtractedPreview)}
                className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
                title={showExtractedPreview ? 'Hide extracted text' : 'Inspect extracted text'}
              >
                {showExtractedPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{showExtractedPreview ? 'Hide Text' : 'View Text'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUploadedFile(null);
                  setShowExtractedPreview(false);
                }}
                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer"
                title="Remove attached document"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Extracted Text Preview Dropdown */}
          {showExtractedPreview && (
            <div className="mt-2 p-3 rounded-xl bg-zinc-950/80 border border-white/10 text-[11px] text-zinc-300 max-h-48 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed">
              {uploadedFile.text}
            </div>
          )}
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div
          id="search-grounding-error-alert"
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            isCapacityError
              ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
              : 'bg-red-500/10 border border-red-500/20 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isCapacityError ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{errorMsg}</span>
          </div>

          {isCapacityError && (
            <button
              onClick={() => {
                setPaywallReason('AI is at capacity for free users. Upgrade to Pro for priority queue access.');
                setShowPaywall(true);
              }}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-sm"
            >
              <Crown className="w-3 h-3" />
              <span>Upgrade</span>
            </button>
          )}
        </div>
      )}

      {/* Search Bar & Options */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search any recent scientific study, historical fact, math theorem, or current event..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950/80 border border-white/10 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <button
            onClick={() => handleSearch()}
            disabled={isSearching || !query.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 shrink-0"
          >
            {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
            <span>{isSearching ? 'Grounding...' : 'Search with Google'}</span>
          </button>
        </div>

        {/* Grounding Context Checkbox */}
        {currentNotesContext && (
          <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
              className="rounded bg-zinc-800 border-white/10 text-blue-500 focus:ring-0"
            />
            <span>Include current study notes as reference context</span>
          </label>
        )}

        {/* Quick Topic Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-mono">
          <span className="text-zinc-500 shrink-0 text-[10px] uppercase tracking-wider">Suggested Topics:</span>
          {topicPresets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuery(preset);
                handleSearch(preset);
              }}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              🌐 {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Grounded Results Display */}
      {isSearching ? (
        <div className="py-16 text-center space-y-3 rounded-2xl bg-zinc-950/60 border border-white/5">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-xs font-semibold text-white">Synthesizing live web data with gemini-3.5-flash...</p>
          <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
            Grounded queries verify citations and retrieve authoritative sources in real time.
          </p>
        </div>
      ) : resultText ? (
        <div className="space-y-6">
          {/* Active Uploaded File Grounding Notice */}
          {uploadedFile && (
            <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
              <div className="flex items-center gap-2 font-mono">
                <Check className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Grounded with uploaded {uploadedFile.isImage ? 'image/diagram' : 'PDF'}:{' '}
                  <strong className="text-white">{uploadedFile.name}</strong>
                </span>
              </div>
              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded">
                Verified with live Google Search
              </span>
            </div>
          )}

          {/* Verified Web Sources Cards */}
          {sources.length > 0 && (
            <div className="p-4 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Verified Google Sources ({sources.length})</span>
                </span>
                {searchQueries.length > 0 && (
                  <span className="text-[10px] font-mono text-zinc-400">
                    Search queries: {searchQueries.join(' • ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sources.map((source, idx) => (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-zinc-950/70 hover:bg-zinc-800 border border-white/5 hover:border-blue-500/30 text-xs text-zinc-300 hover:text-white transition-all flex items-center justify-between group"
                  >
                    <span className="truncate pr-2 font-medium">{source.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-blue-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Markdown Content Output */}
          <div className="p-6 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-4 text-zinc-200">
            <div className="prose prose-invert max-w-none text-xs leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {resultText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center space-y-2 text-zinc-500 rounded-2xl bg-zinc-950/40 border border-white/5">
          <Globe className="w-10 h-10 mx-auto stroke-[1.5]" />
          <p className="text-xs font-medium text-zinc-400">Search-grounded knowledge awaits</p>
          <p className="text-[11px] max-w-xs mx-auto text-zinc-500">
            Ask about recent discoveries or test concepts against current scientific publications.
          </p>
        </div>
      )}
      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason={paywallReason}
        onSuccess={() => {
          setErrorMsg(null);
          setIsCapacityError(false);
        }}
      />
    </div>
  );
};
