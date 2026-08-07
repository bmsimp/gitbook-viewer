import * as fs from 'node:fs';
import type { FileReader } from './context';

export const defaultFileReader: FileReader = (absolutePath: string): string | null => {
  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
};
