import type { RenderContext } from './context';
import { stripFrontMatter } from './pageMeta';
import { pathModuleFor } from './paths';

export const MAX_INCLUDE_DEPTH = 5;

/** Total expansions allowed per render, bounding diamond-shaped graphs. */
export const MAX_INCLUDE_TOTAL = 100;

// Same normalization markdown-it's core `normalize` rule applies to the root
// document. Included content is spliced via `md.block.parse`, which bypasses
// core rules, so without this a CRLF include never has truly blank lines and
// e.g. a leading <details> html_block swallows the whole file verbatim.
const NEWLINES_RE = /\r\n?|\u2028|\u2029/g;
const NULL_RE = /\u0000/g;

export type IncludeResult =
  | { ok: true; absolutePath: string; content: string }
  | { ok: false; reason: string };

/**
 * Resolves an include target relative to `fromFile` and returns its markdown
 * with front matter removed. Cycles are detected against `ctx.env.gbIncludeStack`.
 */
export function resolveInclude(
  target: string,
  fromFile: string | undefined,
  ctx: RenderContext,
): IncludeResult {
  if (!target) {
    return { ok: false, reason: 'no include path given' };
  }
  if (!fromFile) {
    return { ok: false, reason: 'cannot resolve include: the document has no file path' };
  }

  // Path confinement is intentionally not enforced here: the extension reads
  // with the user's own privileges, and flagging workspace-escaping targets
  // belongs to diagnostics, not rendering.
  const path = pathModuleFor(fromFile);
  const absolutePath = path.resolve(path.dirname(fromFile), target);
  const stack = ctx.env.gbIncludeStack ?? [];

  if (stack.includes(absolutePath)) {
    return { ok: false, reason: `include cycle detected at ${target}` };
  }
  // The stack is seeded with the root document, so at the Nth include level
  // its length is N; `>` therefore allows exactly MAX_INCLUDE_DEPTH levels.
  if (stack.length > MAX_INCLUDE_DEPTH) {
    return { ok: false, reason: `include nested deeper than ${MAX_INCLUDE_DEPTH} levels at ${target}` };
  }
  const count = ctx.env.gbIncludeCount ?? 0;
  if (count >= MAX_INCLUDE_TOTAL) {
    return { ok: false, reason: `include budget exceeded (${MAX_INCLUDE_TOTAL} includes per document)` };
  }

  const content = ctx.readFile(absolutePath);
  if (content === null) {
    return { ok: false, reason: `include target not found: ${target}` };
  }

  ctx.env.gbIncludeCount = count + 1;
  const normalized = content.replace(NEWLINES_RE, '\n').replace(NULL_RE, '\uFFFD');
  return { ok: true, absolutePath, content: stripFrontMatter(normalized) };
}
