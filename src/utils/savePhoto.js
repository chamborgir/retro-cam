/**
 * savePhoto.js
 * ---------------------------------------------------------------------
 * iOS Safari does not honor `<a download>` on a data URL — tapping it
 * just opens the image in a new tab instead of saving anything. The
 * only reliable way to get a photo into the iOS Photos app from a web
 * page is the Web Share API with a real File, which triggers the
 * native share sheet (with a "Save Image" action).
 *
 * For non-iOS (Android & Desktop), we convert the Data URL to a Blob URL
 * before triggering the anchor download, ensuring Android browsers (Chrome/Brave)
 * download the file immediately rather than opening it in a tab.
 */

export function isIOS() {
    const ua = navigator.userAgent || navigator.vendor || "";
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    // iPadOS 13+ reports its UA as a Mac, but exposes multi-touch — this
    // is the standard sniff to catch it too.
    const isIpadOS =
        navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return isAppleMobile || isIpadOS;
}

/**
 * @param {string} dataUrl  JPEG data URL from the canvas pipeline
 * @param {string} filename
 * @returns {Promise<{ method: 'share' | 'download' | 'cancelled' | 'opened' }>}
 */
export async function savePhoto(dataUrl, filename) {
    // --- KEEP EXISTING IOS LOGIC ---
    if (isIOS() && navigator.canShare) {
        try {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], filename, {
                type: blob.type || "image/jpeg",
            });

            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file] });
                return { method: "share" };
            }
        } catch (err) {
            if (err?.name === "AbortError") {
                // Person dismissed the share sheet — not an error
                return { method: "cancelled" };
            }
            console.warn(
                "[savePhoto] Web Share failed, falling back to opening the image",
                err,
            );
        }

        // Last-resort iOS fallback: open the image in a new tab
        window.open(dataUrl, "_blank");
        return { method: "opened" };
    }

    // --- NEW IMPROVED NON-IOS / ANDROID DIRECT DOWNLOAD LOGIC ---
    try {
        // 1. Fetch the data URL and convert to a true binary Blob
        const res = await fetch(dataUrl);
        const blob = await res.blob();

        // 2. Create an object URL from the Blob
        const blobUrl = URL.createObjectURL(blob);

        // 3. Trigger immediate download via invisible anchor
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 4. Revoke the object URL after a brief delay to free memory
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        return { method: "download" };
    } catch (err) {
        console.warn(
            "[savePhoto] Blob download failed, falling back to direct dataUrl link",
            err,
        );

        // Fallback: Plain anchor click if Blob creation fails
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return { method: "download" };
    }
}
