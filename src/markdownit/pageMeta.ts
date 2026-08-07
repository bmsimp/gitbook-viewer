const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface PageMeta {
  title?: string;
  description?: string;
  icon?: string;
}

export function stripFrontMatter(source: string): string {
  return source.replace(FRONT_MATTER, '');
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? quoted[2]! : trimmed;
}

export function extractPageMeta(source: string): PageMeta {
  const meta: PageMeta = {};
  const match = FRONT_MATTER.exec(source);

  if (match) {
    for (const line of match[1]!.split(/\r?\n/)) {
      const pair = /^(title|description|icon)\s*:\s*(.+)$/.exec(line);
      if (pair) {
        meta[pair[1] as keyof PageMeta] = unquote(pair[2]!);
      }
    }
  }

  if (!meta.title) {
    const heading = /^#\s+(.+)$/m.exec(stripFrontMatter(source));
    if (heading) {
      meta.title = heading[1]!.trim();
    }
  }

  return { title: meta.title, description: meta.description, icon: meta.icon };
}
