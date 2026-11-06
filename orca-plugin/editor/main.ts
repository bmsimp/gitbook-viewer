// The GitBook view for Markdown files: a read-only render of the open file,
// re-rendered whenever the file changes. It never edits the document.

import { render, styles } from './vendor/gitbook-renderer.js'

// Page ground, text and plain-Markdown styles come from GitBook's palette
// (standalone-base.css), not Orca's theme colours, so the view looks like
// GitBook; only the light/dark choice follows Orca.
const page = `
html { background: rgb(var(--gb-tint-base)); }
:target { scroll-margin-top: 1rem; }
.gbv-unavailable { margin: 1rem 0; padding: 0.75rem 1rem; border-radius: 6px;
  border: 1px dashed rgb(var(--gb-tint-subtle)); background: rgb(var(--gb-tint-subtle) / 0.2);
  color: rgb(var(--gb-tint-muted)); font-size: 0.9em; }
.gbv-unavailable span { display: block; margin-top: 0.25rem; font-size: 0.9em; }
`

for (const css of [styles.fontsCss, styles.gitbookCss, styles.baseCss, page]) {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
}

const article = document.createElement('main')
article.className = 'gbv-article'
document.body.append(article)

// Orca marks the frame's <html> with `dark` or `light`; the GitBook styles key
// their dark palette off `.vscode-dark` on <body>, as in VS Code's preview.
function applyTheme() {
  document.body.classList.toggle('vscode-dark', document.documentElement.classList.contains('dark'))
}
applyTheme()
orca.on('theme', applyTheme)

function show(text: string) {
  try {
    article.innerHTML = render(text)
  } catch (err) {
    const pre = document.createElement('pre')
    pre.textContent = `GitBook render error:\n${err instanceof Error ? err.stack || err.message : String(err)}`
    article.replaceChildren(pre)
  }
  // preview.js (bundled with the renderer) rebuilds tab strips on this event,
  // exactly as it does after each update in VS Code's preview.
  window.dispatchEvent(new Event('vscode.markdown.updateContent'))
}

// Links: in-page anchors scroll, web links open outside Orca, and links to
// other pages do nothing here (the editor can't open other files).
article.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest?.('a[href]')
  if (!link) {
    return
  }
  event.preventDefault()
  const href = link.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: 'start' })
  } else if (/^(https?:|mailto:)/i.test(href)) {
    void orca.shell.openExternal(href)
  }
})

const editor = orca.document
if (!editor) {
  throw new Error('this file runs as a custom editor')
}
const doc = await editor.session<string>()
show(doc.value)
doc.onReplace(show)
