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
 * Suppression must only ever start on a link that provably closes AND whose
 * body is plain text. A link_open with no link_close before end-of-stream
 * (malformed input) would swallow every text token in the rest of the
 * inline; a body holding non-text tokens (image, code_inline, emphasis
 * shells, softbreaks) would leak them next to the injected title because
 * suppression only silences `text` tokens. GitBook itself only emits
 * plain-text mentions, so anything else renders entirely as-authored.
 */
function isReplaceablePlainTextLink(tokens: Token[], openIdx: number): boolean {
  for (let i = openIdx + 1; i < tokens.length; i++) {
    const type = tokens[i]!.type;
    if (type === 'link_close') {
      return true;
    }
    if (type !== 'text' && type !== 'text_special') {
      return false;
    }
  }
  return false;
}

/**
 * GitBook's second mention syntax: a raw HTML anchor, emitted inside HTML
 * tables and paragraphs. GitBook writes exactly this attribute order
 * (`data-mention` first, double-quoted href), so the pattern is intentionally
 * narrow rather than a general HTML parser; the `[^<]*` inner-text group also
 * skips any anchor with nested markup. Non-matching anchors pass through
 * byte-identically.
 */
const HTML_MENTION = /<a data-mention href="([^"]*)"([^>]*)>([^<]*)<\/a>/g;

/**
 * Matches a lone opening tag of the same shape. Inline HTML is tokenized one
 * tag per `html_inline` token (open tag / text / close tag), so the paragraph
 * case is recognized from the open tag plus a token lookahead rather than the
 * whole-anchor regex above.
 */
const HTML_MENTION_OPEN = /^<a data-mention href="([^"]*)"([^>]*)>$/;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

/**
 * Defensive entity decoding for hrefs before filesystem resolution. The
 * corpus only ever emits plain relative paths (no entities observed), but an
 * `&amp;` in a filename would be serialized escaped, so undo the four
 * escapeHtml entities and nothing more.
 */
function unescapeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot);/g, (entity) => ENTITIES[entity]!);
}

/**
 * Replaces the inner text of every resolvable `data-mention` anchor in a raw
 * HTML string with the target's title. Anchors whose target cannot be
 * resolved (missing file, external scheme, no currentDocument) are left
 * completely untouched, as is every other byte of the input.
 */
function replaceHtmlMentions(
  html: string,
  docPath: string | undefined,
  readFile: FileReader,
): string {
  // Cheap guard: most html_block/html_inline output has no mentions at all.
  if (!html.includes('data-mention')) {
    return html;
  }
  return html.replace(HTML_MENTION, (match, href: string, rest: string) => {
    const replacement = mentionText(unescapeEntities(href), docPath, readFile);
    if (replacement === null) {
      return match;
    }
    // Groups 1 and 2 reproduce the matched anchor markup byte-for-byte; only
    // the inner text changes.
    return `<a data-mention href="${href}"${rest}><span class="gb-mention">${escapeHtml(replacement)}</span></a>`;
  });
}

/**
 * Renders GitBook "mention" links -- `[task.md](task.md "mention")` -- with
 * the TARGET's title (front-matter title / first H1, or the matching section
 * heading for anchor mentions) instead of the raw authored text. The same
 * treatment covers GitBook's raw-HTML mention form,
 * `<a data-mention href="task.md">task.md</a>`, which hides inside opaque
 * `html_block` tokens (whole `<table>` blocks) and split `html_inline`
 * tokens where the link-token rules never see it.
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
    if (replacement === null || !isReplaceablePlainTextLink(tokens, idx)) {
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

  // Raw-HTML mentions. Tokens are cached per document and must stay
  // env-independent, so this transforms the RULE OUTPUT string only, never
  // the tokens. VS Code wraps html_block for source mapping, so the previous
  // rule must run first and its output be transformed; the default rules for
  // both token types just return token.content.
  const previousHtmlBlock = md.renderer.rules.html_block;
  const previousHtmlInline = md.renderer.rules.html_inline;

  md.renderer.rules.html_block = (tokens, idx, options, env, self): string => {
    const out = previousHtmlBlock
      ? previousHtmlBlock(tokens, idx, options, env, self)
      : tokens[idx]!.content;
    const docPath = (env as RenderEnv | null | undefined)?.currentDocument?.fsPath;
    return replaceHtmlMentions(out, docPath, readFile);
  };

  md.renderer.rules.html_inline = (tokens, idx, options, env, self): string => {
    const renderEnv = (env ?? {}) as RenderEnv;
    const token = tokens[idx]!;
    const out = previousHtmlInline
      ? previousHtmlInline(tokens, idx, options, env, self)
      : token.content;

    // Closing tag of an inline mention whose authored text is suppressed.
    // The flag can only be live here for a mention this rule opened: markdown
    // mention bodies are guaranteed text-only, so no html_inline `</a>` can
    // occur while a link mention holds the flag.
    if (renderEnv.gbMentionSuppress && /^<\/a\s*>$/.test(token.content)) {
      renderEnv.gbMentionSuppress = false;
      return out;
    }

    if (!out.includes('data-mention')) {
      return out;
    }

    // Defensive: a whole anchor in a single token (markdown-it splits tags,
    // but a chained rule could have merged them).
    const replaced = replaceHtmlMentions(out, renderEnv.currentDocument?.fsPath, readFile);
    if (replaced !== out) {
      return replaced;
    }

    // The normal inline shape: open tag, one plain text token, close tag.
    // Anything else (nested markup, entities splitting the text, a missing
    // close) renders entirely as-authored.
    const open = HTML_MENTION_OPEN.exec(out);
    const body = tokens[idx + 1];
    const close = tokens[idx + 2];
    if (
      !open ||
      body?.type !== 'text' ||
      close?.type !== 'html_inline' ||
      !/^<\/a\s*>$/.test(close.content)
    ) {
      return out;
    }

    const replacement = mentionText(
      unescapeEntities(open[1]!),
      renderEnv.currentDocument?.fsPath,
      readFile,
    );
    if (replacement === null) {
      return out;
    }

    renderEnv.gbMentionSuppress = true;
    return `${out}<span class="gb-mention">${escapeHtml(replacement)}</span>`;
  };
}
