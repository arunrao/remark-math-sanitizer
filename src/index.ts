/**
 * remark-math-sanitizer
 *
 * A pre-processing pipeline that fixes the most common ways LLM output
 * breaks remark-math/KaTeX before the text reaches the Markdown parser.
 *
 * Problems solved:
 *  1. Currency before math  — `$50 and $E=mc^2$` breaks remark-math's
 *     dollar-sign pairing; the opening `$` of the real equation gets escaped.
 *  2. Garbled prose in $…$  — LLMs wrap physics sentences in `$...$`, causing
 *     KaTeX to render each letter as an isolated math symbol.
 *  3. Bare LaTeX environments — `\begin{equation}…\end{equation}` emitted
 *     without `$$` delimiters is invisible to remark-math.
 *  4. `%` inside math       — KaTeX treats `%` as a comment, silently
 *     dropping everything after it on the line.
 *  5. Unicode in math spans — smart quotes and em-dashes inside `$…$` cause
 *     KaTeX strict-mode errors and visible error placeholders.
 *
 * Usage:
 *   import { sanitizeLatexContent } from 'remark-math-sanitizer';
 *   const clean = sanitizeLatexContent(llmOutput);
 *   // pass `clean` to ReactMarkdown with remarkMath + rehypeKatex
 */

// ─── Delimiter normalisation ──────────────────────────────────────────────────

/**
 * Converts `\(...\)` → `$...$` and `\[...\]` → `$$...$$`.
 *
 * remark-math only recognises dollar-sign delimiters by default.
 * LLMs frequently use the bracket form; this step normalises them.
 * Must run AFTER `escapeGarbledInlineMath` so that bracket-delimited spans
 * are not subjected to the prose-detection heuristics.
 */
export function normalizeLatexDelimiters(content: string): string {
  if (!content) return content;

  let normalized = content;

  // Display math first — must precede inline to avoid treating \[ as \(
  normalized = normalized.replace(/\\\[([\s\S]*?)\\\]/g, (_match, inner) => `$$${inner}$$`);

  // Inline math
  normalized = normalized.replace(/\\\(([\s\S]*?)\\\)/g, (_match, inner) => `$${inner}$`);

  return normalized;
}

// ─── Detection helper ─────────────────────────────────────────────────────────

/**
 * Returns `true` if the string contains any LaTeX/math expression.
 * Useful for conditionally enabling the math rendering pipeline.
 */
export function containsMathExpressions(content: string): boolean {
  if (!content) return false;

  const mathPatterns = [
    /\$\$[\s\S]+?\$\$/,         // Display math: $$...$$
    /\$[^$\n]+?\$/,              // Inline math: $...$
    /\\\[[\s\S]+?\\\]/,          // Display math: \[...\]
    /\\\([\s\S]+?\\\)/,          // Inline math: \(...\)
    /\\begin\{equation\}/,       // LaTeX environments
    /\\begin\{align\}/,
    /\\frac\{/,                  // Common LaTeX commands
    /\\sqrt\{/,
    /\\sum_/,
    /\\int_/,
    /\\partial/,
  ];

  return mathPatterns.some((pattern) => pattern.test(content));
}

// ─── Escaping utilities ───────────────────────────────────────────────────────

/**
 * Escapes standalone `$` characters that are not part of math expressions.
 * Conservative: only escapes `$` followed by whitespace or end-of-line.
 */
export function escapeLatexSpecialChars(content: string): string {
  if (!content) return content;
  return content.replace(/\$(?=\s|$)/g, '\\$');
}

/** Punctuation / boundaries that end a currency or unit token (incl. CJK). */
const CURRENCY_UNIT_BOUNDARY =
  '(?:\\s|[.,;:!?\\)\\]}"\'\\u3001\\uFF0C\\uFF01\\uFF1F\\u4e00-\\u9fff]|$)';

/**
 * Magnitude suffixes commonly attached to currency amounts (e.g. $5M, $10k).
 * Constrained to a known set so we don't escape real inline math like $5x$.
 */
const CURRENCY_MAGNITUDE = '(?:bn|mn|MM|[kKmMbBtT])';

/**
 * Escapes currency ranges like `$5-$10` or `$5–$10` so the first `$` is not
 * left dangling. remark-math would otherwise pair the two `$` and treat the
 * dash + second amount as inline math.
 */
export function escapeCurrencyRanges(content: string): string {
  if (!content) return content;

  return content.replace(
    /(?<![\\$])\$(\d[\d,]*(?:\.\d+)?(?:bn|mn|MM|[kKmMbBtT])?)(\s*[-\u2013\u2014~]\s*)\$(\d)/g,
    (_match, amount: string, mid: string, nextDigit: string) =>
      `\\$${amount}${mid}\\$${nextDigit}`
  );
}

/**
 * Escapes dollar signs used as currency or physical-unit prefixes so
 * remark-math does not interpret them as math delimiters.
 *
 * Matches:
 *  - Plain currency:           $8, $1,000.50
 *  - Magnitude amounts:        $5M, $10k, $3bn, $1.5B
 *  - Engine/displacement:      $4.0T, $2.0L, $4.0TV8
 *  - Prices before CJK text:   $50000元
 *
 * Does NOT escape `$$` (display math) or `$` in real math context.
 */
export function escapeCurrencyDollars(content: string): string {
  if (!content) return content;

  const unitBoundary = CURRENCY_UNIT_BOUNDARY;
  const pattern = new RegExp(
    [
      '(?<![\\\\$])\\$',
      '(?=',
      // Magnitude amount — e.g. $5M, $10k, $3bn, $1.5B
      `\\d[\\d,]*(?:\\.\\d+)?${CURRENCY_MAGNITUDE}${unitBoundary}`,
      '|',
      // Plain currency — number then boundary
      `\\d[\\d,]*(?:\\.\\d{1,2})?${unitBoundary}`,
      '|',
      // Displacement / unit suffix — e.g. $4.0T, $2.0L, $4.0TV8
      `\\d+\\.\\d+[A-Z][A-Za-z0-9]{0,3}${unitBoundary}`,
      '|',
      // Integer amount immediately before CJK (e.g. $50000元)
      '\\d[\\d,]+[\u4e00-\u9fff]',
      ')',
    ].join(''),
    'g'
  );

  return content.replace(pattern, '\\$');
}

/**
 * Escapes bare `%` inside math blocks so KaTeX does not treat it as a
 * line comment. `$50%$` would otherwise render only "50" and silently drop
 * trailing content.
 *
 * Only touches content inside `$...$` / `$$...$$`; prose percentages are
 * left untouched.
 */
export function escapeMathPercent(content: string): string {
  if (!content) return content;

  const MATH_BLOCK_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;
  return content.replace(MATH_BLOCK_RE, (block) =>
    block.replace(/(?<!\\)%/g, '\\%')
  );
}

/**
 * Replaces Unicode characters that KaTeX cannot render inside math spans.
 *
 * LLMs sometimes emit "smart" typographic quotes and similar Unicode
 * punctuation inside `$...$` or `$$...$$`. KaTeX logs a strict-mode warning
 * for every such character and renders a visible error placeholder.
 *
 * Only modifies content inside math blocks; prose punctuation is untouched.
 */
export function sanitizeMathUnicode(content: string): string {
  if (!content) return content;

  const replacements: Array<[RegExp, string]> = [
    [/\u201C/g, '"'],   // " LEFT DOUBLE QUOTATION MARK
    [/\u201D/g, '"'],   // " RIGHT DOUBLE QUOTATION MARK
    [/\u2018/g, "'"],   // ' LEFT SINGLE QUOTATION MARK
    [/\u2019/g, "'"],   // ' RIGHT SINGLE QUOTATION MARK
    [/\u2013/g, '-'],   // – EN DASH
    [/\u2014/g, '-'],   // — EM DASH
    [/\u2026/g, '...'], // … HORIZONTAL ELLIPSIS
  ];

  const MATH_BLOCK_RE = /(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$)/g;

  return content.replace(MATH_BLOCK_RE, (mathBlock) => {
    let sanitized = mathBlock;
    for (const [pattern, replacement] of replacements) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  });
}

// ─── Garbled-math detection ───────────────────────────────────────────────────

/**
 * Normalises common LLM encoding mistakes found inside a garbled `$…$` span
 * before the span is unwrapped to plain text.
 *
 * - `\33.7` → `33.7`  (backslash before digit is not valid LaTeX)
 * - `^\circ` → `°`    (degree symbol)
 * - `\circ`  → `°`
 */
function normalizeGarbledMathInner(inner: string): string {
  return inner
    .replace(/\\(\d)/g, '$1')
    .replace(/\^\\circ\b/g, '°')
    .replace(/\\circ\b/g, '°');
}

/**
 * Detects inline `$...$` spans that almost certainly contain prose rather than
 * real LaTeX — a common LLM error.
 *
 * Heuristics (conservative — only trigger when there is strong evidence):
 *  - Contains `**` or `__` (markdown bold markers)
 *  - Contains two or more long lowercase words AND span > 80 chars
 *  - Contains CJK characters (never valid inside `$...$`)
 *  - Contains two or more English prose words that are NOT LaTeX command
 *    names (e.g. "above", "the", "positive" survive the `\word` strip;
 *    `\cos` and `\theta` do not)
 *  - Contains no math tokens at all but has multiple words
 *
 * Intentionally preserves:
 *  - `$\cos\theta$`, `$\sin\theta$`, `$\alpha\beta$`  (all words are commands)
 *  - `$\text{above the line}$`  (explicit prose-in-math via \text)
 *  - `$A$`, `$\theta$`, `$v_0$`  (short variables)
 *
 * When triggered, both `$` delimiters are escaped to `\$` so remark-math
 * treats the span as plain text and KaTeX never sees it.
 */
export function escapeGarbledInlineMath(content: string): string {
  if (!content) return content;

  const INLINE_MATH_RE = /(?<!\$)\$(?!\$)((?:[^$\n])+?)\$(?!\$)/g;

  return content.replace(INLINE_MATH_RE, (match, inner: string) => {
    const isBoldMarkersInside = /\*\*|\* \*|__/.test(inner);
    const isProseInMath = inner.length > 80 && /[a-z]{4,}\s+[a-z]{4,}/.test(inner);
    const hasCjk = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(inner);
    const hasMathTokens = /[\\^_{}=+\d]/.test(inner);
    const wordCount = (inner.trim().match(/[A-Za-z]{3,}/g) || []).length;
    const isPlainProse = !hasMathTokens && /\s/.test(inner.trim()) && wordCount >= 2;
    const hasTextCommand = /\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|operatorname)\{/.test(inner);

    // Count English words that survive stripping LaTeX command names (\word).
    // $\cos\theta$ → strip → "" → 0 words (preserved).
    // $7.2 m at \33.7^\circ above the positive $ → strip \circ → "above the positive" → 3 words (escaped).
    const innerWithoutLatexCommands = inner.replace(/\\[A-Za-z]+/g, '');
    const proseWordCount = (innerWithoutLatexCommands.match(/[A-Za-z]{3,}/g) || []).length;
    const hasEnglishProseWords = proseWordCount >= 2;

    if (hasTextCommand) return match;
    if (!isBoldMarkersInside && !isProseInMath && !hasCjk && !isPlainProse && !hasEnglishProseWords) {
      return match;
    }

    const normalized = normalizeGarbledMathInner(inner);
    return `\\$${normalized}\\$`;
  });
}

// ─── Environment wrapping ─────────────────────────────────────────────────────

/**
 * Wraps bare LaTeX display environments in `$$...$$` so remark-math renders
 * them as display math.
 *
 * LLMs frequently emit `\begin{equation}...\end{equation}` without surrounding
 * `$$` delimiters. remark-math ignores these entirely, passing them through as
 * raw text. This step ensures they are treated as display math.
 *
 * Uses `(?<!\$)` / `(?!\$)` guards to avoid double-wrapping environments that
 * are already inside `$$...$$`.
 */
export function wrapBareLatexEnvironments(content: string): string {
  if (!content) return content;

  const ENV_NAMES =
    '(?:equation|align|aligned|gather|gathered|multline|displaymath|matrix|pmatrix|bmatrix|vmatrix|cases)';
  const ENV_RE = new RegExp(
    `(?<!\\$)(\\\\begin\\{${ENV_NAMES}\\*?\\}[\\s\\S]*?\\\\end\\{${ENV_NAMES}\\*?\\})(?!\\$)`,
    'g'
  );
  return content.replace(ENV_RE, (_m, env: string) => `$$\n${env}\n$$`);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Sanitizes LLM output for safe rendering with remark-math + rehype-katex.
 *
 * This is the single function most consumers need. It runs a multi-step
 * protect/restore pipeline that handles all five failure modes described at
 * the top of this file, in the correct order.
 *
 * **Pipeline steps:**
 *
 * 0. `wrapBareLatexEnvironments`   — wrap bare `\begin{equation}` in `$$`
 * 1. PROTECT real math spans       — replace `$…$` / `$$…$$` that contain
 *    LaTeX structural tokens (`\`, `^`, `_`, `=`) with null-byte placeholders
 *    so currency escaping cannot alter their delimiters
 * 2. `escapeGarbledInlineMath`     — escape prose/CJK/bold wrongly in `$…$`
 * 3. `escapeMathPercent`           — KaTeX `%` comment guard (unprotected spans)
 * 4. `escapeCurrencyRanges`        — `$5-$10` → `\$5-\$10`
 * 5. `escapeCurrencyDollars`       — `$50` → `\$50`
 * 6. RESTORE protected spans
 * 7. `escapeGarbledInlineMath`     — second pass: catches spans with `^`/`_`
 *    that are actually garbled prose (e.g. `$7.2 m at 33.7^\circ above…$`)
 * 8. `normalizeLatexDelimiters`    — `\(…\)` → `$…$`,  `\[…\]` → `$$…$$`
 * 9. `escapeMathPercent`           — second pass after delimiter conversion
 * 10. `sanitizeMathUnicode`        — replace KaTeX-invalid Unicode in math
 *
 * @param content - Raw LLM output (may be partial during streaming)
 * @returns Sanitized string ready for ReactMarkdown with math plugins
 *
 * @example
 * ```ts
 * import { sanitizeLatexContent } from 'remark-math-sanitizer';
 * import ReactMarkdown from 'react-markdown';
 * import remarkMath from 'remark-math';
 * import rehypeKatex from 'rehype-katex';
 *
 * const clean = sanitizeLatexContent(llmOutput);
 * return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{clean}</ReactMarkdown>;
 * ```
 */
export function sanitizeLatexContent(content: string): string {
  if (!content) return content;

  // Step 0: wrap bare LaTeX environments
  let result = wrapBareLatexEnvironments(content);

  // Step 0b: escape displacement/unit measurements that appear as paired $VALUE$
  // spans (e.g. "$6.2L$", "$4.0T$", "$4.0TV8$"). These have dollar signs on
  // both sides so remark-math treats them as inline math and KaTeX renders them
  // in italic math mode — wrong.
  //
  // Conservative scope: ONLY match when the first letter is UPPERCASE.
  // Uppercase letters are used for real-world units/displacement (L = litres,
  // T = turbocharged, V = V-engine, W = watts, K = Kelvin, etc.).
  // Common math variables (x, t, n, r, m) are lowercase, so they are NOT
  // matched and real math like $9.8t$ or $2.5x$ passes through unharmed.
  result = result.replace(
    /(?<!\$)\$([\d,]+\.\d+[A-Z][A-Za-z0-9]{0,3})\$(?!\$)/g,
    (_m, amount: string) => {
      // Never touch spans that contain real LaTeX structural tokens.
      if (/[\\^_=]/.test(amount)) return `$${amount}$`;
      return `\\$${amount}\\$`;
    }
  );

  // Step 1: protect real math spans from currency escaping.
  // Null bytes (\u0000) never appear in LLM text, so they are safe sentinels.
  // "Real math" requires at least one structural LaTeX token: \cmd, ^, _, =.
  // This is intentionally stricter than /\d[a-zA-Z]/ to avoid protecting
  // currency-range spans like $5M-$10M (no structural tokens).
  const spans: string[] = [];
  const MATH_TOKEN_RE = /[\\^_=]/;
  result = result.replace(
    /\$\$[\s\S]*?\$\$|(?<!\$)\$(?!\$)(?:[^$\n])+?\$(?!\$)/g,
    (m) => {
      if (MATH_TOKEN_RE.test(m)) {
        spans.push(m);
        return `\u0000MATH${spans.length - 1}\u0000`;
      }
      return m;
    }
  );

  // Steps 2–5: sanitize non-protected content
  result = escapeGarbledInlineMath(result);
  result = escapeMathPercent(result);
  result = escapeCurrencyRanges(result);
  result = escapeCurrencyDollars(result);

  // Step 6: restore protected math spans
  result = result.replace(/\u0000MATH(\d+)\u0000/g, (_m, i) => spans[+i]);

  // Step 7: second garbled-math pass — catches spans protected in step 1
  // that turn out to be physics prose (e.g. "$53.1^\circ above the positive $")
  result = escapeGarbledInlineMath(result);

  // Steps 8–10: delimiter conversion and math-internal sanitization
  result = normalizeLatexDelimiters(result);
  result = escapeMathPercent(result);
  result = sanitizeMathUnicode(result);

  return result;
}

// ─── LLM prompt snippet ───────────────────────────────────────────────────────

/**
 * System-prompt addition for instructing LLMs to emit well-formed LaTeX.
 * Append to your system prompts to reduce the need for sanitization.
 *
 * @example
 * ```ts
 * const systemPrompt = `You are a helpful assistant.\n\n${LATEX_FORMATTING_GUIDELINES}`;
 * ```
 */
export const LATEX_FORMATTING_GUIDELINES = `\
## Mathematical Expression Formatting

When writing mathematical expressions, please follow these guidelines:

1. **Inline Math**: Use single dollar signs for inline expressions.
   - Example: The formula $E = mc^2$ shows mass-energy equivalence.

2. **Display Math**: Use double dollar signs for standalone equations.
   - Example:
   $$
   \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
   $$

3. **Standard LaTeX Commands**:
   - Fractions: \\frac{numerator}{denominator}
   - Square roots: \\sqrt{expression}
   - Subscripts: x_i or x_{subscript}
   - Superscripts: x^2 or x^{power}
   - Greek letters: \\alpha, \\beta, \\gamma, etc.
   - Summations: \\sum_{i=1}^{n}
   - Integrals: \\int_a^b

4. **Do not** use currency dollar signs ($50, $5M) on the same line as math
   expressions — write "USD 50" or "50 dollars" in plain text instead.

5. **Do not** use \\( \\) or \\[ \\] delimiters — use $ and $$ instead.
`;
