import { useCallback, useEffect, useRef, useState } from "react";
import { useCamera } from "../hooks/useCamera";
import { useLevel } from "../hooks/useLevel";
import { developPhoto, shouldFireFlash } from "../utils/filmProcessing";
import {
    FILM_STOCKS,
    ISO_VALUES,
    DEFAULT_STOCK_ID,
    DEFAULT_ISO,
    DEFAULT_FLASH,
    getStock,
} from "../utils/filmStocks";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIMER_OPTIONS = [0, 3, 10];
const LEVEL_TOLERANCE = 2.5; // degrees considered "level"

const ViewfinderCorner = ({ className }) => (
    <div className={`absolute w-7 h-7 border-cream/70 ${className}`} />
);

// ---- small retro-LCD style icons -----------------------------------
const FlashIcon = ({ mode }) => {
    if (mode === "off") {
        return (
            <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
            >
                <path
                    d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
                    strokeLinejoin="round"
                />
                <path d="M4 4 20 20" strokeLinecap="round" />
            </svg>
        );
    }
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill={mode === "on" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
        >
            <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinejoin="round" />
        </svg>
    );
};

const TimerIcon = () => (
    <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
    >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 2h6" strokeLinecap="round" />
    </svg>
);

const GridIcon = ({ active }) => (
    <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
    >
        <rect x="3" y="3" width="18" height="18" rx="1" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
);

const LevelIcon = ({ active }) => (
    <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
    >
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <path d="M3 12h4M17 12h4" strokeLinecap="round" />
    </svg>
);

const flashLabel = { off: "OFF", auto: "AUTO", on: "ON" };

export default function CameraView({ onCapture, framesLeft, disabled }) {
    const {
        videoRef,
        facingMode,
        isReady,
        error,
        switchCamera,
        retry,
        torchSupported,
        setTorch,
    } = useCamera();
    const level = useLevel();

    const [isCapturing, setIsCapturing] = useState(false);
    const [flashVisual, setFlashVisual] = useState(false);
    const [isFlashing, setIsFlashing] = useState(false);
    const [countdown, setCountdown] = useState(null);
    const countdownTimer = useRef(null);

    const [stockId, setStockId] = useState(DEFAULT_STOCK_ID);
    const [iso, setIso] = useState(DEFAULT_ISO);
    const [flashMode, setFlashMode] = useState(DEFAULT_FLASH);
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [showGrid, setShowGrid] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    const stock = getStock(stockId);

    useEffect(() => () => clearInterval(countdownTimer.current), []);

    const cycleIso = useCallback(() => {
        setIso((current) => {
            const idx = ISO_VALUES.indexOf(current);
            return ISO_VALUES[(idx + 1) % ISO_VALUES.length];
        });
    }, []);

    const cycleFlash = useCallback(() => {
        const order = ["off", "auto", "on"];
        setFlashMode(
            (current) => order[(order.indexOf(current) + 1) % order.length],
        );
    }, []);

    const cycleTimer = useCallback(() => {
        setTimerSeconds((current) => {
            const idx = TIMER_OPTIONS.indexOf(current);
            return TIMER_OPTIONS[(idx + 1) % TIMER_OPTIONS.length];
        });
    }, []);

    // The actual capture pipeline — separated from the shutter handler so
    // the self-timer can call it once the countdown reaches zero.
    const runCapture = useCallback(async () => {
        setIsCapturing(true);
        const video = videoRef.current;
        const willFlash = shouldFireFlash(video, flashMode);
        const canUseTorch =
            willFlash && torchSupported && facingMode === "environment";

        try {
            if (canUseTorch) {
                await setTorch(true);
                await sleep(180);
            } else if (willFlash) {
                setFlashVisual(true);
                await sleep(90);
            }

            const { dataUrl } = developPhoto(video, {
                facingMode,
                stockId,
                iso,
                applyFlash: willFlash && !canUseTorch,
            });

            if (canUseTorch) await setTorch(false);

            await sleep(450); // "developing" beat
            onCapture({
                dataUrl,
                meta: { filterLabel: stock.label, iso, flashFired: willFlash },
            });
        } catch (err) {
            console.error("[CameraView] capture failed", err);
            if (canUseTorch) await setTorch(false);
        } finally {
            setIsCapturing(false);
            setTimeout(() => setFlashVisual(false), 220);
        }
    }, [
        videoRef,
        flashMode,
        torchSupported,
        facingMode,
        setTorch,
        stockId,
        iso,
        stock.label,
        onCapture,
    ]);

    const handleShutter = useCallback(() => {
        // Tapping again while counting down cancels the timer.
        if (countdown !== null) {
            clearInterval(countdownTimer.current);
            setCountdown(null);
            return;
        }

        if (disabled || isCapturing || !isReady || error) return;

        if (timerSeconds > 0) {
            setCountdown(timerSeconds);
            countdownTimer.current = setInterval(() => {
                setCountdown((c) => {
                    if (c <= 1) {
                        clearInterval(countdownTimer.current);
                        runCapture();
                        return null;
                    }
                    return c - 1;
                });
            }, 1000);
        } else {
            runCapture();
        }
    }, [
        countdown,
        disabled,
        isCapturing,
        isReady,
        error,
        timerSeconds,
        runCapture,
    ]);

    const isLevelFlat = Math.abs(level.roll) < LEVEL_TOLERANCE;

    return (
        <div className="relative flex h-full w-full flex-col bg-body-black">
            {/* ---------------- Top status strip (LCD readout) ---------------- */}
            <div className="leatherette safe-top flex items-center justify-between border-b border-panel-brown-light bg-panel-brown px-4 py-2 text-lcd-amber">
                <div className="flex items-center gap-2 text-xs tracking-widest">
                    <span
                        className={`h-1.5 w-1.5 rounded-full bg-film-red ${isReady && !error ? "blink-dot" : ""}`}
                    />
                    <span className="font-display font-semibold">
                        RETROOO CAM
                    </span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] tracking-wide">
                    <span>{facingMode === "user" ? "FRONT" : "BACK"}</span>
                    <span className="text-metal-light">|</span>
                    <span className="tabular-nums">
                        {String(framesLeft).padStart(2, "0")} EXP
                    </span>
                </div>
            </div>

            {/* ---------------- Viewfinder ---------------- */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
                <div className="relative aspect-[3/4] h-full max-h-full w-full overflow-hidden bg-black sm:h-auto sm:max-h-[calc(100dvh-13rem)] sm:w-auto">
                    <video
                        ref={videoRef}
                        playsInline
                        muted
                        autoPlay
                        style={{ filter: stock.previewFilter }}
                        className={`h-full w-full object-cover transition-[filter] duration-200 ${facingMode === "user" ? "scale-x-[-1]" : ""}`}
                    />

                    {/* capture flash */}
                    {flashVisual && (
                        <div className="pointer-events-none absolute inset-0 bg-cream shutter-flash" />
                    )}

                    {/* rule-of-thirds grid */}
                    {showGrid && (
                        <div className="pointer-events-none absolute inset-0">
                            <div className="absolute left-1/3 top-0 h-full w-px bg-cream/35" />
                            <div className="absolute left-2/3 top-0 h-full w-px bg-cream/35" />
                            <div className="absolute top-1/3 left-0 h-px w-full bg-cream/35" />
                            <div className="absolute top-2/3 left-0 h-px w-full bg-cream/35" />
                        </div>
                    )}

                    {/* bubble-level horizon */}
                    {level.enabled && (
                        <div className="pointer-events-none absolute left-1/2 top-1/2 w-2/3 -translate-x-1/2 -translate-y-1/2">
                            <div
                                className="h-px w-full transition-colors"
                                style={{
                                    transform: `rotate(${-level.roll}deg)`,
                                    backgroundColor: isLevelFlat
                                        ? "#7ddc8c"
                                        : "rgba(237,227,211,0.6)",
                                }}
                            />
                            <div
                                className="mx-auto -mt-[3px] h-1.5 w-1.5 rounded-full transition-colors"
                                style={{
                                    backgroundColor: isLevelFlat
                                        ? "#7ddc8c"
                                        : "rgba(237,227,211,0.8)",
                                }}
                            />
                        </div>
                    )}

                    {/* viewfinder corner brackets */}
                    <ViewfinderCorner className="left-3 top-3 border-l-2 border-t-2" />
                    <ViewfinderCorner className="right-3 top-3 border-r-2 border-t-2" />
                    <ViewfinderCorner className="bottom-3 left-3 border-b-2 border-l-2" />
                    <ViewfinderCorner className="bottom-3 right-3 border-b-2 border-r-2" />

                    {/* center focus reticle */}
                    {countdown === null && (
                        <div className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-cream/30" />
                    )}

                    {/* self-timer countdown */}
                    {countdown !== null && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span
                                key={countdown}
                                className="countdown-pulse font-display text-8xl font-semibold text-cream drop-shadow-[0_0_18px_rgba(0,0,0,0.6)]"
                            >
                                {countdown}
                            </span>
                        </div>
                    )}

                    {/* ---- composition aids: timer / grid / level (left) ---- */}
                    {!showFilters && (
                        <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
                            <button
                                onClick={cycleTimer}
                                className="flex items-center gap-1.5 rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest text-cream backdrop-blur-sm"
                            >
                                <TimerIcon />
                                {timerSeconds === 0
                                    ? "OFF"
                                    : `${timerSeconds}s`}
                            </button>
                            <button
                                onClick={() => setShowGrid((v) => !v)}
                                className={`flex items-center gap-1.5 rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest backdrop-blur-sm ${showGrid ? "text-film-orange" : "text-cream"}`}
                            >
                                <GridIcon active={showGrid} />
                                GRID
                            </button>
                            {level.supported && (
                                <button
                                    onClick={level.toggle}
                                    className={`flex items-center gap-1.5 rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest backdrop-blur-sm ${level.enabled ? "text-film-orange" : "text-cream"}`}
                                >
                                    <LevelIcon active={level.enabled} />
                                    LEVEL
                                </button>
                            )}
                        </div>
                    )}

                    {/* ---- shooting settings strip: flash / filter / iso (right) ---- */}
                    {!showFilters && (
                        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
                            <button
                                onClick={cycleFlash}
                                className="flex items-center gap-1.5 rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest text-cream backdrop-blur-sm"
                            >
                                <FlashIcon mode={flashMode} />
                                {flashLabel[flashMode]}
                            </button>
                            <button
                                onClick={cycleIso}
                                className="rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest text-cream backdrop-blur-sm"
                            >
                                ISO {iso}
                            </button>
                            <button
                                onClick={() => setShowFilters(true)}
                                className="flex items-center gap-1.5 rounded-full bg-body-black/60 px-2.5 py-1 font-mono text-[10px] tracking-widest text-cream backdrop-blur-sm"
                            >
                                <span
                                    className="h-2.5 w-2.5 rounded-full border border-cream/50"
                                    style={{ backgroundColor: stock.swatch }}
                                />
                                FILM
                            </button>
                        </div>
                    )}

                    {/* developing overlay */}
                    {isCapturing && (
                        <div className="absolute inset-x-0 bottom-6 flex justify-center">
                            <span className="rounded-full bg-body-black/70 px-3 py-1 font-mono text-[11px] tracking-widest text-lcd-amber">
                                DEVELOPING&hellip;
                            </span>
                        </div>
                    )}

                    {/* error / paused state */}
                    {error && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-body-black/90 px-6 text-center">
                            <p className="font-mono text-sm text-cream/90">
                                {error}
                            </p>
                            <button
                                onClick={retry}
                                className="rounded-full border border-metal-light px-4 py-1.5 font-mono text-xs tracking-widest text-cream hover:bg-panel-brown-light"
                            >
                                TAP TO RESUME
                            </button>
                        </div>
                    )}

                    {!isReady && !error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-body-black/60">
                            <span className="font-mono text-xs tracking-widest text-cream/70">
                                STARTING CAMERA&hellip;
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* ---------------- Filter drawer (swipeable filmstrip) ---------------- */}
            {showFilters && (
                <div className="leatherette border-t border-panel-brown-light bg-panel-brown px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] tracking-widest text-metal-light">
                            CHOOSE FILM STOCK
                        </span>
                        <button
                            onClick={() => setShowFilters(false)}
                            className="font-mono text-[10px] tracking-widest text-lcd-amber"
                        >
                            DONE
                        </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                        {FILM_STOCKS.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setStockId(s.id)}
                                className="flex flex-shrink-0 flex-col items-center gap-1.5"
                            >
                                <span
                                    className={`h-11 w-11 rounded-full border-2 transition ${
                                        s.id === stockId
                                            ? "border-film-orange scale-110"
                                            : "border-metal/60"
                                    }`}
                                    style={{ backgroundColor: s.swatch }}
                                />
                                <span
                                    className={`font-mono text-[9px] tracking-wide ${s.id === stockId ? "text-lcd-amber" : "text-metal-light"}`}
                                >
                                    {s.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ---------------- Bottom control panel ---------------- */}
            <div className="leatherette safe-bottom flex items-center justify-between border-t border-panel-brown-light bg-panel-brown px-8 py-5">
                {/* camera switch */}
                <button
                    onClick={switchCamera}
                    disabled={isCapturing}
                    aria-label="Switch camera"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-metal bg-panel-brown-light text-metal-light transition active:scale-95 disabled:opacity-40"
                >
                    <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                    >
                        <path
                            d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                            strokeLinejoin="round"
                        />
                        <path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
                        <path
                            d="M15.5 5.5 17 4l1.5 1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>

                {/* shutter */}
                <button
                    onClick={handleShutter}
                    disabled={disabled || isCapturing || !isReady || !!error}
                    aria-label={
                        countdown !== null ? "Cancel timer" : "Take photo"
                    }
                    className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-cream/80 bg-panel-brown-light shadow-[0_0_0_2px_rgba(0,0,0,0.4)] transition active:scale-90 disabled:opacity-40"
                >
                    <span className="h-14 w-14 rounded-full bg-cream shadow-inner" />
                    {(isCapturing || countdown !== null) && (
                        <span className="absolute inset-0 rounded-full border-2 border-film-orange animate-ping" />
                    )}
                </button>

                {/* frame counter dial (decorative, mirrors the LCD reading) */}
                <div className="flex h-12 w-12 flex-col items-center justify-center rounded-full border border-metal bg-panel-brown-light font-mono text-lcd-amber">
                    <span className="text-[9px] leading-none text-metal-light">
                        FRAME
                    </span>
                    <span className="text-sm font-semibold leading-none">
                        {String(framesLeft).padStart(2, "0")}
                    </span>
                </div>
            </div>
            {isFlashing && (
                <div
                    className="fixed inset-0 bg-white z-[99999] pointer-events-none"
                    style={{ backgroundColor: "#ffffff" }}
                />
            )}
        </div>
    );
}
