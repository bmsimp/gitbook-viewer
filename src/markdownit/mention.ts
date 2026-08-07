import type MarkdownIt from 'markdown-it';
import type { FileReader, RenderEnv } from './context';
import { escapeHtml } from './context';
import { extractPageMeta, stripFrontMatter } from './pageMeta';
import { resolveTarget } from './resolveTarget';

// See the note in context.ts: the CJS build must use the namespace types from
// markdown-it's CJS entry rather than deep .mjs type imports.
type Token = MarkdownIt.Token;
type RenderRule = MarkdownIt.Renderer.RenderRule;

/**
 * Approximates GitBook's heading anchor slugs: lowercase, spaces to hyphens,
 * punctuation stripped EXCEPT dots and hyphens (`7.1` survives), and an `id-`
 * prefix when the slug would otherwise start with a digit
 * (`#id-2.-updating-from-v6...`). Exact GitBook fidelity is not required;
 * misses fall back to the page title.
 */
export function gitbookSlug(heading: string): string {
  const slug = heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, '')
    .replace(/\s+/g, '-')
    // Punctuation stripping can leave dangling separators ("to v7+" -> "v7").
    .replace(/[.-]+$/g, '')
    .replace(/^-+/, '');
  return /^\d/.test(slug) ? `id-${slug}` : slug;
}

/**
 * Forgiving form used as a second pass: the corpus links the same heading as
 * both `#id-2.-updating-...` and an older `#2-updating-...` spelling, so
 * compare with the `id-` prefix, dots, and hyphen runs neutralized.
 */
function looseSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/^id-/, '')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Heading lines of a markdown source, fenced code blocks excluded. */
function headings(source: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of stripFrontMatter(source).split(/\r?\n/)) {
    const fenceMark = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMark) {
      if (fence === null) {
        fence = fenceMark[1]![0]!;
      } else if (fenceMark[1]![0] === fence) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      continue;
    }
    const heading = /^ {0,3}#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      out.push(heading[1]!.replace(/\s+#+\s*$/, '').trim());
    }
  }
  return out;
}

function findHeadingBySlug(source: string, anchor: string): string | null {
  const all = headings(source);
  for (const heading of all) {
    if (gitbookSlug(heading) === anchor) {
      return heading;
    }
  }
  const wanted = looseSlug(anchor);
  if (!wanted) {
    return null;
  }
  for (const heading of all) {
    if (looseSlug(gitbookSlug(heading)) === wanted) {
      return heading;
    }
  }
  return null;
}

/**
 * The text GitBook would display for a mention of `url`, or null when the
 * mention should render as-authored (external url, unknown document path,
 * missing target, target with no title).
 */
function mentionText(url: string, docPath: string | undefined, readFile: FileReader): string | null {
  const target = resolveTarget(url, docPath);
  if (!target) {
    return null;
  }
  const source = readFile(target);
  if (source === null) {
    return null;
  }

  const hash = url.indexOf('#');
  const anchor = hash >= 0 ? url.slice(hash + 1) : '';
  if (anchor) {
    const heading = findHeadingBySlug(source, anchor);
    if (heading) {
      return heading;
    }
  }
  return extractPageMeta(source).title ?? null;
}

/**
 * Suppression must only ever start on a link that provably closes: a
 * link_open with no link_close before end-of-stream (malformed input) would
 * otherwise swallow every text token in the rest of the inline.
 */
function hasMatchingClose(tokens: Token[], openIdx: number): boolean {
  let depth = 0;
  for (let i = openIdx + 1; i < tokens.length; i++) {
    const type = tokens[i]!.type;
    if (type === 'link_open') {
      depth += 1;
    } else if (type === 'link_close') {
      if (depth === 0) {
        return true;
      }
      depth -= 1;
    }
  }
  return false;
}

/**
 * Renders GitBook "mention" links -- `[task.md](task.md "mention")` -- with
 * the TARGET's title (front-matter title / first H1, or the matching section
 * heading for anchor mentions) instead of the raw authored text.
 *
 * Render-time only: VS Code tokenizes with no `currentDocument` and caches
 * the tokens, so the lookup lives in renderer rules and tokens are never
 * mutated. The original link_open markup comes from the chained rule (VS
 * Code's own href rewriting keeps working); the replacement text is emitted
 * right after it inside a `.gb-mention` span, and the authored inline text is
 * suppressed via an env flag that link_close clears.
 */
export function mentionPlugin(md: MarkdownIt, readFile: FileReader): void {
  const previousLinkOpen = md.renderer.rules.link_open;
  const previousLinkClose = md.renderer.rules.link_close;
  const previousText = md.renderer.rules.text;

  const chain =
    (previous: RenderRule | undefined): RenderRule =>
    (tokens, idx, options, env, self) =>
      previous ? previous(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);

  const chainLinkOpen = chain(previousLinkOpen);
  const chainLinkClose = chain(previousLinkClose);

  md.renderer.rules.link_open = (tokens, idx, options, env, self): string => {
    const renderEnv = (env ?? {}) as RenderEnv;
    // Defensive: never let a stale flag from a malformed stream leak into
    // this link's (or the document's) content.
    renderEnv.gbMentionSuppress = false;

    const token = tokens[idx]!;
    const opened = chainLinkOpen(tokens, idx, options, env, self);
    if (token.attrGet('title') !== 'mention') {
      return opened;
    }

    const replacement = mentionText(
      token.attrGet('href') ?? '',
      renderEnv.currentDocument?.fsPath,
      readFile,
    );
    if (replacement === null || !hasMatchingClose(tokens, idx)) {
      return opened;
    }

    renderEnv.gbMentionSuppress = true;
    return `${opened}<span class="gb-mention">${escapeHtml(replacement)}</span>`;
  };

  md.renderer.rules.link_close = (tokens, idx, options, env, self): string => {
    const renderEnv = (env ?? {}) as RenderEnv;
    renderEnv.gbMentionSuppress = false;
    return chainLinkClose(tokens, idx, options, env, self);
  };

  md.renderer.rules.text = (tokens, idx, options, env, self): string => {
    if ((env as RenderEnv | null | undefined)?.gbMentionSuppress) {
      return '';
    }
    return previousText
      ? previousText(tokens, idx, options, env, self)
      : escapeHtml(tokens[idx]!.content);
  };
}
