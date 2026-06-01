// Generates `output.html` — a side-by-side comparison of unsanitized vs
// sanitized rendering for each failure-mode case. Open it in a browser to
// visually confirm the sanitizer is working.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

import { sanitizeLatexContent } from 'remark-math-sanitizer';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const katexCssPath = require.resolve('katex/dist/katex.min.css');
const katexCss = readFileSync(katexCssPath, 'utf8');

const cases = [
  { id: 1, name: 'Currency before math', input: 'Cost $50 then $E=mc^2$ done.' },
  { id: 2, name: 'Garbled prose in $...$', input: 'The displacement is $7.2 m at 33.7° above the positive $x$ direction.' },
  { id: 3, name: 'Bare LaTeX environment', input: 'See:\n\n\\begin{equation}E=mc^2\\end{equation}\n\nDone.' },
  { id: 4, name: '% inside math', input: 'We are $50\\%$ complete.' },
  { id: 5, name: 'Unicode in math spans', input: 'Let $\\alpha\u201D + 1$ be defined.' },
];

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, { strict: 'ignore', throwOnError: false })
  .use(rehypeStringify);

async function md2html(md) {
  return String(await processor.process(md));
}

const sections = [];
for (const c of cases) {
  const raw = await md2html(c.input);
  const clean = sanitizeLatexContent(c.input);
  const fixed = await md2html(clean);
  sections.push(`
    <section>
      <h2>Case ${c.id}: ${escapeHtml(c.name)}</h2>
      <pre class="input">${escapeHtml(c.input)}</pre>
      <div class="cols">
        <div class="col bad">
          <h3>Without sanitizer</h3>
          <div class="render">${raw}</div>
        </div>
        <div class="col good">
          <h3>With sanitizer</h3>
          <pre class="cleaned">${escapeHtml(clean)}</pre>
          <div class="render">${fixed}</div>
        </div>
      </div>
    </section>
  `);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>remark-math-sanitizer demo</title>
<style>${katexCss}</style>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { margin-bottom: 0.25rem; }
  .sub { color: #666; margin-bottom: 2rem; }
  section { border-top: 1px solid #ddd; padding: 1.25rem 0; }
  h2 { margin: 0 0 0.5rem; }
  pre.input, pre.cleaned { background: #f6f8fa; padding: 0.6rem 0.8rem; border-radius: 6px; overflow-x: auto; font-size: 12.5px; }
  pre.cleaned { background: #eef7ee; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.5rem; }
  .col { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; }
  .col.bad { border-color: #f3c2c2; background: #fff7f7; }
  .col.good { border-color: #b6e0b6; background: #f4fbf4; }
  .col h3 { margin: 0 0 0.5rem; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .render { background: white; padding: 0.6rem 0.8rem; border-radius: 4px; border: 1px solid #eee; }
</style>
</head>
<body>
  <h1>remark-math-sanitizer</h1>
  <p class="sub">Side-by-side: raw LLM output vs. sanitized output, both passed through <code>remark-math</code> + <code>rehype-katex</code>.</p>
  ${sections.join('\n')}
</body>
</html>`;

const outPath = join(__dirname, 'output.html');
writeFileSync(outPath, html);
console.log('Wrote', outPath);
