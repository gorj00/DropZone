import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, '..', 'android', 'app', 'src', 'main', 'res');
const icon = readFileSync(join(here, 'icon.svg'), 'utf8');
const themes = ['ic_launcher', 'ic_launcher_stealth'];
const densities = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const FIGURES = '<g id="figures" transform="scale(2)">';
const SAFE = '<g id="figures" transform="translate(512 512) scale(.86) translate(-512 -512) scale(2)">';

function svg(size, part) {
  let s = icon.replace('viewBox="0 0 1024 1024" width="1024" height="1024"',
    part === 'foreground' || part === 'background' ? `viewBox="-256 -256 1536 1536" width="${size}" height="${size}"` : `viewBox="0 0 1024 1024" width="${size}" height="${size}"`);
  if (part === 'foreground' || part === 'round') s = s.replace(FIGURES, SAFE);
  if (part === 'foreground') s = s.replace(/<g id="background">[\s\S]*?<\/g>/, '');
  if (part === 'background') s = s.replace(/<g id="figures"[\s\S]*<\/svg>/, '</svg>');
  return Buffer.from(s);
}

const render = (size, part) => sharp(svg(size, part)).png();

async function round(size) {
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  return sharp(await render(size, 'round').toBuffer()).composite([{ input: circle, blend: 'dest-in' }]).png();
}

async function ico(sizes) {
  const pngs = await Promise.all(sizes.map(size => render(size, 'full').toBuffer()));
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach((png, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(sizes[i] % 256, at);
    head.writeUInt8(sizes[i] % 256, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs]);
}

for (const name of themes) {
  for (const [density, f] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const layer = Math.round(108 * f);
    const legacy = Math.round(48 * f);
    await render(layer, 'foreground').toFile(join(dir, `${name}_foreground.png`));
    await render(layer, 'background').toFile(join(dir, `${name}_background.png`));
    await render(legacy, 'full').toFile(join(dir, `${name}.png`));
    await (await round(legacy)).toFile(join(dir, `${name}_round.png`));
  }
}

await render(1024, 'full').toFile(join(here, 'icon-only.png'));
await render(1024, 'foreground').toFile(join(here, 'icon-foreground.png'));
await render(1024, 'background').toFile(join(here, 'icon-background.png'));
await render(512, 'full').toFile(join(here, 'play-store-icon.png'));
await render(512, 'full').toFile(join(here, '..', '..', 'website', 'icon.png'));
writeFileSync(join(here, '..', 'public', 'favicon.ico'), await ico([16, 32, 48]));
console.log('Icons written');
