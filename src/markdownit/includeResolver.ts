import type { RenderContext } from './context';
import { stripFrontMatter } from './pageMeta';
import { pathModuleFor } from './paths';

export const MAX_INCLUDE_DEPTH = 5;

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

  const path = pathModuleFor(fromFile);
  const absolutePath = path.resolve(path.dirname(fromFile), target);
  const stack = ctx.env.gbIncludeStack ?? [];

  if (stack.includes(absolutePath)) {
    return { ok: false, reason: `include cycle detected at ${target}` };
  }
  if (stack.length >= MAX_INCLUDE_DEPTH) {
    return { ok: false, reason: `include nested deeper than ${MAX_INCLUDE_DEPTH} levels at ${target}` };
  }

  const content = ctx.readFile(absolutePath);
  if (content === null) {
    return { ok: false, reason: `include target not found: ${target}` };
  }

  return { ok: true, absolutePath, content: stripFrontMatter(content) };
}
