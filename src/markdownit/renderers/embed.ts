import type { GitBookTag } from '../../syntax/scanner';
import type { TagRenderer } from '../context';
import { escapeHtml } from '../context';

function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1]! : url;
}

export const embedRenderer: TagRenderer = {
  open(tag: GitBookTag): string {
    const url = tag.named.url ?? '';
    return (
      `<a class="gb-embed" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">` +
      `<span class="gb-embed__host">${escapeHtml(hostOf(url))}</span>` +
      `<span class="gb-embed__url">${escapeHtml(url)}</span></a>`
    );
  },
  close(): string {
    return '';
  },
};
