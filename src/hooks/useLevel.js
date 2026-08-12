import { useCallback, useEffect, useState } from 'react';

/**
 * useLevel
 * ---------------------------------------------------------------------
 * Bubble-level using DeviceOrientationEvent's `gamma` (left/right tilt
 * when the phone is held upright, in degrees).
 *
 * iOS 13+ requires an explicit, gesture-triggered permission request
 * (DeviceOrientationEvent.requestPermission()) before any orientation
 * events fire at all — plain `addEventListener` silently does nothing
 * on iOS without it. `enable()` must be called from a tap handler.
 */
export function useLevel() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [roll, setRoll] = useState(0);

  const handleOrientation = useCallback((e) => {
    if (typeof e.gamma === 'number') setRoll(e.gamma);
  }, []);

  const enable = useCallback(async () => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
      setSupported(false);
      return;
    }

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          setSupported(false);
          return;
        }
      } catch (err) {
        console.warn('[useLevel] orientation permission request failed', err);
        setSupported(false);
        return;
      }
    }

    window.addEventListener('deviceorientation', handleOrientation);
    setEnabled(true);
  }, [handleOrientation]);

  const disable = useCallback(() => {
    window.removeEventListener('deviceorientation', handleOrientation);
    setEnabled(false);
  }, [handleOrientation]);

  const toggle = useCallback(() => {
    if (enabled) disable();
    else enable();
  }, [enabled, enable, disable]);

  useEffect(() => () => window.removeEventListener('deviceorientation', handleOrientation), [handleOrientation]);

  return { enabled, supported, roll, toggle };
}
