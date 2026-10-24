// Photo viewer (lightbox). Opens from a thumbnail, moves through every photo
// across all stops in travel order (wrapping at the ends), and supports
// keyboard, swipe, and links to a single photo such as #budapest/4.

(() => {
  const dataEl = document.getElementById('photo-data');
  const dialog = document.getElementById('viewer');
  if (!dataEl || !dialog || typeof dialog.showModal !== 'function') return;

  const stops = JSON.parse(dataEl.textContent);
  // Indexes of stops that have photos; empty stops are skipped.
  const order = stops.map((s, i) => (s.photos.length ? i : -1)).filter((i) => i >= 0);
  if (!order.length) return;

  const title = document.getElementById('viewer-title');
  const meta = document.getElementById('viewer-meta');
  const img = document.getElementById('viewer-img');
  const stage = document.getElementById('viewer-stage');
  const closeBtn = document.getElementById('viewer-close');
  const prevBtn = document.getElementById('viewer-prev');
  const nextBtn = document.getElementById('viewer-next');

  let current = null; // { s, p }: stop index and photo index
  let opener = null; // the thumbnail that opened the viewer
  let pushedHistory = false; // whether opening added a history entry
  let loadToken = 0;
  let preloaded = [];

  const hashFor = ({ s, p }) => `#${stops[s].id}/${p + 1}`;

  function parseHash(hash) {
    const m = /^#([a-z0-9-]+)\/(\d+)$/.exec(hash);
    if (!m) return null;
    const s = stops.findIndex((stop) => stop.id === m[1]);
    const p = Number(m[2]) - 1;
    if (s < 0 || p < 0 || p >= stops[s].photos.length) return null;
    return { s, p };
  }

  // The photo one step forward (dir = 1) or back (dir = -1), crossing into
  // the next or previous stop and wrapping around at the ends.
  function neighbour({ s, p }, dir) {
    const q = p + dir;
    if (q >= 0 && q < stops[s].photos.length) return { s, p: q };
    const k = (order.indexOf(s) + dir + order.length) % order.length;
    const ns = order[k];
    return { s: ns, p: dir > 0 ? 0 : stops[ns].photos.length - 1 };
  }

  function preload(pos) {
    const im = new Image();
    im.decoding = 'async';
    im.src = stops[pos.s].photos[pos.p].full;
    return im;
  }

  function render(pos) {
    current = pos;
    const stop = stops[pos.s];
    const photo = stop.photos[pos.p];
    const count = stop.photos.length;
    const isLast = pos.p === count - 1;
    const nextStop = stops[order[(order.indexOf(pos.s) + 1) % order.length]];

    title.textContent = stop.name;
    dialog.setAttribute('aria-label', `${stop.name} photo viewer`);
    meta.textContent =
      `Photo ${pos.p + 1} of ${count}` + (isLast && nextStop !== stop ? ` · next stop ${nextStop.name}` : '');

    // Show the (already loaded) thumbnail as a quiet placeholder until the
    // full-size image has arrived.
    const token = ++loadToken;
    img.alt = photo.alt;
    img.width = photo.w;
    img.height = photo.h;
    const full = new Image();
    full.decoding = 'async';
    full.src = photo.full;
    if (full.complete && full.naturalWidth) {
      img.src = photo.full;
      img.classList.remove('is-loading');
    } else {
      img.src = photo.thumb;
      img.classList.add('is-loading');
      const swap = () => {
        if (token !== loadToken) return;
        img.src = photo.full;
        img.classList.remove('is-loading');
      };
      full.addEventListener('load', swap, { once: true });
      full.addEventListener('error', swap, { once: true });
    }

    preloaded = [preload(neighbour(pos, 1)), preload(neighbour(pos, -1))];
  }

  function open(pos, { fromThumb = null, addHistory = true } = {}) {
    opener = fromThumb;
    render(pos);
    if (!dialog.open) {
      document.documentElement.classList.add('viewer-open');
      dialog.showModal();
      closeBtn.focus();
    }
    if (addHistory && location.hash !== hashFor(pos)) {
      history.pushState({ viewer: true }, '', hashFor(pos));
      pushedHistory = true;
    }
  }

  function go(dir) {
    if (!current) return;
    const pos = neighbour(current, dir);
    render(pos);
    history.replaceState(history.state, '', hashFor(pos));
  }

  // Closes the dialog and puts focus back where it belongs.
  function finishClose() {
    if (!dialog.open) return;
    loadToken++;
    dialog.close();
    document.documentElement.classList.remove('viewer-open');
    let target = opener && document.contains(opener) ? opener : null;
    if (!target && current) {
      // Opened from a link: bring the matching thumbnail into view.
      target = document.querySelector(`.thumb[data-stop="${current.s}"][data-photo="${current.p}"]`);
      target?.scrollIntoView({ block: 'center' });
    }
    target?.focus({ preventScroll: true });
    opener = null;
  }

  // User asked to close: undo our history entry so Back behaves, or tidy
  // the URL if the page was opened straight to a photo.
  function close() {
    if (!dialog.open) return;
    if (pushedHistory) {
      pushedHistory = false;
      history.back(); // the popstate handler finishes closing
    } else {
      if (current) history.replaceState(null, '', `#${stops[current.s].id}`);
      finishClose();
    }
  }

  document.addEventListener('click', (e) => {
    const thumb = e.target.closest('.thumb[data-stop]');
    if (!thumb) return;
    open({ s: Number(thumb.dataset.stop), p: Number(thumb.dataset.photo) }, { fromThumb: thumb });
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));

  // Escape: the browser fires "cancel" on a modal dialog.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'Tab') {
      // Keep focus inside the viewer: wrap from the last button to the first.
      const buttons = [closeBtn, prevBtn, nextBtn];
      const i = buttons.indexOf(document.activeElement);
      const target = e.shiftKey ? (i <= 0 ? buttons[buttons.length - 1] : null) : i === buttons.length - 1 || i < 0 ? buttons[0] : null;
      if (target) {
        e.preventDefault();
        target.focus();
      }
    }
  });

  window.addEventListener('popstate', () => {
    const pos = parseHash(location.hash);
    if (pos) {
      if (dialog.open) render(pos);
      else open(pos, { addHistory: false });
      pushedHistory = false;
    } else if (dialog.open) {
      pushedHistory = false;
      finishClose();
    }
  });

  // Swipe: left/right to move, down to close. Mouse drags are ignored, and
  // so are pinch gestures and swipes while zoomed in.
  const SWIPE_X = 50;
  const SWIPE_DOWN = 90;
  const pointers = new Set();
  let start = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    pointers.add(e.pointerId);
    start = pointers.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (e.type === 'pointercancel') return;
    if (window.visualViewport && window.visualViewport.scale > 1.01) return;
    if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > SWIPE_DOWN && dy > 1.5 * Math.abs(dx)) close();
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // Opened via a link straight to a photo, e.g. #budapest/4.
  const initial = parseHash(location.hash);
  if (initial) open(initial, { addHistory: false });
})();
