import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../src/markdownit/plugin';

describe('gitbookPlugin', () => {
  it('leaves ordinary markdown untouched', () => {
    const md = gitbookPlugin(new MarkdownIt());
    expect(md.render('# Hello')).toContain('<h1>Hello</h1>');
  });
});
