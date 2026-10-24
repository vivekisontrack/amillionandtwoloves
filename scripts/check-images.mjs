// Privacy check: fails if any published image still carries metadata,
// above all GPS location. Scans images/ and, if it exists, dist/.
//
// Every file is checked twice: once with our own byte-level parser and once
// with sharp, so a bug in one does not hide a leak.

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { hasAnyMetadata, scanMetadata } from './lib/metadata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) yield full;
  }
}

// Returns a list of problems for one file (empty when clean).
export async function checkImage(file) {
  const problems = [];
  const buf = await readFile(file);
  const found = scanMetadata(buf);
  if (found.gps) problems.push('GPS location data');
  if (found.exif) problems.push('EXIF data');
  if (found.xmp) problems.push('XMP data');
  if (found.iptc) problems.push('IPTC data');
  problems.push(...found.other);

  const meta = await sharp(buf).metadata();
  if (meta.exif && !found.exif) problems.push('EXIF data (reported by sharp)');
  if (meta.xmp && !found.xmp) problems.push('XMP data (reported by sharp)');
  if (meta.iptc && !found.iptc) problems.push('IPTC data (reported by sharp)');
  return problems;
}

export async function checkDirs(dirs) {
  let count = 0;
  const failures = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for await (const file of walk(dir)) {
      count++;
      const problems = await checkImage(file);
      if (problems.length) failures.push({ file: path.relative(ROOT, file), problems });
    }
  }
  return { count, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { count, failures } = await checkDirs([path.join(ROOT, 'images'), path.join(ROOT, 'dist')]);
  if (failures.length) {
    console.error(`Metadata check FAILED: ${failures.length} of ${count} image(s) contain metadata.`);
    for (const f of failures) console.error(`  ${f.file}: ${f.problems.join(', ')}`);
    console.error('Run "npm run images -- --force" to regenerate them without metadata.');
    process.exit(1);
  }
  console.log(`Metadata check passed: ${count} image(s), no GPS or other metadata.`);
}
