// Corpus render-check: runs every .md file in a real GitBook corpus through
// the extension's markdown-it plugin and asserts that no supported GitBook
// tag survives rendering as raw `{% ... %}` text.
//
// Usage: node scripts/corpus-check.mjs [corpusRoot]   (default g:/CIPP/docs)
//
// Exit 1 on any raw supported-tag remnant, unexpected include error, or
// render crash; exit 0 otherwise with a summary table.

import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const corpusRoot = path.resolve(process.argv[2] ?? 'g:/CIPP/docs');

// ---------------------------------------------------------------------------
// Build the plugin (TS, CJS output) on the fly so the script always tests the
// current source, independent of dist/extension.js (which bundles vscode).
// ---------------------------------------------------------------------------
const pluginOut = path.join(projectRoot, 'out', 'plugin-cli.cjs');
buildSync({
  entryPoints: [path.join(projectRoot, 'src', 'markdownit', 'plugin.ts')],
  bundle: true,
  outfile: pluginOut,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: false,
});

const require = createRequire(import.meta.url);
const { gitbookPlugin } = require(pluginOut);
const MarkdownIt = require('markdown-it');

// ---------------------------------------------------------------------------
// Collect corpus files.
// ---------------------------------------------------------------------------
function collectMarkdown(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectMarkdown(full, acc);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) acc.push(full);
  }
  return acc;
}

if (!fs.existsSync(corpusRoot)) {
  console.error(`corpus root not found: ${corpusRoot}`);
  process.exit(1);
}
const files = collectMarkdown(corpusRoot).sort();

// ---------------------------------------------------------------------------
// Render every file and scan the output.
// ---------------------------------------------------------------------------
const SUPPORTED = new Set([
  'hint', 'stepper', 'step', 'tabs', 'tab', 'code',
  'content-ref', 'include', 'embed', 'file',
]);

// Include-error targets known to be missing from the corpus (referenced by
// the docs but absent from .gitbook/includes). Errors mentioning these are
// expected; any other include error is a failure.
const KNOWN_MISSING_INCLUDES = ['ng-note.md', 'deploy-policy-expand.md'];

const OUTPUT_MARKERS = [
  'gb-hint', 'gb-stepper', 'gb-tabs', 'gb-content-ref', 'gb-embed',
  'gb-file', 'gb-code', 'gb-page-header', 'gb-include-error',
];

const markerCounts = Object.fromEntries(OUTPUT_MARKERS.map((m) => [m, 0]));
const unknownTagCounts = new Map(); // tag name -> occurrences
const rawRemnantFailures = [];      // { file, snippet }
const includeErrors = [];           // { file, reason, expected }
const crashes = [];                 // { file, error }
let filesProcessed = 0;

// Text inside <pre>/<code> is intentional literal content (docs that *show*
// GitBook syntax), so it is excluded from the raw-remnant scan.
function stripCodeContent(html) {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/gi, '')
    .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, '');
}

for (const file of files) {
  const md = new MarkdownIt({ html: true });
  gitbookPlugin(md);

  let html;
  try {
    const source = fs.readFileSync(file, 'utf8');
    html = md.render(source, { currentDocument: { fsPath: file } });
  } catch (error) {
    crashes.push({ file, error: String(error && error.stack ? error.stack : error) });
    continue;
  }
  filesProcessed += 1;

  for (const marker of OUTPUT_MARKERS) {
    const count = html.split(`class="${marker}`).length - 1;
    markerCounts[marker] += count;
  }

  // Include errors: pull the reason text out of each error block.
  const errorRe = /<div class="gb-include-error"><strong>GitBook include failed:<\/strong>\s*([^<]*)<\/div>/g;
  for (const match of html.matchAll(errorRe)) {
    const reason = match[1].trim();
    const expected = KNOWN_MISSING_INCLUDES.some((name) => reason.includes(name));
    includeErrors.push({ file: path.relative(corpusRoot, file), reason, expected });
  }

  // Raw `{% tag %}` remnants outside code blocks.
  const scannable = stripCodeContent(html);
  const tagRe = /\{%\s*(?:end)?([a-zA-Z][\w-]*)/g;
  for (const match of scannable.matchAll(tagRe)) {
    const name = match[1];
    if (SUPPORTED.has(name)) {
      const at = match.index ?? 0;
      rawRemnantFailures.push({
        file: path.relative(corpusRoot, file),
        snippet: scannable.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' '),
      });
    } else {
      unknownTagCounts.set(name, (unknownTagCounts.get(name) ?? 0) + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
console.log(`\nGitBook corpus render-check — ${corpusRoot}`);
console.log(`Files found: ${files.length}   rendered: ${filesProcessed}   crashed: ${crashes.length}\n`);

console.log('Rendered output markers:');
for (const marker of OUTPUT_MARKERS) {
  console.log(`  ${marker.padEnd(18)} ${markerCounts[marker]}`);
}

if (unknownTagCounts.size > 0) {
  console.log('\nUnsupported tags left as-is (not failures):');
  for (const [name, count] of [...unknownTagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(18)} ${count}`);
  }
}

if (includeErrors.length > 0) {
  console.log('\nInclude errors:');
  for (const { file, reason, expected } of includeErrors) {
    console.log(`  [${expected ? 'expected' : 'UNEXPECTED'}] ${file}: ${reason}`);
  }
}

const unexpectedIncludeErrors = includeErrors.filter((e) => !e.expected);
let failed = false;

if (rawRemnantFailures.length > 0) {
  failed = true;
  console.error('\nFAIL: raw supported-tag remnants in rendered output:');
  for (const { file, snippet } of rawRemnantFailures) {
    console.error(`  ${file}: …${snippet}…`);
  }
}
if (unexpectedIncludeErrors.length > 0) {
  failed = true;
  console.error('\nFAIL: include errors outside the known-missing set (see list above).');
}
if (crashes.length > 0) {
  failed = true;
  console.error('\nFAIL: render crashes:');
  for (const { file, error } of crashes) {
    console.error(`  ${file}\n    ${error.split('\n')[0]}`);
  }
}

console.log(`\n${failed ? 'CORPUS CHECK FAILED' : 'Corpus check passed.'}`);
process.exit(failed ? 1 : 0);
