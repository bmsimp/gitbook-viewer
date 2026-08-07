(function () {
  'use strict';

  /**
   * Active panel index per tab group, keyed by the group's ordinal position.
   *
   * VS Code re-runs preview scripts on every content change, so this map is a
   * best-effort memory only. The durable state lives in the DOM: when a group's
   * strip already holds buttons we leave the group completely alone, which
   * preserves whatever the reader had selected.
   */
  var activeByGroup = Object.create(null);

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

    group.querySelectorAll('.gb-tabs__button').forEach(function (button, i) {
      button.setAttribute('aria-selected', String(i === index));
    });
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
        button.textContent = panel.getAttribute('data-gb-tab-title') || 'Tab ' + (index + 1);
        button.addEventListener('click', function () {
          activate(group, groupIndex, index);
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
