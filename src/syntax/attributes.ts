export interface ParsedAttributes {
  named: Record<string, string>;
  positional: string[];
}

const TOKEN = /([A-Za-z_][\w-]*)\s*=\s*(["'])(.*?)\2|(["'])(.*?)\4/g;

export function parseAttributes(input: string): ParsedAttributes {
  // Object.create(null) avoids inheriting Object.prototype, so a malicious or
  // accidental `__proto__="..."` attribute cannot pollute the prototype chain.
  const named: Record<string, string> = Object.create(null);
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
