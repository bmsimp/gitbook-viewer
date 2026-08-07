import type MarkdownIt from 'markdown-it';

/**
 * Renders the way VS Code's markdown preview actually does: tokenize with an
 * env that has NO currentDocument, then render with the full env. Extension
 * code that needs the document path must therefore run in renderer rules.
 * Using md.render() in tests hides this whole class of bug.
 */
export function renderLikeVsCode(
  md: MarkdownIt,
  src: string,
  env: Record<string, unknown> = {},
): string {
  const tokens = md.parse(src, {
    currentDocument: undefined,
    containingImages: new Set(),
    resourceProvider: undefined,
  });
  return md.renderer.render(tokens, md.options, {
    containingImages: new Set(),
    resourceProvider: undefined,
    ...env,
  });
}
