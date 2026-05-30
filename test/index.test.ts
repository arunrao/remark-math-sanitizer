import { describe, it, expect } from 'vitest';
import {
  escapeCurrencyDollars,
  escapeCurrencyRanges,
  escapeGarbledInlineMath,
  escapeMathPercent,
  sanitizeLatexContent,
  sanitizeMathUnicode,
  normalizeLatexDelimiters,
  containsMathExpressions,
  wrapBareLatexEnvironments,
} from '../src/index.js';

// ─── escapeCurrencyDollars ────────────────────────────────────────────────────

describe('escapeCurrencyDollars', () => {
  it('escapes plain currency amounts', () => {
    expect(escapeCurrencyDollars('Costs $8 per month.')).toBe('Costs \\$8 per month.');
    expect(escapeCurrencyDollars('Price is $1,000.50 today')).toBe(
      'Price is \\$1,000.50 today'
    );
  });

  it('escapes engine displacement units like $4.0T and $2.0L', () => {
    expect(escapeCurrencyDollars('W205 ($4.0T V8)')).toBe('W205 (\\$4.0T V8)');
    expect(escapeCurrencyDollars('new $2.0L turbo')).toBe('new \\$2.0L turbo');
    expect(escapeCurrencyDollars('$4.0TV8)')).toBe('\\$4.0TV8)');
  });

  it('escapes amounts before CJK characters', () => {
    expect(escapeCurrencyDollars('预算$50000元')).toBe('预算\\$50000元');
  });

  it('escapes magnitude amounts ($5M, $10k, $3bn)', () => {
    expect(escapeCurrencyDollars('Cap of $5M and $10k.')).toBe('Cap of \\$5M and \\$10k.');
    expect(escapeCurrencyDollars('Raised $3bn this round')).toBe('Raised \\$3bn this round');
    expect(escapeCurrencyDollars('Revenue $1.5B total')).toBe('Revenue \\$1.5B total');
  });

  it('does not escape real inline math', () => {
    expect(escapeCurrencyDollars('Formula $2x+3$ here')).toBe('Formula $2x+3$ here');
    expect(escapeCurrencyDollars('Use $\\alpha$ symbol')).toBe('Use $\\alpha$ symbol');
  });

  it('does not escape display math delimiters', () => {
    expect(escapeCurrencyDollars('$$E=mc^2$$')).toBe('$$E=mc^2$$');
  });
});

// ─── escapeCurrencyRanges ─────────────────────────────────────────────────────

describe('escapeCurrencyRanges', () => {
  it('escapes both dollars in a hyphen range', () => {
    expect(escapeCurrencyRanges('Range is $5-$10 per unit.')).toBe(
      'Range is \\$5-\\$10 per unit.'
    );
  });

  it('escapes both dollars in an en-dash range', () => {
    expect(escapeCurrencyRanges('Range is $5\u2013$10.')).toBe('Range is \\$5\u2013\\$10.');
  });

  it('handles decimal ranges with spaces', () => {
    expect(escapeCurrencyRanges('$1.5 - $2.5')).toBe('\\$1.5 - \\$2.5');
  });
});

// ─── escapeMathPercent ────────────────────────────────────────────────────────

describe('escapeMathPercent', () => {
  it('escapes bare percent inside inline math', () => {
    expect(escapeMathPercent('It is $50%$ done.')).toBe('It is $50\\%$ done.');
  });

  it('leaves already-escaped percent alone', () => {
    expect(escapeMathPercent('Use $50\\%$ here.')).toBe('Use $50\\%$ here.');
  });

  it('does not touch prose percentages outside math', () => {
    expect(escapeMathPercent('Save 20% today.')).toBe('Save 20% today.');
  });
});

// ─── sanitizeMathUnicode ──────────────────────────────────────────────────────

describe('sanitizeMathUnicode', () => {
  it('replaces smart quotes inside math with ASCII equivalents', () => {
    expect(sanitizeMathUnicode('$\\alpha\u201d + 1$')).toBe('$\\alpha" + 1$');
    expect(sanitizeMathUnicode("$x\u2018y$")).toBe("$x'y$");
  });

  it('replaces en-dash and em-dash inside math with hyphens', () => {
    expect(sanitizeMathUnicode('$a\u2013b$')).toBe('$a-b$');
    expect(sanitizeMathUnicode('$a\u2014b$')).toBe('$a-b$');
  });

  it('leaves prose punctuation outside math untouched', () => {
    const prose = 'It\u2019s great \u2014 really.';
    expect(sanitizeMathUnicode(prose)).toBe(prose);
  });
});

// ─── normalizeLatexDelimiters ─────────────────────────────────────────────────

describe('normalizeLatexDelimiters', () => {
  it('converts \\( \\) to $ $', () => {
    expect(normalizeLatexDelimiters('\\(E=mc^2\\)')).toBe('$E=mc^2$');
  });

  it('converts \\[ \\] to $$ $$', () => {
    expect(normalizeLatexDelimiters('\\[E=mc^2\\]')).toBe('$$E=mc^2$$');
  });

  it('converts display math before inline to avoid conflict', () => {
    const input = '\\[a\\] and \\(b\\)';
    expect(normalizeLatexDelimiters(input)).toBe('$$a$$ and $b$');
  });

  it('leaves already-dollar-delimited math untouched', () => {
    expect(normalizeLatexDelimiters('$E=mc^2$')).toBe('$E=mc^2$');
    expect(normalizeLatexDelimiters('$$E=mc^2$$')).toBe('$$E=mc^2$$');
  });
});

// ─── containsMathExpressions ──────────────────────────────────────────────────

describe('containsMathExpressions', () => {
  it('detects inline dollar math', () => {
    expect(containsMathExpressions('The formula $E=mc^2$ is famous.')).toBe(true);
  });

  it('detects display dollar math', () => {
    expect(containsMathExpressions('$$\\int_0^1 f(x) dx$$')).toBe(true);
  });

  it('detects \\frac and \\sqrt commands', () => {
    expect(containsMathExpressions('Use \\frac{a}{b}')).toBe(true);
    expect(containsMathExpressions('Use \\sqrt{x}')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(containsMathExpressions('No math here at all.')).toBe(false);
  });
});

// ─── escapeGarbledInlineMath ──────────────────────────────────────────────────

describe('escapeGarbledInlineMath', () => {
  it('escapes inline math spans containing CJK characters', () => {
    expect(escapeGarbledInlineMath('Formula $E=mc^2中文解释$ here')).toBe(
      'Formula \\$E=mc^2中文解释\\$ here'
    );
  });

  it('escapes inline math spans containing markdown bold markers', () => {
    expect(escapeGarbledInlineMath('$foo **bar** baz$')).toBe('\\$foo **bar** baz\\$');
  });

  it('escapes plain prose between two stray dollar signs', () => {
    expect(escapeGarbledInlineMath('A lone $ and another $ here.')).toBe(
      'A lone \\$ and another \\$ here.'
    );
  });

  it('preserves real inline math with math tokens', () => {
    expect(escapeGarbledInlineMath('Value $a_i$ and $2x + 3$.')).toBe(
      'Value $a_i$ and $2x + 3$.'
    );
    expect(escapeGarbledInlineMath('Use $\\sin x$ here')).toBe('Use $\\sin x$ here');
  });

  it('preserves real math whose only words are LaTeX command names', () => {
    expect(escapeGarbledInlineMath('Check $\\cos\\theta + \\sin\\theta = 1$.')).toBe(
      'Check $\\cos\\theta + \\sin\\theta = 1$.'
    );
    expect(escapeGarbledInlineMath('$\\nabla \\times \\mathbf{B}$')).toBe(
      '$\\nabla \\times \\mathbf{B}$'
    );
  });

  it('escapes physics prose wrapped in dollar signs (backslash-digit angle)', () => {
    const input = 'displacement is about $7.2 m at \\33.7^\\circ above the positive $x$-axis.';
    expect(escapeGarbledInlineMath(input)).toBe(
      'displacement is about \\$7.2 m at 33.7° above the positive \\$x$-axis.'
    );
  });

  it('escapes physics prose wrapped in dollar signs (plain degree angle)', () => {
    const input = 'displacement is 10 m at about $53.1^\\circ above the positive x$-axis.';
    expect(escapeGarbledInlineMath(input)).toBe(
      'displacement is 10 m at about \\$53.1° above the positive x\\$-axis.'
    );
  });

  it('preserves inline math that uses \\text{...} for words', () => {
    expect(escapeGarbledInlineMath('Label $\\text{above the line}$ here')).toBe(
      'Label $\\text{above the line}$ here'
    );
  });

  it('preserves short variable and Greek letter math', () => {
    expect(escapeGarbledInlineMath('Magnitude $A$ and angle $\\theta$.')).toBe(
      'Magnitude $A$ and angle $\\theta$.'
    );
  });
});

// ─── wrapBareLatexEnvironments ────────────────────────────────────────────────

describe('wrapBareLatexEnvironments', () => {
  it('wraps a bare equation environment in $$', () => {
    const input = 'Solve \\begin{equation}x^2 + 1 = 0\\end{equation} for x.';
    const result = wrapBareLatexEnvironments(input);
    expect(result).toContain('$$\n\\begin{equation}');
    expect(result).toContain('\\end{equation}\n$$');
  });

  it('wraps a bare align environment in $$', () => {
    const input = 'Consider:\n\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\ndone.';
    const result = wrapBareLatexEnvironments(input);
    expect(result).toContain('$$\n\\begin{align}');
  });

  it('does not double-wrap an already-delimited environment', () => {
    const input = '$$\\begin{equation}E=mc^2\\end{equation}$$';
    expect(wrapBareLatexEnvironments(input)).toBe(input);
  });
});

// ─── sanitizeLatexContent (integration) ──────────────────────────────────────

describe('sanitizeLatexContent', () => {
  it('prevents CJK automotive prose from being parsed as math', () => {
    const input =
      'W205 C63 S (约 2015-2021，$4.0T V8) **，它和新一代 **W206 C63 S E Performance (约 2023 起，$2.0T 插混四缸)';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$4.0T V8');
    expect(result).toContain('\\$2.0T 插混四缸');
    expect(result).not.toMatch(/(?<!\\)\$4\.0T[\s\S]*?\$2\.0T/);
  });

  it('handles a mix of currency forms without breaking real math', () => {
    const input = 'Budget $5M-$10M, margin $50%$, and $E = mc^2$ with $0.10/word.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$5M-\\$10M');
    expect(result).toContain('$50\\%$');
    expect(result).toContain('$E = mc^2$');
    expect(result).toContain('\\$0.10/word');
  });

  it('unwraps garbled displacement prose (backslash-digit angle)', () => {
    const input = 'displacement is about $7.2 m at \\33.7^\\circ above the positive $x$-axis.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$7.2 m at 33.7° above the positive \\$');
    expect(result).not.toMatch(/(?<!\\)\$7\.2 m at/);
  });

  it('unwraps garbled displacement prose (plain degree angle)', () => {
    const input = 'displacement is 10 m at about $53.1^\\circ above the positive x$-axis.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$53.1° above the positive x\\$');
    expect(result).not.toMatch(/(?<!\\)\$53\.1/);
  });

  it('preserves real trig math unchanged', () => {
    const input = 'Check that $\\cos\\theta + \\sin\\theta = 1$.';
    expect(sanitizeLatexContent(input)).toContain('$\\cos\\theta + \\sin\\theta = 1$');
  });

  it('escapes paired $6.2L$ engine displacement wrapped in both dollar signs', () => {
    // "拿 $6.2L$ 自然吸气 V8" — the displacement looks like a math span to remark-math;
    // KaTeX would render "6.2L" in italic math mode. Both $ must be escaped.
    const input = '拿 $6.2L$ 自然吸气 V8';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$6.2L\\$');
    expect(result).not.toMatch(/(?<!\\)\$6\.2L\$/);
  });

  it('escapes other paired displacement measurements ($4.0T$, $2.5V6$)', () => {
    expect(sanitizeLatexContent('engine $4.0T$ power')).toContain('\\$4.0T\\$');
    expect(sanitizeLatexContent('old $6.2L$ nat-asp')).toContain('\\$6.2L\\$');
  });

  it('does NOT escape lowercase-variable math that matches the decimal pattern', () => {
    // $9.8t$, $2.5x$, $3.14r$ are plausible physics/math expressions.
    // The first letter is lowercase → NOT matched by step 0b → preserved as math.
    expect(sanitizeLatexContent('time $9.8t$ seconds')).toContain('$9.8t$');
    expect(sanitizeLatexContent('distance $2.5x$ units')).toContain('$2.5x$');
  });

  // ── Currency-adjacent-to-math parity bug ────────────────────────────────────

  it('fixes currency before real math — core parity bug', () => {
    // Before fix: the opening $ of $E=mc^2$ was being escaped by
    // escapeCurrencyDollars, leaving a dangling $ at the end.
    const input = 'Cost $50 then formula $E=mc^2$ done.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$50');
    expect(result).toMatch(/\$E=mc\^2\$/);
  });

  it('handles multiple currencies before real math', () => {
    const input = 'Between $5 and $10, the velocity is $v = at$.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('\\$5');
    expect(result).toContain('\\$10');
    expect(result).toContain('$v = at$');
    expect(result).not.toMatch(/(?<!\\)\$5\b/);
    expect(result).not.toMatch(/(?<!\\)\$10\b/);
  });

  it('preserves $50%$ as KaTeX math with escaped percent', () => {
    expect(sanitizeLatexContent('Efficiency is $50%$ today.')).toContain('$50\\%$');
  });

  // ── Bare environment wrapping ────────────────────────────────────────────────

  it('wraps bare equation environment so remark-math can render it', () => {
    const input = 'The result is \\begin{equation}E = mc^2\\end{equation} QED.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('$$');
    expect(result).toContain('\\begin{equation}');
  });

  // ── Delimiter normalisation ──────────────────────────────────────────────────

  it('converts \\( \\) to $ $ and renders correctly', () => {
    const input = 'The formula \\(E = mc^2\\) is famous.';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('$E = mc^2$');
  });

  it('converts \\[ \\] to $$ $$ and renders correctly', () => {
    const input = 'Display: \\[E = mc^2\\]';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('$$E = mc^2$$');
  });

  // ── Unicode sanitization ─────────────────────────────────────────────────────

  it('replaces smart quotes inside math spans', () => {
    const input = '$\\alpha\u201d + 1$';
    const result = sanitizeLatexContent(input);
    expect(result).toContain('$\\alpha" + 1$');
  });

  // ── LATEX_FORMATTING_GUIDELINES ──────────────────────────────────────────────

  it('LATEX_FORMATTING_GUIDELINES is a non-empty string', async () => {
    const { LATEX_FORMATTING_GUIDELINES } = await import('../src/index.js');
    expect(typeof LATEX_FORMATTING_GUIDELINES).toBe('string');
    expect(LATEX_FORMATTING_GUIDELINES.length).toBeGreaterThan(100);
    expect(LATEX_FORMATTING_GUIDELINES).toContain('$$');
  });
});
