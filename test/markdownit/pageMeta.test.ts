import { describe, expect, it } from 'vitest';
import { extractPageMeta, stripFrontMatter } from '../../src/markdownit/pageMeta';

describe('stripFrontMatter', () => {
  it('removes a leading YAML block', () => {
    expect(stripFrontMatter('---\ntitle: X\n---\n# Body\n')).toBe('# Body\n');
  });

  it('leaves content without front matter untouched', () => {
    expect(stripFrontMatter('# Body\n')).toBe('# Body\n');
  });

  it('ignores a horizontal rule that is not front matter', () => {
    expect(stripFrontMatter('# Body\n\n---\n')).toBe('# Body\n\n---\n');
  });

  it('handles CRLF', () => {
    expect(stripFrontMatter('---\r\ntitle: X\r\n---\r\n# Body\r\n')).toBe('# Body\r\n');
  });
});

describe('extractPageMeta', () => {
  it('reads title and description from front matter', () => {
    expect(extractPageMeta('---\ntitle: Endpoints\ndescription: All endpoints\n---\n# Other\n')).toEqual({
      title: 'Endpoints',
      description: 'All endpoints',
      icon: undefined,
    });
  });

  it('falls back to the first H1 when front matter has no title', () => {
    expect(extractPageMeta('---\ndescription: D\n---\n\n# Real Title\n').title).toBe('Real Title');
  });

  it('reads the icon key', () => {
    expect(extractPageMeta('---\nicon: rocket\n---\n# T\n').icon).toBe('rocket');
  });

  it('strips surrounding quotes from values', () => {
    expect(extractPageMeta('---\ntitle: "Quoted"\n---\n').title).toBe('Quoted');
  });

  it('returns undefined title when nothing is available', () => {
    expect(extractPageMeta('Just a paragraph.\n').title).toBeUndefined();
  });
});
