import { globSync, statSync } from 'node:fs';

const fonts = globSync('dist/**/*.{woff,woff2,ttf,otf}');
if (fonts.length > 4) throw new Error('Font budget exceeded: at most four files');
const fontBytes = fonts.reduce((sum, file) => sum + statSync(file).size, 0);
console.log(`Fonts: ${fontBytes} bytes / 220000 bytes (${fonts.length} files)`);
if (fontBytes > 220000) throw new Error('Font budget exceeded: 220 KB');

export default [
  {
    name: 'Initial JS (all page chunks plus registration, gzip)',
    path: ['dist/assets/*.js', 'dist/registerSW.js'],
    gzip: true,
    brotli: false,
    limit: '170 KB',
  },
  { name: 'CSS (gzip)', path: 'dist/assets/*.css', gzip: true, brotli: false, limit: '30 KB' },
];
