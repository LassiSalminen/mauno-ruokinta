// Generoi PWA-ikonit tassu-SVG:stä Playwrightin Chromiumilla: npm run icons
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const GREEN = '#66a446', DARK = '#4a7d32';
const PAW = '<ellipse cx="6" cy="9" rx="2.2" ry="3"/><ellipse cx="10" cy="5.5" rx="2.2" ry="3"/><ellipse cx="14.5" cy="5.5" rx="2.2" ry="3"/>'
  + '<ellipse cx="18.5" cy="9" rx="2.2" ry="3"/><path d="M12 11c-3.5 0-6.5 4.5-6.5 7 0 2 1.6 3 3.3 3 1.3 0 2-.7 3.2-.7s1.9.7 3.2.7c1.7 0 3.3-1 3.3-3 0-2.5-3-7-6.5-7z"/>';

// pawScale = tassun osuus ikonin leveydestä, radius = kulmien pyöristys (0 = täysi neliö)
function svg(size, { pawScale, radius }) {
  const p = size * pawScale, off = (size - p) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GREEN}"/><stop offset="1" stop-color="${DARK}"/></linearGradient></defs>
    <rect width="${size}" height="${size}" rx="${size * radius}" fill="url(#g)"/>
    <g transform="translate(${off} ${off}) scale(${p / 24})" fill="#fff">${PAW}</g></svg>`;
}

const ICONS = [
  ['icons/icon-192.png', 192, { pawScale: 0.62, radius: 0.22 }],
  ['icons/icon-512.png', 512, { pawScale: 0.62, radius: 0.22 }],
  ['icons/maskable-512.png', 512, { pawScale: 0.5, radius: 0 }], // pysyy maskable-turva-alueella
  ['icons/apple-touch-icon.png', 180, { pawScale: 0.6, radius: 0 }],
];

await mkdir('icons', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, opts] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, opts)}</body></html>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
  console.log('✓', file);
}
await browser.close();
