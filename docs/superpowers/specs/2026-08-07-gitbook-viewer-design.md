# GitBook Viewer — Design

**Date:** 2026-08-07
**Status:** Approved

## Problem

VS Code's built-in Markdown preview renders GitBook's block syntax as literal text.
A page opens showing `{% hint style="warning" %}` instead of a callout, so the preview
is unusable for authoring GitBook content.

The CIPP documentation set (`g:\CIPP\docs`) is the driving corpus. A scan of it found:

| Tag | Occurrences | Notes |
| --- | --- | --- |
| `{% hint style="..." %}` | 681 | info 386, warning 230, danger 53, success 12 |
| `{% step %}` | 397 | always inside `stepper` |
| `{% include "..." %}` | 345 | 2 targets missing on disk |
| `{% stepper %}` | 91 | |
| `{% content-ref url="..." %}` | 46 | |
| `{% tab title="..." %}` | 27 | |
| `{% tabs %}` | 9 | |
| `{% embed url="..." %}` | 5 | |
| `{% code overflow="wrap" %}` | 4 | |
| `{% file src="..." %}` | 2 | |

Front matter keys in use: `description` (78), `icon` (10), `noIndex` (7), `title` (2).
`<details>`, `<table>`, and `<figure>` HTML also appears; markdown-it already passes
these through, so they are out of scope.

Two `{% include %}` targets referenced by the docs — `ng-note.md` and
`deploy-policy-expand.md` — do not exist in `.gitbook/includes/`. Nothing surfaces this
today.

`https://docs.cipp.app` is the live GitBook render of this same repository and serves as
the reference for visual fidelity.

## Goals

1. GitBook block syntax renders correctly in the **native** VS Code Markdown preview
   (`Ctrl+Shift+V`), with no separate preview command.
2. Rendered output matches GitBook.com's real appearance, not an approximation.
3. Authoring aids: diagnostics for broken references, snippets and completion for tags.

## Non-Goals

- Rendering `<details>`, `<table>`, `<figure>` (markdown-it already handles them).
- Editing, round-tripping, or WYSIWYG authoring.
- Publishing to the VS Code Marketplace. Distribution is via a built VSIX.
- Rendering `{% embed %}` targets as live iframes.

## Approach

Three parsing strategies were considered.

**A. Block rule plus token registry — chosen.** One markdown-it block rule recognizes any
`{% tag attrs %}` / `{% endtag %}` line and emits tokens with `nesting: ±1`. A per-tag
renderer registry converts tokens to HTML. Markdown inside blocks parses normally,
nesting such as `stepper > step > hint` works without special cases, and setting
`token.map` preserves the preview's scroll sync and click-to-line.

**B. String pre-processing — rejected.** Regex-replacing `{% %}` with HTML before
markdown-it runs prevents markdown inside blocks from parsing and destroys source-line
mapping, breaking scroll sync.

**C. `markdown-it-container` per tag — rejected.** That plugin is hard-wired to `:::`
fences and cannot match `{% %}` delimiters.

## Architecture

All rendering happens in the extension host. VS Code's `extendMarkdownIt` contribution
point runs in Node, so `fs` is available, and the markdown-it `env` carries
`currentDocument: vscode.Uri` (confirmed in VS Code's `markdownEngine.ts`, `RenderEnv`).
The webview receives only CSS, the bundled font, and a small script for tab clicks.

### Contribution points

```jsonc
"contributes": {
  "markdown.markdownItPlugins": true,
  "markdown.previewStyles":  ["media/gitbook.css"],
  "markdown.previewScripts": ["media/preview.js"],
  "snippets":       [{ "language": "markdown", "path": "snippets/gitbook.json" }],
  "configuration":  { /* see Settings */ }
}
```

`activate()` returns `{ extendMarkdownIt(md) { ... } }` and separately registers the
diagnostic and completion providers. Activation is on `onLanguage:markdown` so
diagnostics run without a preview open.

### Module layout

```
src/
  extension.ts              activate(): wire providers, return { extendMarkdownIt }
  syntax/
    scanner.ts              PURE: string -> GitBookTag[] { name, attrs, range, kind }
    attributes.ts           PURE: `style="info" url="x"` -> Record<string, string>
  markdownit/
    plugin.ts               block rule: tags -> nesting tokens, sets token.map
    renderers/
      hint.ts  stepper.ts  step.ts   tabs.ts  tab.ts
      code.ts  file.ts     embed.ts  contentRef.ts  include.ts
    includeResolver.ts      sync fs read, front-matter strip, path rebase,
                            cycle and depth guard
    pageHeader.ts           front matter (icon, description) -> page header
  diagnostics/
    referenceChecker.ts     GitBookTag[] -> vscode.Diagnostic[]
  completion/
    tagCompletion.ts        tag names after `{` / `%`
    pathCompletion.ts       filesystem paths inside quoted attributes
media/
  gitbook.css
  preview.js
  fonts/Inter-*.woff2
snippets/gitbook.json
test/
```

### Boundaries

`syntax/` imports neither `vscode` nor `fs`. It is the shared core consumed by both the
markdown-it plugin and the diagnostics provider, and it is unit-testable in plain Node.
This is the primary seam in the design: a change to tag parsing has exactly one home, and
both consumers stay in sync by construction.

Each renderer in `markdownit/renderers/` handles one tag family and depends only on the
token it receives. Adding a GitBook tag means adding one file and one registry entry.

## Rendering Behavior

**`hint`** — Four styles (`info`, `warning`, `danger`, `success`). Accent bar, tinted
background, and icon glyph per style.

**`stepper` / `step`** — Numbered rail. Numbers come from CSS `counter-increment` rather
than markup, so they stay correct across live re-renders.

**`tabs` / `tab`** — Tab strip plus panels. `preview.js` handles clicks. The active index
is keyed by the tab group's ordinal position so the selection survives the re-render that
fires on every keystroke.

**`content-ref`** — Card containing the target page title and an arrow, linking to the
target file. Handles `page.md`, `page.md#anchor`, and directory references resolving to
`README.md`.

**`code overflow="wrap"`** — Applies wrapping to the contained fence.

**`file src="..."`** — Download card showing the filename.

**`embed url="..."`** — Link card. Not an iframe: the preview's CSP blocks third-party
frames and the webview has no network access.

**`include`** — Resolved with `fs.readFileSync` against
`path.dirname(env.currentDocument.fsPath)`. markdown-it rules are synchronous, so the
read must be too; include files are small and this is not a measurable cost. Processing
order:

1. Read the target file. On failure, emit a visible error box — never render nothing.
2. Strip YAML front matter (included files such as `feature-request.md` carry `title:`).
3. Rebase relative link and image paths from the include's directory to the host
   document's directory, so assets referenced from `.gitbook/includes/` still resolve.
4. Recursively parse the result into the token stream so its markdown renders.

Depth is capped at 5 and a cycle set is carried on `env`. Rendered output has no
surrounding chrome, matching GitBook, which splices includes inline.

**Page header** — VS Code strips YAML front matter before the plugin sees the document,
so `pageHeader.ts` reads the file from `env.currentDocument` itself, parses front matter,
and prepends GitBook's page header showing `icon:` and `description:`.

## Styling

The palette is extracted from the live CSS at `https://docs.cipp.app` during
implementation rather than estimated. It is emitted as two token sets scoped to
`body.vscode-light` and `body.vscode-dark`.

`gitbookViewer.colorScheme` overrides this by setting a `data-gb-scheme` attribute that
takes precedence over both scoped rules:

- `auto` (default) — GitBook's light palette under light editor themes, its dark palette
  under dark ones.
- `light` / `dark` — force one palette regardless of editor theme, for final visual
  checks against the published site.

Inter is bundled as woff2 under the SIL Open Font License and declared via `@font-face`
in `gitbook.css`, so metrics match GitBook.com on machines without Inter installed.
License text ships in `media/fonts/`.

## Diagnostics

A `DiagnosticCollection` named `gitbook`, updated on markdown open and change with a
300 ms debounce, driven by `syntax/scanner.ts` output.

| Condition | Severity |
| --- | --- |
| `include` / `content-ref url` / `file src` target missing on disk | Warning |
| Unbalanced open and close tags | Error |
| Unrecognized tag name | Information |

`http:` and `https:` targets and bare `#anchor` references are skipped. Controlled by
`gitbookViewer.diagnostics.enabled`.

## Completion and Snippets

`tagCompletion.ts` offers tag names on `{` and `%` trigger characters.
`pathCompletion.ts` offers workspace-relative filesystem paths inside the quoted value of
`include`, `url=`, and `src=`.

Snippets: `gb-hint`, `gb-hint-warning`, `gb-hint-danger`, `gb-stepper`, `gb-tabs`,
`gb-content-ref`, `gb-code`, `gb-include`, `gb-embed`, `gb-file`.

## Settings

| Setting | Type | Default |
| --- | --- | --- |
| `gitbookViewer.colorScheme` | `auto` \| `light` \| `dark` | `auto` |
| `gitbookViewer.diagnostics.enabled` | boolean | `true` |

Deliberately minimal. Include depth (5) and diagnostic debounce (300 ms) are constants,
not settings.

## Testing

**Unit** — `syntax/scanner.ts`, `syntax/attributes.ts`, and `includeResolver` (against
temp-directory fixtures). Pure and fast; these drive the TDD loop.

**Golden HTML snapshots** — Fixture `.md` files rendered through a bare markdown-it
instance with the plugin applied, compared to expected HTML. Fixtures are lifted from
real CIPP pages and cover all ten tag families plus a nested
`stepper > step > hint` case, a missing-include case, and an unbalanced-tag case.

**Integration** — `@vscode/test-electron` for diagnostics and completion, which need the
real `vscode` API surface.

**Manual** — Pixel-diff three CIPP pages against their `docs.cipp.app` equivalents.

## Repository and Delivery

- `github.com/bmsimp/gitbook-viewer`, public, MIT licensed.
- Local checkout at `g:\gitbook-viewer`.
- TypeScript bundled with esbuild; `.vscodeignore` excludes sources and tests from the
  VSIX.
- GitHub Actions on push and pull request: lint, unit tests, integration tests,
  `vsce package`, VSIX uploaded as a build artifact.
- Installation: build the VSIX and run `code --install-extension gitbook-viewer-<v>.vsix`,
  or download the artifact from a CI run. No Marketplace publisher account required.

## Risks and Open Questions

**Front-matter double read.** `pageHeader.ts` reads the document from disk while the user
may have unsaved changes in the editor buffer. Mitigation: prefer the open
`TextDocument`'s text when one exists for that URI, falling back to `fs`.

**Include path rebasing.** Rewriting relative paths inside included content is
correctness-sensitive. Covered by dedicated unit tests; the current CIPP includes contain
only absolute URLs, so real-world exposure is low.

**Preview script re-entry.** `previewScripts` reload on every content change. Tab state is
therefore keyed by group ordinal rather than held in closure state.

**GitBook syntax drift.** GitBook may add or change block syntax. The scanner emits
unrecognized tags as Information diagnostics rather than failing, so new syntax degrades
visibly rather than silently.
