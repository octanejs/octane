// Port of cartesian/useAnimatedLineLength.ts — monotonically-growing visible
// path length across data changes (drives the line-draw entrance dasharray).
import { useCallback, useRef } from 'octane';
import { round } from '../util/round';

export function useAnimatedLineLength(points: unknown) {
	const startingLengthRef = useRef(0);
	const maxAnimatedLengthRef = useRef(0);
	const reachedFullRef = useRef(false);
	const prevPointsRef = useRef(points);
	if (prevPointsRef.current !== points) {
		startingLengthRef.current = maxAnimatedLengthRef.current;
		prevPointsRef.current = points;
	}
	// Stable callback (reads only refs) — never re-triggers consumers.
	return useCallback((animationElapsedTime: number, totalLength: number) => {
		if (reachedFullRef.current) {
			return null;
		}
		const visibleLength = Math.min(
			round(startingLengthRef.current + animationElapsedTime * totalLength),
			totalLength,
		);
		if (animationElapsedTime > 0 && totalLength > 0) {
			maxAnimatedLengthRef.current = Math.max(maxAnimatedLengthRef.current, visibleLength);
			if (visibleLength >= totalLength) {
				reachedFullRef.current = true;
				return null;
			}
		}
		return visibleLength;
	}, []);
}
