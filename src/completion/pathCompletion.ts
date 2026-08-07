import * as vscode from 'vscode';
import { pathModuleFor } from '../markdownit/paths';

/** Matches an unterminated quoted value belonging to a GitBook path attribute. */
const OPEN_QUOTE = /\{%\s*(?:include|content-ref\s+url\s*=|file\s+src\s*=|embed\s+url\s*=)\s*"([^"]*)$/;

export function registerPathCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      {
        async provideCompletionItems(document, position) {
          const prefix = document.lineAt(position.line).text.slice(0, position.character);
          const match = OPEN_QUOTE.exec(prefix);
          if (!match) {
            return undefined;
          }

          const typed = match[1]!;
          const path = pathModuleFor(document.uri.fsPath);
          // Typed paths in markdown are always forward-slash, so the typed
          // part is split with posix semantics even when the document's own
          // fsPath is a Windows path; the platform module then resolves the
          // mixed-separator join, which Windows path handling accepts.
          const typedDir = typed.endsWith('/') ? typed : path.posix.dirname(typed);
          const baseDir = path.resolve(path.dirname(document.uri.fsPath), typedDir === '.' ? '' : typedDir);

          let entries: [string, vscode.FileType][];
          try {
            entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(baseDir));
          } catch {
            return undefined;
          }

          return entries
            .filter(
              ([name, type]) =>
                type === vscode.FileType.Directory ||
                name.toLowerCase().endsWith('.md') ||
                /\.(pdf|ya?ml|json|png|jpe?g|gif|svg|zip)$/i.test(name),
            )
            .map(([name, type]) => {
              const isDirectory = type === vscode.FileType.Directory;
              const item = new vscode.CompletionItem(
                isDirectory ? `${name}/` : name,
                isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
              );
              if (isDirectory) {
                // Re-open suggestions so the user can keep descending.
                item.command = { command: 'editor.action.triggerSuggest', title: 'Continue' };
              }
              return item;
            });
        },
      },
      '"', '/',
    ),
  );
}
