import type MarkdownIt from 'markdown-it';
import type { GitBookTag } from '../syntax/scanner';

// This package compiles as CommonJS, so deep imports of markdown-it's .mjs
// type files would need resolution-mode attributes and would create a second,
// incompatible type identity. Use the namespace types from the CJS entry.
type Token = MarkdownIt.Token;

/** Mirrors the subset of VS Code's markdown RenderEnv that we rely on. */
export interface RenderEnv {
  currentDocument?: { fsPath: string };
  /**
   * Absolute paths currently being included, used to break cycles. Seeded
   * with the root document's path at the first expansion so chains that lead
   * back to the document itself are caught.
   */
  gbIncludeStack?: string[];
  /** Total successful expansions this render, bounded by MAX_INCLUDE_TOTAL. */
  gbIncludeCount?: number;
}

export type FileReader = (absolutePath: string) => string | null;

export interface RenderContext {
  md: MarkdownIt;
  env: RenderEnv;
  readFile: FileReader;
}

export interface TagRenderer {
  open(tag: GitBookTag, ctx: RenderContext): string;
  close?(tag: GitBookTag, ctx: RenderContext): string;
}

export interface GitBookToken extends Token {
  gbTag?: GitBookTag;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
