// The slice of Orca's custom-editor API this plugin uses. Orca's generated
// typings (`orca plugin types`) can replace this; it is kept local because some
// Orca builds ship without the file that command copies.

interface OrcaEditorSession<T> {
  readonly value: T;
  readonly readOnly: boolean;
  onReplace(handler: (value: T) => void): void;
  change(value: T): void;
  dispose(): void;
}

interface OrcaEditorDocumentApi {
  session<T>(options?: { merge?: (base: T, outside: T, mine: T) => T }): Promise<OrcaEditorSession<T>>;
}

declare const orca: {
  readonly document?: OrcaEditorDocumentApi;
  on(event: 'theme', handler: () => void): void;
  readonly shell: { openExternal(url: string): Promise<unknown> };
};
