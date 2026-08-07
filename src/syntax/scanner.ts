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

const TAG_LINE = /^(\s*)\{%\s*(end)?([A-Za-z][\w-]*)\s*([\s\S]*?)\s*%\}\s*$/;

export function scanLine(line: string, lineNumber: number): GitBookTag | null {
  const match = TAG_LINE.exec(line);
  if (!match) {
    return null;
  }

  const [, indent = '', end, name = '', attrText = ''] = match;
  const { named, positional } = parseAttributes(attrText);
  const raw = line.trim();

  return {
    name,
    kind: end ? 'close' : NEVER_CLOSE_TAGS.has(name) ? 'standalone' : 'open',
    named,
    positional,
    line: lineNumber,
    startCol: indent.length,
    endCol: indent.length + raw.length,
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
