# `remark-math-sanitizer` — sample client

A self-contained Node.js project that consumes `remark-math-sanitizer` and verifies it fixes all five documented failure modes against a real `remark-math` + `rehype-katex` pipeline.

> The dependency on `remark-math-sanitizer` is a workspace path (`file:../..`),
> so the demo always exercises the current working tree. Build the package once
> in the repo root before installing the demo.

## Setup

```sh
# from the repo root
npm install
npm run build

# then
cd examples/demo
npm install
```

## Run automated checks

```sh
npm test
```

Expected output:

```
remark-math-sanitizer demo — five failure modes

package version: 2.0.0

Case 1: Currency before math      — PASS
Case 2: Garbled prose in $...$    — PASS
Case 3: Bare LaTeX environment    — PASS
Case 4: % inside math             — PASS
Case 5: Unicode in math spans     — PASS

Result: 5 passed, 0 failed (of 5)
```

Each case asserts both that the sanitized string has the expected escaping **and** that the rendered HTML from the full `unified` → `remark-math` → `rehype-katex` pipeline has (or does not have) the right `class="katex"` / `katex-display` / `katex-error` markers.

## Visual comparison

```sh
npm run render
open output.html
```

Generates a side-by-side HTML page comparing rendering **without** the sanitizer vs **with** the sanitizer for each case. KaTeX CSS is inlined.

## What's exercised

| File | Purpose |
|---|---|
| `test.mjs` | Automated PASS/FAIL checks on sanitized output and resulting HTML. |
| `render.mjs` | Generates `output.html` — visual side-by-side comparison. |
| `package.json` | Pulls `remark-math-sanitizer` plus `unified`, `remark-parse`, `remark-math`, `remark-rehype`, `rehype-katex`, `rehype-stringify`, `katex`. |
