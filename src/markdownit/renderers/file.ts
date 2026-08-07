import type { GitBookTag } from '../../syntax/scanner';
import type { TagRenderer } from '../context';
import { escapeHtml } from '../context';

const ICON =
  '<svg viewBox="0 0 16 16" width="18" height="18"><path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 1.5V5.5H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

export const fileRenderer: TagRenderer = {
  open(tag: GitBookTag): string {
    const src = tag.named.src ?? '';
    const name = src.split('/').pop() || src;
    return (
      `<a class="gb-file" href="${escapeHtml(src)}" download>` +
      `<span class="gb-file__icon" aria-hidden="true">${ICON}</span>` +
      `<span class="gb-file__name">${escapeHtml(name)}</span></a>`
    );
  },
  // `{% endfile %}` appears inconsistently in the wild; emit nothing for it.
  close(): string {
    return '';
  },
};
