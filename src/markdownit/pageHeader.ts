import type MarkdownIt from 'markdown-it';
import { escapeHtml, type FileReader, type RenderEnv } from './context';
import { extractPageMeta } from './pageMeta';

/**
 * Reads the current editor buffer for a document (which may have unsaved
 * edits), or null when no buffer is open for that path. Wired to
 * vscode.workspace.textDocuments by the extension; tests inject it directly.
 */
export type DocumentTextReader = (absolutePath: string) => string | null;

/**
 * Core rule that prepends a GitBook-style page header (icon + description)
 * built from the document's YAML front matter. VS Code strips front matter
 * before the plugin sees the source, so the file (or its unsaved buffer) is
 * re-read to recover it.
 */
export function pageHeaderPlugin(
  md: MarkdownIt,
  readFile: FileReader,
  readDocumentText?: DocumentTextReader,
): void {
  md.core.ruler.push('gitbook_page_header', (state) => {
    const docPath = (state.env as RenderEnv | undefined)?.currentDocument?.fsPath;
    if (!docPath) {
      return;
    }

    const source = readDocumentText?.(docPath) ?? readFile(docPath);
    if (source === null || source === undefined) {
      return;
    }

    // Title is deliberately not rendered here: the header shows only icon and
    // description, so title-only front matter produces no header at all.
    const meta = extractPageMeta(source);
    if (!meta.description && !meta.icon) {
      return;
    }

    const icon = meta.icon
      ? `<div class="gb-page-header__icon" data-gb-icon="${escapeHtml(meta.icon)}" aria-hidden="true"></div>`
      : '';
    const description = meta.description
      ? `<p class="gb-page-header__desc">${escapeHtml(meta.description)}</p>`
      : '';

    // No token.map on purpose: the header corresponds to no source line, and
    // VS Code's preview scroll sync skips tokens without maps, so unshifting
    // it cannot desync the rest of the document.
    const token = new state.Token('html_block', '', 0);
    token.content = `<div class="gb-page-header">${icon}${description}</div>\n`;
    token.block = true;
    state.tokens.unshift(token);
  });
}
