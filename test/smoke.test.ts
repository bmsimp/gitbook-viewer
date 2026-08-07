import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';
import { gitbookPlugin } from '../src/markdownit/plugin';
import { renderLikeVsCode } from './helpers/render';

describe('gitbookPlugin', () => {
  it('leaves ordinary markdown untouched', () => {
    const md = gitbookPlugin(new MarkdownIt());
    expect(renderLikeVsCode(md, '# Hello')).toContain('<h1>Hello</h1>');
  });
});
