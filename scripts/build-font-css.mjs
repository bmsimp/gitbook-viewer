import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FACES = [
  { weight: 400, file: '@fontsource/inter/files/inter-latin-400-normal.woff2' },
  { weight: 500, file: '@fontsource/inter/files/inter-latin-500-normal.woff2' },
  { weight: 600, file: '@fontsource/inter/files/inter-latin-600-normal.woff2' },
];

const blocks = await Promise.all(
  FACES.map(async ({ weight, file }) => {
    const base64 = (await readFile(require.resolve(file))).toString('base64');
    return `@font-face {
  font-family: 'GitBook Inter';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}`;
  }),
);

await writeFile(new URL('../media/fonts.css', import.meta.url), `${blocks.join('\n\n')}\n`, 'utf8');
console.log(`media/fonts.css written (${blocks.length} faces)`);
