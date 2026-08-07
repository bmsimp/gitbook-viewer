import type MarkdownIt from 'markdown-it';
import { gitbookPlugin } from './markdownit/plugin';

export function activate(): { extendMarkdownIt(md: MarkdownIt): MarkdownIt } {
  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      // readDocumentText is wired to vscode.workspace.textDocuments in a later
      // task; until then page headers reflect the saved file, not unsaved edits.
      return gitbookPlugin(md);
    },
  };
}

export function deactivate(): void {
  // nothing to clean up
}
