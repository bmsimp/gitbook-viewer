import * as vscode from 'vscode';

interface TagSuggestion {
  label: string;
  insert: string;
  detail: string;
}

const SUGGESTIONS: TagSuggestion[] = [
  { label: 'hint', insert: '{% hint style="${1|info,warning,danger,success|}" %}\n$0\n{% endhint %}', detail: 'Callout box' },
  { label: 'stepper', insert: '{% stepper %}\n{% step %}\n$0\n{% endstep %}\n{% endstepper %}', detail: 'Numbered steps' },
  { label: 'step', insert: '{% step %}\n$0\n{% endstep %}', detail: 'One step' },
  { label: 'tabs', insert: '{% tabs %}\n{% tab title="${1:Title}" %}\n$0\n{% endtab %}\n{% endtabs %}', detail: 'Tab group' },
  { label: 'tab', insert: '{% tab title="${1:Title}" %}\n$0\n{% endtab %}', detail: 'One tab' },
  { label: 'content-ref', insert: '{% content-ref url="${1:page.md}" %}\n[${1:page.md}](${1:page.md})\n{% endcontent-ref %}', detail: 'Page card' },
  { label: 'include', insert: '{% include "${1:../.gitbook/includes/file.md}" %}', detail: 'Reusable snippet' },
  { label: 'code', insert: '{% code overflow="wrap" %}\n$0\n{% endcode %}', detail: 'Code wrapper' },
  { label: 'embed', insert: '{% embed url="${1:https://}" %}', detail: 'Embedded link' },
  { label: 'file', insert: '{% file src="${1:../.gitbook/assets/file.pdf}" %}', detail: 'Download card' },
];

export function registerTagCompletion(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      {
        provideCompletionItems(document, position) {
          const prefix = document.lineAt(position.line).text.slice(0, position.character);
          // A partially typed tag opener: `{`, `{%`, or `{% na`. The whole
          // match is replaced by the chosen snippet, which re-emits `{% `.
          const match = /\{%?\s*[\w-]*$/.exec(prefix);
          if (!match) {
            return undefined;
          }
          const start = position.character - match[0].length;
          const range = new vscode.Range(position.line, start, position.line, position.character);

          return SUGGESTIONS.map((suggestion) => {
            const item = new vscode.CompletionItem(suggestion.label, vscode.CompletionItemKind.Snippet);
            item.detail = suggestion.detail;
            item.insertText = new vscode.SnippetString(suggestion.insert);
            item.range = range;
            item.filterText = `{% ${suggestion.label}`;
            return item;
          });
        },
      },
      '{', '%',
    ),
  );
}
