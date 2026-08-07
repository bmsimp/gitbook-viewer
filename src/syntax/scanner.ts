import { parseAttributes } from './attributes';

export type TagKind = 'open' | 'close' | 'standalone';

export interface GitBookTag {
  /** Tag name without the `end` prefix, e.g. `hint` for both open and close. */
  name: string;
  kind: TagKind;
  named: Record<string, string>;
  positional: string[];
  /** Zero-based line number. */
  line: number;
  startCol: number;
  endCol: number;
  raw: string;
}

export const REQUIRED_CLOSE_TAGS: ReadonlySet<string> = new Set([
  'hint', 'stepper', 'step', 'tabs', 'tab', 'code', 'content-ref',
  'columns', 'column', 'expand',
]);

export const OPTIONAL_CLOSE_TAGS: ReadonlySet<string> = new Set(['file', 'embed']);

export const NEVER_CLOSE_TAGS: ReadonlySet<string> = new Set(['include']);

export const KNOWN_TAGS: ReadonlySet<string> = new Set([
  ...REQUIRED_CLOSE_TAGS, ...OPTIONAL_CLOSE_TAGS, ...NEVER_CLOSE_TAGS,
]);

// Matches an optional `end` prefix followed by the tag name. Ambiguity: a tag
// literally named `endpoint` would be classified as a close tag for `point`,
// since the `end` prefix is stripped greedily before the name is read. No tag
// in the known GitBook corpus begins with `end`, so this is intentionally
// unresolved rather than special-cased.
const TAG_HEAD = /^(end)?([A-Za-z][\w-]*)(?=\s|$)/;

export function scanLine(line: string, lineNumber: number): GitBookTag | null {
  // Bail out on cheap, linear checks before doing any attribute parsing, so a
  // near-miss line (e.g. an unterminated tag) never touches a backtracking
  // regex over the whole line.
  const raw = line.trim();
  if (!raw.startsWith('{%') || !raw.endsWith('%}') || raw.length < 4) {
    return null;
  }

  const inner = raw.slice(2, -2).trim();
  const head = TAG_HEAD.exec(inner);
  if (!head) {
    return null;
  }

  const [full, end, name = ''] = head;
  const attrText = inner.slice(full.length);
  const { named, positional } = parseAttributes(attrText);
  const startCol = line.length - line.trimStart().length;

  return {
    name,
    kind: end ? 'close' : NEVER_CLOSE_TAGS.has(name) ? 'standalone' : 'open',
    named,
    positional,
    line: lineNumber,
    startCol,
    endCol: startCol + raw.length,
    raw,
  };
}

export function scan(text: string): GitBookTag[] {
  const tags: GitBookTag[] = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    const tag = scanLine(line ?? '', index);
    if (tag) {
      tags.push(tag);
    }
  }

  return tags;
}
