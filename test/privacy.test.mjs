// Proves the image pipeline removes GPS data and applies orientation, and that
// the privacy check really catches GPS data (so a passing check means something).

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { processPhoto } from '../scripts/build-images.mjs';
import { checkImage } from '../scripts/check-images.mjs';
import { scanMetadata } from '../scripts/lib/metadata.mjs';

let dir;
let original;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'privacy-test-'));
  original = path.join(dir, 'camera.jpg');
  // A 300x200 landscape "camera photo" tagged as rotated 90 degrees (EXIF
  // orientation 6), with GPS coordinates and XMP, like a phone would write.
  const buf = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#88aacc' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'Phone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '46/1 29/1 54/1', GPSLongitudeRef: 'E', GPSLongitude: '7/1 43/1 23/1' },
    })
    .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="46,29.9N"/></rdf:RDF></x:xmpmeta>')
    .toBuffer();
  // sharp writes its own Orientation tag, so set it with withMetadata.
  await writeFile(original, await sharp(buf).keepMetadata().withMetadata({ orientation: 6 }).toBuffer());
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

test('the test photo really contains GPS data and an orientation tag', async () => {
  const buf = await readFile(original);
  const found = scanMetadata(buf);
  assert.equal(found.exif, true);
  assert.equal(found.gps, true);
  assert.equal((await sharp(buf).metadata()).orientation, 6);
});

test('the privacy check flags a file with GPS data', async () => {
  const problems = await checkImage(original);
  assert.ok(problems.includes('GPS location data'), `expected GPS problem, got: ${problems.join(', ')}`);
});

test('the privacy check flags GPS data in a WebP file', async () => {
  const webp = path.join(dir, 'leaky.webp');
  await sharp(original).webp().keepExif().toFile(webp);
  const problems = await checkImage(webp);
  assert.ok(problems.includes('GPS location data'), `expected GPS problem, got: ${problems.join(', ')}`);
});

test('processed photos have no metadata and are correctly oriented', async () => {
  const out = await processPhoto(original, path.join(dir, 'out', 'camera'));
  for (const size of ['thumb', 'full']) {
    const file = out[size].file;
    assert.deepEqual(await checkImage(file), [], `${size} should have no metadata`);
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, 'webp');
    // Orientation 6 means the 300x200 sensor image is displayed as 200x300.
    assert.equal(meta.width, 200);
    assert.equal(meta.height, 300);
    assert.equal(meta.orientation, undefined);
    assert.equal(out[size].width, 200);
    assert.equal(out[size].height, 300);
  }
});
