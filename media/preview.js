(function () {
  'use strict';

  /**
   * Active panel index per tab group, keyed by the group's ordinal position.
   *
   * VS Code re-runs preview scripts and replaces the preview DOM on every
   * content change (i.e. on every keystroke), so this map deliberately lives on
   * a namespaced window property rather than in this closure: re-injecting the
   * script builds a fresh closure, and anything held here would reset the
   * reader's selection back to the first tab mid-edit. The property is created
   * only if absent so it survives re-injection, and it is the only name this
   * script puts on window.
   */
  var STATE_KEY = '__gitbookViewerTabState';
  if (!window[STATE_KEY]) {
    window[STATE_KEY] = Object.create(null);
  }
  var activeByGroup = window[STATE_KEY];

  // Ids are scoped to this preview's document (each preview is its own
  // webview), so the same ids in another open preview cannot collide.
  function buttonId(groupIndex, index) {
    return 'gb-tab-btn-' + groupIndex + '-' + index;
  }

  function panelId(groupIndex, index) {
    return 'gb-tab-panel-' + groupIndex + '-' + index;
  }

  /**
   * Show the panel at position "index" within "group" and hide the rest.
   *
   * Panels and buttons are paired by ordinal position, which is the same order
   * the buttons were built in, so the two stay in lockstep even if the markup's
   * data-gb-tab-index values were ever non-sequential.
   */
  function activate(group, groupIndex, index) {
    activeByGroup[groupIndex] = index;

    group.querySelectorAll('.gb-tabs__tab').forEach(function (panel, i) {
      var isActive = i === index;
      panel.setAttribute('data-gb-active', String(isActive));
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });

    // Roving focus: only the selected tab is in the page tab order, so Tab
    // enters/leaves the strip once and the arrow keys move within it.
    group.querySelectorAll('.gb-tabs__button').forEach(function (button, i) {
      var isSelected = i === index;
      button.setAttribute('aria-selected', String(isSelected));
      button.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
  }

  /** Resolve an arrow/Home/End key to the tab it should move to, or -1. */
  function keyTarget(key, index, count) {
    if (key === 'ArrowRight') {
      return index === count - 1 ? 0 : index + 1;
    }
    if (key === 'ArrowLeft') {
      return index === 0 ? count - 1 : index - 1;
    }
    if (key === 'Home') {
      return 0;
    }
    if (key === 'End') {
      return count - 1;
    }
    return -1;
  }

  /**
   * Mark the body when the rendered document contains GitBook markup so the
   * stylesheet can scope document-wide styling (the Inter font) to GitBook
   * pages without leaking into plain markdown previews. The selector list names
   * the renderers' top-level classes precisely rather than sniffing with
   * [class*="gb-"], which would also match unrelated classes like "rgb-swatch".
   */
  var GITBOOK_MARKUP =
    '[data-gb-tabs], .gb-hint, .gb-stepper, .gb-content-ref, .gb-file, ' +
    '.gb-embed, .gb-integration, .gb-code, .gb-page-header, .gb-include-error, ' +
    // A successful include renders without chrome (matching GitBook), so the
    // renderer emits a hidden marker span purely for this probe; mentions are
    // plain spans. Without these, a page whose only GitBook features are
    // includes/mentions would never be detected and lose the gated styling
    // (expand cards, Inter). Raw a[data-mention] anchors count too: an
    // unresolvable html mention renders with no gb-mention span at all.
    '.gb-mention, .gb-include-marker, a[data-mention]';

  function markDocument() {
    if (document.querySelector(GITBOOK_MARKUP)) {
      document.body.setAttribute('data-gb-doc', '');
    } else {
      document.body.removeAttribute('data-gb-doc');
    }

    // The extension host cannot script the preview directly (Strict security
    // strips scripts from rendered content), so a forced colour scheme travels
    // as a hidden marker element prepended to the rendered HTML.
    var schemeMarker = document.querySelector('[data-gb-scheme-marker]');
    if (schemeMarker) {
      document.body.setAttribute('data-gb-scheme', schemeMarker.getAttribute('data-gb-scheme-marker'));
    } else {
      document.body.removeAttribute('data-gb-scheme');
    }
  }

  // Nested tab groups are unsupported: groups are matched by a flat
  // querySelectorAll, inheriting the renderer's flat-groups assumption.
  function build() {
    markDocument();
    document.querySelectorAll('[data-gb-tabs]').forEach(function (group, groupIndex) {
      var strip = group.querySelector('.gb-tabs__strip');
      if (!strip) {
        return; // no strip to fill
      }

      var panels = group.querySelectorAll('.gb-tabs__tab');
      // In sync when every panel has its button. VS Code's preview updater
      // diffs the DOM and can preserve subtrees, so a built strip may survive
      // while panels are added or removed; rebuilding from scratch on any
      // mismatch keeps buttons and panels paired by ordinal.
      if (strip.childElementCount === panels.length) {
        return; // already built for this markup
      }
      while (strip.firstChild) {
        strip.removeChild(strip.firstChild);
      }
      strip.setAttribute('role', 'tablist');

      panels.forEach(function (panel, index) {
        // Ids are derived from position so they stay stable across re-renders.
        var ownButtonId = buttonId(groupIndex, index);
        var ownPanelId = panelId(groupIndex, index);

        panel.id = ownPanelId;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', ownButtonId);

        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'gb-tabs__button';
        button.id = ownButtonId;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', ownPanelId);
        button.setAttribute('tabindex', '-1');
        button.textContent = panel.getAttribute('data-gb-tab-title') || 'Tab ' + (index + 1);
        button.addEventListener('click', function () {
          activate(group, groupIndex, index);
        });
        button.addEventListener('keydown', function (event) {
          var next = keyTarget(event.key, index, panels.length);
          if (next < 0) {
            return;
          }
          event.preventDefault();
          activate(group, groupIndex, next);
          var target = group.querySelectorAll('.gb-tabs__button')[next];
          if (target) {
            target.focus();
          }
        });
        strip.appendChild(button);
      });

      var remembered = activeByGroup[groupIndex];
      var initial = typeof remembered === 'number' && remembered < panels.length ? remembered : 0;
      activate(group, groupIndex, initial);
    });
  }

  // Register the listener only while the document is still parsing.
  // DOMContentLoaded fires once per document; an unconditional
  // addEventListener would leave a dead listener attached.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  // VS Code's markdown preview does NOT re-run contributed scripts on
  // content changes. It patches the DOM in place and dispatches this custom
  // event afterwards; without it we would only ever see the initial (often
  // still empty) document shell. build() is idempotent, so re-running it on
  // every update is safe, and the strip/panel count guard rebuilds tab strips
  // the patcher wiped. Scripts load once per webview, so this registers once.
  window.addEventListener('vscode.markdown.updateContent', build);
})();
