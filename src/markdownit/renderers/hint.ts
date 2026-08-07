import type { GitBookTag } from '../../syntax/scanner';
import type { TagRenderer } from '../context';

const STYLES = new Set(['info', 'warning', 'danger', 'success']);

/** Inline SVG so the preview needs no external image resources. */
const ICONS: Record<string, string> = {
  info: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v5M8 4.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  warning: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3.5M8 11.5v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  danger: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  success: '<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 8.2l2.2 2.2L11 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const hintRenderer: TagRenderer = {
  open(tag: GitBookTag): string {
    const requested = tag.named.style ?? 'info';
    const style = STYLES.has(requested) ? requested : 'info';
    return (
      `<div class="gb-hint gb-hint--${style}">` +
      `<div class="gb-hint__icon" aria-hidden="true">${ICONS[style]}</div>` +
      '<div class="gb-hint__body">'
    );
  },
  close(): string {
    return '</div></div>';
  },
};
