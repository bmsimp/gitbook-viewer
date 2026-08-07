import { escapeHtml } from '../context';

export function renderIncludeError(reason: string): string {
  return `<div class="gb-include-error"><strong>GitBook include failed:</strong> ${escapeHtml(reason)}</div>`;
}
