import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('./version.properties', import.meta.url);
const props = Object.fromEntries(
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => line.split('=').map(part => part.trim()))
);
const versionCode = Number(props.versionCode) + 1;
if (!Number.isInteger(versionCode) || versionCode < 2) throw new Error(`Invalid versionCode in ${file.pathname}`);
const versionName = process.argv[2] ?? props.versionName;
writeFileSync(file, `versionCode=${versionCode}\nversionName=${versionName}\n`);
console.log(`versionCode=${versionCode} versionName=${versionName}`);
