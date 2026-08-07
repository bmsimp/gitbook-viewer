import { pathModuleFor } from './paths';

/**
 * Resolves a GitBook link/ref target against the document that contains it.
 * Shared by {% content-ref %} cards and "mention" links.
 *
 * Returns the absolute path of the target markdown file, or null when there
 * is nothing to look up: no document path, an external/scheme url, or a
 * pure-anchor target. Any anchor fragment is ignored here. Extensionless
 * targets (`dir/`, `./`, `../foo`) are treated as directories holding a
 * README.md, matching GitBook's page layout.
 */
export function resolveTarget(url: string, docPath: string | undefined): string | null {
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
