export interface ParsedAttributes {
  named: Record<string, string>;
  positional: string[];
}

const TOKEN = /([A-Za-z_][\w-]*)\s*=\s*(["'])(.*?)\2|(["'])(.*?)\4/g;

export function parseAttributes(input: string): ParsedAttributes {
  const named: Record<string, string> = {};
  const positional: string[] = [];

  for (const match of input.matchAll(TOKEN)) {
    const [, key, , namedValue, , positionalValue] = match;
    if (key !== undefined && namedValue !== undefined) {
      named[key] = namedValue;
    } else if (positionalValue !== undefined) {
      positional.push(positionalValue);
    }
  }

  return { named, positional };
}
