import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/**
 * Pre-processes text to ensure inline math ($...$, \(...\)) and block math ($$...$$, \[...\])
 * as well as Markdown headings (#, ##, ###) parse and render cleanly into LaTeX and styled headings.
 */
export function cleanLatexAndMarkdown(rawText: string): string {
  if (!rawText) return '';

  let text = rawText.replace(/\r\n/g, '\n');

  // 1. Transform block math \[ ... \] or \\[ ... \\] into $$ ... $$
  text = text.replace(/(?:\\{1,2}\[)([\s\S]*?)(?:\\{1,2}\])/g, (_, math) => {
    return `\n$$\n${math.trim()}\n$$\n`;
  });

  // 2. Transform inline math \( ... \) or \\( ... \\) into $ ... $
  text = text.replace(/(?:\\{1,2}\()([\s\S]*?)(?:\\{1,2}\))/g, (_, math) => {
    return `$${math.trim()}$`;
  });

  // 3. Fix inline dollar math with extra inner spaces (e.g., "$ x = 5 $" -> "$x = 5$")
  // remark-math requires no space after opening '$' and no space before closing '$'
  // Lookbehind-free regex for universal iOS Safari / older WebKit compatibility
  text = text.replace(/(^|[^$])\$\s+([^$\n]+?)\s+\$([^$]|$)/g, (_, prefix, math, suffix) => {
    return `${prefix}$${math.trim()}$${suffix}`;
  });

  // 4. Wrap standalone LaTeX matrix/aligned blocks in $$ if not already inside $$
  // Lookbehind-free regex for universal iOS Safari / older WebKit compatibility
  text = text.replace(
    /(^|[^$])(\s*\\begin\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix|align\*?|aligned|equation\*?|gather\*?)\}[\s\S]*?\\end\{(?:matrix|pmatrix|bmatrix|vmatrix|Vmatrix|align\*?|aligned|equation\*?|gather\*?)\}\s*)([^$]|$)/g,
    (_, prefix, env, suffix) => `${prefix}\n$$\n${env.trim()}\n$$\n${suffix}`
  );

  // 5. Ensure Markdown headings have space after '#' (e.g. '#Heading' -> '# Heading')
  text = text.replace(/^(#{1,6})([^\s#\n])/gm, '$1 $2');

  // 6. Ensure Markdown headings have an empty line preceding them if not at the start
  text = text.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

  return text;
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  compact = false,
}) => {
  const cleanContent = cleanLatexAndMarkdown(content);

  return (
    <div className={`studia-markdown ${compact ? 'text-xs' : 'text-xs sm:text-sm'} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1
              className={`font-black text-white tracking-tight border-b border-white/10 pb-1.5 ${
                compact ? 'text-sm mt-2 mb-1.5' : 'text-lg sm:text-xl mt-4 mb-2'
              }`}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={`font-bold text-indigo-300 tracking-tight ${
                compact ? 'text-xs sm:text-sm mt-2 mb-1' : 'text-base sm:text-lg mt-3.5 mb-2'
              }`}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={`font-semibold text-purple-300 tracking-tight ${
                compact ? 'text-xs mt-1.5 mb-1' : 'text-sm sm:text-base mt-3 mb-1.5'
              }`}
            >
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4
              className={`font-semibold text-zinc-200 ${
                compact ? 'text-xs mt-1 mb-0.5' : 'text-xs sm:text-sm mt-2.5 mb-1'
              }`}
            >
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className={`leading-relaxed text-zinc-200 last:mb-0 ${compact ? 'mb-1' : 'mb-2.5'}`}>
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul
              className={`list-disc list-outside ml-4 space-y-1 text-zinc-200 ${
                compact ? 'my-1' : 'my-2'
              }`}
            >
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol
              className={`list-decimal list-outside ml-4 space-y-1 text-zinc-200 ${
                compact ? 'my-1' : 'my-2'
              }`}
            >
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-indigo-500/70 pl-3 my-2 text-zinc-300 italic bg-indigo-500/5 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-zinc-800/90 text-indigo-300 font-mono text-[11px] border border-white/10"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <div className="my-2.5 rounded-xl bg-zinc-950 border border-white/10 p-3 overflow-x-auto text-[11px] font-mono text-zinc-200">
                <code {...props}>{children}</code>
              </div>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-white/10">
              <table className="w-full text-left text-xs border-collapse divide-y divide-white/10">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-white/5 text-indigo-200 font-mono text-[11px]">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-white/5">{children}</tbody>
          ),
          th: ({ children }) => (
            <th className="p-2 font-bold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="p-2 text-zinc-300">{children}</td>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-white">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-300">{children}</em>
          ),
          hr: () => <hr className="my-3 border-white/10" />,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
};
