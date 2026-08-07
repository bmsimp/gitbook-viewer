export interface ParsedAttributes {
  named: Record<string, string>;
  positional: string[];
}

const TOKEN = /([A-Za-z_][\w-]*)\s*=\s*(["'])(.*?)\2|(["'])(.*?)\4/g;

/**
 * TOKEN backtracks quadratically over long unquoted runs (each position
 * greedily consumes the tail hunting for `=`), measured ~5s at 100k chars.
 * No legitimate GitBook tag carries anywhere near this much attribute text,
 * so oversized input parses as attribute-free rather than stalling the
 * extension host on every keystroke.
 */
const MAX_ATTRIBUTE_TEXT = 2000;

export function parseAttributes(input: string): ParsedAttributes {
  // Object.create(null) avoids inheriting Object.prototype, so a malicious or
  // accidental `__proto__="..."` attribute cannot pollute the prototype chain.
  const named: Record<string, string> = Object.create(null);
  const positional: string[] = [];

  if (input.length > MAX_ATTRIBUTE_TEXT) {
    return { named, positional };
  }

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
