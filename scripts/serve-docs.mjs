#!/usr/bin/env node
// Local GitBook preview server with live reload. See --help, or the
// "Standalone / Orca preview" section of the README.
//
// Purely additive: never touches the VS Code extension build.

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createGitbookRenderer, openInBrowser } from './lib/gitbook-render.mjs';
import { createDocsServer, resolveServeTarget } from './lib/docs-server.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `gitbook-serve — preview GitBook docs locally, live-reloading on save

Usage:
  gitbook-serve [path] [options]

  path        A docs folder or a single .md page (default: current folder).
              A folder with a .gitbook.yaml serves the root it names. A page
              opens that page, serving its docs root so links between pages
              work (the .gitbook.yaml root or SUMMARY.md folder above it, else
              the current folder if the page is inside it, else its own folder).

Options:
  --orca            Open in Orca's embedded browser (uses ORCA_CLI_COMMAND or \`orca\`)
  --open            Open in the OS default browser
  --port <n>        Port to listen on (default 4100; tries the next 10 if busy; 0 = any)
  --host <addr>     Interface to bind (default 127.0.0.1 — this machine only)
  --scheme <s>      auto | light | dark (default auto: follows the OS)
  --no-reload       Don't watch files or auto-refresh pages
  -h, --help        Show this help
`;

// ---------------------------------------------------------------------------
// Parse args.
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
let target;
let port = 4100;
let host = '127.0.0.1';
let scheme = 'auto';
let orca = false;
let open = false;
let liveReload = true;

function fail(message) {
  console.error(`gitbook-serve: ${message}\nRun with --help for usage.`);
  process.exit(2);
}

function value(i, flag) {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    fail(`${flag} needs a value`);
  }
  return v;
}

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    process.stdout.write(HELP);
    process.exit(0);
  } else if (arg === '--port') {
    port = Number(value(i++, arg));
  } else if (arg === '--host') {
    host = value(i++, arg);
  } else if (arg === '--scheme') {
    scheme = value(i++, arg);
  } else if (arg === '--orca') {
    orca = true;
  } else if (arg === '--open') {
    open = true;
  } else if (arg === '--no-reload') {
    liveReload = false;
  } else if (!arg.startsWith('-') && target === undefined) {
    target = arg;
  } else {
    fail(`unknown argument: ${arg}`);
  }
}

if (!['auto', 'light', 'dark'].includes(scheme)) {
  fail(`--scheme must be auto, light or dark (got "${scheme}")`);
}
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  fail(`--port must be 0..65535 (got "${port}")`);
}

let resolved;
try {
  resolved = resolveServeTarget(target);
} catch (err) {
  console.error(`gitbook-serve: ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Start.
// ---------------------------------------------------------------------------
const renderer = createGitbookRenderer(projectRoot);
const docs = createDocsServer({
  root: resolved.root,
  renderer,
  scheme,
  liveReload,
  log: (message) => console.error(message),
});

let address;
try {
  address = await docs.listen(port, host);
} catch (err) {
  console.error(`gitbook-serve: could not listen on ${host}:${port} — ${err.message}`);
  process.exit(1);
}

const pageUrl = address.url + resolved.startPath;
console.log(`Serving ${docs.root}`);
console.log(`  ${pageUrl}`);
if (address.port !== port && port !== 0) {
  console.log(`  (port ${port} was busy; using ${address.port})`);
}
if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
  console.log(`  Warning: bound to ${host} — other machines on your network can read these docs.`);
}
console.log(liveReload ? 'Live reload on — saving a file refreshes the open page.' : 'Live reload off.');
console.log('Press Ctrl+C to stop.');

if (orca) {
  launchInOrca(pageUrl);
}
if (open) {
  openInBrowser(pageUrl);
}

// Stop cleanly so the port is released straight away.
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (stopping) {
      process.exit(1);
    }
    stopping = true;
    await docs.close();
    process.exit(0);
  });
}

// Async on purpose: the orca CLI can take several seconds on a cold start, and
// a synchronous call would stall the server while Orca loads the page from it.
function launchInOrca(url) {
  const exe = process.env.ORCA_CLI_COMMAND || 'orca';
  const failed = (reason) => {
    console.error(`Could not open Orca's browser (${exe}): ${reason}`);
    console.error(`Open ${url} manually, or run this from an Orca terminal.`);
  };
  const child = spawn(exe, ['tab', 'create', '--url', url], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
  const timer = setTimeout(() => {
    child.kill();
    failed('timed out after 30s');
  }, 30_000);
  child.on('error', (err) => {
    clearTimeout(timer);
    failed(err.message);
  });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    if (code === 0) {
      console.log("Opened in Orca's browser.");
    } else if (!signal) {
      failed(stderr.trim() || `exit code ${code}`);
    }
  });
}
