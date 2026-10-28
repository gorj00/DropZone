import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, '..', 'android', 'app', 'src', 'main', 'res');
const neon = readFileSync(join(here, 'icon.svg'), 'utf8');

const STEALTH_COLORS = {
  '#5a1c6e': '#3a1a0c', '#1d1150': '#15161c', '#0b0724': '#08090c',
  '#123f7a': '#0f2a40', '#14124c': '#13151b', '#0a0722': '#08090c',
  '#3df0ff': '#5cc8ff', '#ff2e7e': '#ff5a1f',
  '#ff9cc2': '#ffb27a', '#ff1f6d': '#ff4d14',
  '#8f86d8': '#8a8f9c', '#2c2380': '#2c303a', '#07051a': '#050608',
  '#b6fcff': '#c9ecff', '#14b4cb': '#2a9fe0',
  '#a3124f': '#8a2a00', '#0b5f73': '#0b3f63'
};

const stealth = Object.entries(STEALTH_COLORS).reduce((s, [from, to]) => s.split(from).join(to), neon);
const themes = [{ source: neon, name: 'ic_launcher' }, { source: stealth, name: 'ic_launcher_stealth' }];
const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function svg(source, size, part) {
  let s = source.replace('viewBox="0 0 1024 1024" width="1024" height="1024"',
    part === 'full' ? `viewBox="0 0 1024 1024" width="${size}" height="${size}"` : `viewBox="-256 -256 1536 1536" width="${size}" height="${size}"`);
  if (part === 'foreground') s = s.replace(/<g id="background">[\s\S]*?<\/g>/, '');
  if (part === 'background') s = s.replace(/<g id="figures"[\s\S]*<\/svg>/, '</svg>');
  return Buffer.from(s);
}

const render = (source, size, part) => sharp(svg(source, size, part)).png();

function round(source, size) {
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return render(source, size, 'full').toBuffer().then(png => sharp(png).composite([{ input: circle, blend: 'dest-in' }]).png());
}

for (const { source, name } of themes) {
  for (const [density, f] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const layer = Math.round(108 * f);
    const legacy = Math.round(48 * f);
    await render(source, layer, 'foreground').toFile(join(dir, `${name}_foreground.png`));
    await render(source, layer, 'background').toFile(join(dir, `${name}_background.png`));
    await render(source, legacy, 'full').toFile(join(dir, `${name}.png`));
    await (await round(source, legacy)).toFile(join(dir, `${name}_round.png`));
  }
}

await render(neon, 1024, 'full').toFile(join(here, 'icon-only.png'));
await render(neon, 1024, 'foreground').toFile(join(here, 'icon-foreground.png'));
await render(neon, 1024, 'background').toFile(join(here, 'icon-background.png'));
await render(neon, 512, 'full').toFile(join(here, 'play-store-icon.png'));
console.log('Icons written');
