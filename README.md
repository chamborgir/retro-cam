# Dazz — Retro Film Camera Web App

A mobile-first React + Tailwind + Canvas clone of Dazz Cam / HUJI: live
camera feed, retro skeuomorphic UI, client-side film processing
(color grade -> grain -> light leak -> date stamp), and save-to-device.

## 1. Install & run locally

```bash
npm install
npm run dev
```

Vite will print a `Local:` URL (usually `http://localhost:5173`).
**Camera access requires a "secure context"** — `localhost` counts as
secure, so this works fine on your own machine's browser.

## 2. Testing on your phone (important)

`getUserMedia` is blocked on plain HTTP for any host other than
`localhost`. To test on an actual phone you have two options:

**Option A — same Wi-Fi, HTTPS tunnel (recommended)**
```bash
npm run dev -- --host
# in a second terminal:
npx localtunnel --port 5173
# or: npx ngrok http 5173
```
Open the printed `https://...` URL on your phone.

**Option B — same Wi-Fi, plain HTTP (Android Chrome only, with a flag)**
```bash
npm run dev -- --host
```
Note the `Network:` URL (e.g. `http://192.168.1.23:5173`), then on the
phone visit `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
add that exact URL, and relaunch Chrome. iOS Safari does not support
this flag — use Option A instead.

## 3. Build for production

```bash
npm run build
npm run preview   # serves the production build locally to sanity-check
```
Deploy the `dist/` folder to any static host (Vercel, Netlify, GitHub
Pages, Cloudflare Pages, etc.) — all of those serve over HTTPS by
default, so camera access "just works" once deployed.

## Project structure

```
src/
  hooks/useCamera.js          getUserMedia lifecycle, front/back switch,
                               guaranteed track.stop() cleanup
  utils/filmProcessing.js     canvas pipeline: color grade -> grain ->
                               light leak -> date stamp
  components/CameraView.jsx   viewfinder, corner brackets, shutter,
                               LCD status strip, switch-camera button
  components/PhotoPreviewModal.jsx
                               "developed print" preview + Save Photo
  App.jsx                     top-level state: captured photo, exposure
                               (frame) counter
  index.css                   design tokens (@theme) — the film-camera
                               color palette & fonts, all in one place
```

## Customizing the look

All colors/fonts live as CSS custom properties + a Tailwind v4 `@theme`
block at the top of `src/index.css` — change `--film-orange`,
`--lcd-amber`, etc. there and every component picks it up automatically
via classes like `bg-film-orange` / `text-lcd-amber`.

The intensity of grain, the light-leak position/color, and the color
grade curve are all tunable constants inside
`src/utils/filmProcessing.js`.
