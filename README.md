# Retrooo Cam — Retro Film Camera Web App

A mobile-first React + Tailwind + Canvas clone of Dazz Cam / HUJI: live
camera feed, retro skeuomorphic UI, client-side film processing
(color grade -> grain -> light leak -> date stamp), and save-to-device.

## Customizing the look

All colors/fonts live as CSS custom properties + a Tailwind v4 `@theme`
block at the top of `src/index.css` — change `--film-orange`,
`--lcd-amber`, etc. there and every component picks it up automatically
via classes like `bg-film-orange` / `text-lcd-amber`.

The intensity of grain, the light-leak position/color, and the color
grade curve are all tunable constants inside
`src/utils/filmProcessing.js`.
