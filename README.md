# Jeni + Vivek

A one-page photo site for our October 2026 wedding and honeymoon: a hand-drawn map, then one chapter per stop in travel order.

Live at **https://vivekisontrack.github.io/amillionandtwoloves/** (once GitHub Pages is turned on; see [Deploying](#deploying)).

## How it is put together

It is a plain static site: HTML, CSS and a little vanilla JavaScript. No framework.
Two small Node scripts do the work a framework would:

- `scripts/build-images.mjs` turns your original photos into small, private web images.
- `scripts/build-site.mjs` writes the page (`dist/index.html`) from `content/stops.json`.

I chose a build script over a page that loads `stops.json` in the browser because the generated page shows its text and photos straight away, works without JavaScript (apart from the photo viewer), and scores better on phone speed tests. The only dependency is [sharp](https://sharp.pixelplumbing.com/) for image resizing.

```
content/stops.json     all text and the photo order (edit this)
photos/<stop-id>/      your original photos (not committed to git)
images/                generated web images and manifest.json (committed)
src/                   page styles, viewer script, map artwork, favicon
scripts/               image pipeline, site build, privacy check, preview server
test/                  privacy tests for the image pipeline
dist/                  the built site (generated, not committed)
```

The stop ids are `oeschinensee`, `lenk`, `geneva`, `budapest`, `galway`, `sligo` and `dublin`.

## One-time setup

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
```

## Adding photos

1. Copy the originals into the stop's folder, for example `photos/budapest/`.
   Name them so they sort in the order you want, for example `01-parliament.jpg`, `02-baths.jpg`.
   JPEG and PNG work everywhere. iPhone HEIC files may not: if one fails, export it as JPEG.
2. Make the web images:

   ```sh
   npm run images
   ```

   This rotates each photo upright, removes **all** metadata (including GPS location), and writes a 600 px thumbnail (up to about 80 KB) and a 2000 px full-size WebP (up to about 800 KB) into `images/`. Each image gets the highest quality that fits; the limits are in `SIZES` at the top of `scripts/build-images.mjs`. Photos it has already processed are skipped, so it is safe to run as often as you like.
3. List the photos in `content/stops.json` with their alt text (see below).
   If you leave a stop's `photos` list empty, the site shows every processed photo in that stop's folder in filename order, with generic alt text, and the build prints a warning to remind you.
4. Preview, then commit and push (see below). Commit the new files in `images/`. The originals in `photos/` are ignored by git on purpose, so keep your own backup of them.

To remove a photo, delete it from `photos/<stop-id>/` and from `content/stops.json`, then run `npm run images -- --prune`.

## Editing text

Everything you see on the page lives in `content/stops.json`:

```json
{
  "id": "budapest",
  "name": "Budapest",
  "country": "Hungary",
  "dates": "Oct 14 to 18",
  "text": "A short paragraph about Budapest.",
  "photos": [
    { "file": "01-parliament.jpg", "alt": "The Parliament lit up across the Danube" }
  ]
}
```

- `text` is the paragraph under the stop's name.
- `photos` sets the order. `file` is the original's file name in `photos/<stop-id>/`. `alt` describes the photo for people using screen readers, so make it a short, real description.
- `focus` (optional) sets which part of a photo shows in its square thumbnail. By default the thumbnail is cut from the center; if that cuts off something important, add for example `"focus": "top"`. You can use `top`, `bottom`, `left`, `right` or `center`, two of them together (`"top left"`), or percentages across and down (`"50% 20%"`). It only affects the thumbnail; the viewer always shows the whole photo.
- The title, subtitle, eyebrow and footer are at the top of the file. In the footer, a `♥` is drawn as a hand-drawn heart (screen readers read it as "and").
- `shareImage` is the photo used for link previews in messages, as `<stop-id>/<file>`. Run `npm run images` after changing it. Leave it empty (`""`) for no preview image. The preview is a wide 1200 x 630 crop, so for a tall photo, set `shareImageFocus` to choose which part is kept: the same `top`, `center` or percentage values as `focus` below (for example `"50% 28%"`, which means centered across and about a quarter of the way down). Check `images/share.jpg` after running `npm run images`.
- `siteUrl` is the site's public address, used for link previews. Change it if you add a custom domain.

## Previewing locally

```sh
npm run preview
```

Then open http://localhost:8080. Press Ctrl+C to stop. Run it again after any change.

## Checks

```sh
npm test
```

This fails if any image in `images/` or `dist/` still has GPS or any other metadata, and runs tests proving the pipeline strips GPS data and that the check really catches it. GitHub runs the same checks before every deploy.

## Deploying

The site deploys to GitHub Pages automatically whenever `main` changes (`.github/workflows/deploy.yml`). Pull requests are checked and built, but not deployed.

**One-time setup:** in the repository on GitHub, go to **Settings → Pages**, and under **Build and deployment → Source** choose **GitHub Actions**. If a deploy ran before this was set, open the **Actions** tab, pick the latest "Build and deploy" run and choose **Re-run all jobs**.

After that, publishing is just:

```sh
git add -A
git commit -m "Add Budapest photos"
git push
```

The update is live a minute or two after the push. Progress is shown in the **Actions** tab.

### Custom domain (later)

In **Settings → Pages**, enter the domain under **Custom domain** and follow GitHub's DNS instructions. Then update `siteUrl` in `content/stops.json`.

## Privacy

- Published images contain no location or other metadata. `npm test` checks this, and so does every deploy.
- No analytics or trackers. The only third-party request is for the two Google Fonts (Caveat and Cormorant Garamond).
- Search engines are asked not to index the site (`<meta name="robots" content="noindex">`). The `robots.txt` file only takes effect once the site has its own domain, because crawlers look for it at the domain root.
- Anyone with the link can see the site, and the repository is public, so the web images can also be seen on GitHub.

## Changing the design

- Colors, fonts and layout: `src/styles.css` (color tokens are at the top).
- Map artwork and where each stop sits on the maps: `src/maps.mjs`. The maps are deliberately not to scale.
- Photo viewer behavior: `src/viewer.js`.
- Page structure: `scripts/build-site.mjs`.
