import type { GitBookTag } from '../../syntax/scanner';
import type { RenderContext, TagRenderer } from '../context';
import { escapeHtml } from '../context';
import { extractPageMeta } from '../pageMeta';
import { resolveTarget } from '../resolveTarget';

const ARROW =
  '<svg class="gb-content-ref__arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const contentRefRenderer: TagRenderer = {
  open(tag: GitBookTag, ctx: RenderContext): string {
    const url = tag.named.url ?? '';
    const target = resolveTarget(url, ctx.env.currentDocument?.fsPath);
    const source = target ? ctx.readFile(target) : null;
    const meta = source ? extractPageMeta(source) : {};
    const title = meta.title ?? url;

    const description = meta.description
      ? `<span class="gb-content-ref__desc">${escapeHtml(meta.description)}</span>`
      : '';

    // Unsafe urls lose the href but keep the card (see embed.ts).
    const href = ctx.md.validateLink(url) ? ` href="${escapeHtml(url)}"` : '';

    return (
      `<a class="gb-content-ref"${href}>` +
      '<span class="gb-content-ref__text">' +
      `<span class="gb-content-ref__title">${escapeHtml(title)}</span>${description}` +
      `</span>${ARROW}</a>` +
      // Hidden rather than dropped: the inner markdown keeps its DOM so
      // line-based scroll sync still has elements to anchor to.
      '<div class="gb-content-ref__body" hidden>'
    );
  },
  close(): string {
    return '</div>';
  },
};
