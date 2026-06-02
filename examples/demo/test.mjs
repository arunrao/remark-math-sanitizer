// Sanity-check that `remark-math-sanitizer` from npm fixes the five
// documented failure modes. Prints PASS/FAIL per case.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  sanitizeLatexContent,
  containsMathExpressions,
  normalizeLatexDelimiters,
  wrapBareLatexEnvironments,
} from 'remark-math-sanitizer';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

const cases = [
  {
    id: 1,
    name: 'Currency before math',
    input: 'Cost $50 then $E=mc^2$ done.',
    // After sanitization, the $50 must be escaped and $E=mc^2$ must remain math.
    expect: (clean, html) =>
      clean.includes('&#36;50') &&
      clean.includes('$E=mc^2$') &&
      html.includes('class="katex"'),
  },
  {
    id: 2,
    name: 'Garbled prose in $...$',
    input:
      'The displacement is $7.2 m at 33.7° above the positive $x$ direction.',
    // The garbled span must be escaped (both $ become \$), so KaTeX never sees it.
    // Must NOT double-escape (\\$ would render as a literal backslash + open math).
    expect: (clean, html) =>
      clean.includes('&#36;7.2 m at 33.7') &&
      !clean.includes('&#36;&#36;') &&
      !html.includes('katex-error') &&
      !html.includes('class="katex"'),
  },
  {
    id: 3,
    name: 'Bare LaTeX environment',
    input: 'See:\n\n\\begin{equation}E=mc^2\\end{equation}\n\nDone.',
    // Must be wrapped in $$...$$ and produce a KaTeX display math block.
    expect: (clean, html) =>
      /\$\$[\s\S]*\\begin\{equation\}/.test(clean) &&
      html.includes('katex-display'),
  },
  {
    id: 4,
    name: '% inside math',
    input: 'We are $50\\%$ complete.',
    // The % must be escaped inside math; KaTeX should render "50%".
    expect: (clean, html) =>
      clean.includes('$50\\%$') &&
      html.includes('class="katex"') &&
      !html.includes('katex-error'),
  },
  {
    id: 5,
    name: 'Unicode in math spans',
    input: 'Let $\\alpha\u201D + 1$ be defined.',
    // The smart quote must be normalized to ASCII " before KaTeX sees it.
    expect: (clean, html) =>
      !clean.includes('\u201D') &&
      clean.includes('"') &&
      !html.includes('katex-error'),
  },
];

const processor = unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, { strict: 'ignore', throwOnError: false })
  .use(rehypeStringify);

async function toHtml(md) {
  const file = await processor.process(md);
  return String(file);
}

let pass = 0;
let fail = 0;

console.log('remark-math-sanitizer demo — five failure modes\n');
const __dirname = dirname(fileURLToPath(import.meta.url));
const _pkgPath = join(__dirname, 'node_modules', 'remark-math-sanitizer', 'package.json');
console.log('package version:', JSON.parse(readFileSync(_pkgPath, 'utf8')).version);
console.log('');

for (const c of cases) {
  const clean = sanitizeLatexContent(c.input);
  const html = await toHtml(clean);
  let ok = false;
  try {
    ok = c.expect(clean, html);
  } catch (err) {
    ok = false;
  }
  if (ok) pass++;
  else fail++;

  console.log(`Case ${c.id}: ${c.name} — ${ok ? 'PASS' : 'FAIL'}`);
  console.log('  input:     ', JSON.stringify(c.input));
  console.log('  sanitized: ', JSON.stringify(clean));
  if (!ok) {
    console.log('  html:      ', html.slice(0, 240).replace(/\n/g, ' ') + (html.length > 240 ? '...' : ''));
  }
  console.log('');
}

// Bonus sanity checks on the smaller exported helpers
console.log('Helper sanity checks:');
console.log('  containsMathExpressions("hello") =', containsMathExpressions('hello'));
console.log('  containsMathExpressions("$x^2$") =', containsMathExpressions('$x^2$'));
console.log('  normalizeLatexDelimiters("\\\\(x\\\\)") =', JSON.stringify(normalizeLatexDelimiters('\\(x\\)')));
console.log('  wrapBareLatexEnvironments wraps equation:',
  wrapBareLatexEnvironments('\\begin{equation}x\\end{equation}').startsWith('$$'));
console.log('');

console.log(`Result: ${pass} passed, ${fail} failed (of ${cases.length})`);
process.exit(fail === 0 ? 0 : 1);
