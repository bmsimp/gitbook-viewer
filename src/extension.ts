import * as vscode from 'vscode';
import type MarkdownIt from 'markdown-it';
import { gitbookPlugin } from './markdownit/plugin';
import { registerDiagnostics } from './diagnostics/provider';
import { registerTagCompletion } from './completion/tagCompletion';
import { registerPathCompletion } from './completion/pathCompletion';

/** Reads unsaved buffer text so the page header reflects in-flight edits. */
function readOpenDocument(absolutePath: string): string | null {
  const open = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === absolutePath);
  return open ? open.getText() : null;
}

export function activate(context: vscode.ExtensionContext): {
  extendMarkdownIt(md: MarkdownIt): MarkdownIt;
} {
  registerDiagnostics(context);
  registerTagCompletion(context);
  registerPathCompletion(context);

  // The markdown extension only re-renders on content changes, so a scheme
  // change would otherwise not show until the next edit.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('gitbookViewer.colorScheme')) {
        void vscode.commands.executeCommand('markdown.preview.refresh');
      }
    }),
  );

  return {
    extendMarkdownIt(md: MarkdownIt): MarkdownIt {
      const extended = gitbookPlugin(md, { readDocumentText: readOpenDocument });

      // Stamp the forced colour scheme (gitbookViewer.colorScheme) onto the
      // preview. The renderer runs in the extension host, but the preview's
      // default "Strict" security level strips scripts from rendered content,
      // so an inline <script> would never run. Instead the wrapper prepends an
      // invisible marker element; media/preview.js (a contributed preview
      // script, which does run) reads it and sets body[data-gb-scheme].
      const original = extended.renderer.render.bind(extended.renderer);
      extended.renderer.render = (tokens, options, env): string => {
        const scheme = vscode.workspace
          .getConfiguration('gitbookViewer')
          .get<'auto' | 'light' | 'dark'>('colorScheme', 'auto');
        // Whitelist before interpolating into HTML: settings.json can hold
        // arbitrary strings, and anything unrecognised behaves as auto.
        const stamp =
          scheme === 'light' || scheme === 'dark'
            ? `<div data-gb-scheme-marker="${scheme}" style="display:none"></div>\n`
            : '';
        return stamp + original(tokens, options, env);
      };

      return extended;
    },
  };
}

export function deactivate(): void {
  // nothing to clean up
}
