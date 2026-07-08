// Port of animation/useAnimationStartSnapshot.ts — interruption-safe animation
// snapshots: `startValue` is frozen per animation cycle; the live "latest
// visible frame" ref is only writable after the new cycle's t=0 handshake.
import { useCallback, useRef } from 'octane';

export function useAnimationStartSnapshot(
	animationInput: unknown,
	previousValueRef: { current: any },
) {
	// Identity of the animation cycle currently being served.
	const previousAnimationInputRef = useRef(animationInput);
	// Frozen start-of-cycle value used for interpolation.
	const startValueRef = useRef(previousValueRef.current);
	// Blocks live-ref writes until the new animation renders its own t=0 frame.
	const isReadyToCommitRef = useRef(true);
	if (previousAnimationInputRef.current !== animationInput) {
		// New animation cycle: capture exactly one frozen starting snapshot.
		previousAnimationInputRef.current = animationInput;
		startValueRef.current = previousValueRef.current;
		isReadyToCommitRef.current = false;
	}
	const syncStepValue = useCallback(
		(stepValue: any, animationElapsedTime: number, canCommit = true) => {
			if (animationElapsedTime === 0) {
				// t=0 handshake: the new animation has rendered its starting frame.
				isReadyToCommitRef.current = true;
				return;
			}
			if (animationElapsedTime === 1) {
				// Keep the frozen snapshot aligned with the fully completed geometry.
				startValueRef.current = stepValue;
			}
			if (animationElapsedTime > 0 && isReadyToCommitRef.current && canCommit) {
				previousValueRef.current = stepValue;
			}
		},
		[previousValueRef],
	);
	return {
		startValue: startValueRef.current,
		syncStepValue,
	};
}
