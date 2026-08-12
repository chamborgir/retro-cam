/**
 * filmProcessing.js
 * ---------------------------------------------------------------------
 * All client-side, canvas-only "film development" pipeline. No network
 * calls, no external SDKs — just 2D context pixel math.
 *
 * Pipeline order (must run in this order to match the Dazz/HUJI look):
 *   1. Draw the raw frame (mirrored if front camera)
 *   2. Flash boost   -> optional brightness/exposure lift (simulated flash)
 *   3. Color grade   -> per-film-stock channel shift + saturation/contrast
 *   4. Film grain     -> random noise, "overlay" blend, scaled by ISO
 *   5. Light leak     -> radial gradient, "screen" blend, stock-tinted
 *   6. Date stamp     -> retro amber LCD-style timestamp, bottom right
 * --------------------------------------------------------------------- */

import { getStock, grainForIso } from './filmStocks';

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Samples a tiny down-scaled copy of the current video frame to estimate
 * average scene brightness (0-255), used to decide whether "AUTO" flash
 * should fire.
 */
export function estimateBrightness(video) {
  const w = 16;
  const h = 16;
  const sample = document.createElement('canvas');
  sample.width = w;
  sample.height = h;
  const sctx = sample.getContext('2d');
  sctx.drawImage(video, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  return total / (data.length / 4);
}

/**
 * Decide whether the flash should fire for this shot.
 *  - 'on'  -> always
 *  - 'off' -> never
 *  - 'auto'-> only in dim scenes (avg luminance below threshold)
 */
export function shouldFireFlash(video, flashMode, threshold = 90) {
  if (flashMode === 'on') return true;
  if (flashMode === 'off') return false;
  return estimateBrightness(video) < threshold;
}

/**
 * Step 2 (conditional) — Simulated flash.
 * Used when the flash "fires" but we don't have (or don't want to
 * double up with) a real hardware torch — e.g. the front camera, or a
 * device with no torch capability. Brightens the whole frame slightly
 * and adds a soft centered hot-spot, like an on-camera flash would.
 */
function applyFlashBoost(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const hotspot = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );
  hotspot.addColorStop(0, 'rgba(255,255,255,0.4)');
  hotspot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hotspot;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Step 3 — Film-stock color grade.
 * Applies the selected stock's channel curve, then optional
 * saturation, shadow lift, monochrome conversion, and contrast boost,
 * in that order, matching how the presets in filmStocks.js are shaped.
 */
function applyColorGrade(ctx, width, height, stock) {
  const { grade, saturation = 1, lifted = 0, monochrome = false, contrastBoost = 1 } = stock;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * grade.rMul + grade.rAdd;
    let g = data[i + 1] * grade.gMul + grade.gAdd;
    let b = data[i + 2] * grade.bMul + grade.bAdd;

    if (lifted) {
      r += (255 - r) * lifted;
      g += (255 - g) * lifted;
      b += (255 - b) * lifted * 0.85;
    }

    if (saturation !== 1) {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }

    if (monochrome) {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = g = b = gray;
    }

    if (contrastBoost !== 1) {
      r = (r - 128) * contrastBoost + 128;
      g = (g - 128) * contrastBoost + 128;
      b = (b - 128) * contrastBoost + 128;
    }

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Step 4 — Film grain, intensity driven by ISO.
 * Builds a monochrome noise field on an off-screen canvas, then
 * composites it on top with `overlay` so grain darkens shadows and
 * lightens highlights instead of just washing everything out grey.
 */
function applyFilmGrain(ctx, width, height, intensity) {
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = width;
  grainCanvas.height = height;
  const gctx = grainCanvas.getContext('2d');

  const noise = gctx.createImageData(width, height);
  const buf = noise.data;
  for (let i = 0; i < buf.length; i += 4) {
    const v = 128 + (Math.random() * 2 - 1) * intensity;
    buf[i] = v;
    buf[i + 1] = v;
    buf[i + 2] = v;
    buf[i + 3] = 255;
  }
  gctx.putImageData(noise, 0, 0);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(grainCanvas, 0, 0);
  ctx.restore();
}

/**
 * Step 5 — Light leak.
 * Two soft radial gradients composited with `screen` so they only
 * ever brighten the frame. Color can be overridden per film stock
 * (e.g. Vaporwave uses magenta/cyan instead of orange/red).
 */
function applyLightLeak(ctx, width, height, stock) {
  const primary = stock.lightLeak?.primary ?? '255,150,60';
  const secondary = stock.lightLeak?.secondary ?? '255,70,60';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  const g1 = ctx.createRadialGradient(
    width * 0.92, height * 0.06, 0,
    width * 0.92, height * 0.06, width * 0.65
  );
  g1.addColorStop(0, `rgba(${primary},0.55)`);
  g1.addColorStop(0.45, `rgba(${primary},0.25)`);
  g1.addColorStop(1, `rgba(${primary},0)`);
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);

  const g2 = ctx.createRadialGradient(
    width * 0.04, height * 0.98, 0,
    width * 0.04, height * 0.98, width * 0.45
  );
  g2.addColorStop(0, `rgba(${secondary},0.32)`);
  g2.addColorStop(1, `rgba(${secondary},0)`);
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

/**
 * Step 6 — Date stamp.
 * Bold monospace amber-orange text, bottom right, with a soft glow to
 * mimic the LED date-imprint on 90s point-and-shoots. Format: 'YY MM DD
 */
function applyDateStamp(ctx, width, height, date = new Date()) {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const text = `'${yy} ${mm} ${dd}`;

  const fontSize = Math.max(20, Math.round(width * 0.034));
  const x = width - width * 0.045;
  const y = height - height * 0.04;

  ctx.save();
  ctx.font = `bold ${fontSize}px "Courier New", monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  ctx.shadowColor = 'rgba(255,130,40,0.85)';
  ctx.shadowBlur = fontSize * 0.4;
  ctx.fillStyle = '#ff7d2e';
  ctx.fillText(text, x, y);

  ctx.shadowBlur = fontSize * 0.12;
  ctx.fillStyle = '#ffb266';
  ctx.fillText(text, x, y);

  ctx.restore();
}

/**
 * Draws the current video frame to a full-resolution canvas, mirroring
 * it when the front ("user") camera is active, then runs the full
 * development pipeline on it using the chosen film stock / ISO / flash.
 *
 * @param {HTMLVideoElement} video
 * @param {Object} options
 * @param {'user'|'environment'} options.facingMode
 * @param {string} options.stockId       one of FILM_STOCKS[].id
 * @param {number} options.iso           one of ISO_VALUES
 * @param {boolean} options.applyFlash   true -> run the simulated flash pass
 *                                       (skip this if a real hardware torch
 *                                       already lit the scene)
 * @returns {{ dataUrl: string, canvas: HTMLCanvasElement }}
 */
export function developPhoto(video, options) {
  const { facingMode, stockId, iso, applyFlash } = options;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    throw new Error('Video stream is not ready yet');
  }

  const stock = getStock(stockId);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Draw raw frame (mirror only for the selfie/front camera)
  ctx.save();
  if (facingMode === 'user') {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, width, height);
  ctx.restore();

  // 2. Simulated flash (only when requested — real torch handles this
  //    optically for supported back cameras, see useCamera.js)
  if (applyFlash) {
    applyFlashBoost(ctx, width, height);
  }

  // 3 -> 6. Development pipeline, in exact order
  applyColorGrade(ctx, width, height, stock);
  applyFilmGrain(ctx, width, height, grainForIso(iso) * (stock.grainBoost ?? 1));
  applyLightLeak(ctx, width, height, stock);
  applyDateStamp(ctx, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { dataUrl, canvas };
}
