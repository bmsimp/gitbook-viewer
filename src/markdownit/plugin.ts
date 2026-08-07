import type MarkdownIt from 'markdown-it';
import type { GitBookTag } from '../syntax/scanner';
import { OPTIONAL_CLOSE_TAGS, scanLine } from '../syntax/scanner';
import { renderers } from './renderers';
import { defaultFileReader } from './fileReader';
import { resolveInclude } from './includeResolver';
import { renderIncludeError } from './renderers/include';
import { rebasePlugin } from './rebase';
import { pageHeaderPlugin, type DocumentTextReader } from './pageHeader';
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

export function gitbookPlugin(md: MarkdownIt, options: PluginOptions = {}): MarkdownIt {
  const readFile = options.readFile ?? defaultFileReader;

  md.block.ruler.before('fence', 'gitbook_tag', createRule(readFile), {
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

  pageHeaderPlugin(md, readFile, options.readDocumentText);
  rebasePlugin(md);

  return md;
}

function createRule(readFile: FileReader) {
  return function gitbookTagRule(
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

    // Includes have no renderer entry: on success they leave no tokens of
    // their own, just the included file's markdown spliced in place.
    if (tag.name === 'include') {
      if (silent) {
        return true;
      }
      expandInclude(state, startLine, tag, readFile);
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
  };
}

function expandInclude(
  state: StateBlock,
  startLine: number,
  tag: GitBookTag,
  readFile: FileReader,
): void {
  const env = (state.env ?? {}) as RenderEnv;
  const ctx: RenderContext = { md: state.md, env, readFile };
  const target = tag.positional[0] ?? '';
  // Seed the stack with the root document itself so an include chain leading
  // back to the document being rendered errors immediately as a cycle instead
  // of splicing the root's own body into itself.
  const stack =
    env.gbIncludeStack ?? (env.currentDocument ? [env.currentDocument.fsPath] : []);
  env.gbIncludeStack = stack;
  // Nested includes resolve relative to the file that contains them; at the
  // top level the stack holds only the root document.
  const fromFile = stack[stack.length - 1];
  const result = resolveInclude(target, fromFile, ctx);

  if (!result.ok) {
    const token = state.push('html_block', '', 0);
    token.content = `${renderIncludeError(result.reason)}\n`;
    token.map = [startLine, startLine + 1];
    return;
  }

  env.gbIncludeStack = [...stack, result.absolutePath];
  try {
    const included: Token[] = [];
    state.md.block.parse(result.content, state.md, env, included);

    for (const token of included) {
      // Included tokens map to lines in another file; drop the mapping so the
      // preview's scroll sync does not jump to unrelated lines in this document.
      token.map = null;
      markForRebase(token, result.absolutePath);
      state.tokens.push(token);
    }
  } finally {
    // Restore even if the reader throws, so a failure mid-splice cannot leave
    // ancestor frames on the stack for sibling includes.
    env.gbIncludeStack = stack;
  }
}

function markForRebase(token: Token, includeAbsPath: string): void {
  // Inline tokens carry links/images whose relative paths need rebasing
  // (Task 8). Ancestor splice loops re-visit tokens already stamped by nested
  // expansions, so the first (deepest, correct) stamp must win.
  if (token.type === 'inline' && !('gbRebaseFrom' in token)) {
    (token as Token & { gbRebaseFrom?: string }).gbRebaseFrom = includeAbsPath;
  }
}
