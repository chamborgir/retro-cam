/**
 * filmStocks.js
 * ---------------------------------------------------------------------
 * Each "film stock" bundles:
 *  - grade: the exact same rMul/rAdd style channel math used by
 *    applyColorGrade() in filmProcessing.js
 *  - previewFilter: a CSS `filter` string applied live to the <video>
 *    element so the viewfinder roughly WYSIWYGs the final grade
 *  - swatch: a hex dot used in the filter picker UI
 *  - vignette: 0-1 darkened-corner strength (applyVignette)
 *  - starFlare: true, or a { maxSpots, threshold, rayLength, color }
 *    config, turning blown-out light sources into 8-point sparkle
 *    stars (applyStarFlare) — the "shining star" cross-screen-filter
 *    look real disposables get pointed at streetlights/the sun
 * --------------------------------------------------------------------- */

export const FILM_STOCKS = [
    {
        id: "original",
        label: "Original",
        swatch: "#ede3d3",
        grade: { rMul: 1, rAdd: 0, gMul: 1, gAdd: 0, bMul: 1, bAdd: 0 },
        saturation: 1,
        noLightLeak: true,
        grainBoost: 0,
        previewFilter: "none",
    },
    {
        id: "gold",
        label: "Kodak Gold",
        swatch: "#e8a33d",
        grade: {
            rMul: 1.15,
            rAdd: 10,
            gMul: 1.05,
            gAdd: 6,
            bMul: 0.85,
            bAdd: -8,
        },
        saturation: 1.05,
        grainBoost: 1,
        vignette: 0.12,
        starFlare: {
            maxSpots: 2,
            threshold: 238,
            rayLength: 0.2,
            color: "255,225,170",
        },
        previewFilter:
            "saturate(1.15) sepia(0.12) contrast(1.05) brightness(1.02)",
    },
    {
        id: "superia",
        label: "Fuji Superia",
        swatch: "#6fae8f",
        grade: {
            rMul: 0.97,
            rAdd: -2,
            gMul: 1.08,
            gAdd: 4,
            bMul: 1.03,
            bAdd: 3,
        },
        saturation: 0.95,
        grainBoost: 0.9,
        vignette: 0.08,
        previewFilter: "saturate(0.9) hue-rotate(-6deg) contrast(1.05)",
    },
    {
        id: "portra",
        label: "Portra Soft",
        swatch: "#e8c4b8",
        grade: {
            rMul: 1.06,
            rAdd: 12,
            gMul: 1.0,
            gAdd: 8,
            bMul: 0.94,
            bAdd: 6,
        },
        saturation: 0.85,
        lifted: 0.08,
        grainBoost: 0.7,
        previewFilter:
            "saturate(0.85) brightness(1.06) contrast(0.92) sepia(0.08)",
    },
    {
        id: "noir",
        label: "Noir B&W",
        swatch: "#8c8c8c",
        grade: { rMul: 1, rAdd: 0, gMul: 1, gAdd: 0, bMul: 1, bAdd: 0 },
        monochrome: true,
        contrastBoost: 1.18,
        grainBoost: 1.35,
        vignette: 0.3,
        starFlare: {
            maxSpots: 2,
            threshold: 242,
            rayLength: 0.24,
            color: "255,255,255",
        },
        previewFilter: "grayscale(1) contrast(1.2)",
    },
    {
        id: "vapor",
        label: "Vaporwave",
        swatch: "#b06bd6",
        grade: {
            rMul: 1.08,
            rAdd: 6,
            gMul: 0.94,
            gAdd: -4,
            bMul: 1.18,
            bAdd: 14,
        },
        saturation: 1.1,
        grainBoost: 0.8,
        vignette: 0.15,
        starFlare: {
            maxSpots: 3,
            threshold: 234,
            rayLength: 0.24,
            color: "220,140,255",
        },
        lightLeak: { primary: "255,60,220", secondary: "60,180,255" },
        previewFilter: "saturate(1.25) hue-rotate(-12deg) contrast(1.08)",
    },
    {
        id: "prism",
        label: "Prism",
        swatch: "#c874c2",
        grade: { rMul: 1.04, rAdd: 4, gMul: 1.0, gAdd: 0, bMul: 1.06, bAdd: 6 },
        saturation: 1.1,
        grainBoost: 0.75,
        prismGhost: true,
        vignette: 0.1,
        starFlare: {
            maxSpots: 3,
            threshold: 233,
            rayLength: 0.2,
            color: "255,255,255",
        },
        lightLeak: { primary: "255,90,220", secondary: "80,200,255" },
        previewFilter: "saturate(1.2) contrast(1.05)",
    },
    {
        id: "faded",
        label: "Faded Polaroid",
        swatch: "#d8cbb0",
        grade: {
            rMul: 1.0,
            rAdd: 18,
            gMul: 0.98,
            gAdd: 16,
            bMul: 0.9,
            bAdd: 20,
        },
        saturation: 0.72,
        lifted: 0.14,
        grainBoost: 0.55,
        vignette: 0.22,
        previewFilter:
            "saturate(0.65) brightness(1.1) contrast(0.85) sepia(0.18)",
    },
    {
        id: "sunkissed",
        label: "Sunkissed",
        swatch: "#f2b25c",
        grade: {
            rMul: 1.12,
            rAdd: 14,
            gMul: 1.04,
            gAdd: 6,
            bMul: 0.82,
            bAdd: -6,
        },
        saturation: 1.1,
        grainBoost: 0.65,
        vignette: 0.1,
        starFlare: {
            maxSpots: 3,
            threshold: 230,
            rayLength: 0.28,
            color: "255,220,150",
        },
        lightLeak: { primary: "255,190,90", secondary: "255,120,60" },
        previewFilter:
            "saturate(1.15) sepia(0.2) contrast(1.02) brightness(1.06)",
    },
    {
        id: "nighthalide",
        label: "Night Halide",
        swatch: "#2f6f7a",
        grade: {
            rMul: 1.05,
            rAdd: 6,
            gMul: 0.98,
            gAdd: -2,
            bMul: 1.1,
            bAdd: 8,
        },
        saturation: 1.05,
        grainBoost: 1.2,
        vignette: 0.38,
        starFlare: {
            maxSpots: 4,
            threshold: 224,
            rayLength: 0.32,
            color: "255,160,90",
        },
        lightLeak: { primary: "255,140,60", secondary: "40,190,210" },
        previewFilter:
            "saturate(1.1) hue-rotate(-4deg) contrast(1.08) brightness(0.96)",
    },
    {
        id: "flashpop",
        label: "Flash Pop",
        swatch: "#ff6fb0",
        grade: { rMul: 1.1, rAdd: 4, gMul: 1.04, gAdd: 2, bMul: 1.02, bAdd: 0 },
        saturation: 1.25,
        contrastBoost: 1.15,
        grainBoost: 1.1,
        vignette: 0.3,
        starFlare: {
            maxSpots: 2,
            threshold: 246,
            rayLength: 0.14,
            color: "255,255,255",
        },
        previewFilter: "saturate(1.3) contrast(1.15) brightness(1.03)",
    },
    {
        id: "grdmono",
        label: "GRD Mono",
        swatch: "#4a4a4a",
        grade: { rMul: 1, rAdd: 0, gMul: 1, gAdd: 0, bMul: 1, bAdd: 0 },
        monochrome: true,
        contrastBoost: 1.32,
        grainBoost: 1.5,
        vignette: 0.42,
        previewFilter: "grayscale(1) contrast(1.3) brightness(0.95)",
    },
];

export const DEFAULT_STOCK_ID = "gold";

export const getStock = (id) =>
    FILM_STOCKS.find((s) => s.id === id) || FILM_STOCKS[0];

// Higher ISO = more visible grain, mirroring real film stock behavior.
export const ISO_VALUES = [100, 200, 400, 800, 1600, 3200];
export const DEFAULT_ISO = 400;

const ISO_GRAIN_MAP = {
    100: 10,
    200: 16,
    400: 24,
    800: 36,
    1600: 52,
    3200: 72,
};

export const grainForIso = (iso) => ISO_GRAIN_MAP[iso] ?? 24;

export const FLASH_MODES = ["off", "auto", "on"];
export const DEFAULT_FLASH = "off";
