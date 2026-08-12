/**
 * savePhoto.js
 * ---------------------------------------------------------------------
 * iOS Safari does not honor `<a download>` on a data URL — tapping it
 * just opens the image in a new tab instead of saving anything. The
 * only reliable way to get a photo into the iOS Photos app from a web
 * page is the Web Share API with a real File, which triggers the
 * native share sheet (with a "Save Image" action).
 *
 * Everywhere else (desktop + Android Chrome), a plain anchor download
 * still works fine and is a much lower-friction click, so we only take
 * the share-sheet path on iOS.
 */

export function isIOS() {
  const ua = navigator.userAgent || navigator.vendor || '';
  const isAppleMobile = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  // iPadOS 13+ reports its UA as a Mac, but exposes multi-touch — this
  // is the standard sniff to catch it too.
  const isIpadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIpadOS;
}

/**
 * @param {string} dataUrl  JPEG data URL from the canvas pipeline
 * @param {string} filename
 * @returns {Promise<{ method: 'share' | 'download' | 'cancelled' | 'opened' }>}
 */
export async function savePhoto(dataUrl, filename) {
  if (isIOS() && navigator.canShare) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { method: 'share' };
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        // person dismissed the share sheet — not an error
        return { method: 'cancelled' };
      }
      console.warn('[savePhoto] Web Share failed, falling back to opening the image', err);
    }

    // Last-resort iOS fallback: open the image in a new tab so they can
    // long-press -> "Add to Photos" themselves.
    window.open(dataUrl, '_blank');
    return { method: 'opened' };
  }

  // Non-iOS: plain anchor download.
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return { method: 'download' };
}
