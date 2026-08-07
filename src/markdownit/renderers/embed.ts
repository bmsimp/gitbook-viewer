import type { GitBookTag } from '../../syntax/scanner';
import type { RenderContext, TagRenderer } from '../context';
import { escapeHtml } from '../context';

/** Host of an absolute url, or '' when there is no scheme://host to show. */
function hostOf(url: string): string {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1]! : '';
}

export const embedRenderer: TagRenderer = {
  open(tag: GitBookTag, ctx: RenderContext): string {
    const url = tag.named.url ?? '';
    // Same policy markdown-it applies to ordinary links: an unsafe url
    // (javascript:, vbscript:, unregistered data:) loses its href but the
    // card is still shown so no content silently disappears.
    const href = ctx.md.validateLink(url) ? ` href="${escapeHtml(url)}"` : '';
    const host = hostOf(url);
    const hostSpan = host ? `<span class="gb-embed__host">${escapeHtml(host)}</span>` : '';
    return (
      `<a class="gb-embed"${href} target="_blank" rel="noreferrer">` +
      `${hostSpan}<span class="gb-embed__url">${escapeHtml(url)}</span></a>`
    );
  },
  // `{% endembed %}` appears inconsistently in the wild; emit nothing for it.
  close(): string {
    return '';
  },
};
