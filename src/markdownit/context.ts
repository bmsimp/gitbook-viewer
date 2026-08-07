import type MarkdownIt from 'markdown-it';
import type { GitBookTag } from '../syntax/scanner';

// This package compiles as CommonJS, so deep imports of markdown-it's .mjs
// type files would need resolution-mode attributes and would create a second,
// incompatible type identity. Use the namespace types from the CJS entry.
type Token = MarkdownIt.Token;

/**
 * Mutable expansion counter shared by every nested include render. It has to
 * be an object rather than a number: nested envs are built by spreading the
 * parent env, and a spread copies a number by value (resetting the budget at
 * each level) while an object is copied by reference.
 */
export interface IncludeBudget {
  count: number;
}

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
  gbBudget?: IncludeBudget;
  /**
   * True inside the nested render of an included file. Used to suppress
   * whole-page decoration (the page header) that only the root document owns.
   */
  gbNested?: boolean;
  /**
   * True while rendering the inline content of a "mention" link whose target
   * title replaced the authored text; the text rule emits nothing until the
   * link_close clears it. Lives on the env because renderer rules share one
   * env per render and tokens themselves must stay immutable (VS Code caches
   * them per document).
   */
  gbMentionSuppress?: boolean;
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
