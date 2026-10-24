// Byte-level scan of JPEG, WebP and PNG files for embedded metadata.
// This deliberately does not rely on sharp, so the privacy check has an
// independent second opinion on what sharp wrote.

const GPS_IFD_TAG = 0x8825;

// Returns { exif, gps, xmp, iptc, other: [] } describing what was found.
export function scanMetadata(buf) {
  const found = { exif: false, gps: false, xmp: false, iptc: false, other: [] };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) scanJpeg(buf, found);
  else if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') scanWebp(buf, found);
  else if (buf.toString('latin1', 1, 4) === 'PNG') scanPng(buf, found);
  else found.other.push('unknown file format');
  return found;
}

export function hasAnyMetadata(found) {
  return found.exif || found.gps || found.xmp || found.iptc || found.other.length > 0;
}

function scanJpeg(buf, found) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break; // end of image or start of scan
    if (marker === 0xff) { i++; continue; } // fill byte
    const len = buf.readUInt16BE(i + 2);
    const body = buf.subarray(i + 4, i + 2 + len);
    if (marker === 0xe1) {
      if (body.toString('latin1', 0, 6) === 'Exif\0\0') {
        found.exif = true;
        if (tiffHasGps(body.subarray(6))) found.gps = true;
      } else if (body.toString('latin1', 0, 28).startsWith('http://ns.adobe.com/xap/1.0/')) {
        found.xmp = true;
        if (/GPS/i.test(body.toString('latin1'))) found.gps = true;
      } else {
        found.other.push('APP1 segment');
      }
    } else if (marker === 0xed) {
      found.iptc = true;
    } else if (marker >= 0xe3 && marker <= 0xef) {
      // APP3 to APP15 can hold vendor metadata. APP2 (ICC profile) and APP0
      // (JFIF header) carry no personal data.
      found.other.push(`APP${marker - 0xe0} segment`);
    } else if (marker === 0xfe) {
      found.other.push('comment segment');
    }
    i += 2 + len;
  }
}

function scanWebp(buf, found) {
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const body = buf.subarray(i + 8, i + 8 + size);
    if (id === 'EXIF') {
      found.exif = true;
      const tiff = body.toString('latin1', 0, 6) === 'Exif\0\0' ? body.subarray(6) : body;
      if (tiffHasGps(tiff)) found.gps = true;
    } else if (id === 'XMP ') {
      found.xmp = true;
      if (/GPS/i.test(body.toString('latin1'))) found.gps = true;
    }
    i += 8 + size + (size % 2);
  }
}

function scanPng(buf, found) {
  let i = 8;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + size);
    if (type === 'eXIf') {
      found.exif = true;
      if (tiffHasGps(body)) found.gps = true;
    } else if (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') {
      const text = body.toString('latin1');
      if (text.startsWith('XML:com.adobe.xmp')) found.xmp = true;
      else found.other.push(`${type} chunk`);
      if (/GPS/i.test(text)) found.gps = true;
    }
    if (type === 'IEND') break;
    i += 12 + size;
  }
}

// Walks IFD0 of a TIFF structure looking for the GPS IFD pointer.
function tiffHasGps(tiff) {
  if (tiff.length < 8) return false;
  const order = tiff.toString('latin1', 0, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const le = order === 'II';
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return false;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === GPS_IFD_TAG) return true;
  }
  return false;
}
