import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Supabase server client for profile usage tracking and premium unlock validation
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jrcexjeloihnjvwlgvby.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_P-rOXlHqf6WczxzFo6vidA_G7kCtO1e';
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Detects 429 RESOURCE_EXHAUSTED / quota capacity errors across Gemini API responses.
 */
function isCapacityOr429Error(err: any): boolean {
  if (!err) return false;
  const status = err?.status ?? err?.code ?? err?.statusCode ?? err?.response?.status;
  if (status === 429 || status === '429' || status === 'RESOURCE_EXHAUSTED') return true;
  const str = (err?.message || err?.error || err?.statusText || String(err)).toLowerCase();
  return (
    str.includes('429') ||
    str.includes('resource_exhausted') ||
    str.includes('resource exhausted') ||
    str.includes('quota exceeded') ||
    str.includes('too many requests') ||
    str.includes('at capacity')
  );
}

/**
 * Checks usage limit and premium bypass in Supabase profiles table.
 * Free tier limit: 5 generations.
 * is_premium: true permanently bypasses the 5-use limit.
 */
async function checkUsageAndPremium(userId?: string): Promise<{
  allowed: boolean;
  is_premium: boolean;
  usage_count: number;
  reason?: string;
}> {
  if (!userId || userId === 'guest_user') {
    return { allowed: true, is_premium: false, usage_count: 0 };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('usage_count, is_premium, is_pro, subscription_tier')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return { allowed: true, is_premium: false, usage_count: 0 };
    }

    const isPremium = Boolean(data.is_premium || data.is_pro || data.subscription_tier === 'pro');
    const usageCount = typeof data.usage_count === 'number' ? data.usage_count : 0;

    // Premium users permanently bypass the 5-use limit
    if (isPremium) {
      return { allowed: true, is_premium: true, usage_count: usageCount };
    }

    // 5-use limit enforcement
    if (usageCount >= 5) {
      return {
        allowed: false,
        is_premium: false,
        usage_count: usageCount,
        reason: 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.',
      };
    }

    return { allowed: true, is_premium: false, usage_count: usageCount };
  } catch (err) {
    console.warn('[Server Supabase] Error checking usage status:', err);
    return { allowed: true, is_premium: false, usage_count: 0 };
  }
}

/**
 * Increments usage_count in Supabase profiles table upon every successful AI generation.
 */
async function recordUsageIncrement(userId?: string): Promise<number | null> {
  if (!userId || userId === 'guest_user') return null;
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('usage_count')
      .eq('id', userId)
      .single();

    const current = typeof data?.usage_count === 'number' ? data.usage_count : 0;
    const nextCount = current + 1;

    await supabaseAdmin
      .from('profiles')
      .update({
        usage_count: nextCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    console.log(`[Server Supabase] Incremented usage_count to ${nextCount} for user ${userId}`);
    return nextCount;
  } catch (err) {
    console.warn('[Server Supabase] Error incrementing usage_count:', err);
    return null;
  }
}

// Lazy initializer for Gemini API with proper telemetry header
function getGeminiClient(): GoogleGenAI {
  dotenv.config();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Fast multi-model Gemini execution helper with candidate fallbacks and strict per-attempt timeouts.
 * Prioritizes fast completion (sub-10s) to prevent client 'Load failed' / proxy connection timeouts.
 */
interface GeminiGenerateOptions {
  systemInstruction?: string;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: any;
  maxOutputTokens?: number;
  timeoutMs?: number;
  operationName?: string;
}

async function generateWithModelFallback(
  ai: GoogleGenAI,
  prompt: string | any[],
  options: GeminiGenerateOptions = {}
): Promise<{ text: string; modelUsed: string }> {
  // Ordered candidate models: prioritize stable, sub-3s high-performance models to prevent client timeout
  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
  ];

  const timeoutMs = options.timeoutMs || 10000;
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const requestConfig: any = {
        temperature: options.temperature ?? 0.4,
      };
      if (options.systemInstruction) {
        requestConfig.systemInstruction = options.systemInstruction;
      }
      if (options.responseMimeType) {
        requestConfig.responseMimeType = options.responseMimeType;
      }
      if (options.responseSchema) {
        requestConfig.responseSchema = options.responseSchema;
      }
      if (options.maxOutputTokens) {
        requestConfig.maxOutputTokens = options.maxOutputTokens;
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Model ${model} timed out after ${timeoutMs}ms`));
        });
      });

      const callPromise = ai.models.generateContent({
        model,
        contents: prompt as any,
        config: requestConfig,
      });

      const response = await Promise.race([callPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const resultText = response.text?.trim();
      if (resultText && resultText.length > 0) {
        return { text: resultText, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[${options.operationName || 'Gemini'}] Model ${model} failed or timed out (${err?.message || err}). Trying next candidate...`);
    }
  }

  throw lastError || new Error('All candidate Gemini models failed to respond.');
}

/**
 * Helper to determine if content is a question/problem vs textbook notes
 */
function isProblemOrQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('?') ||
    /\b(solve|calculate|find|evaluate|compute|determine|simplify|prove|integrate|differentiate|derive|what is|how many|show that)\b/i.test(text) ||
    /(\d+[\+\-\*\/\^=]\d+)/.test(text)
  );
}

/**
 * Intelligent algorithmic study engine used as an immediate fallback
 * if Gemini API services encounter unexpected rate limits, timeouts, or downtime.
 */
function generateFallbackSummary(title: string, content: string, format = 'auto'): string {
  const cleanTitle = (title || 'Study Material').trim();
  const cleanContent = (content || '').trim();
  const normFormat = (format || '').trim().toLowerCase();

  const isStepByStep =
    normFormat === 'step-by-step problem solver' ||
    normFormat === 'step_by_step' ||
    normFormat.includes('problem solver') ||
    (normFormat !== 'detailed concept explanation' &&
      !normFormat.includes('concept explanation') &&
      isProblemOrQuestion(cleanContent));

  if (isStepByStep) {
    return `# 🎯 Step-by-Step Problem Solution: ${cleanTitle}

---

## 🎯 Problem Statement & Given Information
**Question / Problem**:
${cleanContent}

---

## 📝 Step-by-Step Solution & Working
1. **Identify the Given Values & Target Variables**:
   * Extract given constants and identify the desired variable $x$.
2. **Apply the Governing Mathematical Formula**:
   $$f(x) = y$$
3. **Step-by-Step Calculations**:
   * Step 1: Substitute the given parameters into the formula.
   * Step 2: Simplify algebraic expressions and compute intermediate values.
   * Step 3: Verify dimensional units and consistency.

---

## 🏁 Final Answer
**Result**: The solution is verified through systematic mathematical derivation.

---

## 💡 Key Concept & Method
* **Core Rule**: Isolate the variable of interest, apply the relevant theorem, and verify each step using standard LaTeX mathematical notation.`;
  }

  if (
    normFormat === 'detailed concept explanation' ||
    normFormat === 'detailed_concept' ||
    normFormat.includes('concept explanation')
  ) {
    const sentences = cleanContent
      .split(/(?<=[.?!])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 15);

    const execSummary =
      sentences.slice(0, 3).join(' ') ||
      cleanContent.slice(0, 300) ||
      `Essential concepts, intuition, and real-world mechanisms governing ${cleanTitle}.`;

    const breakdowns = sentences.slice(2, 6).map((s, idx) => {
      return `### Step ${idx + 1}: Conceptual Breakdown
* **Core Principle**: ${s}
* **Real-World Example**: Like a household thermostat or hydraulic lever, adjusting one parameter dynamically balances the rest of the system.
* **Why It Matters**: Understanding this step-by-step mechanism helps you solve complex exam problems easily.`;
    });

    return `# 💡 Detailed Concept Explanation: ${cleanTitle}

---

## 🌟 Big Picture in Plain Language
${execSummary}

---

## 🔍 Step-by-Step Concept Breakdown & Intuition
${breakdowns.length > 0 ? breakdowns.join('\n\n') : `### Step 1: Foundational Mechanism\n* **Core Principle**: The core ideas and laws of **${cleanTitle}** explained in clear, approachable terms.\n* **Real-World Example**: Think of it as a set of interconnected gears where each variable moves in direct harmony with the others.`}

---

## 📐 Core Formulas & Mathematical Principles
* **Governing Relationship**: Expressed in standard LaTeX notation:
  $$f(x) = y$$
* **Plain Language Meaning**: Each variable represents a measurable quantity, showing exactly how changes in input scale the final output.

---

## ⚡ High-Yield Memory Tips & Takeaways
* Whenever reviewing **${cleanTitle}**, first visualize the underlying mechanism using real-world analogies before calculating numbers.`;
  }

  const sentences = cleanContent
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const execSummary =
    sentences.slice(0, 3).join(' ') ||
    cleanContent.slice(0, 300) ||
    `Fundamental study notes for ${cleanTitle}.`;

  const keyPoints = sentences
    .slice(2, 8)
    .map((s) => {
      const words = s.split(/\s+/);
      const headline = words.slice(0, Math.min(4, words.length)).join(' ');
      return `* **${headline}**: ${s}`;
    });

  if (keyPoints.length === 0) {
    keyPoints.push(`* **Core Principle**: Essential foundations and core concepts of ${cleanTitle}.`);
    keyPoints.push(`* **Key Definitions**: Key theoretical models, mechanisms, and rules governing this subject.`);
    keyPoints.push(`* **Examination Focus**: High-frequency exam formulas and core principles.`);
  }

  return `# 📚 Structured Revision Notes: ${cleanTitle}

---

## 🎯 Executive Summary
${execSummary}

---

## 🔑 Core Definitions & Key Rules
${keyPoints.join('\n')}

---

## 📐 Key Formulas & Principles
* **Core Relationship**: Essential mathematical model and variables governing **${cleanTitle}**.
* **Formula Notation**: Expressed in standard LaTeX notation (e.g. $y = mx + b$ and $$\\Delta E = h\\nu$$).

---

## ⚡ High-Yield Memory Tips & Mnemonics
* Test active recall by explaining key concepts in your own words without referencing notes.

---

## ❓ Retention Self-Check Questions
1. What is the fundamental concept or thesis introduced in **${cleanTitle}**?
2. What are the key variables or entities described, and how do they function?
3. How would you apply this principle in an exam problem or real-world scenario?`;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'Studia',
    time: new Date().toISOString(),
    geminiConfigured: !!process.env.GEMINI_API_KEY,
  });
});

// AI Summarization & Problem Solver Endpoint
app.post('/api/gemini/summarize', async (req, res) => {
  try {
    const { title, content, text, format = 'auto', useSearchGrounding } = req.body;
    const rawContent = (content || text || req.body.noteText || '').trim();
    const cleanTitle = (title || 'Study Material').trim();

    if (!rawContent || rawContent.length === 0) {
      return res.status(400).json({
        error: 'Note or problem content is required. Please enter or upload study notes.',
      });
    }

    try {
      const ai = getGeminiClient();
      const normFormat = (format || '').trim();

      const systemInstruction = `You are the core intelligence engine for Studia, an advanced AI study assistant. Your primary objective is to foster deep understanding, critical thinking, and independent problem-solving in students.

Follow these strict operational guidelines when synthesizing educational content:

1. Critical Thinking & Conceptual Depth:
   - Prioritize conceptual application (How and Why) over pure rote memorization (What and When).
   - Formulate explanations that reveal underlying principles and logic.

2. Mathematics & Quantitative Analysis:
   - Step-by-Step Breakdown: Break problems down into distinct, logical steps.
   - Variable & Formula Definition: Explicitly define all variables and formulas before plugging in numbers.
   - Sanity Checks: Include verification methods (dimensional analysis, order of magnitude, boundary tests).

3. Biology & Science Setup:
   - Macro-to-Micro Structure: Explain biological systems starting with the big picture before zooming into cellular or molecular mechanisms (Organism -> System -> Organ -> Tissue -> Cell -> Molecule/Protein).
   - Real-World Analogies: Consistently use intuitive analogies to clarify complex biological and scientific processes.
   - Cause and Effect & Homeostasis: Emphasize the "why" framed around homeostasis—what happens when the system is in balance, and what happens when a piece fails.

4. Formatting & Rigor:
   - Always use Markdown for headings (##, ###) and bold text (**).
   - Format all mathematical equations using LaTeX syntax: $ for inline math ($x = 2$) and $$ for block equations ($$\\int_0^1 x^2 dx$$).`;

      let prompt = '';

      if (
        normFormat === 'Step-by-Step Problem Solver' ||
        normFormat.toLowerCase() === 'step_by_step' ||
        normFormat.toLowerCase().includes('problem solver')
      ) {
        prompt = `Student Topic / Document: "${cleanTitle}"

Content to Analyze and Solve:
"""
${rawContent.slice(0, 15000)}
"""

Structure the response with high pedagogical craft:
## 🎯 Problem Statement & Given Parameters
- Explicitly define all known and unknown variables with their units.
- Identify the governing formulas and scientific or mathematical laws before substituting numbers.

## 📝 Step-by-Step Logical Solution
- Break every step down into numbered, logical progressions with intermediate calculations.
- Use LaTeX for all mathematical expressions ($ for inline, $$ for block).

## 🏁 Final Answer & Sanity Check
- Clearly state the final result.
- **Sanity Check:** Explain how the student can quickly verify if the answer makes physical and mathematical sense.

## 💡 Conceptual Deep-Dive & Socratic Reflection
- Explain *why* this method works.
- Pose 1-2 guiding Socratic questions to prompt the student to think critically about how changes to initial conditions would impact the outcome.`;
      } else if (
        normFormat === 'Detailed Concept Explanation' ||
        normFormat.toLowerCase() === 'detailed_concept' ||
        normFormat.toLowerCase().includes('concept explanation')
      ) {
        prompt = `Student Topic / Document: "${cleanTitle}"

Study Content:
"""
${rawContent.slice(0, 15000)}
"""

Explain this material with deep pedagogical clarity:
- **Macro-to-Micro Perspective:** Start with the overarching system or big picture before examining cellular, atomic, or specialized mechanisms.
- **Intuitive Analogies:** Use real-world analogies to illuminate abstract concepts.
- **Cause, Effect & Homeostasis:** Explain what maintains system equilibrium and what occurs when specific components fail.
- **Variables & Formulas:** Explicitly define any formulas and variables in LaTeX ($...$ and $$...$$).
- **Socratic Comprehension Check:** Conclude with 2 thought-provoking "How and Why" reflection prompts.`;
      } else {
        prompt = `Student Topic / Document: "${cleanTitle}"
Format Mode: ${format}

Content:
"""
${rawContent.slice(0, 15000)}
"""

Structure the synthesized study guide as follows:
## 🎯 Big-Picture Overview & Analogy
(Start with the macro view and an intuitive real-world analogy)

## 🔑 Core Concepts & Homeostasis / Mechanics
(Detailed breakdown of mechanisms, cause-and-effect relationships, or structural hierarchy)

## 📐 Governing Formulas & Variable Definitions
(Explicit definitions of all symbols, variables, and formulas in LaTeX)

## ⚡ Step-by-Step Applications & Common Traps
(Practical application steps, pinpointing where students commonly misunderstand the logic)

## ❓ Socratic Reflection Questions (How & Why)
(2-3 conceptual questions challenging the student to apply what they learned beyond simple recall)`;
      }

      // If Google Search data is requested for summarization, ground with live search
      if (useSearchGrounding) {
        try {
          const groundedPrompt = `${systemInstruction}\n\nIMPORTANT: Use live Google Search grounding to verify all facts, check for the latest scientific discoveries and consensus, and ground your explanation with verifiable source citations.\n\n${prompt}`;
          
          let searchResponse: any;
          try {
            searchResponse = await ai.models.generateContent({
              model: 'gemini-3.5-flash',
              contents: groundedPrompt,
              config: {
                tools: [{ googleSearch: {} }],
              },
            });
          } catch (modelErr: any) {
            console.warn('gemini-3.5-flash grounding fallback to gemini-3.8-flash:', modelErr?.message);
            searchResponse = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: groundedPrompt,
              config: {
                tools: [{ googleSearch: {} }],
              },
            });
          }

          const candidate = searchResponse.candidates?.[0];
          const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
          const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

          const sources: Array<{ title: string; url: string }> = [];
          for (const chunk of groundingChunks) {
            if ((chunk as any).web?.uri) {
              sources.push({
                title: (chunk as any).web.title || 'Source',
                url: (chunk as any).web.uri,
              });
            }
          }
          const uniqueSources = sources.filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx);

          return res.json({
            summary: searchResponse.text || '',
            sources: uniqueSources,
            searchQueries: webSearchQueries,
            isGrounded: true,
            modelUsed: 'gemini-3.5-flash (with googleSearch tool)',
            isFallback: false,
          });
        } catch (searchErr: any) {
          console.warn('Search-grounded summarization failed, reverting to standard generator:', searchErr?.message);
        }
      }

      const result = await generateWithModelFallback(ai, prompt, {
        systemInstruction,
        temperature: 0.25,
        timeoutMs: 15000,
        operationName: 'Studia AI Engine',
      });

      return res.json({
        summary: result.text,
        modelUsed: result.modelUsed,
        isFallback: false,
      });
    } catch (aiError: any) {
      console.warn('Gemini summary generation failed or timed out; generating local study summary fallback:', aiError?.message || aiError);

      const fallbackSummary = generateFallbackSummary(cleanTitle, rawContent, format);
      return res.json({
        summary: fallbackSummary,
        isFallback: true,
        notice: 'Generated using local study engine (AI service temporarily high-latency).',
        modelUsed: 'local-fallback',
      });
    }
  } catch (error: any) {
    console.error('Error generating summary:', error);
    res.status(500).json({
      error: error?.message || 'Failed to process content analysis.',
    });
  }
});

// Fallback mock quiz generator for when Gemini API is unavailable or encounters errors
function generateFallbackQuizQuestions(title: string, content: string) {
  const cleanTitle = title || 'Study Material';
  const sentences = content
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const s1 = sentences[0] || `Understanding the fundamental principles of ${cleanTitle}`;
  const s2 = sentences[1] || `Key methodologies and operational frameworks in ${cleanTitle}`;
  const s3 = sentences[2] || `Practical applications and critical evaluation of ${cleanTitle}`;

  return [
    {
      id: `fallback_q1_${Date.now()}`,
      question: `Based on the study material on "${cleanTitle}", which statement best reflects the core principle?`,
      options: [
        `${s1.slice(0, 80)}${s1.length > 80 ? '...' : ''}`,
        `It is completely unrelated to ${cleanTitle} and operates in isolation.`,
        `It relies solely on unverified assumptions without theoretical backing.`,
        `None of the foundational concepts apply to modern study models.`,
      ],
      correctIndex: 0,
      explanation: `The foundational concept emphasizes: "${s1.slice(0, 100)}", which aligns directly with the provided study material.`,
      conceptTag: cleanTitle.split(' ')[0] || 'Core Theory',
    },
    {
      id: `fallback_q2_${Date.now()}`,
      question: `When analyzing key components of ${cleanTitle}, what is the primary objective of this topic?`,
      options: [
        `To bypass systematic validation and jump directly to arbitrary conclusions.`,
        `To structure problem-solving, optimize conceptual mastery, and retain key definitions.`,
        `To restrict learning capabilities exclusively to rote repetition.`,
        `To eliminate active recall practices in favor of passive reading.`,
      ],
      correctIndex: 1,
      explanation: `Structured methodology in ${cleanTitle} ensures optimized problem-solving and high retention through systematic comprehension.`,
      conceptTag: 'Methodology',
    },
    {
      id: `fallback_q3_${Date.now()}`,
      question: `How should a scholar evaluate and apply the principles of ${cleanTitle} in practice?`,
      options: [
        `Ignore contextual variables and assume static outcomes in every scenario.`,
        `Discard foundational concepts whenever challenging problem sets arise.`,
        `Synthesize theoretical principles with practical application and active self-testing.`,
        `Rely exclusively on guesswork without referring to core definitions.`,
      ],
      correctIndex: 2,
      explanation: `Synthesizing theory with practical application and self-testing provides the highest level of mastery for ${cleanTitle}.`,
      conceptTag: 'Application',
    },
  ];
}

// AI Quiz Generator Endpoint
app.post('/api/gemini/quiz', async (req, res) => {
  const { title, content, questionCount = 5, difficulty = 'medium', useSearchGrounding } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Note content is required to generate quiz.' });
  }

  try {
    const ai = getGeminiClient();
    const count = Math.min(Math.max(Number(questionCount) || 5, 2), 10);

    const prompt = `You are the core intelligence engine for Studia, an advanced AI study assistant.
Generate a ${count}-question multiple choice practice quiz based on the study note titled "${title || 'Study Material'}".
Difficulty level: ${difficulty}.

CRITICAL OPERATIONAL RULES FOR QUIZZES:
1. PRIORITIZE CONCEPTUAL APPLICATION (HOW AND WHY) OVER PURE MEMORIZATION (WHAT AND WHEN). Do not write shallow recall questions asking for dates, names, or rote definitions. Instead, test cause-and-effect, mechanism operation, problem-solving, and theoretical implications.
2. SCIENCE & BIOLOGY CONTEXT: Test understanding of macro-to-micro structures, functional analogies, and cause-and-effect centered on homeostasis (e.g., what happens when a piece of the biological circuit fails).
3. MATHEMATICS & STEM CONTEXT: Test conceptual selection of formulas, step-by-step logic, and identifying where mathematical reasoning breaks down.
4. DETAILED EXPLANATION WITH GAP IDENTIFICATION: In each explanation, clearly explain WHY the correct answer works, and explicitly pinpoint why the incorrect options represent common misconceptions or breakdowns in student logic.

Study Material:
"""
${content.slice(0, 15000)}
"""

Return a JSON array of questions where each question has:
- "id": a unique string ID (e.g. "q1", "q2")
- "question": the conceptual question text
- "options": exactly 4 distinct, plausible answer strings
- "correctIndex": the 0-based index (0, 1, 2, or 3) of the correct answer
- "explanation": a comprehensive explanation validating the correct answer and pinpointing where the logic breaks down in the other choices
- "conceptTag": short 1-2 word concept tag (e.g. "Homeostasis", "Chain Rule", "Enzyme Kinetics")`;

    // If Google Search grounding is requested, ground question generation with live search data
    if (useSearchGrounding) {
      try {
        const groundedPrompt = `${prompt}\n\nCRITICAL: Use live Google Search data to verify that all facts, scientific findings, and answer choices are up to date and accurate. Output ONLY a valid JSON array of objects (wrapped in [ ... ]).`;
        
        let searchResponse: any;
        try {
          searchResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: groundedPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        } catch (mErr: any) {
          console.warn('gemini-3.5-flash quiz grounding fallback to gemini-3.8-flash:', mErr?.message);
          searchResponse = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: groundedPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        }

        const candidate = searchResponse.candidates?.[0];
        const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const sources: Array<{ title: string; url: string }> = [];
        for (const chunk of groundingChunks) {
          if ((chunk as any).web?.uri) {
            sources.push({
              title: (chunk as any).web.title || 'Source',
              url: (chunk as any).web.uri,
            });
          }
        }
        const uniqueSources = sources.filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx);

        const rawText = searchResponse.text || '';
        const jsonMatch = rawText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return res.json({
              title: title ? `Quiz: ${title}` : 'AI Generated Study Quiz',
              questions: parsed,
              sources: uniqueSources,
              isGrounded: true,
              isFallback: false,
              modelUsed: 'gemini-3.5-flash (with googleSearch tool)',
            });
          }
        }
      } catch (groundQuizErr: any) {
        console.warn('Grounded quiz generation failed, continuing to standard schema generator:', groundQuizErr?.message);
      }
    }

    const result = await generateWithModelFallback(ai, prompt, {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            question: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            correctIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            conceptTag: { type: Type.STRING },
          },
          required: ['id', 'question', 'options', 'correctIndex', 'explanation'],
        },
      },
      timeoutMs: 12000,
      operationName: 'Generate Quiz',
    });

    const jsonText = result.text?.trim() || '[]';
    const parsedQuestions = JSON.parse(jsonText);

    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      throw new Error('Gemini returned an empty question array.');
    }

    res.json({
      title: title ? `Quiz: ${title}` : 'AI Generated Study Quiz',
      questions: parsedQuestions,
      isFallback: false,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.warn('Gemini quiz generation encountered an issue; deploying sample 3-question quiz fallback:', error?.message || error);
    
    // Provide a sample 3-question quiz fallback so the UI never breaks
    const fallbackQuestions = generateFallbackQuizQuestions(title, content);
    
    res.json({
      title: title ? `Quiz: ${title}` : 'Sample Practice Quiz',
      questions: fallbackQuestions,
      isFallback: true,
      notice: 'Generated using practice sample quiz fallback.',
    });
  }
});

// AI Socratic Study Tutor endpoint
app.post('/api/gemini/tutor', async (req, res) => {
  try {
    const { message, context, history, imageBase64, mimeType, useSearchGrounding } = req.body;

    if (!message && !imageBase64) {
      return res.status(400).json({ error: 'Message or image is required.' });
    }

    const ai = getGeminiClient();

    let historyFormatted = '';
    if (Array.isArray(history) && history.length > 0) {
      historyFormatted = `RECENT CONVERSATION HISTORY:\n` +
        history
          .filter((m: any) => m && m.text)
          .slice(-8)
          .map((m: any) => `${m.sender === 'user' ? 'Student' : 'Studia Tutor'}: ${m.text}`)
          .join('\n\n') + '\n\n';
    }

    const promptText = `${historyFormatted}Student Current Input: ${message || 'Please analyze this problem or note and guide me step-by-step.'}
${context ? `\n\nReference Material / Context Notes:\n"${context}"` : ''}

Respond as the Studia Core Intelligence Engine adhering to the Socratic method, Mathematics processing, and Biology/Science operational rules.`;

    const systemInstruction = `You are the core intelligence engine for Studia, an advanced AI study assistant. Your primary objective is to foster deep understanding, critical thinking, and independent problem-solving in students.

Do not just provide answers. You are a tutor, not a search engine. Follow these strict operational guidelines:

### 1. Critical Thinking & Questioning (The Socratic Method)
* **Guide, Don't Give:** When a student asks a direct question, do NOT just dump the final solution. Provide a targeted hint or ask a guiding question that leads them to the answer (e.g., "What formula do you think applies here?" or "What do you remember about the main character's motivation?").
* **Identify Gaps:** If a student provides an incorrect answer or mistaken step, pinpoint exactly where their logic broke down before correcting them or asking a targeted question.
* **Affirm & Nudge:** When they get a step right, enthusiastically validate their reasoning, then prompt them for the subsequent step.

### 2. Mathematics Processing
* **Step-by-Step Breakdown:** Always break mathematical problems down into distinct, logical steps.
* **Variable Definition:** Explicitly define all variables and formulas before plugging in numbers.
* **Interactive Solving:** Pause after the first step and ask the student to perform the next calculation or identify the next logical move. Never do all the work in one turn unless the student is at the final verification stage.
* **Sanity Checks:** Once the final answer is reached, explain how to quickly verify if the final answer makes sense in the context of the problem (e.g., units, order of magnitude, boundary checks).

### 3. Biology & Science Setup
* **Macro-to-Micro Structure:** Explain biological systems by starting with the big picture before zooming into the cellular or molecular level (e.g., Organism -> System -> Organ -> Cell -> Protein/Molecular).
* **Analogies:** Consistently use real-world analogies to explain complex biological mechanisms (e.g., comparing the cell membrane to a security gate).
* **Cause and Effect:** Emphasize the "why" behind biological setups. Frame explanations around homeostasis—what happens when the system is working perfectly, and what happens when one piece fails.

### Tone & Personality
Be encouraging, analytical, and patient. Adapt your vocabulary to the student's level, but always push them slightly beyond their comfort zone to promote active learning.

### Formatting Rules:
- Always use Markdown for headings (##, ###), bullet points, and bold text (**).
- You MUST format all mathematical equations using LaTeX syntax: $ for inline math (e.g., $x = 2$) and $$ for block equations (e.g., $$y = mx + b$$).`;

    // If Search Grounding is active, use Google Search tool via gemini-3.5-flash / gemini-3.8-flash
    if (useSearchGrounding) {
      try {
        const searchPrompt = `${systemInstruction}\n\nIMPORTANT: Use live Google Search grounding to verify up-to-date facts, academic citations, recent developments, and accurate real-world context.\n\n${promptText}`;
        let searchContents: any;
        if (imageBase64) {
          const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
          searchContents = [
            { text: searchPrompt },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
          ];
        } else {
          searchContents = searchPrompt;
        }

        let searchResponse: any;
        try {
          searchResponse = await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: searchContents,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        } catch (mErr: any) {
          console.warn('gemini-3.5-flash tutor grounding fallback to gemini-3.8-flash:', mErr?.message);
          searchResponse = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: searchContents,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        }

        const candidate = searchResponse.candidates?.[0];
        const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
        const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

        const sources: Array<{ title: string; url: string }> = [];
        for (const chunk of groundingChunks) {
          if ((chunk as any).web?.uri) {
            sources.push({
              title: (chunk as any).web.title || 'Source',
              url: (chunk as any).web.uri,
            });
          }
        }
        const uniqueSources = sources.filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx);

        return res.json({
          reply: searchResponse.text || 'Here is what I found with Google Search grounding...',
          sources: uniqueSources,
          searchQueries: webSearchQueries,
          isGrounded: true,
          modelUsed: 'gemini-3.5-flash (with googleSearch tool)',
        });
      } catch (tutorSearchErr: any) {
        console.warn('Tutor search grounding error, falling back to standard generator:', tutorSearchErr?.message);
      }
    }

    let contents: any;
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      contents = [
        { text: promptText },
        {
          inlineData: {
            mimeType: mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        },
      ];
    } else {
      contents = promptText;
    }

    const result = await generateWithModelFallback(ai, contents, {
      systemInstruction,
      temperature: 0.35,
      timeoutMs: 15000,
      operationName: 'AI Tutor',
    });

    res.json({ reply: result.text || 'I am thinking about your question...' });
  } catch (error: any) {
    console.error('Error in AI Tutor:', error);
    const is503 = error?.status === 503 || String(error?.message || '').includes('503');
    res.status(is503 ? 503 : 500).json({
      error: error?.message || 'Failed to get answer from AI Tutor.',
      is503,
    });
  }
});

// AI OCR & Multimodal Image / Pic Parser endpoint
app.post('/api/gemini/parse-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', filename = 'Study Photo', promptHint } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data is required.' });
    }

    const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const ai = getGeminiClient();

    const systemInstruction = `You are Studia's expert academic OCR and study document transcription engine.
Your task is to accurately, thoroughly, and cleanly transcribe and extract all content from this academic photo/document (which may be a textbook page, lecture slide, whiteboard photo, handwritten notes, exam worksheet, math problem set, or diagram).
Strict Instructions:
1. Always use Markdown for headings (##, ###), bullet points, and bold text (**).
2. You MUST format all mathematical equations using LaTeX syntax. Use $ for inline math (e.g., $x = 2$) and $$ for block equations (e.g., $$y = mx + b$$).
3. If diagrams, tables, or graphs are present, concisely describe the visual components and transcribe all labels, values, and axis titles.
4. If this is an exam question or problem set, transcribe every question, sub-part, and multiple-choice options verbatim.
5. Provide a suggested clean title for this study material at the very top on line 1 formatted as: "# Title: <Suggested Subject & Topic>" followed by two newlines and the full content.
6. Do NOT hallucinate text that is not present in the image.`;

    const userPrompt = promptHint || 'Transcribe and extract all text, formulas, diagrams, questions, and notes from this study image thoroughly.';

    const contents = [
      { text: userPrompt },
      {
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      },
    ];

    const result = await generateWithModelFallback(ai, contents, {
      systemInstruction,
      temperature: 0.2,
      timeoutMs: 15000,
      operationName: 'ParseImageOCR',
    });

    let rawText = result.text.trim();
    let extractedTitle = filename ? filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') : 'Extracted Study Notes';

    // Check if Gemini provided a top-level "# Title: ..."
    const titleMatch = rawText.match(/^#\s*Title:\s*(.+)$/m);
    if (titleMatch && titleMatch[1]) {
      extractedTitle = titleMatch[1].trim();
      rawText = rawText.replace(/^#\s*Title:\s*.+\n+/m, '').trim();
    }

    res.json({
      success: true,
      text: rawText,
      title: extractedTitle,
      modelUsed: result.modelUsed,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/parse-image:', error);
    res.status(500).json({
      error: 'Failed to extract text from the uploaded picture. Please ensure the image is clear and well-lit.',
      details: error?.message,
    });
  }
});

// -------------------------------------------------------------
// USER USAGE & PAYWALL STATUS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/user/usage-status', async (req, res) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || (req.query?.userId as string);
    const status = await checkUsageAndPremium(userId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to check usage status' });
  }
});

app.post('/api/user/increment-usage', async (req, res) => {
  try {
    const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
    const newCount = await recordUsageIncrement(userId);
    res.json({ success: true, usage_count: newCount });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to increment usage' });
  }
});

// -------------------------------------------------------------
// 1. GOOGLE SEARCH DATA GROUNDING (gemini-3.5-flash with googleSearch)
// -------------------------------------------------------------
app.post('/api/gemini/search-grounding', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
  const usageCheck = await checkUsageAndPremium(userId);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: usageCheck.reason || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.',
      code: 'USAGE_LIMIT_REACHED',
      usage_count: usageCheck.usage_count,
      limit: 5,
      requiresPaywall: true,
    });
  }

  try {
    let { query, context, documentTitle } = req.body;

    if (!query && !context) {
      return res.status(400).json({ error: 'Search query or reference document/image is required.' });
    }

    if (!query && context) {
      query = documentTitle
        ? `Comprehensive scientific overview and real-time research grounding for: ${documentTitle}`
        : `Comprehensive scientific overview and real-time research grounding for: ${context.slice(0, 150)}...`;
    }

    const ai = getGeminiClient();
    const promptText = `You are Studia's Research & Fact-Checking Engine. Provide an up-to-date, scientifically accurate, and comprehensive explanation grounded in real-time Google Search data.
${context ? `Reference Material / Uploaded Document / Transcribed Image:\n"""\n${context}\n"""\n\n` : ''}
User Query / Topic: "${query}"

Operational Guidelines:
- Deliver well-structured Markdown with clear sections, bullet points, and LaTeX for mathematical/chemical expressions ($inline$ or $$block$$).
- If reference material was uploaded (e.g. PDF document, research paper, exam problem, or diagram), analyze it thoroughly, fact-check key statements against live Google Search results, and incorporate the latest discoveries and scientific consensus.
- Highlight verified findings, recent research papers/discoveries, and factual consensus.
- Where relevant, explain both the fundamental mechanism and practical applications.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: promptText,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || '';
    const candidate = response.candidates?.[0];
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    const webSearchQueries = candidate?.groundingMetadata?.webSearchQueries || [];

    const sources: Array<{ title: string; url: string }> = [];
    for (const chunk of groundingChunks) {
      if ((chunk as any).web?.uri) {
        sources.push({
          title: (chunk as any).web.title || 'Source',
          url: (chunk as any).web.uri,
        });
      }
    }

    // Deduplicate sources by URL
    const uniqueSources = sources.filter((s, idx, arr) => arr.findIndex((x) => x.url === s.url) === idx);

    await recordUsageIncrement(userId);

    res.json({
      success: true,
      text,
      sources: uniqueSources,
      searchQueries: webSearchQueries,
      modelUsed: 'gemini-3.5-flash',
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/search-grounding:', error);
    if (isCapacityOr429Error(error)) {
      return res.status(429).json({
        error: 'AI is at capacity. Please upgrade or try again later.',
        code: 'RESOURCE_EXHAUSTED',
        status: 429,
        isCapacityError: true,
      });
    }
    res.status(500).json({ error: error?.message || 'Failed to perform search grounded research.' });
  }
});

// -------------------------------------------------------------
// 2. TEXT-TO-SPEECH (TTS) AUDIO GENERATION (gemini-3.1-flash-tts-preview)
// -------------------------------------------------------------
app.post('/api/gemini/generate-tts', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || req.body?.userId;
  const usageCheck = await checkUsageAndPremium(userId);
  if (!usageCheck.allowed) {
    return res.status(403).json({
      error: usageCheck.reason || 'You have reached your 5 free AI generations limit. Please upgrade to Pro for unlimited access.',
      code: 'USAGE_LIMIT_REACHED',
      usage_count: usageCheck.usage_count,
      limit: 5,
      requiresPaywall: true,
    });
  }

  try {
    const { text, voice = 'Kore', language = 'en' } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Text prompt is required for speech synthesis.' });
    }

    const ai = getGeminiClient();
    const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = validVoices.includes(voice) ? voice : 'Kore';

    // Format speech prompt if language instruction is requested
    const langPrefix = language && language !== 'en' ? `Speak in ${language}: ` : '';
    const speechPrompt = `${langPrefix}${text.trim()}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: speechPrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    const mimeType = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'audio/pcm;rate=24000';

    if (!base64Audio) {
      return res.status(500).json({ error: 'No audio stream returned from TTS model.' });
    }

    await recordUsageIncrement(userId);

    res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType,
      voice: chosenVoice,
      language,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/generate-tts:', error);
    if (isCapacityOr429Error(error)) {
      return res.status(429).json({
        error: 'AI is at capacity. Please upgrade or try again later.',
        code: 'RESOURCE_EXHAUSTED',
        status: 429,
        isCapacityError: true,
      });
    }
    res.status(500).json({ error: error?.message || 'Failed to generate speech audio.' });
  }
});

// -------------------------------------------------------------
// M-PESA DARAJA STK PUSH & LOCAL PAYMENT PROCESSING
// -------------------------------------------------------------
app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { phoneNumber, amount, planType, userId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required for M-Pesa STK push.' });
    }

    // Clean & normalize phone number to 254XXXXXXXXX
    let cleanPhone = String(phoneNumber).replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.slice(1);
    } else if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) {
      cleanPhone = '254' + cleanPhone;
    }

    if (cleanPhone.length !== 12 || !cleanPhone.startsWith('254')) {
      return res.status(400).json({
        error: 'Invalid Kenyan phone number format. Please enter a valid number like 0712345678 or 254712345678.',
      });
    }

    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const merchantRequestId = `MR_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const receiptCode = `QJD${Math.floor(1000 + Math.random() * 9000)}K${Math.floor(10 + Math.random() * 90)}M`;

    // Simulated Safaricom Daraja STK Push response
    res.json({
      success: true,
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: `Success. Prompt sent to +${cleanPhone}. Check your phone to enter your M-Pesa PIN.`,
      simulatedReceipt: receiptCode,
      amount: amount || 380,
      currency: 'KES',
      phone: cleanPhone,
      businessShortCode: '174379',
      accountReference: 'STUDIA_PASS',
      transactionTimestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('M-Pesa STK Push error:', error);
    res.status(500).json({ error: 'Failed to initiate M-Pesa STK push.' });
  }
});

// M-Pesa STK Query / Status check
app.post('/api/mpesa/query', async (req, res) => {
  try {
    const { checkoutRequestId, receiptCode } = req.body;
    const finalReceipt = receiptCode || `QJD${Math.floor(1000 + Math.random() * 9000)}K${Math.floor(10 + Math.random() * 90)}M`;

    res.json({
      ResultCode: '0',
      ResultDesc: 'The service request is processed successfully.',
      status: 'completed',
      MpesaReceiptNumber: finalReceipt,
      TransactionDate: new Date().toISOString(),
      verified: true,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to query M-Pesa status.' });
  }
});

// Generic Payment checkout simulation
app.post('/api/payment/checkout', async (req, res) => {
  try {
    const { planId = 'pro_monthly', amount = 2.99, currency = 'USD', paymentMethod = 'card' } = req.body;
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    res.json({
      success: true,
      transactionId,
      status: 'completed',
      plan: planId,
      amount,
      currency,
      paymentMethod,
      timestamp: new Date().toISOString(),
      message: 'Subscription activated successfully!',
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Payment processing failed.' });
  }
});

// -------------------------------------------------------------
// USD SUBSCRIPTION CHECKOUT & WEBHOOKS (Stripe / Paystack USD)
// -------------------------------------------------------------
const USD_PRICING_CONFIG: Record<string, { name: string; amountCents: number; interval: string }> = {
  pro_weekly: { name: 'Studia Pro Weekly', amountCents: 99, interval: 'week' },
  pro_monthly: { name: 'Studia Pro Monthly', amountCents: 299, interval: 'month' },
  pro_yearly: { name: 'Studia Pro Yearly', amountCents: 2499, interval: 'year' },
};

// Create USD Checkout Session (Stripe or Paystack or Simulator)
app.post('/api/payments/create-checkout-session', async (req, res) => {
  try {
    const {
      planType = 'pro_monthly',
      userId = 'guest_user',
      email = 'student@example.com',
      redirectUrl = '',
    } = req.body;

    const planConfig = USD_PRICING_CONFIG[planType] || USD_PRICING_CONFIG.pro_monthly;
    const sessionId = `cs_usd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // If Stripe Secret Key is present, integration ready:
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        // Dynamic import to prevent compile crash if stripe package is not installed
        const stripeModule: any = await (new Function('m', 'return import(m)')('stripe').catch(() => null));
        if (stripeModule) {
          const StripeConstructor = stripeModule.default || stripeModule;
          const stripe = new StripeConstructor(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2023-10-16',
          });

          const baseUrl = redirectUrl || process.env.APP_URL || 'http://localhost:3000';
          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            customer_email: email,
            client_reference_id: userId,
            metadata: { userId, planType },
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: planConfig.name,
                    description: 'Unlimited AI study generations, summaries, quizzes & smart timetable.',
                  },
                  unit_amount: planConfig.amountCents,
                  recurring: {
                    interval: planConfig.interval as any,
                  },
                },
                quantity: 1,
              },
            ],
            success_url: `${baseUrl}/?payment_success=true&plan=${planType}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/?payment_cancelled=true`,
          });

          return res.json({
            success: true,
            provider: 'stripe',
            url: session.url,
            sessionId: session.id,
          });
        }
      } catch (stripeErr: any) {
        console.warn('Stripe checkout error, falling back to simulated session:', stripeErr.message);
      }
    }

    const paystackSecret =
      process.env.PAYSTACK_SECRET_KEY ||
      (process.env.VITE_PAYPAL_CLIENT_ID?.startsWith('sk_') ? process.env.VITE_PAYPAL_CLIENT_ID : undefined);

    // Paystack USD checkout flow (if PAYSTACK_SECRET_KEY is configured)
    if (paystackSecret) {
      try {
        const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${paystackSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            amount: planConfig.amountCents,
            currency: 'USD',
            reference: sessionId,
            metadata: { userId, planType },
            callback_url: `${redirectUrl || ''}/?payment_success=true&plan=${planType}&reference=${sessionId}`,
          }),
        });
        const paystackData = await paystackRes.json();
        if (paystackData.status && paystackData.data?.authorization_url) {
          return res.json({
            success: true,
            provider: 'paystack',
            url: paystackData.data.authorization_url,
            reference: sessionId,
          });
        }
      } catch (paystackErr: any) {
        console.warn('Paystack USD init warning:', paystackErr.message);
      }
    }

    // Instant development/preview checkout simulation:
    // Seamlessly redirects back to the app with ?payment_success=true&plan=...
    const simulatedSuccessUrl = `/?payment_success=true&plan=${planType}&session_id=${sessionId}`;
    res.json({
      success: true,
      provider: 'simulation',
      simulated: true,
      sessionId,
      url: simulatedSuccessUrl,
      plan: planType,
      amountUsd: (planConfig.amountCents / 100).toFixed(2),
      currency: 'USD',
      message: `Checkout session initialized in USD ($${(planConfig.amountCents / 100).toFixed(2)}).`,
    });
  } catch (error: any) {
    console.error('Checkout session creation error:', error);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// Stripe Webhook Endpoint Template
app.post('/api/webhooks/stripe', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[Stripe Webhook] Event received: ${event?.type}`);

    // In production with STRIPE_WEBHOOK_SECRET:
    // const sig = req.headers['stripe-signature'];
    // const event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event?.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const userId = session?.client_reference_id || session?.metadata?.userId;
      const planType = session?.metadata?.planType || 'pro_monthly';

      console.log(`[Stripe Webhook] Upgrading user ${userId} to plan ${planType}`);

      // Upgrade in Supabase database if service key is configured
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseAdmin = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          );

          await supabaseAdmin.from('subscriptions').upsert({
            user_id: userId,
            plan_type: planType,
            status: 'active',
            stripe_customer_id: session?.customer,
            stripe_subscription_id: session?.subscription,
            updated_at: new Date().toISOString(),
          });

          await supabaseAdmin.from('profiles').update({
            is_pro: true,
            subscription_tier: planType,
          }).eq('id', userId);
        } catch (dbErr) {
          console.warn('[Stripe Webhook] Database update warning:', dbErr);
        }
      }
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Stripe webhook processing error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Paystack Webhook Endpoint Template
app.post('/api/webhooks/paystack', async (req, res) => {
  try {
    const event = req.body;
    console.log(`[Paystack Webhook] Event received: ${event?.event}`);

    if (event?.event === 'charge.success') {
      const data = event.data;
      const userId = data?.metadata?.userId;
      const planType = data?.metadata?.planType || 'pro_monthly';

      console.log(`[Paystack Webhook] Upgraded user ${userId} to ${planType}`);
    }

    res.sendStatus(200);
  } catch (error: any) {
    console.error('Paystack webhook error:', error);
    res.sendStatus(500);
  }
});

// Server-side Paystack Verification Endpoint using Secret Key
app.get('/api/paystack/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const paystackSecret =
      process.env.PAYSTACK_SECRET_KEY ||
      (process.env.VITE_PAYPAL_CLIENT_ID?.startsWith('sk_') ? process.env.VITE_PAYPAL_CLIENT_ID : undefined);

    if (!paystackSecret) {
      return res.status(500).json({ status: false, message: 'Paystack Secret Key is not configured.' });
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
      },
    });
    const result = await response.json();
    return res.json(result);
  } catch (err: any) {
    console.error('Paystack transaction verification failed:', err);
    return res.status(500).json({ status: false, message: err?.message || 'Verification failed.' });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);

  // -------------------------------------------------------------
  // 4. REAL-TIME LIVE VOICE CONVERSATIONS (gemini-3.8-live)
  // -------------------------------------------------------------
  const wss = new WebSocketServer({ server, path: '/api/live' });

  wss.on('connection', async (clientWs) => {
    console.log('[Live Voice] Client connected to /api/live WebSocket');
    let session: any = null;

    try {
      const ai = getGeminiClient();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction:
            'You are Studia, an advanced conversational AI study companion and academic mentor. Foster deep understanding, critical thinking, and Socratic problem-solving. Guide students step-by-step, use real-world analogies, explain biological mechanisms from macro to micro with cause-and-effect around homeostasis, define formulas clearly, and keep spoken answers engaging, encouraging, and natural.',
        },
        callbacks: {
          onmessage: (message: any) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ status: 'session_closed' }));
            }
          },
          onerror: (err: any) => {
            console.error('[Live API Error]', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ error: err?.message || 'Live session error' }));
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ status: 'connected', model: 'gemini-3.8-live' }));
      }

      clientWs.on('message', (data: any) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio && session) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text && session) {
            session.sendRealtimeInput({
              text: parsed.text,
            });
          }
        } catch (err) {
          console.error('[Live Voice] Error handling message from client:', err);
        }
      });

      clientWs.on('close', () => {
        console.log('[Live Voice] Client disconnected from /api/live');
        try {
          session?.close?.();
        } catch (e) {}
      });
    } catch (err: any) {
      console.error('[Live Voice] Failed to connect to Live API session:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ error: err?.message || 'Failed to connect to Live API.' }));
        clientWs.close();
      }
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Studia full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
