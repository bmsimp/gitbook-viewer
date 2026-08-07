import type { GitBookTag } from '../../syntax/scanner';
import type { TagRenderer } from '../context';

export const codeRenderer: TagRenderer = {
  open(tag: GitBookTag): string {
    const wrap = tag.named.overflow === 'wrap' ? ' gb-code--wrap' : '';
    return `<div class="gb-code${wrap}">`;
  },
  close(): string {
    return '</div>';
  },
};
