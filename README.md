# remark-math-sanitizer

A pre-processing pipeline that fixes the most common ways LLM output breaks [remark-math](https://github.com/remarkjs/remark-math) / [KaTeX](https://katex.org/) rendering.

[![npm version](https://img.shields.io/npm/v/remark-math-sanitizer)](https://www.npmjs.com/package/remark-math-sanitizer)
[![license](https://img.shields.io/npm/l/remark-math-sanitizer)](./LICENSE)

---

## The problem

LLMs produce markdown with math that consistently breaks standard remark-math in five ways:

| # | Failure mode | Example input | What breaks |
|---|---|---|---|
| 1 | **Currency before math** | `Cost $50 then $E=mc^2$ done.` | The `$` on `$50` steals the opening delimiter of `$E=mc^2$`, leaving a dangling `$` — KaTeX errors out |
| 2 | **Garbled prose in `$...$`** | `displacement is $7.2 m at 33.7° above the positive $x$` | KaTeX renders each English word as spaced italic characters |
| 3 | **Bare LaTeX environments** | `\begin{equation}E=mc^2\end{equation}` | remark-math ignores environments without surrounding `$$` delimiters |
| 4 | **`%` inside math** | `$50%$ complete` | KaTeX treats `%` as a comment and silently drops everything after it |
| 5 | **Unicode in math spans** | `$\alpha" + 1$` | KaTeX strict-mode errors on smart quotes, em-dashes, etc. |

None of these are fixable by upgrading remark-math or switching to remark-math-extended — they happen in the text before it reaches the parser.

---

## Install

Install this package and its peer dependencies:

```sh
npm install remark-math-sanitizer react-markdown remark-math rehype-katex katex
```

No runtime dependencies of its own. ESM only (`"type": "module"`).

---

## Usage

### Basic — ReactMarkdown

The most common setup. Call `sanitizeLatexContent` on the LLM output before passing it to `ReactMarkdown`, then load the KaTeX stylesheet once in your app shell.

```tsx
// app/layout.tsx (or _app.tsx / index.html)
import 'katex/dist/katex.min.css';
```

```tsx
// components/ChatMessage.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sanitizeLatexContent } from 'remark-math-sanitizer';

interface ChatMessageProps {
  content: string;
}

export function ChatMessage({ content }: ChatMessageProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {sanitizeLatexContent(content)}
    </ReactMarkdown>
  );
}
```

---

### Streaming (LLM token-by-token)

`sanitizeLatexContent` is a pure synchronous function with no state, so you can safely call it on the **accumulated string** at every token. React will only re-render changed nodes.

```tsx
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sanitizeLatexContent } from 'remark-math-sanitizer';

export function StreamingMessage() {
  const [raw, setRaw] = useState('');

  async function startStream() {
    const res = await fetch('/api/chat', { method: 'POST' });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      setRaw(accumulated);          // store raw; sanitize at render time
    }
  }

  return (
    <>
      <button onClick={startStream}>Ask</button>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {sanitizeLatexContent(raw)}  {/* called on every render */}
      </ReactMarkdown>
    </>
  );
}
```

> **Tip:** If you memoize the sanitized output, key the memo on the raw string:
> ```ts
> const clean = useMemo(() => sanitizeLatexContent(raw), [raw]);
> ```

---

### Next.js App Router

Load the KaTeX stylesheet in your root layout and use a Client Component for the message renderer (ReactMarkdown needs browser APIs).

```tsx
// app/layout.tsx
import 'katex/dist/katex.min.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// components/message.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { sanitizeLatexContent } from 'remark-math-sanitizer';

export function Message({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {sanitizeLatexContent(content)}
    </ReactMarkdown>
  );
}
```

---

### Without React — unified / remark pipeline

Works with any unified-based pipeline (Astro, Vite, Node.js scripts, etc.):

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { sanitizeLatexContent } from 'remark-math-sanitizer';

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify);

const html = String(await processor.process(sanitizeLatexContent(llmOutput)));
```

---

### Reducing sanitization with the system prompt

Add `LATEX_FORMATTING_GUIDELINES` to your LLM system prompt to instruct the model to emit well-formed LaTeX from the start:

```ts
import { LATEX_FORMATTING_GUIDELINES } from 'remark-math-sanitizer';

const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: `You are a helpful assistant.\n\n${LATEX_FORMATTING_GUIDELINES}`,
    },
    { role: 'user', content: userMessage },
  ],
});
```

This tells the model to use `$…$` / `$$…$$` delimiters, avoid mixing currency and math on the same line, and use standard LaTeX command names — reducing how much the sanitizer needs to fix at render time.

---

## Exports

| Export | Description |
|---|---|
| `sanitizeLatexContent(str)` | **Main function.** Runs the full 10-step pipeline. |
| `wrapBareLatexEnvironments(str)` | Wraps `\begin{equation}…\end{equation}` (and other display environments) in `$$…$$`. |
| `escapeGarbledInlineMath(str)` | Detects and escapes `$…$` spans that contain prose rather than LaTeX. |
| `escapeCurrencyDollars(str)` | Escapes `$50`, `$5M`, `$4.0T` etc. so they are not parsed as math. |
| `escapeCurrencyRanges(str)` | Escapes both `$` in ranges like `$5–$10`. |
| `escapeMathPercent(str)` | Escapes `%` inside `$…$` so KaTeX doesn't treat it as a comment. |
| `sanitizeMathUnicode(str)` | Replaces smart quotes and Unicode dashes inside math spans with ASCII. |
| `normalizeLatexDelimiters(str)` | Converts `\(…\)` → `$…$` and `\[…\]` → `$$…$$`. |
| `containsMathExpressions(str)` | Returns `true` if the string contains any math expression. |
| `escapeLatexSpecialChars(str)` | Escapes standalone `$` followed by whitespace. |
| `LATEX_FORMATTING_GUIDELINES` | System-prompt snippet instructing LLMs to emit well-formed LaTeX. |

---

## Pipeline diagram

`sanitizeLatexContent` runs these steps in order:

```
LLM output
    │
    ▼
0.  wrapBareLatexEnvironments
    └─ \begin{equation}…\end{equation} → $$\n\begin{equation}…\end{equation}\n$$
    │
    ▼
1.  PROTECT real math spans
    └─ $…$ containing \cmd / ^ / _ / = → \0MATHn\0 placeholder
    │
    ▼
2.  escapeGarbledInlineMath   (on non-protected content)
    └─ prose/CJK/bold inside $…$ → \$…\$
    │
    ▼
3.  escapeMathPercent          (on non-protected content)
4.  escapeCurrencyRanges       (safe: real math is shielded)
5.  escapeCurrencyDollars      (safe: real math is shielded)
    │
    ▼
6.  RESTORE protected spans
    └─ \0MATHn\0 → original $…$
    │
    ▼
7.  escapeGarbledInlineMath   (second pass — catches protected-but-garbled spans,
    │                          e.g. $7.2 m at 33.7^\circ above the positive $)
    ▼
8.  normalizeLatexDelimiters   \(…\) → $…$   \[…\] → $$…$$
9.  escapeMathPercent          (second pass — catches % in newly-created spans)
10. sanitizeMathUnicode        (replace Unicode in all math spans)
    │
    ▼
  sanitized output  →  ReactMarkdown + remarkMath + rehypeKatex
```

The double-pass on `escapeGarbledInlineMath` (steps 2 and 7) is necessary because step 1 must protect spans that *look* like math (contain `^` or `_`) before currency escaping runs, but some of those spans turn out to be physics prose (e.g. `$7.2 m at 33.7^\circ above the positive $`). Step 7 catches those after restoration.

---

## Comparison with remark-math

| Capability | remark-math | remark-math-sanitizer |
|---|:---:|:---:|
| Parse `$…$` / `$$…$$` as math | ✅ | — *(still uses remark-math for parsing)* |
| Recognise `\(…\)` / `\[…\]` delimiters | ❌ | ✅ *(normalises to `$…$` first)* |
| Fix currency-before-math parity bug | ❌ | ✅ |
| Detect garbled prose in `$…$` | ❌ | ✅ |
| Wrap bare `\begin{equation}` | ❌ | ✅ |
| Escape `%` inside math | ❌ | ✅ |
| Sanitize Unicode in math spans | ❌ | ✅ |
| No runtime dependencies | ✅ | ✅ |

`remark-math-sanitizer` is a **pre-processor**, not a replacement for `remark-math`. You still need `remark-math` + `rehype-katex` in your render stack — this library just makes sure the text fed to them is correct.

---

## Using the system-prompt snippet

```ts
import { LATEX_FORMATTING_GUIDELINES } from 'remark-math-sanitizer';

const systemPrompt = `You are a helpful assistant.\n\n${LATEX_FORMATTING_GUIDELINES}`;
```

This instructs the LLM to use `$…$` / `$$…$$` delimiters, avoid mixing currency and math on the same line, and use proper LaTeX command names — reducing the amount of sanitization needed at render time.

---

## Contributing

```sh
git clone https://github.com/arunrao/remark-math-sanitizer
cd remark-math-sanitizer
npm install
npm test          # run tests with vitest
npm run build     # compile to dist/
```

All new heuristics in `escapeGarbledInlineMath` must include a failing test case that demonstrates the real-world LLM output being fixed, and a passing test case confirming the nearest valid math expression is still preserved.

---

## License

[MIT](./LICENSE) © Arun Rao
