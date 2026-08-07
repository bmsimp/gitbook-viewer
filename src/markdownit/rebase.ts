import type MarkdownIt from 'markdown-it';
import { pathModuleFor } from './paths';
import type { RenderEnv } from './context';

// See the note in context.ts: the CJS build must use the namespace types from
// markdown-it's CJS entry rather than deep .mjs type imports.
type Token = MarkdownIt.Token;

/** Scheme-, protocol-relative-, root-relative-, and fragment-only targets stay as written. */
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i;

/**
 * Rewrite a relative `target` so that, resolved against `toDir`, it points at
 * the same file it pointed at when resolved against `fromDir`. Both
 * directories must use the same path style (POSIX or Windows) — they always
 * do in practice, since both derive from the same document/include family.
 */
export function rebasePath(target: string, fromDir: string, toDir: string): string {
  if (!target || ABSOLUTE.test(target)) {
    return target;
  }

  const path = pathModuleFor(fromDir);
  const absolute = path.resolve(fromDir, target);
  const relative = path.relative(toDir, absolute).replace(/\\/g, '/');
  return relative === '' ? '.' : relative;
}

/**
 * Core rule that rewrites link hrefs and image srcs inside spliced include
 * content (inline tokens stamped with gbRebaseFrom by expandInclude) so they
 * resolve relative to the document being previewed instead of the include
 * file's own directory. Pushed to the end of the core chain, after the
 * `inline` rule has populated token.children.
 */
export function rebasePlugin(md: MarkdownIt): void {
  md.core.ruler.push('gitbook_rebase', (state) => {
    const docPath = (state.env as RenderEnv | undefined)?.currentDocument?.fsPath;
    if (!docPath) {
      return;
    }
    const path = pathModuleFor(docPath);
    const toDir = path.dirname(docPath);

    for (const token of state.tokens) {
      const from = (token as Token & { gbRebaseFrom?: string }).gbRebaseFrom;
      if (!from || !token.children) {
        continue;
      }
      const fromDir = pathModuleFor(from).dirname(from);

      // markdown-it flattens inline content, so images nested inside links
      // still appear directly in token.children — one loop covers them all.
      for (const child of token.children) {
        const attribute = child.type === 'image' ? 'src' : child.type === 'link_open' ? 'href' : null;
        if (!attribute) {
          continue;
        }
        const value = child.attrGet(attribute);
        if (value) {
          child.attrSet(attribute, rebasePath(value, fromDir, toDir));
        }
      }
    }
  });
}
