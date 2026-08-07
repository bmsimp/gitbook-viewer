import type MarkdownIt from 'markdown-it';
import { scanLine } from '../syntax/scanner';
import { renderers } from './renderers';
import { defaultFileReader } from './fileReader';
import type { FileReader, GitBookToken, RenderContext, RenderEnv } from './context';

// See the note in context.ts: the CJS build must use the namespace types from
// markdown-it's CJS entry rather than deep .mjs type imports.
type StateBlock = MarkdownIt.StateBlock;
type Token = MarkdownIt.Token;
type RenderRule = MarkdownIt.Renderer.RenderRule;

export interface PluginOptions {
  readFile?: FileReader;
}

export function gitbookPlugin(md: MarkdownIt, options: PluginOptions = {}): MarkdownIt {
  const readFile = options.readFile ?? defaultFileReader;

  md.block.ruler.before('fence', 'gitbook_tag', createRule(), {
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

  return md;
}

function createRule() {
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

    if (!tag || !renderers[tag.name]) {
      return false;
    }

    if (silent) {
      return true;
    }

    const type = tag.kind === 'close' ? 'gitbook_close' : 'gitbook_open';
    const token = state.push(type, '', tag.kind === 'close' ? -1 : 1) as GitBookToken;
    token.gbTag = tag;
    token.map = [startLine, startLine + 1];
    token.block = true;

    state.line = startLine + 1;
    return true;
  };
}
