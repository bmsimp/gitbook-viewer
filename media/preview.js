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

  function build() {
    document.querySelectorAll('[data-gb-tabs]').forEach(function (group, groupIndex) {
      var strip = group.querySelector('.gb-tabs__strip');
      if (!strip || strip.childElementCount > 0) {
        return; // no strip to fill, or already built for this render
      }
      strip.setAttribute('role', 'tablist');

      var panels = group.querySelectorAll('.gb-tabs__tab');
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

  document.addEventListener('DOMContentLoaded', build);
  if (document.readyState !== 'loading') {
    build();
  }
})();
