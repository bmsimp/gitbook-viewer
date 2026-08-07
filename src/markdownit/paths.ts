import * as path from 'node:path';

/**
 * On Windows, `path.resolve('/docs', 'x.md')` prepends the current drive
 * letter (`G:\docs\x.md`), which breaks lookups against POSIX-style paths
 * such as those used by in-memory test file maps. When the document path is
 * POSIX-style (no backslash, no drive letter), resolve with path.posix so the
 * result stays driveless. Windows-style paths get path.win32 explicitly —
 * not the platform module — so they behave identically on any OS (CI runs
 * on Linux, where the platform module would treat `C:\x` as one segment).
 */
export function pathModuleFor(docPath: string): path.PlatformPath {
  return !docPath.includes('\\') && !/^[A-Za-z]:/.test(docPath) ? path.posix : path.win32;
}
