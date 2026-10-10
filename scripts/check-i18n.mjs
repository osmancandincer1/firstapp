// AYR-08 / §16.9: fails when locales differ or when code uses a missing key.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const localeDir = join(root, 'apps/mobile/src/i18n');
const srcDir = join(root, 'apps/mobile/src');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

const locales = readdirSync(localeDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    name: f,
    keys: new Set(flatten(JSON.parse(readFileSync(join(localeDir, f), 'utf8')))),
  }));

const errors = [];
const [base, ...others] = locales;
for (const other of others) {
  for (const k of base.keys) if (!other.keys.has(k)) errors.push(`${other.name} is missing "${k}"`);
  for (const k of other.keys) if (!base.keys.has(k)) errors.push(`${base.name} is missing "${k}"`);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory()
      ? walk(p)
      : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)
        ? [p]
        : [];
  });

const used = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g;
for (const file of walk(srcDir)) {
  for (const [, key] of readFileSync(file, 'utf8').matchAll(used)) {
    if (!base.keys.has(key)) errors.push(`${relative(root, file)} uses unknown key "${key}"`);
  }
}

if (errors.length) {
  console.error(`i18n check failed:\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n OK: ${locales.map((l) => `${l.name} (${l.keys.size})`).join(', ')}`);
