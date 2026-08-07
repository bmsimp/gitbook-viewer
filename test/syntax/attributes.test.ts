import { describe, expect, it } from 'vitest';
import { parseAttributes } from '../../src/syntax/attributes';

describe('parseAttributes', () => {
  it('returns empty results for an empty string', () => {
    expect(parseAttributes('')).toEqual({ named: {}, positional: [] });
  });

  it('parses a single named attribute', () => {
    expect(parseAttributes('style="info"')).toEqual({
      named: { style: 'info' },
      positional: [],
    });
  });

  it('parses multiple named attributes', () => {
    expect(parseAttributes('url="https://x.test/a" fullWidth="false"')).toEqual({
      named: { url: 'https://x.test/a', fullWidth: 'false' },
      positional: [],
    });
  });

  it('parses a positional quoted value', () => {
    expect(parseAttributes('"../../.gitbook/includes/note.md"')).toEqual({
      named: {},
      positional: ['../../.gitbook/includes/note.md'],
    });
  });

  it('accepts single quotes', () => {
    expect(parseAttributes("style='warning'")).toEqual({
      named: { style: 'warning' },
      positional: [],
    });
  });

  it('tolerates extra whitespace', () => {
    expect(parseAttributes('  style = "danger"  ')).toEqual({
      named: { style: 'danger' },
      positional: [],
    });
  });

  it('keeps values containing spaces intact', () => {
    expect(parseAttributes('title="Formal Tone"')).toEqual({
      named: { title: 'Formal Tone' },
      positional: [],
    });
  });
});
