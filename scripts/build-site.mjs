// Builds the static site into dist/ from content/stops.json, the image
// manifest (images/manifest.json) and the files in src/.
//
// Usage: npm run build

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_WASH, MINI, OVERVIEW, PINNED_STOP, miniMap, overviewMap } from '../src/maps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

// Grey tiles shown in a chapter until its photos are added.
const PLACEHOLDER_TILES = 12;
const TILTS = ['-0.8deg', '0.6deg', '-0.4deg', '0.9deg', '-0.6deg'];
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&display=swap';

// A hand-drawn heart: a watercolor wash under a pen outline with a small
// overshoot where the stroke closes. Replaces "♥" in the footer text.
const HEART_PATH =
  'M12 20.4C9.1 18.1 3.3 14.2 3.5 8.7 3.6 5.5 6.3 3.7 8.9 4.3 10.6 4.8 11.6 6.1 12 7.6 12.5 6 13.7 4.6 15.6 4.2 18.3 3.7 20.7 5.8 20.5 9 20.2 13.9 15.1 17.5 12 20.4';
const HEART_SVG = `<svg class="heart" viewBox="0 0 24 24" role="img" aria-label="and"><path class="heart-wash" transform="translate(0.9 0.7)" d="${HEART_PATH}Z"/><path class="heart-ink" d="${HEART_PATH}l1.1-.9"/></svg>`;

const warnings = [];
const errors = [];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const hashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

// Where a square thumbnail is cropped from: one or two CSS object-position
// keywords ("top", "top left") or percentages ("50% 20%", 0% = left/top).
const FOCUS_PART = /^(left|right|top|bottom|center|\d{1,3}(\.\d+)?%)$/;
function isValidFocus(focus) {
  const parts = focus.split(/\s+/);
  return parts.length >= 1 && parts.length <= 2 && parts.every((p) => FOCUS_PART.test(p) && (!p.endsWith('%') || parseFloat(p) <= 100));
}

// Resolves each stop's photo list against the manifest.
function resolvePhotos(stop, manifest) {
  const inFolder = Object.keys(manifest.photos)
    .filter((key) => key.startsWith(`${stop.id}/`))
    .sort();

  if (!stop.photos || stop.photos.length === 0) {
    if (inFolder.length) {
      warnings.push(
        `${stop.name}: no photos listed in content/stops.json, so showing all ${inFolder.length} processed photo(s) in filename order with generic alt text.`,
      );
    }
    return inFolder.map((key, i) => ({ key, alt: `Photo ${i + 1} from ${stop.name}` }));
  }

  const listed = new Set();
  const photos = [];
  for (const [i, photo] of stop.photos.entries()) {
    const key = `${stop.id}/${photo.file}`;
    listed.add(key);
    if (!manifest.photos[key]) {
      errors.push(`${stop.name}: "${photo.file}" is listed in content/stops.json but has not been processed. Put it in photos/${stop.id}/ and run "npm run images".`);
      continue;
    }
    if (!photo.alt || !photo.alt.trim()) {
      warnings.push(`${stop.name}: "${photo.file}" has no alt text; using a generic description.`);
    }
    let focus;
    if (photo.focus !== undefined) {
      focus = String(photo.focus).trim().toLowerCase();
      if (!isValidFocus(focus)) {
        errors.push(`${stop.name}: "${photo.file}" has focus "${photo.focus}". Use top, bottom, left, right or center (or two of them, like "top left"), or percentages like "50% 20%".`);
        focus = undefined;
      }
    }
    photos.push({ key, alt: photo.alt?.trim() || `Photo ${i + 1} from ${stop.name}`, focus });
  }
  const unlisted = inFolder.filter((key) => !listed.has(key));
  if (unlisted.length) {
    warnings.push(`${stop.name}: ${unlisted.length} processed photo(s) not listed in content/stops.json, so not shown: ${unlisted.map((k) => k.split('/')[1]).join(', ')}`);
  }
  return photos;
}

function renderMarkers(stops) {
  return stops
    .map((stop, i) => {
      const pos = OVERVIEW[stop.id];
      if (!pos) return '';
      const pin = stop.id === PINNED_STOP ? `<circle cx="${pos.x}" cy="${pos.y}" r="2.2" fill="#b55d4c"/>` : '';
      // The pills below the map are the accessible navigation, so these
      // duplicate links are for pointer users only.
      return `<a class="map-stop" href="#${stop.id}" tabindex="-1" aria-hidden="true">
    <circle class="map-hit" cx="${pos.x}" cy="${pos.y}" r="16"/>
    <circle class="map-dot" cx="${pos.x}" cy="${pos.y}" r="5"/>${pin}
    <text x="${pos.label.x}" y="${pos.label.y}" text-anchor="${pos.label.anchor}">${esc(stop.name)}</text>
  </a>`;
    })
    .join('\n  ');
}

function renderTiles(stop, stopIndex) {
  if (stop.resolved.length === 0) {
    const tiles = Array.from(
      { length: PLACEHOLDER_TILES },
      (_, p) => `<div class="thumb thumb--placeholder wash-${stop.wash}" style="--tilt:${TILTS[(p + stopIndex) % TILTS.length]}">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5a5348" stroke-width="1.4"><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
      </div>`,
    ).join('\n      ');
    return `<p class="visually-hidden">Photos from ${esc(stop.name)} are coming soon.</p>
    <div class="grid" aria-hidden="true">
      ${tiles}
    </div>`;
  }
  const tiles = stop.resolved
    .map((photo, p) => {
      const t = photo.thumb;
      return `<button type="button" class="thumb" style="--tilt:${TILTS[(p + stopIndex) % TILTS.length]}" data-stop="${stopIndex}" data-photo="${p}" aria-label="Open ${esc(stop.name)} photo ${p + 1}: ${esc(photo.alt)}">
        <img src="${esc(t.src)}" alt="${esc(photo.alt)}" width="${t.width}" height="${t.height}"${photo.focus ? ` style="object-position:${photo.focus}"` : ''} loading="lazy" decoding="async">
      </button>`;
    })
    .join('\n      ');
  return `<div class="grid">
      ${tiles}
    </div>`;
}

function renderStop(stop, i, stops) {
  const next = stops[i + 1];
  const nextLink = next
    ? `<a href="#${next.id}">Next: ${esc(next.name)}</a>`
    : `<a href="#map">Back to the start</a>`;
  return `<section class="stop" id="${stop.id}" aria-labelledby="${stop.id}-title">
    <div class="stop-top">
      <div class="stop-text">
        <p class="stop-eyebrow">Stop ${i + 1} of ${stops.length} · ${esc(stop.country)} · ${esc(stop.dates)}</p>
        <h2 class="stop-title" id="${stop.id}-title">${esc(stop.name)}</h2>
        <p class="stop-body">${esc(stop.text)}</p>
      </div>
      ${MINI[stop.id] ? miniMap(esc(stop.name), MINI[stop.id], stop.wash) : ''}
    </div>
    ${renderTiles(stop, i)}
    <nav class="stop-nav" aria-label="${esc(stop.name)} chapter">
      <a href="#map">Back to the map</a>
      ${nextLink}
    </nav>
  </section>`;
}

function renderPage(content, stops, manifest, assets) {
  const viewerData = stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
    photos: stop.resolved.map((p) => ({
      thumb: p.thumb.src,
      full: p.full.src,
      w: p.full.width,
      h: p.full.height,
      alt: p.alt,
    })),
  }));
  const siteUrl = content.siteUrl?.replace(/\/?$/, '/') ?? '';
  const share = manifest.share;
  const [shareStop, shareFile] = (content.shareImage ?? '').split('/');
  const shareAlt =
    content.stops.find((s) => s.id === shareStop)?.photos?.find((p) => p.file === shareFile)?.alt ?? content.title;
  const shareTags = share
    ? `<meta property="og:image" content="${esc(siteUrl + share.src)}">
<meta property="og:image:width" content="${share.width}">
<meta property="og:image:height" content="${share.height}">
<meta property="og:image:alt" content="${esc(shareAlt)}">`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(content.title)}</title>
<meta name="description" content="${esc(content.subtitle)}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#f7f3ea">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${esc(manifest.touchIcon?.src ?? '')}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(content.title)}">
<meta property="og:description" content="${esc(content.subtitle)}">
<meta property="og:url" content="${esc(siteUrl)}">
${shareTags}
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${FONTS_URL.replace(/&/g, '&amp;')}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${FONTS_URL.replace(/&/g, '&amp;')}"></noscript>
<style>
${assets.cssText}</style>
<script src="viewer.js?v=${assets.js}" defer></script>
</head>
<body>
<header class="intro" id="map">
  <p class="intro-eyebrow">${esc(content.eyebrow)}</p>
  <h1 class="intro-title">${esc(content.title)}</h1>
  <p class="intro-subtitle">${esc(content.subtitle)}</p>
  ${overviewMap(renderMarkers(stops))}
  <nav class="pills" aria-label="Destinations">
    ${stops.map((s, i) => `<a class="pill" href="#${s.id}"><span class="pill-num">${i + 1}</span>${esc(s.name)}</a>`).join('\n    ')}
  </nav>
</header>

<main>
  ${stops.map((s, i) => renderStop(s, i, stops)).join('\n\n  ')}
</main>

<footer class="footer">${esc(content.footer ?? '').replace(/♥/g, HEART_SVG)}</footer>

<dialog class="viewer" id="viewer" aria-modal="true" aria-label="Photo viewer">
  <div class="viewer-bar">
    <div class="viewer-heading">
      <span class="viewer-title" id="viewer-title"></span>
      <span class="viewer-meta" id="viewer-meta" aria-live="polite"></span>
    </div>
    <button type="button" class="round-btn" id="viewer-close" aria-label="Close viewer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <div class="viewer-body">
    <button type="button" class="round-btn viewer-prev" id="viewer-prev" aria-label="Previous photo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
    </button>
    <div class="viewer-stage" id="viewer-stage">
      <img class="viewer-img" id="viewer-img" alt="">
    </div>
    <button type="button" class="round-btn viewer-next" id="viewer-next" aria-label="Next photo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
  </div>
</dialog>

<script type="application/json" id="photo-data">${JSON.stringify(viewerData).replace(/</g, '\\u003c')}</script>
</body>
</html>
`;
}

async function main() {
  const content = JSON.parse(await readFile(path.join(ROOT, 'content', 'stops.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'images', 'manifest.json'), 'utf8'));

  const ids = new Set();
  const stops = content.stops.map((stop) => {
    if (!/^[a-z0-9-]+$/.test(stop.id)) errors.push(`Stop id "${stop.id}" may only use lowercase letters, digits and hyphens.`);
    if (ids.has(stop.id)) errors.push(`Stop id "${stop.id}" is used twice.`);
    ids.add(stop.id);
    const wash = COUNTRY_WASH[stop.country];
    if (!wash) warnings.push(`${stop.name}: no map colour for country "${stop.country}" (add it to COUNTRY_WASH in src/maps.mjs).`);
    if (!OVERVIEW[stop.id] || !MINI[stop.id]) warnings.push(`${stop.name}: no map position (add it to src/maps.mjs).`);
    const resolved = resolvePhotos(stop, manifest).map((p) => ({ ...p, ...manifest.photos[p.key] }));
    return { ...stop, wash: wash ?? 'ch', resolved };
  });

  for (const w of warnings) console.warn(`! ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`x ${e}`);
    console.error('\nBuild failed.');
    process.exit(1);
  }

  const css = await readFile(path.join(ROOT, 'src', 'styles.css'), 'utf8');
  const js = await readFile(path.join(ROOT, 'src', 'viewer.js'), 'utf8');
  const html = renderPage(content, stops, manifest, { cssText: css, js: hashOf(js) });

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await writeFile(path.join(DIST, 'index.html'), html);
  await writeFile(path.join(DIST, 'viewer.js'), js);
  await cp(path.join(ROOT, 'src', 'favicon.svg'), path.join(DIST, 'favicon.svg'));
  await writeFile(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  await cp(path.join(ROOT, 'images'), path.join(DIST, 'images'), {
    recursive: true,
    filter: (src) => path.basename(src) !== 'manifest.json',
  });

  const shown = stops.reduce((n, s) => n + s.resolved.length, 0);
  console.log(`Built dist/ with ${stops.length} stops and ${shown} photos.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
