#!/usr/bin/env node
// Standalone GitBook renderer: turns a single .md file into a self-contained
// HTML document using the *same* markdown-it plugin and media assets as the VS
// Code extension, so it can be viewed in any browser (including Orca's embedded
// one) without a VS Code preview.
//
// Usage:
//   gitbook-render <file.md> [-o out.html] [--scheme auto|light|dark] [--open]
//
// Without -o the HTML goes to the system temp folder (gitbook-viewer/<name>.html).
//
// For clicking through a whole docs/ tree with working relative links, use
// scripts/serve-docs.mjs instead. This script is purely additive — it never
// touches the extension build.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGitbookRenderer, openInBrowser } from './lib/gitbook-render.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Parse args.
// ---------------------------------------------------------------------------
const USAGE = 'usage: gitbook-render <file.md> [-o out.html] [--scheme auto|light|dark] [--open]';
const argv = process.argv.slice(2);
let input;
let output;
let scheme = 'auto';
let open = false;

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    console.log(USAGE);
    process.exit(0);
  } else if (arg === '-o' || arg === '--out') {
    output = argv[++i];
  } else if (arg === '--scheme') {
    scheme = argv[++i];
  } else if (arg === '--open') {
    open = true;
  } else if (!arg.startsWith('-') && !input) {
    input = arg;
  } else {
    console.error(`unknown argument: ${arg}`);
    process.exit(2);
  }
}

if (!input) {
  console.error(USAGE);
  process.exit(2);
}
if (!['auto', 'light', 'dark'].includes(scheme)) {
  console.error(`--scheme must be auto, light or dark (got "${scheme}")`);
  process.exit(2);
}

const inputPath = path.resolve(input);
if (!fs.existsSync(inputPath)) {
  console.error(`file not found: ${inputPath}`);
  process.exit(1);
}

const outputPath = output
  ? path.resolve(output)
  : path.join(os.tmpdir(), 'gitbook-viewer', `${path.basename(inputPath, path.extname(inputPath))}.html`);

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------
const { renderBody, wrapHtml } = createGitbookRenderer(projectRoot);
const source = fs.readFileSync(inputPath, 'utf8');
const body = renderBody(source, inputPath);

// Relative images/links in the markdown resolve against the source file's
// directory — in VS Code that rebasing is done by VS Code's own renderer rules,
// which we don't have, so a <base href> stands in for top-level paths. (The
// docs server avoids this entirely by mirroring the file tree onto URLs.)
const baseHref = pathToFileURL(path.dirname(inputPath) + path.sep).href;
const html = wrapHtml({ body, title: path.basename(inputPath), scheme, baseHref });

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');

const fileUrl = pathToFileURL(outputPath).href;
console.log(`Rendered ${inputPath} -> ${outputPath}`);
console.log(fileUrl);

if (open) {
  openInBrowser(fileUrl);
}
