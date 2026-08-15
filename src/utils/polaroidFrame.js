/**
 * polaroidFrame.js
 * ---------------------------------------------------------------------
 * Turns the already-developed photo into the "with info" export: a
 * cream print border plus the shot's settings baked into the bottom
 * margin (film stock, ISO, flash, aperture, ratio, EV, white balance) —
 * mirroring what PhotoPreviewModal already shows on-screen, just
 * rendered into the actual saved file instead of being UI-only chrome.
 *
 * Runs once, at save time, on the finished JPEG — deliberately kept out
 * of filmProcessing.js's live capture pipeline, since this has nothing
 * to do with simulating film and everything to do with export layout.
 */

const CREAM = "#ede3d3";
const INK = "rgba(18,16,13,0.62)"; // body-black at ~60% for the caption line
const INK_SOFT = "rgba(18,16,13,0.45)"; // body-black at ~45% for the detail line

const loadImage = (src) =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

/**
 * @param {string} photoDataUrl  JPEG data URL from developPhoto()
 * @param {Object} meta          the same `meta` object PhotoPreviewModal
 *                                already receives (filterLabel, iso,
 *                                flashFired, aperture, ratioLabel,
 *                                exposureEv, whiteBalanceLabel)
 * @returns {Promise<string>}    JPEG data URL of the framed print
 */
export async function composeWithInfoPrint(photoDataUrl, meta) {
    const img = await loadImage(photoDataUrl);
    const photoW = img.naturalWidth;
    const photoH = img.naturalHeight;

    const border = Math.round(photoW * 0.035);
    const bottomBand = Math.round(photoW * 0.22);

    const canvas = document.createElement("canvas");
    canvas.width = photoW + border * 2;
    canvas.height = photoH + border * 2 + bottomBand;
    const ctx = canvas.getContext("2d");

    // Cream print stock, corner-to-corner.
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The photo itself, inset by the border.
    ctx.drawImage(img, border, border, photoW, photoH);

    // Caption line — film stock + ISO + flash, matching the modal.
    const captionSize = Math.max(18, Math.round(photoW * 0.032));
    const caption = meta
        ? `${meta.filterLabel.toUpperCase()} · ISO ${meta.iso}${meta.flashFired ? " · FLASH" : ""}`
        : "DEVELOPED ON DAZZ";

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK;
    ctx.font = `bold ${captionSize}px "Courier New", monospace`;
    const captionY = photoH + border + Math.round(bottomBand * 0.42);
    ctx.fillText(caption, canvas.width / 2, captionY);

    // Detail line — aperture, ratio, EV, white balance, same rules the
    // modal uses (EV and non-auto white balance only show when set).
    if (meta) {
        const detailSize = Math.max(14, Math.round(photoW * 0.024));
        const parts = [`F/${meta.aperture}`, meta.ratioLabel];
        if (meta.exposureEv) {
            parts.push(`${meta.exposureEv > 0 ? "+" : ""}${meta.exposureEv}EV`);
        }
        if (meta.whiteBalanceLabel && meta.whiteBalanceLabel !== "AUTO") {
            parts.push(meta.whiteBalanceLabel);
        }
        ctx.fillStyle = INK_SOFT;
        ctx.font = `${detailSize}px "Courier New", monospace`;
        ctx.fillText(
            parts.join(" · "),
            canvas.width / 2,
            captionY + detailSize * 1.7,
        );
    }

    return canvas.toDataURL("image/jpeg", 0.95);
}
