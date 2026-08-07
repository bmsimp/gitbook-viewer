# GitBook Viewer

Renders GitBook block syntax in VS Code's **native** Markdown preview. Open any page from a GitBook-synced repo and press `Ctrl+Shift+V` (or `Ctrl+K V` for side-by-side) — it just works, no custom webview, no separate command.

Without this extension, a GitBook page in the preview is a wall of raw `{% hint %}` / `{% tabs %}` / `{% include %}` markers with the actual content squashed between them, includes missing entirely, and front matter rendered as a stray table. With it, hints become styled callouts, steppers and tabs get real structure, includes are spliced in place, content-refs and files render as cards, and the page description from front matter becomes a subtitle header — pixel-matched to GitBook's own light and dark palettes, with the Inter font bundled.

## Supported syntax

| Syntax | Rendering |
| --- | --- |
| `{% hint style="info\|warning\|danger\|success" %}` | Styled callout with icon, all 4 GitBook styles |
| `{% stepper %}` / `{% step %}` | Numbered step list with connecting rail |
| `{% tabs %}` / `{% tab title="…" %}` | Tab group (first tab selected, clickable in the preview) |
| `{% content-ref url="…" %}` | Page card using the target's front-matter title/description |
| `{% include "…" %}` | Target markdown spliced inline — nested includes, relative-path resolution from the including file, link/image path rebasing, plus cycle detection, a 5-level depth cap, and a per-document expansion budget |
| `{% embed url="…" %}` | Link card (the preview's CSP forbids iframes, so embeds don't play inline) |
| `{% file src="…" %}` | Download-style file card |
| `{% code overflow="wrap" %}` | Fenced code with GitBook's soft-wrap option |
| `{% @vendor/block … %}` | Integration placeholder card linking out to the vendor URL — Storylane demos get a play badge and "Interactive demo" labeling (the preview's CSP forbids live embeds) |
| Mention links | Both GitBook mention syntaxes — `[x](page.md "mention")` and raw `<a data-mention href="…">` — render the target page's title (or section heading for `#anchor` mentions) instead of the file name |
| `<details>` / `<summary>` | GitBook-style expand cards with a rotating chevron |
| Front matter `description` | GitBook-style page header (the description as a subtitle; `title` is deliberately not rendered and `icon` is reserved) |

Unsupported tags (e.g. `columns`, `expand`) are left as-is rather than mangled.

## Editor features

- **Diagnostics** — squiggles for missing `{% include %}` / `{% content-ref %}` / `{% file %}` / relative `{% embed %}` targets, unbalanced open/close tags, unknown tag names, and includes that escape the workspace.
- **Completion** — tag completion when you type `{%`, and file-path completion inside quoted attributes (`src=`, `url=`, include targets).
- **Snippets** — 11 `gb-` snippets covering every supported block (all four hint styles, stepper, tabs, content-ref, code, include, embed, file).

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `gitbookViewer.colorScheme` | `auto` | Which GitBook palette the preview uses: `auto` follows the editor theme, or force `light` / `dark`. Both palettes are pixel-matched to GitBook's. |
| `gitbookViewer.diagnostics.enabled` | `true` | Report broken `{% include %}`, `{% content-ref %}`, `{% file %}`, and relative `{% embed %}` targets. |

## Install

Not published to the Marketplace (deliberately). Two ways to get the VSIX:

**From source**

```sh
npm ci
npm run package
code --install-extension gitbook-viewer-0.1.0.vsix
```

**From CI**

Download the `gitbook-viewer-vsix` artifact from the latest [GitHub Actions run](https://github.com/bmsimp/gitbook-viewer/actions), unzip it, then:

```sh
code --install-extension gitbook-viewer.vsix
```

## Development

```sh
npm ci          # install
npm test        # unit tests (vitest)
npm run watch   # rebuild on change
```

Press **F5** to launch the Extension Development Host (the launch config opens a docs folder — edit `.vscode/launch.json` to point at yours).

To render-check an entire GitBook corpus through the real plugin and catch raw-tag remnants or include regressions:

```sh
npm run corpus -- <path-to-docs>
```

## Notes and limitations

- Inter is bundled and applied only to documents that actually contain GitBook syntax; plain Markdown previews are left alone.
- Embeds and integration blocks render as link cards — the Markdown preview's Content-Security-Policy forbids iframes.
- `<details>` expand-card styling applies in every Markdown preview, not just GitBook documents (per-page gating proved unreliable in the webview and a styled card is harmless).
- GitBook tag attributes *inside* included files (e.g. a `{% file src %}` within an include) are not path-rebased; regular links and images are.
- Nested tab groups are unsupported.

## License

MIT
