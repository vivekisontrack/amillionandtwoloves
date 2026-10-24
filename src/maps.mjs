// Hand-drawn map artwork and per-stop map positions.
// The maps are deliberately not to scale: Switzerland is enlarged so its three
// stops (only about 150 km apart) stay legible.

export const COUNTRY_WASH = {
  Switzerland: 'ch',
  Hungary: 'hu',
  Ireland: 'ie',
};

// Positions on the overview map (viewBox 0 0 520 340): the marker, and where
// its label sits relative to it.
export const OVERVIEW = {
  oeschinensee: { x: 300, y: 226, label: { x: 310, y: 220, anchor: 'start' } },
  lenk: { x: 264, y: 248, label: { x: 264, y: 270, anchor: 'middle' } },
  geneva: { x: 212, y: 248, label: { x: 202, y: 240, anchor: 'end' } },
  budapest: { x: 444, y: 208, label: { x: 454, y: 202, anchor: 'start' } },
  galway: { x: 84, y: 96, label: { x: 74, y: 100, anchor: 'end' } },
  sligo: { x: 110, y: 56, label: { x: 120, y: 50, anchor: 'start' } },
  dublin: { x: 176, y: 92, label: { x: 186, y: 104, anchor: 'start' } },
};

// Positions on the small chapter route map (viewBox 0 0 260 170).
export const MINI = {
  oeschinensee: { x: 150, y: 113 },
  lenk: { x: 132, y: 124 },
  geneva: { x: 106, y: 124 },
  budapest: { x: 222, y: 104 },
  galway: { x: 42, y: 48 },
  sligo: { x: 55, y: 28 },
  dublin: { x: 88, y: 46 },
};

// The stop whose marker gets the red pin on the overview map.
export const PINNED_STOP = 'oeschinensee';

const IRELAND = 'M60 80 Q56 40 100 30 Q150 20 190 50 Q210 90 190 124 Q150 150 100 140 Q60 130 60 80Z';
const SWITZERLAND = 'M190 236 Q220 210 280 206 Q330 210 336 236 Q320 270 260 276 Q210 276 190 236Z';
const HUNGARY = 'M390 190 Q430 170 490 184 Q510 210 490 236 Q440 250 400 234 Q376 212 390 190Z';

// markers: pre-rendered marker links for the stops (see build-site.mjs).
export function overviewMap(markers) {
  return `<svg class="overview-map" viewBox="0 0 520 340" role="img" aria-label="Hand-drawn map of the route from Switzerland to Hungary to Ireland">
  <defs>
    <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="#2b2b2b" stroke-width="0.5"/>
    </pattern>
  </defs>
  <g class="wash-ie" fill-opacity="0.45">
    <path d="${IRELAND}"/>
    <path transform="translate(6 4)" d="M70 82 Q70 50 104 42 Q146 36 178 58 Q192 90 176 116 Q144 136 104 128 Q72 118 70 82Z"/>
  </g>
  <g class="wash-ch" fill-opacity="0.5">
    <path d="${SWITZERLAND}"/>
    <path transform="translate(-4 3)" d="M204 236 Q230 218 280 216 Q320 220 324 238 Q310 262 262 266 Q220 266 204 236Z"/>
  </g>
  <g class="wash-hu" fill-opacity="0.5">
    <path d="${HUNGARY}"/>
    <path transform="translate(5 -3)" d="M400 196 Q436 182 482 192 Q496 212 480 230 Q440 240 406 228 Q390 212 400 196Z"/>
  </g>
  <g fill="url(#hatch)" fill-opacity="0.25" stroke="#2b2b2b" stroke-width="1.2" stroke-linejoin="round">
    <path d="${IRELAND}"/>
    <path d="${SWITZERLAND}"/>
    <path d="${HUNGARY}"/>
  </g>
  <path d="M300 226 Q280 240 264 248 Q236 260 212 248 Q320 140 444 208 Q280 40 84 96 Q90 70 110 56 Q150 60 176 92"
        fill="none" stroke="#8a5a3b" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2 6"/>
  ${markers}
  <g class="map-country">
    <text x="128" y="166" text-anchor="middle">Ireland</text>
    <text x="262" y="300" text-anchor="middle">Switzerland</text>
    <text x="446" y="266" text-anchor="middle">Hungary</text>
  </g>
</svg>`;
}

export function miniMap(name, pos, wash) {
  const dots = Object.values(MINI)
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5"/>`)
    .join('');
  return `<svg class="mini-map" viewBox="0 0 260 170" role="img" aria-label="Route map with ${name} highlighted">
  <g fill="none" stroke="#2b2b2b" stroke-width="0.9" stroke-opacity="0.7">
    <path d="M30 40 Q28 20 50 15 Q75 10 95 25 Q105 45 95 62 Q75 75 50 70 Q30 65 30 40Z"/>
    <path d="M95 118 Q110 105 140 103 Q165 105 168 118 Q160 135 130 138 Q105 138 95 118Z"/>
    <path d="M195 95 Q215 85 245 92 Q255 105 245 118 Q220 125 200 117 Q188 106 195 95Z"/>
  </g>
  <path d="M150 113 Q140 120 132 124 Q118 130 106 124 Q160 70 222 104 Q140 20 42 48 Q45 35 55 28 Q75 30 88 46"
        fill="none" stroke="#8a5a3b" stroke-width="1.2" stroke-dasharray="1.5 4" stroke-linecap="round"/>
  <g fill="#cfc4b2">${dots}</g>
  ${pos ? `<circle class="wash-${wash}" cx="${pos.x}" cy="${pos.y}" r="9" fill-opacity="0.8"/>
  <circle cx="${pos.x}" cy="${pos.y}" r="4" fill="#b55d4c"/>` : ''}
</svg>`;
}
