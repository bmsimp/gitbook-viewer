import {
  KNOWN_TAGS,
  REQUIRED_CLOSE_TAGS,
  scan,
  type GitBookTag,
} from '../syntax/scanner';
import { pathModuleFor } from '../markdownit/paths';

export type IssueSeverity = 'error' | 'warning' | 'information';
export type IssueCode = 'missing-target' | 'unbalanced' | 'unknown-tag' | 'outside-workspace';

export interface Issue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  /** Zero-based line number of the offending tag. */
  line: number;
  startCol: number;
  endCol: number;
}

export type ExistsCheck = (absolutePath: string) => boolean;

/** Attribute holding a filesystem reference, per tag. */
const TARGET_ATTRIBUTE: Record<string, string> = {
  'content-ref': 'url',
  file: 'src',
  embed: 'url',
};

function targetOf(tag: GitBookTag): string | undefined {
  if (tag.name === 'include') {
    return tag.positional[0];
  }
  const attribute = TARGET_ATTRIBUTE[tag.name];
  return attribute ? tag.named[attribute] : undefined;
}

function issueAt(tag: GitBookTag, severity: IssueSeverity, code: IssueCode, message: string): Issue {
  return { severity, code, message, line: tag.line, startCol: tag.startCol, endCol: tag.endCol };
}

/**
 * Statically check a GitBook markdown document for broken local references,
 * unbalanced container tags, and unknown tags.
 *
 * Pure: filesystem access is injected via `exists`, and path semantics follow
 * the shape of `documentPath` (see pathModuleFor), so POSIX-style test paths
 * behave identically on Windows.
 *
 * When `workspaceRoot` is given, includes that resolve outside it are flagged
 * as informational even if the target exists.
 */
export function checkReferences(
  text: string,
  documentPath: string,
  exists: ExistsCheck,
  workspaceRoot?: string,
): Issue[] {
  const issues: Issue[] = [];
  const tags = scan(text);
  const openStack: GitBookTag[] = [];
  const path = pathModuleFor(documentPath);
  const baseDir = path.dirname(documentPath);

  for (const tag of tags) {
    if (!KNOWN_TAGS.has(tag.name)) {
      issues.push(issueAt(tag, 'information', 'unknown-tag', `Unknown GitBook tag "${tag.name}".`));
      continue;
    }

    if (tag.kind === 'close') {
      const last = openStack.pop();
      if (!last || last.name !== tag.name) {
        if (last) {
          openStack.push(last);
        }
        issues.push(
          issueAt(tag, 'error', 'unbalanced', `"{% end${tag.name} %}" has no matching "{% ${tag.name} %}".`),
        );
      }
      continue;
    }

    if (REQUIRED_CLOSE_TAGS.has(tag.name)) {
      openStack.push(tag);
    }

    const target = targetOf(tag);
    // Skip external/self references: scheme (https:, mailto:), protocol-relative,
    // and pure-anchor targets are not filesystem paths.
    if (target && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) {
      const withoutAnchor = target.split('#')[0] ?? '';
      if (withoutAnchor) {
        const resolved = path.resolve(baseDir, withoutAnchor);
        // Extensionless targets follow GitBook's directory convention.
        const candidate = path.extname(resolved) ? resolved : path.join(resolved, 'README.md');
        if (!exists(candidate)) {
          issues.push(issueAt(tag, 'warning', 'missing-target', `Target not found: ${target}`));
        } else if (tag.name === 'include' && workspaceRoot) {
          const rel = path.relative(workspaceRoot, resolved);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            issues.push(
              issueAt(tag, 'information', 'outside-workspace', `Include resolves outside the workspace: ${target}`),
            );
          }
        }
      }
    }
  }

  for (const unclosed of openStack) {
    issues.push(
      issueAt(
        unclosed,
        'error',
        'unbalanced',
        `"{% ${unclosed.name} %}" is never closed with "{% end${unclosed.name} %}".`,
      ),
    );
  }

  return issues.sort((a, b) => a.line - b.line);
}
