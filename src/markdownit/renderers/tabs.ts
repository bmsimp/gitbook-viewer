import type { GitBookTag } from '../../syntax/scanner';
import type { RenderContext, RenderEnv, TagRenderer } from '../context';
import { escapeHtml } from '../context';

interface TabsEnv extends RenderEnv {
  gbTabIndex?: number;
}

export const tabsRenderer: TagRenderer = {
  open(_tag: GitBookTag, ctx: RenderContext): string {
    (ctx.env as TabsEnv).gbTabIndex = 0;
    return '<div class="gb-tabs" data-gb-tabs><div class="gb-tabs__strip" role="tablist"></div>';
  },
  close(): string {
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
