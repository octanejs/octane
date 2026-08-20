import { useEffect, useState } from 'react';
/**
 * Listen for devicePixelRatio changes and set the new value accordingly. This could
 * happen for reasons such as:
 * - User moves window from retina screen display to a separate monitor
 * - User controls zoom settings on the browser
 *
 * Source: https://github.com/rexxars/use-device-pixel-ratio/blob/main/index.ts
 *
 * @param customDevicePixelRatio - Number to force a dpr to abide by, rather than using the window's
 *
 * @returns dpr: Number - Device pixel ratio; ratio of physical px to resolution in CSS pixels for current device
 */
export default function useDevicePixelRatio(customDevicePixelRatio?: number) {
  const dpr = customDevicePixelRatio || getDevicePixelRatio();
  const [currentDpr, setCurrentDpr] = useState(dpr);

  useEffect(() => {
    const canListen = typeof window !== 'undefined' && 'matchMedia' in window;
    if (!canListen) {
      return;
    }

    const updateDpr = () => {
      const newDpr = customDevicePixelRatio || getDevicePixelRatio();
      setCurrentDpr(newDpr);
    };
    const mediaMatcher = window.matchMedia(
      `screen and (resolution: ${currentDpr}dppx)`
    );
    mediaMatcher.hasOwnProperty('addEventListener')
      ? mediaMatcher.addEventListener('change', updateDpr)
      : mediaMatcher.addListener(updateDpr);

    return () => {
      mediaMatcher.hasOwnProperty('removeEventListener')
        ? mediaMatcher.removeEventListener('change', updateDpr)
        : mediaMatcher.removeListener(updateDpr);
    };
  }, [currentDpr, customDevicePixelRatio]);

  return currentDpr;
}

function getDevicePixelRatio(): number {
  const hasDprProp =
    typeof window !== 'undefined' &&
    typeof window.devicePixelRatio === 'number';
  const dpr = hasDprProp ? window.devicePixelRatio : 1;
  return Math.min(Math.max(1, dpr), 3);
}
