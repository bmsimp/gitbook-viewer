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

## Standalone / Orca preview

The GitBook renderer also runs outside VS Code, so you can preview GitBook content in any browser — including Orca's embedded one — with live reload as you edit. It reuses the *same* `src/markdownit/` plugin and `media/` assets (no fork) and never touches the extension build.

**One-time setup** — from this repo, install the two commands globally:

```sh
npm ci
npm link        # adds gitbook-serve and gitbook-render to your PATH
```

Undo with `npm unlink -g gitbook-viewer`. Commands read the plugin source straight from this checkout, so a `git pull` here updates them — no rebuild needed. (Without linking, `npm run serve -- …` and `npm run render -- …` work from this repo.)

**Preview docs with live reload**

```sh
gitbook-serve --orca                       # this folder, opened in Orca's browser
gitbook-serve docs/guides/setup.md --orca  # open a specific page
gitbook-serve path/to/docs --open          # OS default browser instead
gitbook-serve --help                       # all options
```

Saving any file under the docs tree refreshes the open page, keeping your scroll position. Which folder gets served:

- **A folder** is served as-is — unless it has a `.gitbook.yaml`, in which case the `root:` it names is served.
- **A page** is opened inside its docs root so links to other pages work: the nearest `.gitbook.yaml` root or `SUMMARY.md` folder above it, else the current folder (if the page is inside it), else the page's own folder.

Each page is served at a URL that mirrors its path on disk, so relative links (`[x](../other.md)`), images, `{% include %}` targets, and `page.md#heading` anchors all work. Folders show their `README.md` plus an "In this folder" listing, extensionless links fall back to `.md`, and a breadcrumb bar tracks where you are. A file that fails to render shows the error in the page rather than stopping the server.

| Option | Default | Description |
| --- | --- | --- |
| `--orca` | off | Open in Orca's browser via `ORCA_CLI_COMMAND` (set in Orca terminals) or `orca` on `PATH` |
| `--open` | off | Open in the OS default browser |
| `--port <n>` | `4100` | Tries the next 10 ports if busy; `0` picks any free port |
| `--host <addr>` | `127.0.0.1` | Interface to bind. The default keeps docs on this machine only |
| `--scheme <s>` | `auto` | `auto` follows the OS, or force `light` / `dark` |
| `--no-reload` | off | Don't watch files |

By default the server only listens on `127.0.0.1`, only answers requests addressed to `localhost`/`127.0.0.1` (blocking DNS-rebinding attacks from web pages), only serves files inside the docs root (symlinks included), and accepts only `GET`/`HEAD`.

**GitBook view inside Orca's editor**

The `orca-plugin/` folder is an Orca plugin that adds a **GitBook** view beside **Source** on every Markdown tab. Switch to it from the view buttons at the top right of the tab: no server, no browser tab, and it re-renders whenever the file changes. It follows Orca's light/dark theme.

One-time setup, from this repo (Orca prints an approval fingerprint the first time; re-run with `--approve <fingerprint>` to accept it):

```sh
npm run build:orca                       # bundles the renderer into the plugin
orca plugin dev load "<path-to-this-repo>/orca-plugin"
```

It then lives under Settings → Plugins → Development folders and reloads itself when the plugin files change, so re-run `npm run build:orca` after pulling renderer changes. Remove it with `orca plugin dev unload <path>`.

Orca gives an editor view only the open file's text — not its location or any other file — so this view is for the page you're working on. Includes and relative images show a "not shown in this view" note, content-ref and mention cards show the link rather than the target page's title, and links to other pages don't navigate. Use `gitbook-serve --orca` when you need those.

**Render one page to a self-contained HTML file**

```sh
gitbook-render docs/page.md                  # writes to your temp folder, prints a file:// URL
gitbook-render docs/page.md -o page.html --open --scheme light
```

Fonts, styles, and the tab script are inlined into one portable file — handy for sharing or archiving a page.

The editor-only features (diagnostics, completion, snippets) are VS Code–specific and not part of the standalone tools — they aren't needed to *view* a page.

## Notes and limitations

- Inter is bundled and applied only to documents that actually contain GitBook syntax; plain Markdown previews are left alone.
- Embeds and integration blocks render as link cards — the Markdown preview's Content-Security-Policy forbids iframes.
- `<details>` expand-card styling applies in every Markdown preview, not just GitBook documents (per-page gating proved unreliable in the webview and a styled card is harmless).
- GitBook tag attributes *inside* included files (e.g. a `{% file src %}` within an include) are not path-rebased; regular links and images are.
- Nested tab groups are unsupported.

## License

MIT
