import type MarkdownIt from 'markdown-it';
import { gitbookPlugin } from './markdownit/plugin';

export function activate(): { extendMarkdownIt(md: MarkdownIt): MarkdownIt } {
  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      return gitbookPlugin(md);
    },
  };
}

export function deactivate(): void {
  // nothing to clean up
}
