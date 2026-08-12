import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useCamera
 * ---------------------------------------------------------------------
 * Owns the <video> ref + MediaStream lifecycle:
 *  - requests the front/back camera via getUserMedia
 *  - ALWAYS stops every track on the previous stream before requesting
 *    a new one (prevents the classic "camera locked" bug on iOS Safari
 *    / Android Chrome when switching cameras or unmounting)
 *  - exposes a simple `switchCamera()` toggle and error state for a
 *    denied-permission / no-camera-found UI
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [facingMode, setFacingMode] = useState('environment');
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);
  const [torchSupported, setTorchSupported] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    async (mode) => {
      setError(null);
      setIsReady(false);
      setTorchSupported(false);

      // Stop any existing tracks BEFORE requesting new ones — requesting
      // a new stream while the old one still holds the device is what
      // causes lockups on mobile browsers.
      stopStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support camera access.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });

        streamRef.current = stream;

        if (videoRef.current) {
          const el = videoRef.current;
          // iOS Safari needs playsinline set as a real attribute (not just
          // the JSX prop) or it will try to take over the full screen the
          // moment the stream starts.
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          el.muted = true;
          el.srcObject = stream;
          try {
            await el.play();
          } catch (playErr) {
            // Safari can reject play() if it wasn't triggered by a direct
            // user gesture. The stream is still attached — it'll start
            // rendering as soon as the user taps anywhere on the page.
            console.warn('[useCamera] video play() was blocked, will resume on next interaction', playErr);
          }
        }

        // Real hardware flashlight (torch) is only ever exposed on the
        // rear camera, and only in some Chromium-based browsers.
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities ? track.getCapabilities() : {};
        setTorchSupported(!!capabilities.torch);

        setIsReady(true);
      } catch (err) {
        console.error('[useCamera] getUserMedia failed', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('Camera permission denied. Enable it in your browser settings to keep shooting.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else if (err.name === 'NotReadableError') {
          setError('Camera is already in use by another app.');
        } else {
          setError('Could not start the camera.');
        }
      }
    },
    [stopStream]
  );

  /**
   * Toggle the real device flashlight, when available. Always resolves
   * (never throws) — callers should treat a `false` return as "fall
   * back to the simulated screen-flash instead".
   */
  const setTorch = useCallback(async (on) => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return false;
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch (err) {
      console.warn('[useCamera] torch toggle failed', err);
      return false;
    }
  }, []);

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => {
      const next = prev === 'user' ? 'environment' : 'user';
      startStream(next);
      return next;
    });
  }, [startStream]);

  // Start on mount, always release the device on unmount.
  useEffect(() => {
    startStream(facingMode);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release the camera if the tab/app is backgrounded — this avoids the
  // device staying "busy" in the background on Android, and avoids iOS
  // Safari's hard camera lock when you switch apps mid-session. We do
  // NOT auto-restart on return: iOS Safari silently refuses to restart
  // getUserMedia unless the call happens inside a direct tap handler, so
  // instead we surface a "tap to resume" state the person taps themselves
  // (see `retry`/error UI in CameraView).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopStream();
        setIsReady(false);
        setError('Camera paused — tap resume to keep shooting.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopStream]);

  return {
    videoRef,
    facingMode,
    isReady,
    error,
    switchCamera,
    retry: () => startStream(facingMode),
    torchSupported,
    setTorch,
  };
}
