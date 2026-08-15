/**
 * cameraSettings.js
 * ---------------------------------------------------------------------
 * Shared option lists + lookup helpers for the manual-control drawer
 * (aperture, exposure, white balance, aspect ratio, digital zoom).
 * Consumed by both CameraView.jsx (UI + live preview math) and
 * filmProcessing.js (the actual pixel pipeline), so the numbers here
 * are the single source of truth for what "f/2.8" or "TUNGSTEN"
 * actually does to a frame.
 * --------------------------------------------------------------------- */

// ---- Aperture -----------------------------------------------------
// No phone camera has a real iris, so each stop fakes the two things
// an f-stop actually changes: a wider aperture (lower f-number) blurs
// the background more and lets in more light.
export const APERTURE_OPTIONS = [
    { fstop: 1.4, blur: 14, brightness: 1.12 },
    { fstop: 2, blur: 10, brightness: 1.08 },
    { fstop: 2.8, blur: 6, brightness: 1.03 },
    { fstop: 5.6, blur: 2, brightness: 1.0 },
    { fstop: 8, blur: 0, brightness: 0.96 },
    { fstop: 16, blur: 0, brightness: 0.9 },
];
export const DEFAULT_APERTURE_FSTOP = 2.8;
export const getAperture = (fstop) =>
    APERTURE_OPTIONS.find((a) => a.fstop === fstop) ||
    APERTURE_OPTIONS.find((a) => a.fstop === DEFAULT_APERTURE_FSTOP);

// ---- Exposure compensation -----------------------------------------
export const EXPOSURE_STEPS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
export const DEFAULT_EXPOSURE = 0;

// ---- White balance ---------------------------------------------------
// rMul/bMul mirror the channel-multiply math in applyWhiteBalance();
// previewFilter is layered onto the live <video> so the viewfinder
// roughly matches what will be baked into the photo.
export const WHITE_BALANCE_OPTIONS = [
    {
        id: "auto",
        label: "AUTO",
        rMul: 1,
        bMul: 1,
        previewFilter: "",
        kelvin: null,
    },
    {
        id: "daylight",
        label: "DAYLIGHT",
        rMul: 1.03,
        bMul: 0.97,
        previewFilter: "sepia(0.04)",
        kelvin: 5500,
    },
    {
        id: "cloudy",
        label: "CLOUDY",
        rMul: 1.08,
        bMul: 0.93,
        previewFilter: "sepia(0.08)",
        kelvin: 6500,
    },
    {
        id: "tungsten",
        label: "TUNGSTEN",
        rMul: 0.85,
        bMul: 1.18,
        previewFilter: "hue-rotate(6deg)",
        kelvin: 3200,
    },
    {
        id: "fluorescent",
        label: "FLUORESCENT",
        rMul: 0.94,
        bMul: 1.08,
        previewFilter: "hue-rotate(-4deg)",
        kelvin: 4000,
    },
];
export const DEFAULT_WHITE_BALANCE = "auto";
export const getWhiteBalance = (id) =>
    WHITE_BALANCE_OPTIONS.find((w) => w.id === id) ||
    WHITE_BALANCE_OPTIONS.find((w) => w.id === DEFAULT_WHITE_BALANCE);

// ---- Aspect ratio -----------------------------------------------------
// `value` is width/height for the (portrait) capture frame, matching
// the `ratio` option documented in developPhoto().
export const RATIO_OPTIONS = [
    { id: "classic", label: "4:3", value: 3 / 4 },
    { id: "square", label: "1:1", value: 1 },
    { id: "wide", label: "16:9", value: 9 / 16 },
];
export const DEFAULT_RATIO_ID = "classic";
export const getRatio = (id) =>
    RATIO_OPTIONS.find((r) => r.id === id) ||
    RATIO_OPTIONS.find((r) => r.id === DEFAULT_RATIO_ID);

// ---- Digital zoom -----------------------------------------------------
// Rear camera only. Hardware zoom (via track.applyConstraints) is
// preferred when the device/browser exposes a `zoom` capability;
// otherwise CameraView falls back to a software crop done in
// developPhoto's step 2.
export const ZOOM_LEVELS = [0.5, 1, 1.5, 2, 3];
export const DEFAULT_ZOOM = 1;
// 0.5x ("ultra-wide") is only physically meaningful when the hardware
// itself reports it's reachable — there's no such thing as a software
// zoom-out, since the sensor never captured anything wider than 1x.
export const ULTRA_WIDE_ZOOM = 0.5;

/**
 * Builds the zoom pills to actually show, based on what the current
 * camera track reports. Falls back to the plain 1x-3x set (software
 * crop) when there's no hardware zoom capability at all.
 */
export const getAvailableZoomLevels = (capabilities) => {
    if (!capabilities) return ZOOM_LEVELS;
    const { min, max } = capabilities;
    const levels = ZOOM_LEVELS.filter(
        (l) => l >= min - 0.001 && l <= max + 0.001,
    );
    if (min <= ULTRA_WIDE_ZOOM) levels.unshift(ULTRA_WIDE_ZOOM);
    if (!levels.length) levels.push(Math.min(Math.max(1, min), max));
    return levels;
};

// ---- Hardware control range mapping -----------------------------------
// Manual exposure/ISO constraints (Image Capture API) exist on some
// Chromium-based mobile browsers, but every device reports its own
// min/max/step in its own units — there's no universal "EV" or "ISO"
// scale at the hardware level. These helpers do a best-effort linear
// (or, for ISO, log2 — ISO doubles rather than adds) remap of our own
// UI scale onto whatever range the current track actually exposes.
export const mapToHardwareRange = (value, valueMin, valueMax, capabilities) => {
    if (!capabilities) return value;
    const { min, max } = capabilities;
    const t = (value - valueMin) / (valueMax - valueMin);
    return min + t * (max - min);
};

export const mapIsoToHardwareRange = (iso, capabilities) => {
    if (!capabilities) return iso;
    const { min, max } = capabilities;
    const logMin = Math.log2(100);
    const logMax = Math.log2(3200);
    const t = (Math.log2(iso) - logMin) / (logMax - logMin);
    return min + t * (max - min);
};
