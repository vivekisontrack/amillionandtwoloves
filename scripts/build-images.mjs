// Image pipeline: turns the original photos in photos/<stop-id>/ into web-ready
// images in images/<stop-id>/ and records their sizes in images/manifest.json.
//
// For every photo it:
//   1. applies the camera's EXIF orientation,
//   2. strips all metadata (EXIF, GPS, XMP, IPTC, ICC) from the output,
//   3. writes a thumbnail (600 px long edge) and a full size (2000 px long edge) as WebP,
//   4. skips photos whose original has not changed since the last run.
//
// Usage:
//   npm run images            process new or changed photos
//   npm run images -- --prune also delete web images whose original is gone
//   npm run images -- --force reprocess everything

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTOS_DIR = path.join(ROOT, 'photos');
const IMAGES_DIR = path.join(ROOT, 'images');
const MANIFEST_PATH = path.join(IMAGES_DIR, 'manifest.json');
const CONTENT_PATH = path.join(ROOT, 'content', 'stops.json');
const FAVICON_PATH = path.join(ROOT, 'src', 'favicon.svg');

// Bump this when the output settings change, so every photo is regenerated.
const PIPELINE_VERSION = 1;

export const SIZES = {
  thumb: { longEdge: 600, targetBytes: 80 * 1024 },
  full: { longEdge: 2000, targetBytes: 400 * 1024 },
};
const QUALITY_STEPS = [82, 76, 70, 64, 58];
const SHARE_SIZE = { width: 1200, height: 630 };

export const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif', '.heic', '.heif']);

// Encodes one size of one photo. Tries decreasing quality until the file is
// under its target, and reports when even the lowest quality is too big.
async function encodeSize(input, { longEdge, targetBytes }) {
  let last;
  for (const quality of QUALITY_STEPS) {
    // sharp writes no metadata unless asked to (keepExif, withMetadata, ...),
    // so the output carries no EXIF, GPS, XMP or IPTC data.
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    last = { data, width: info.width, height: info.height, quality };
    if (data.length <= targetBytes) return { ...last, overTarget: false };
  }
  return { ...last, overTarget: true };
}

// Processes one original into thumb and full WebP files.
// outBase is the output path without suffix, e.g. images/lenk/03-church.
export async function processPhoto(srcPath, outBase) {
  const input = await readFile(srcPath);
  const result = {};
  for (const [name, size] of Object.entries(SIZES)) {
    const encoded = await encodeSize(input, size);
    const outPath = `${outBase}-${name}.webp`;
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, encoded.data);
    result[name] = {
      file: outPath,
      width: encoded.width,
      height: encoded.height,
      bytes: encoded.data.length,
      quality: encoded.quality,
      overTarget: encoded.overTarget,
    };
  }
  return result;
}

export function outputSlug(fileName) {
  return path
    .parse(fileName)
    .name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

async function listOriginals() {
  if (!existsSync(PHOTOS_DIR)) return [];
  const result = [];
  for (const stopDir of (await readdir(PHOTOS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const files = (await readdir(path.join(PHOTOS_DIR, stopDir.name)))
      .filter((f) => PHOTO_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();
    const slugs = new Map();
    for (const file of files) {
      const slug = outputSlug(file);
      if (slugs.has(slug)) {
        throw new Error(`photos/${stopDir.name}: "${file}" and "${slugs.get(slug)}" would produce the same output name. Rename one of them.`);
      }
      slugs.set(slug, file);
      result.push({ stop: stopDir.name, file, slug, path: path.join(PHOTOS_DIR, stopDir.name, file) });
    }
  }
  return result;
}

async function buildShareImage(manifest, content, force) {
  const key = content.shareImage;
  if (!key) return;
  const src = path.join(PHOTOS_DIR, key);
  if (!existsSync(src)) {
    if (!manifest.share) console.warn(`! Share image original photos/${key} not found; skipping share image.`);
    return;
  }
  const hash = await sha256(src);
  const outPath = path.join(IMAGES_DIR, 'share.jpg');
  if (!force && manifest.share?.sourceSha256 === hash && manifest.share?.from === key && existsSync(outPath)) return;
  const { data, info } = await sharp(src)
    .rotate()
    .resize({ ...SHARE_SIZE, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  await writeFile(outPath, data);
  manifest.share = { from: key, sourceSha256: hash, src: rel(outPath), width: info.width, height: info.height, bytes: data.length };
  console.log(`+ share image from ${key} (${Math.round(data.length / 1024)} KB)`);
}

async function buildTouchIcon(manifest, force) {
  const hash = await sha256(FAVICON_PATH);
  const outPath = path.join(IMAGES_DIR, 'apple-touch-icon.png');
  if (!force && manifest.touchIcon?.sourceSha256 === hash && existsSync(outPath)) return;
  await sharp(FAVICON_PATH, { density: 288 }).resize(180, 180).flatten({ background: '#f7f3ea' }).png().toFile(outPath);
  manifest.touchIcon = { sourceSha256: hash, src: rel(outPath), width: 180, height: 180 };
  console.log('+ apple touch icon');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');
  const prune = args.has('--prune');

  const content = await readJson(CONTENT_PATH, {});
  const manifest = await readJson(MANIFEST_PATH, { pipelineVersion: PIPELINE_VERSION, photos: {} });
  if (manifest.pipelineVersion !== PIPELINE_VERSION) {
    console.log('Pipeline settings changed; reprocessing every photo.');
  }
  const stale = manifest.pipelineVersion !== PIPELINE_VERSION;
  manifest.pipelineVersion = PIPELINE_VERSION;

  const originals = await listOriginals();
  let processed = 0;
  let skipped = 0;
  const warnings = [];

  for (const photo of originals) {
    const key = `${photo.stop}/${photo.file}`;
    const hash = await sha256(photo.path);
    const outBase = path.join(IMAGES_DIR, photo.stop, photo.slug);
    const prev = manifest.photos[key];
    const outputsExist = prev && existsSync(path.join(ROOT, prev.thumb.src)) && existsSync(path.join(ROOT, prev.full.src));
    if (!force && !stale && prev?.sourceSha256 === hash && outputsExist) {
      skipped++;
      continue;
    }
    let out;
    try {
      out = await processPhoto(photo.path, outBase);
    } catch (err) {
      throw new Error(`Could not process photos/${key}: ${err.message}\nIf this is a HEIC file, export it as JPEG and try again.`);
    }
    const entry = { sourceSha256: hash };
    for (const name of Object.keys(SIZES)) {
      const o = out[name];
      entry[name] = { src: rel(o.file), width: o.width, height: o.height, bytes: o.bytes };
      if (o.overTarget) {
        warnings.push(`${key} ${name} is ${Math.round(o.bytes / 1024)} KB, over the ${SIZES[name].targetBytes / 1024} KB target even at quality ${o.quality}.`);
      }
    }
    manifest.photos[key] = entry;
    processed++;
    console.log(`+ ${key}  thumb ${Math.round(out.thumb.bytes / 1024)} KB, full ${Math.round(out.full.bytes / 1024)} KB (${out.full.width}x${out.full.height})`);
  }

  const present = new Set(originals.map((p) => `${p.stop}/${p.file}`));
  const orphans = Object.keys(manifest.photos).filter((key) => !present.has(key));
  if (prune) {
    for (const key of orphans) {
      for (const name of Object.keys(SIZES)) await rm(path.join(ROOT, manifest.photos[key][name].src), { force: true });
      delete manifest.photos[key];
      console.log(`- removed ${key}`);
    }
  } else if (orphans.length) {
    console.log(`(${orphans.length} published photo(s) have no original in photos/ on this computer; kept. Use --prune to remove them.)`);
  }

  await mkdir(IMAGES_DIR, { recursive: true });
  await buildShareImage(manifest, content, force || stale);
  await buildTouchIcon(manifest, force || stale);

  // Sort keys so the manifest diff stays readable in git.
  manifest.photos = Object.fromEntries(Object.entries(manifest.photos).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`\nDone: ${processed} processed, ${skipped} unchanged.`);
  for (const w of warnings) console.warn(`! ${w}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
