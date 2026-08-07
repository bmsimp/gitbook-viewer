import type { GitBookTag } from '../../syntax/scanner';
import type { RenderContext, TagRenderer } from '../context';
import { escapeHtml } from '../context';
import { extractPageMeta } from '../pageMeta';
import { pathModuleFor } from '../paths';

const ARROW =
  '<svg class="gb-content-ref__arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function resolveTarget(url: string, ctx: RenderContext): string | null {
  const docPath = ctx.env.currentDocument?.fsPath;
  if (!docPath || /^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return null;
  }

  const withoutAnchor = url.split('#')[0] ?? '';
  if (!withoutAnchor) {
    return null;
  }

  const p = pathModuleFor(docPath);
  const resolved = p.resolve(p.dirname(docPath), withoutAnchor);
  return p.extname(resolved) ? resolved : p.join(resolved, 'README.md');
}

export const contentRefRenderer: TagRenderer = {
  open(tag: GitBookTag, ctx: RenderContext): string {
    const url = tag.named.url ?? '';
    const target = resolveTarget(url, ctx);
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
