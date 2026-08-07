import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { checkReferences, type Issue } from './referenceChecker';

const SEVERITY: Record<Issue['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

const DEBOUNCE_MS = 300;

export function registerDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('gitbook');
  context.subscriptions.push(collection);

  const timers = new Map<string, NodeJS.Timeout>();

  function refresh(document: vscode.TextDocument): void {
    if (document.languageId !== 'markdown' || document.uri.scheme !== 'file') {
      return;
    }

    if (!vscode.workspace.getConfiguration('gitbookViewer').get<boolean>('diagnostics.enabled', true)) {
      collection.delete(document.uri);
      return;
    }

    const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
    const issues = checkReferences(document.getText(), document.uri.fsPath, (p) => fs.existsSync(p), root);

    collection.set(
      document.uri,
      issues.map((issue) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(issue.line, issue.startCol, issue.line, issue.endCol),
          issue.message,
          SEVERITY[issue.severity],
        );
        diagnostic.source = 'GitBook Viewer';
        diagnostic.code = issue.code;
        return diagnostic;
      }),
    );
  }

  function schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        refresh(document);
      }, DEBOUNCE_MS),
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('gitbookViewer.diagnostics.enabled')) {
        vscode.workspace.textDocuments.forEach(refresh);
      }
    }),
    {
      dispose(): void {
        timers.forEach(clearTimeout);
        timers.clear();
      },
    },
  );

  vscode.workspace.textDocuments.forEach(refresh);
}
