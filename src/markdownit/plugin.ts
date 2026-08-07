import type MarkdownIt from 'markdown-it';
import { OPTIONAL_CLOSE_TAGS, scanLine } from '../syntax/scanner';
import { renderers } from './renderers';
import { defaultFileReader } from './fileReader';
import { resolveInclude } from './includeResolver';
import { renderIncludeError } from './renderers/include';
import { pageHeaderPlugin, type DocumentTextReader } from './pageHeader';
import { mentionPlugin } from './mention';
import type { FileReader, GitBookToken, RenderContext, RenderEnv } from './context';

// See the note in context.ts: the CJS build must use the namespace types from
// markdown-it's CJS entry rather than deep .mjs type imports.
type StateBlock = MarkdownIt.StateBlock;
type Token = MarkdownIt.Token;
type RenderRule = MarkdownIt.Renderer.RenderRule;

export interface PluginOptions {
  readFile?: FileReader;
  readDocumentText?: DocumentTextReader;
}

/**
 * VS Code's markdown preview tokenizes and renders with two *different* envs:
 * `md.parse` gets an env with no `currentDocument` (and the resulting tokens
 * are cached per document), while only `md.renderer.render` sees the real one.
 * Everything here that depends on the document's path therefore has to live in
 * a renderer rule -- a block or core rule would only ever see `undefined`.
 */
export function gitbookPlugin(md: MarkdownIt, options: PluginOptions = {}): MarkdownIt {
  // Idempotence: applying the plugin twice would double the block rule.
  if (md.renderer.rules.gitbook_open) {
    return md;
  }

  const readFile = options.readFile ?? defaultFileReader;

  md.block.ruler.before('fence', 'gitbook_tag', gitbookTagRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  const render = (kind: 'open' | 'close'): RenderRule =>
    (tokens: Token[], idx: number, _options, env: unknown): string => {
      const token = tokens[idx] as GitBookToken;
      const tag = token.gbTag;
      if (!tag) {
        return '';
      }
      const renderer = renderers[tag.name];
      if (!renderer) {
        return '';
      }
      const ctx: RenderContext = { md, env: (env ?? {}) as RenderEnv, readFile };
      return kind === 'open' ? renderer.open(tag, ctx) : (renderer.close?.(tag, ctx) ?? '');
    };

  md.renderer.rules.gitbook_open = render('open');
  md.renderer.rules.gitbook_close = render('close');
  md.renderer.rules.gitbook_include = renderInclude(md, readFile);

  pageHeaderPlugin(md, readFile, options.readDocumentText);
  mentionPlugin(md, readFile);

  return md;
}

interface IncludeMeta {
  target: string;
}

function gitbookTagRule(
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean {
  // Four-space indent means an indented code block, not a tag.
  if (state.sCount[startLine]! - state.blkIndent >= 4) {
    return false;
  }

  const start = state.bMarks[startLine]! + state.tShift[startLine]!;
  const max = state.eMarks[startLine]!;
  const tag = scanLine(state.src.slice(start, max), startLine);

  if (!tag) {
    return false;
  }

  // Includes are not expanded here. Resolving one needs the document's path,
  // which block rules never see (see the note on gitbookPlugin), so the token
  // only records the target and the gitbook_include renderer rule does the
  // work. Keeping the token env-independent also keeps it safe to cache.
  if (tag.name === 'include') {
    if (silent) {
      return true;
    }
    const token = state.push('gitbook_include', '', 0);
    token.meta = { target: tag.positional[0] ?? '' } satisfies IncludeMeta;
    token.map = [startLine, startLine + 1];
    token.block = true;
    state.line = startLine + 1;
    return true;
  }

  if (!renderers[tag.name]) {
    return false;
  }

  if (silent) {
    return true;
  }

  const type = tag.kind === 'close' ? 'gitbook_close' : 'gitbook_open';
  // Tags like `{% file %}` and `{% embed %}` are conventionally written
  // without end tags; their renderers emit self-contained markup from
  // open(), so both their opens and (occasional) explicit closes must not
  // shift nesting.
  const nesting = OPTIONAL_CLOSE_TAGS.has(tag.name) ? 0 : tag.kind === 'close' ? -1 : 1;
  const token = state.push(type, '', nesting as 0 | 1 | -1) as GitBookToken;
  token.gbTag = tag;
  token.map = [startLine, startLine + 1];
  token.block = true;

  state.line = startLine + 1;
  return true;
}

function renderInclude(md: MarkdownIt, readFile: FileReader): RenderRule {
  return (tokens: Token[], idx: number, _options, env: unknown): string => {
    const target = (tokens[idx]?.meta as IncludeMeta | null | undefined)?.target ?? '';
    const renderEnv = (env ?? {}) as RenderEnv;

    // Seed the stack with the root document itself so an include chain leading
    // back to the document being rendered errors immediately as a cycle instead
    // of rendering the root's own body inside itself.
    const stack =
      renderEnv.gbIncludeStack ??
      (renderEnv.currentDocument?.fsPath ? [renderEnv.currentDocument.fsPath] : []);
    // Nested includes resolve relative to the file that contains them; at the
    // top level the stack holds only the root document.
    const fromFile = stack[stack.length - 1];

    // Created on the root env so that sibling includes at the same level share
    // it too; nested envs inherit the same object through the spread below.
    // Caveat: the counter persists on the caller's env object. VS Code builds
    // a fresh env per render so this is per-render in practice; a host that
    // reused one env across renders would accumulate toward the cap.
    const budget = (renderEnv.gbBudget ??= { count: 0 });
    const ctx: RenderContext = {
      md,
      env: { ...renderEnv, gbIncludeStack: stack, gbBudget: budget },
      readFile,
    };

    const result = resolveInclude(target, fromFile, ctx);
    if (!result.ok) {
      return `${renderIncludeError(result.reason)}\n`;
    }

    return md.render(result.content, {
      ...renderEnv,
      currentDocument: nestedDocument(renderEnv.currentDocument, result.absolutePath),
      gbIncludeStack: [...stack, result.absolutePath],
      gbNested: true,
    });
  };
}

/**
 * Builds the `currentDocument` for an include's nested render. VS Code's own
 * image/link renderer rules rewrite relative paths against `env.currentDocument`,
 * so pointing it at the include file is what makes assets inside an include
 * resolve relative to that file. `vscode` must not be imported from this
 * directory (src/markdownit stays standalone so the unit tests and the corpus
 * script can bundle it), but a real `vscode.Uri` exposes `.with()`, which
 * preserves the scheme and authority while swapping the path. Tests pass a
 * plain `{ fsPath }` object, which takes the fallback.
 */
function nestedDocument(
  current: RenderEnv['currentDocument'],
  absolutePath: string,
): RenderEnv['currentDocument'] {
  // Uri paths are posix with a leading slash: /g:/CIPP/.gitbook/includes/x.md
  const posix = absolutePath.replace(/\\/g, '/');
  const withMethod = (current as { with?: (change: { path: string }) => unknown } | undefined)?.with;
  if (typeof withMethod === 'function') {
    return withMethod.call(current, {
      path: posix.startsWith('/') ? posix : `/${posix}`,
    }) as RenderEnv['currentDocument'];
  }
  return { fsPath: absolutePath };
}
