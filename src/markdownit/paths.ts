import * as path from 'node:path';

/**
 * On Windows, `path.resolve('/docs', 'x.md')` prepends the current drive
 * letter (`G:\docs\x.md`), which breaks lookups against POSIX-style paths
 * such as those used by in-memory test file maps. When the document path is
 * POSIX-style (no backslash, no drive letter), resolve with path.posix so the
 * result stays driveless; real Windows fsPaths keep platform behavior.
 */
export function pathModuleFor(docPath: string): path.PlatformPath {
  return !docPath.includes('\\') && !/^[A-Za-z]:/.test(docPath) ? path.posix : path;
}
