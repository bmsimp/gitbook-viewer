const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Intentional YAML subset: flat top-level string keys only, last key wins, no
// lists or nested maps. Folded/literal block scalars (>, >-, |, |-) are
// space-joined; everything else GitBook puts in front matter is ignored.

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

const BLOCK_SCALARS = new Set(['>', '>-', '|', '|-']);

export function extractPageMeta(source: string): PageMeta {
  const meta: PageMeta = {};
  const match = FRONT_MATTER.exec(source);

  if (match) {
    const lines = match[1]!.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const pair = /^(title|description|icon)\s*:\s*(.*)$/.exec(lines[i]!);
      if (!pair) {
        continue;
      }

      let value: string;
      if (BLOCK_SCALARS.has(pair[2]!.trim())) {
        // Block scalar: consume the following more-indented lines as the
        // value, joined with single spaces.
        const parts: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) {
          parts.push(lines[++i]!.trim());
        }
        value = parts.join(' ').trim();
      } else {
        value = unquote(pair[2]!);
      }

      if (value) {
        meta[pair[1] as keyof PageMeta] = value;
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
