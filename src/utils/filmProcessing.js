/**
 * filmProcessing.js
 * ---------------------------------------------------------------------
 * All client-side, canvas-only "film development" pipeline. No network
 * calls, no external SDKs — just 2D context pixel math.
 *
 * Pipeline order (must run in this order — mirrors how a real camera +
 * darkroom stack these: capture-time optics/exposure first, then the
 * film stock's character, then film artifacts, then the print stamp):
 *   1. Draw the raw frame, cropped to ratio + zoom (mirrored if front camera)
 *   2. Aperture     -> simulated depth-of-field blur + f-stop light gain
 *   3. Exposure     -> manual EV compensation (skipped if hardware did it)
 *   4. White balance -> red/blue channel correction (skipped if hardware did it)
 *   5. Flash boost  -> optional brightness lift (simulated flash fallback)
 *   6. Color grade  -> per-film-stock channel shift + saturation/contrast
 *   7. Film grain   -> random noise, "overlay" blend, scaled by ISO
 *   8. Light leak   -> radial gradient, "screen" blend, stock-tinted
 *   9. Vignette     -> darkened corners, "multiply" blend (toy-camera stocks)
 *   10. Star flare  -> cross-screen-filter starbursts on bright highlights
 *   11. Prism ghost -> dual-prism chromatic ghosting (prismGhost stocks only)
 *   12. Date stamp  -> retro amber LCD-style timestamp, bottom right
 * --------------------------------------------------------------------- */

import { getStock, grainForIso } from "./filmStocks";
import { getAperture, getWhiteBalance } from "./cameraSettings";

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Samples a tiny down-scaled copy of the current video frame to estimate
 * average scene brightness (0-255), used to decide whether "AUTO" flash
 * should fire.
 */
export function estimateBrightness(video) {
    const w = 16;
    const h = 16;
    const sample = document.createElement("canvas");
    sample.width = w;
    sample.height = h;
    const sctx = sample.getContext("2d");
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
    if (flashMode === "on") return true;
    if (flashMode === "off") return false;
    return estimateBrightness(video) < threshold;
}

/**
 * Step 2 — Simulated aperture.
 * No phone camera has a real adjustable iris, so this fakes the two
 * things an f-stop actually changes:
 *  - depth of field: a soft radial mask keeps a center "focus" zone
 *    sharp and blurs everything outside it (via the canvas 2D context's
 *    native `filter: blur()`, composited back in with a gradient mask)
 *  - light gain: wider apertures (lower f-number) let more light in,
 *    so we nudge overall brightness accordingly
 */
function applyAperture(ctx, width, height, blurPx, brightnessMul) {
    if (blurPx > 0) {
        const base = document.createElement("canvas");
        base.width = width;
        base.height = height;
        base.getContext("2d").drawImage(ctx.canvas, 0, 0);

        const blurred = document.createElement("canvas");
        blurred.width = width;
        blurred.height = height;
        const bctx = blurred.getContext("2d");
        bctx.filter = `blur(${blurPx}px)`;
        bctx.drawImage(base, 0, 0);
        bctx.filter = "none";

        // Soft radial mask: transparent (= stay sharp) in the center focus
        // zone, opaque (= show the blur) toward the edges.
        const mask = document.createElement("canvas");
        mask.width = width;
        mask.height = height;
        const mctx = mask.getContext("2d");
        const grad = mctx.createRadialGradient(
            width / 2,
            height * 0.42,
            height * 0.14,
            width / 2,
            height * 0.42,
            height * 0.62,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,1)");
        mctx.fillStyle = grad;
        mctx.fillRect(0, 0, width, height);

        bctx.globalCompositeOperation = "destination-in";
        bctx.drawImage(mask, 0, 0);

        ctx.drawImage(blurred, 0, 0);
    }

    if (brightnessMul && brightnessMul !== 1) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = clamp(data[i] * brightnessMul);
            data[i + 1] = clamp(data[i + 1] * brightnessMul);
            data[i + 2] = clamp(data[i + 2] * brightnessMul);
        }
        ctx.putImageData(imageData, 0, 0);
    }
}

/**
 * Step 3 — Manual exposure compensation (EV stops).
 * Tamed to ~0.6x per stop so +-2 EV is a strong but not completely
 * blown-out/crushed adjustment.
 */
function applyExposure(ctx, width, height, ev) {
    if (!ev) return;
    const factor = Math.pow(2, ev * 0.6);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * factor);
        data[i + 1] = clamp(data[i + 1] * factor);
        data[i + 2] = clamp(data[i + 2] * factor);
    }
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Step 4 — White balance.
 * Simple, real-WB-accurate approach: multiply red and blue channels
 * (green is the reference channel, left alone), correcting for a
 * light source's color cast.
 */
function applyWhiteBalance(ctx, width, height, rMul, bMul) {
    if (rMul === 1 && bMul === 1) return;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(data[i] * rMul);
        data[i + 2] = clamp(data[i + 2] * bMul);
    }
    ctx.putImageData(imageData, 0, 0);
}

/**
 * Step 5 (conditional) — Simulated flash.
 * Used when the flash "fires" but we don't have (or don't want to
 * double up with) a real hardware torch — e.g. the front camera (which
 * uses a real prolonged screen flash instead, handled in CameraView and
 * never touches pixels), or a back camera with no torch capability.
 */
function applyFlashBoost(ctx, width, height) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const hotspot = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
    );
    hotspot.addColorStop(0, "rgba(255,255,255,0.4)");
    hotspot.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hotspot;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

/**
 * Step 6 — Film-stock color grade.
 * Applies the selected stock's channel curve, then optional
 * saturation, shadow lift, monochrome conversion, and contrast boost,
 * in that order, matching how the presets in filmStocks.js are shaped.
 */
function applyColorGrade(ctx, width, height, stock) {
    const {
        grade,
        saturation = 1,
        lifted = 0,
        monochrome = false,
        contrastBoost = 1,
    } = stock;
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
 * Step 7 — Film grain, intensity driven by ISO.
 * Builds a monochrome noise field on an off-screen canvas, then
 * composites it on top with `overlay` so grain darkens shadows and
 * lightens highlights instead of just washing everything out grey.
 */
function applyFilmGrain(ctx, width, height, intensity) {
    const grainCanvas = document.createElement("canvas");
    grainCanvas.width = width;
    grainCanvas.height = height;
    const gctx = grainCanvas.getContext("2d");

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
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(grainCanvas, 0, 0);
    ctx.restore();
}

/**
 * Step 8 — Light leak.
 * Two soft radial gradients composited with `screen` so they only
 * ever brighten the frame. Color can be overridden per film stock
 * (e.g. Vaporwave uses magenta/cyan instead of orange/red).
 */
function applyLightLeak(ctx, width, height, stock) {
    const primary = stock.lightLeak?.primary ?? "255,150,60";
    const secondary = stock.lightLeak?.secondary ?? "255,70,60";

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const g1 = ctx.createRadialGradient(
        width * 0.92,
        height * 0.06,
        0,
        width * 0.92,
        height * 0.06,
        width * 0.65,
    );
    g1.addColorStop(0, `rgba(${primary},0.55)`);
    g1.addColorStop(0.45, `rgba(${primary},0.25)`);
    g1.addColorStop(1, `rgba(${primary},0)`);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, width, height);

    const g2 = ctx.createRadialGradient(
        width * 0.04,
        height * 0.98,
        0,
        width * 0.04,
        height * 0.98,
        width * 0.45,
    );
    g2.addColorStop(0, `rgba(${secondary},0.32)`);
    g2.addColorStop(1, `rgba(${secondary},0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
}

/**
 * Step 9 — Date stamp.
 * Bold monospace amber-orange text, bottom right, with a soft glow to
 * mimic the LED date-imprint on 90s point-and-shoots. Format: 'YY MM DD
 */
function applyDateStamp(ctx, width, height, date = new Date()) {
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const text = `'${yy} ${mm} ${dd}`;

    const fontSize = Math.max(20, Math.round(width * 0.034));
    const x = width - width * 0.045;
    const y = height - height * 0.04;

    ctx.save();
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";

    ctx.shadowColor = "rgba(255,130,40,0.85)";
    ctx.shadowBlur = fontSize * 0.4;
    ctx.fillStyle = "#ff7d2e";
    ctx.fillText(text, x, y);

    ctx.shadowBlur = fontSize * 0.12;
    ctx.fillStyle = "#ffb266";
    ctx.fillText(text, x, y);

    ctx.restore();
}

/**
 * Step 9 — Vignette.
 * Simple darkened-corner falloff via a "multiply" radial gradient —
 * cheap stand-in for the light falloff of a cheap plastic toy-camera
 * lens. Strength is per-stock (0 = none).
 */
function applyVignette(ctx, width, height, strength) {
    if (!strength) return;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.3,
        width / 2,
        height / 2,
        height * 0.78,
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}

/**
 * Step 10 — Star flare.
 * Real disposable/vintage cameras (and cross-screen filters) turn any
 * small, blown-out light source — streetlights, string lights, sun
 * glints — into an 8-point starburst. We fake that by cheaply scanning
 * a downsampled copy of the frame for isolated bright spots, then
 * screen-blending a soft glow + radiating spike lines on top of each
 * one found in the full-res frame.
 */
function applyStarFlare(ctx, width, height, config = {}) {
    const {
        maxSpots = 3,
        threshold = 236,
        rayLength = 0.22,
        color = "255,255,255",
    } = config;

    // Cheap bright-spot detection on a small downsampled copy — running
    // this pixel-by-pixel at full resolution would be far too slow.
    const sampleW = 80;
    const sampleH = Math.max(1, Math.round((height / width) * sampleW));
    const sample = document.createElement("canvas");
    sample.width = sampleW;
    sample.height = sampleH;
    const sctx = sample.getContext("2d");
    sctx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
    const { data } = sctx.getImageData(0, 0, sampleW, sampleH);

    const points = [];
    for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
            const i = (y * sampleW + x) * 4;
            const lum =
                data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            if (lum > threshold) points.push({ x, y, lum });
        }
    }
    if (!points.length) return;
    points.sort((a, b) => b.lum - a.lum);

    // Non-max suppression so one large blown-out window doesn't spawn a
    // dozen overlapping stars — keep only the strongest, well-separated
    // spots, up to maxSpots.
    const picked = [];
    const minDist = sampleW * 0.12;
    for (const p of points) {
        if (picked.length >= maxSpots) break;
        const tooClose = picked.some(
            (q) => Math.hypot(p.x - q.x, p.y - q.y) < minDist,
        );
        if (!tooClose) picked.push(p);
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const rayLen = Math.max(width, height) * rayLength;

    for (const p of picked) {
        const cx = (p.x / sampleW) * width;
        const cy = (p.y / sampleH) * height;
        const strength = Math.min(
            1,
            (p.lum - threshold) / (255 - threshold) + 0.4,
        );

        const glowR = rayLen * 0.18;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        glow.addColorStop(0, `rgba(${color},${0.9 * strength})`);
        glow.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // 4 lines through the center = an 8-point star, alternating
        // long/short spikes for the classic cross-screen-filter look.
        const spikes = 4;
        for (let s = 0; s < spikes; s++) {
            const angle = (Math.PI / spikes) * s;
            const len = s % 2 === 0 ? rayLen : rayLen * 0.55;
            const dx = Math.cos(angle) * len;
            const dy = Math.sin(angle) * len;
            const grad = ctx.createLinearGradient(
                cx - dx,
                cy - dy,
                cx + dx,
                cy + dy,
            );
            grad.addColorStop(0, `rgba(${color},0)`);
            grad.addColorStop(0.5, `rgba(${color},${0.85 * strength})`);
            grad.addColorStop(1, `rgba(${color},0)`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = Math.max(1, width * 0.0025);
            ctx.beginPath();
            ctx.moveTo(cx - dx, cy - dy);
            ctx.lineTo(cx + dx, cy + dy);
            ctx.stroke();
        }
    }
    ctx.restore();
}

/**
 * Step 11 — D3D-style dual-prism chromatic ghost.
 * Real prism-lens attachments split light into offset, tinted copies.
 * We approximate that by drawing two hue-shifted duplicates (magenta
 * and cyan) of the frame, each nudged sideways and screen-blended back
 * on top — giving a retro "dazzle" double-vision fringe.
 */
function applyPrismGhost(ctx, width, height) {
    const offset = Math.max(4, Math.round(width * 0.02));

    const base = document.createElement("canvas");
    base.width = width;
    base.height = height;
    base.getContext("2d").drawImage(ctx.canvas, 0, 0);

    const tint = (rMul, gMul, bMul) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const cx = c.getContext("2d");
        cx.drawImage(base, 0, 0);
        const imageData = cx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = clamp(data[i] * rMul);
            data[i + 1] = clamp(data[i + 1] * gMul);
            data[i + 2] = clamp(data[i + 2] * bMul);
        }
        cx.putImageData(imageData, 0, 0);
        return c;
    };

    const magenta = tint(1.15, 0.85, 1.1);
    const cyan = tint(0.85, 1.1, 1.15);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(magenta, offset, 0);
    ctx.drawImage(cyan, -offset, 0);
    ctx.restore();
}

/**
 * Draws the current video frame to a canvas — center-cropped to the
 * chosen aspect ratio, then further cropped for digital zoom when no
 * hardware zoom is available — mirroring it when the front ("user")
 * camera is active, then runs the full development pipeline using the
 * chosen film stock, ISO, aperture, exposure, white balance, and flash.
 *
 * @param {HTMLVideoElement} video
 * @param {Object} options
 * @param {'user'|'environment'} options.facingMode
 * @param {string} options.stockId          one of FILM_STOCKS[].id
 * @param {number} options.iso              one of ISO_VALUES
 * @param {number} options.apertureFstop    one of APERTURE_OPTIONS[].fstop
 * @param {number} options.exposureEv       one of EXPOSURE_STEPS
 * @param {string} options.whiteBalanceId   one of WHITE_BALANCE_OPTIONS[].id
 * @param {number} options.ratio            target width/height, e.g. 3/4
 * @param {number} options.zoom             zoom factor, e.g. 1, 1.5, 2, 3
 * @param {boolean} options.hardwareZoomApplied  true if the camera track
 *                                          itself is already zoomed via
 *                                          applyConstraints — skips the
 *                                          software crop so we don't
 *                                          double-zoom
 * @param {boolean} options.applyFlash      true -> run the simulated flash pass
 *                                          (skip when a real torch or the
 *                                          front-camera screen flash already
 *                                          lit the scene)
 * @param {boolean} options.skipExposure    true -> exposure compensation was
 *                                          already pushed to the real sensor
 *                                          via applyConstraints; don't redo
 *                                          it in canvas on top of that
 * @param {boolean} options.skipWhiteBalance same idea, for white balance
 * @returns {{ dataUrl: string, canvas: HTMLCanvasElement }}
 */
export function developPhoto(video, options) {
    const {
        facingMode,
        stockId,
        iso,
        apertureFstop,
        exposureEv,
        whiteBalanceId,
        applyFlash,
        ratio = 3 / 4,
        zoom = 1,
        hardwareZoomApplied = false,
        skipExposure = false,
        skipWhiteBalance = false,
    } = options;
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (!vw || !vh) {
        throw new Error("Video stream is not ready yet");
    }

    const stock = getStock(stockId);
    const aperture = getAperture(apertureFstop);
    const whiteBalance = getWhiteBalance(whiteBalanceId);

    // 1. Center-crop the raw sensor frame down to the requested aspect ratio.
    let cropW = vw;
    let cropH = vh;
    if (vw / vh > ratio) {
        cropH = vh;
        cropW = vh * ratio;
    } else {
        cropW = vw;
        cropH = vw / ratio;
    }
    let cropX = (vw - cropW) / 2;
    let cropY = (vh - cropH) / 2;

    // 2. Digital zoom: crop further into the center. Skipped when the
    //    camera track is already hardware-zoomed (the frame is physically
    //    zoomed already, so cropping again would double it up).
    let srcX = cropX;
    let srcY = cropY;
    let srcW = cropW;
    let srcH = cropH;
    if (zoom > 1 && !hardwareZoomApplied) {
        srcW = cropW / zoom;
        srcH = cropH / zoom;
        srcX = cropX + (cropW - srcW) / 2;
        srcY = cropY + (cropH - srcH) / 2;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // 3. Draw the cropped/zoomed frame (mirror only for the selfie/front camera)
    ctx.save();
    if (facingMode === "user") {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, width, height);
    ctx.restore();

    // 4 -> 11. Development pipeline, in exact order
    applyAperture(ctx, width, height, aperture.blur, aperture.brightness);
    if (!skipExposure) applyExposure(ctx, width, height, exposureEv);
    if (!skipWhiteBalance)
        applyWhiteBalance(
            ctx,
            width,
            height,
            whiteBalance.rMul,
            whiteBalance.bMul,
        );
    if (applyFlash) applyFlashBoost(ctx, width, height);
    applyColorGrade(ctx, width, height, stock);

    const grain = grainForIso(iso) * (stock.grainBoost ?? 1);
    if (grain > 0) applyFilmGrain(ctx, width, height, grain);

    if (!stock.noLightLeak) applyLightLeak(ctx, width, height, stock);
    if (stock.prismGhost) applyPrismGhost(ctx, width, height);

    applyDateStamp(ctx, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    return { dataUrl, canvas };
}
