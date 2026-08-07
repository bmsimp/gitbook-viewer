import { describe, expect, it } from 'vitest';
import { scan, scanLine, KNOWN_TAGS } from '../../src/syntax/scanner';

describe('scanLine', () => {
  it('returns null for ordinary text', () => {
    expect(scanLine('just a paragraph', 0)).toBeNull();
  });

  it('returns null for an unterminated tag', () => {
    expect(scanLine('{% hint style="info"', 0)).toBeNull();
  });

  it('parses an opening tag with attributes', () => {
    expect(scanLine('{% hint style="info" %}', 3)).toEqual({
      name: 'hint',
      kind: 'open',
      named: { style: 'info' },
      positional: [],
      line: 3,
      startCol: 0,
      endCol: 23,
      raw: '{% hint style="info" %}',
    });
  });

  it('parses a closing tag', () => {
    const tag = scanLine('{% endhint %}', 9);
    expect(tag).toMatchObject({ name: 'hint', kind: 'close', line: 9 });
  });

  it('parses a bare opening tag', () => {
    expect(scanLine('{% stepper %}', 0)).toMatchObject({ name: 'stepper', kind: 'open' });
  });

  it('parses a positional include', () => {
    expect(scanLine('{% include "../a.md" %}', 0)).toMatchObject({
      name: 'include',
      kind: 'standalone',
      positional: ['../a.md'],
    });
  });

  it('records the column offset of an indented tag', () => {
    expect(scanLine('  {% endstep %}', 0)).toMatchObject({ startCol: 2, endCol: 15 });
  });

  it('rejects a tag with trailing content on the line', () => {
    expect(scanLine('{% hint %} trailing', 0)).toBeNull();
  });

  it('flags an unrecognized tag name', () => {
    expect(scanLine('{% bogus %}', 0)).toMatchObject({ name: 'bogus', kind: 'open' });
    expect(KNOWN_TAGS.has('bogus')).toBe(false);
  });

  it('returns null for a tag with no name', () => {
    expect(scanLine('{% %}', 0)).toBeNull();
  });

  it('keeps an attribute value intact when it contains a literal %} sequence', () => {
    expect(scanLine('{% hint title="100%} off" %}', 0)).toMatchObject({
      name: 'hint',
      kind: 'open',
      named: { title: '100%} off' },
    });
  });

  it('parses a tag with an unquoted attribute, silently dropping the malformed attribute', () => {
    expect(scanLine('{% code overflow=wrap %}', 0)).toMatchObject({
      name: 'code',
      kind: 'open',
      named: {},
      positional: [],
    });
  });

  it('does not exhibit catastrophic backtracking on a near-miss line', () => {
    const line = '{% a' + ' '.repeat(50_000) + 'x';
    const start = performance.now();
    const result = scanLine(line, 0);
    const elapsed = performance.now() - start;
    expect(result).toBeNull();
    expect(elapsed).toBeLessThan(50);
  });
});

describe('scan', () => {
  it('finds every tag in a document with correct line numbers', () => {
    const src = ['# Title', '', '{% hint style="warning" %}', 'Body', '{% endhint %}', ''].join('\n');
    const tags = scan(src);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toMatchObject({ name: 'hint', kind: 'open', line: 2 });
    expect(tags[1]).toMatchObject({ name: 'hint', kind: 'close', line: 4 });
  });

  it('handles CRLF line endings', () => {
    const tags = scan('{% hint %}\r\n{% endhint %}\r\n');
    expect(tags).toHaveLength(2);
    expect(tags[1]).toMatchObject({ line: 1, kind: 'close' });
  });

  it('returns an empty array for a document with no tags', () => {
    expect(scan('# Just a heading\n\nSome text.\n')).toEqual([]);
  });
});
