import type { GitBookTag } from '../../syntax/scanner';
import type { RenderContext, RenderEnv, TagRenderer } from '../context';
import { escapeHtml } from '../context';

interface TabsEnv extends RenderEnv {
  /**
   * Position of the next tab within the current group. A single counter
   * assumes flat groups only: tabs nested inside a tab would clobber it.
   * GitBook itself does not support nested tabs, so a stack is deliberately
   * not built here.
   */
  gbTabIndex?: number;
}

export const tabsRenderer: TagRenderer = {
  open(_tag: GitBookTag, ctx: RenderContext): string {
    (ctx.env as TabsEnv).gbTabIndex = 0;
    return '<div class="gb-tabs" data-gb-tabs><div class="gb-tabs__strip" role="tablist"></div>';
  },
  close(_tag: GitBookTag, ctx: RenderContext): string {
    // Clear the counter so a stray {% tab %} after a closed group starts at
    // index 0 (visible) instead of inheriting a stale index and hiding itself.
    delete (ctx.env as TabsEnv).gbTabIndex;
    return '</div>';
  },
};

export const tabRenderer: TagRenderer = {
  open(tag: GitBookTag, ctx: RenderContext): string {
    const env = ctx.env as TabsEnv;
    const index = env.gbTabIndex ?? 0;
    env.gbTabIndex = index + 1;

    const title = escapeHtml(tag.named.title ?? `Tab ${index + 1}`);
    const active = index === 0;

    return (
      `<div class="gb-tabs__tab" data-gb-tab-index="${index}" ` +
      `data-gb-active="${active}" data-gb-tab-title="${title}"${active ? '' : ' hidden'}>`
    );
  },
  close(): string {
    return '</div>';
  },
};
