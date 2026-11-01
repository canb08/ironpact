import { existsSync, globSync, readFileSync, statSync } from 'node:fs';

const fonts = globSync('dist/**/*.{woff,woff2,ttf,otf}');
if (fonts.length > 4) throw new Error('Font budget exceeded: at most four files');
const fontBytes = fonts.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Fonts: ${fontBytes} bytes / 220000 bytes (${fonts.length} files)`);
if (fontBytes > 220000) throw new Error('Font budget exceeded: 220 KB');

// Initial JS = what index.html loads up front (entry + modulepreloads); lazy route chunks are excluded.
function initialScripts() {
  if (!existsSync('dist/index.html')) throw new Error('Run npm run build before npm run size');
  const html = readFileSync('dist/index.html', 'utf8');
  const scripts = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((match) => `dist/${match[1]}`);
  if (!scripts.length) throw new Error('No entry script found in dist/index.html');
  return [...scripts, 'dist/registerSW.js'].filter((file) => existsSync(file));
}

export default [
  {
    name: 'Initial JS (entry + modulepreloads + registration, gzip)',
    path: initialScripts(),
    gzip: true,
    brotli: false,
    limit: '170 KB',
  },
  {
    name: 'All JS incl. lazy routes (gzip, tracking ceiling)',
    path: ['dist/assets/*.js', 'dist/registerSW.js'],
    gzip: true,
    brotli: false,
    limit: '400 KB',
  },
  { name: 'CSS (gzip)', path: 'dist/assets/*.css', gzip: true, brotli: false, limit: '30 KB' },
];
