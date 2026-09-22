import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - mammoth does not provide TypeScript types
import mammoth from 'mammoth';

// Configure pdfjs worker in browser
if (typeof window !== 'undefined') {
  try {
    // Prefer local bundled worker if supported by bundler, fallback to unpkg CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

/**
 * Checks whether text contains binary gibberish or null characters
 */
export function isBinaryString(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 1000);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true; // Null byte indicates binary
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }
  return sample.length > 0 && nonPrintable / sample.length > 0.05;
}

/**
 * Clean plain text from BOM and non-printable control characters
 */
export function cleanText(text: string): string {
  if (!text) return '';
  // Strip BOM
  let cleaned = text.replace(/^\uFEFF/, '');
  // Remove non-printable control characters, keeping tabs, newlines, carriage returns
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim();
}

/**
 * Clean RTF markup to extract plain text
 */
function cleanRtf(rtf: string): string {
  let text = rtf.replace(/\{\*(?:\\([a-z]+)|[^{}]+)\}/gi, '');
  text = text.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|header|footer)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '');
  text = text.replace(/\\par(?:\r\n|\r|\n|\s+)?/gi, '\n');
  text = text.replace(/\\line(?:\r\n|\r|\n|\s+)?/gi, '\n');
  text = text.replace(/\\tab(?:\s+)?/gi, '\t');
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  text = text.replace(/\\[a-zA-Z]+-?\d*(?: )?/g, '');
  text = text.replace(/[{}]/g, '');
  return cleanText(text);
}

export const SCANNED_PDF_TOAST_MESSAGE =
  'This PDF appears to be a scanned image or photo. Please paste the text directly into the box or upload an editable document/Word file.';

/**
 * Extracts plain text from a PDF file using pdfjs
 */
async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const textPieces: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    let lastY: number | null = null;
    let pageText = '';

    for (const rawItem of content.items) {
      const item = rawItem as any;
      if (!item || typeof item.str !== 'string') continue;
      const str = item.str;
      if (!str) continue;

      const currentY = item.transform && item.transform.length >= 6 ? item.transform[5] : null;
      const isNewLine = item.hasEOL || (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5);

      if (isNewLine) {
        pageText += '\n' + str;
      } else {
        if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += str;
      }
      if (currentY !== null) {
        lastY = currentY;
      }
    }

    if (pageText.trim()) {
      textPieces.push(pageText.trim());
    }
  }

  const fullText = textPieces.join('\n\n').trim();
  if (!fullText || fullText.length < 20) {
    // Attempt Gemini OCR for scanned or image-based PDF
    try {
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read PDF file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/gemini/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64DataUrl,
          mimeType: 'application/pdf',
          filename: file.name,
          promptHint: 'Transcribe and extract all study content, text, formulas (in LaTeX), diagrams, questions, and notes from this PDF thoroughly.',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text && data.text.trim()) {
          return cleanText(data.text);
        }
      }
    } catch (e) {
      console.warn('Gemini multimodal PDF fallback failed:', e);
    }
    throw new Error(SCANNED_PDF_TOAST_MESSAGE);
  }

  return cleanText(fullText);
}

/**
 * Extracts plain text from a DOCX file using mammoth
 */
async function extractDocxText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result?.value || '';

  if (!text.trim()) {
    throw new Error('No readable text could be extracted from this Word document.');
  }

  return cleanText(text);
}

/**
 * Extracts transcribed notes, questions, and text from an uploaded picture/image via Gemini Vision OCR
 */
export async function extractImageText(file: File): Promise<{ text: string; title: string; imageBase64?: string }> {
  const base64DataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read picture file.'));
    reader.readAsDataURL(file);
  });

  const mimeType = file.type || 'image/jpeg';
  const res = await fetch('/api/gemini/parse-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64DataUrl,
      mimeType,
      filename: file.name,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to extract text from photo with Gemini Vision.');
  }

  const data = await res.json();
  return {
    text: data.text || '',
    title: data.title || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
    imageBase64: base64DataUrl,
  };
}

export interface ParsedDocumentResult {
  text: string;
  title: string;
  fileType: 'pdf' | 'image' | 'word' | 'text';
  fileName: string;
  previewUrl?: string;
  imageBase64?: string;
  size?: number;
}

/**
 * Comprehensive parser for documents (PDF, Word, Text, Markdown) and Pictures (Photos, Whiteboards, Scans)
 */
export async function parseUploadedDocumentOrPic(file: File): Promise<ParsedDocumentResult> {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const fallbackTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

  // 1. Pictures / Images (Photos of notes, textbooks, whiteboard, problem sets)
  if (
    type.startsWith('image/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.webp') ||
    name.endsWith('.bmp') ||
    name.endsWith('.heic') ||
    name.endsWith('.gif')
  ) {
    const { text, title, imageBase64 } = await extractImageText(file);
    let previewUrl: string | undefined;
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      previewUrl = imageBase64;
    }

    return {
      text,
      title: title || fallbackTitle,
      fileType: 'image',
      fileName: file.name,
      previewUrl,
      imageBase64,
      size: file.size,
    };
  }

  // 2. PDF Documents
  if (name.endsWith('.pdf') || type.includes('pdf')) {
    const text = await extractPdfText(file);
    return {
      text,
      title: fallbackTitle,
      fileType: 'pdf',
      fileName: file.name,
      size: file.size,
    };
  }

  // 3. Word (.docx) Documents
  if (name.endsWith('.docx') || type.includes('wordprocessingml.document')) {
    const text = await extractDocxText(file);
    return {
      text,
      title: fallbackTitle,
      fileType: 'word',
      fileName: file.name,
    };
  }

  // 4. RTF Documents
  if (name.endsWith('.rtf') || type.includes('rtf')) {
    const rawRtf = await file.text();
    return {
      text: cleanRtf(rawRtf),
      title: fallbackTitle,
      fileType: 'text',
      fileName: file.name,
    };
  }

  // 5. Default: Plain text, markdown, CSV, JSON, code files
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const decodedText = decoder.decode(buffer);

  if (isBinaryString(decodedText)) {
    if (decodedText.startsWith('%PDF')) {
      const text = await extractPdfText(file);
      return { text, title: fallbackTitle, fileType: 'pdf', fileName: file.name };
    }
    if (decodedText.startsWith('PK')) {
      try {
        const text = await extractDocxText(file);
        return { text, title: fallbackTitle, fileType: 'word', fileName: file.name };
      } catch {
        throw new Error('This file appears to be a compressed or binary archive. Please upload a PDF, image, Word, or text file.');
      }
    }
    throw new Error('Unable to read text from this binary file. Please upload a PDF, photo/picture, Word document, or text file.');
  }

  return {
    text: cleanText(decodedText),
    title: fallbackTitle,
    fileType: 'text',
    fileName: file.name,
  };
}

/**
 * Parses and extracts clean, human-readable plain text from uploaded files (.txt, .md, .pdf, .docx, images, etc.)
 */
export async function parseUploadedFile(file: File): Promise<string> {
  const result = await parseUploadedDocumentOrPic(file);
  return result.text;
}
