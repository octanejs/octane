// Port of animation/useAnimationController.tsx — context override point for
// the animation driver (tests inject a mock controller; the default ticks on
// requestAnimationFrame).
import { createContext, useContext, useMemo } from 'octane';
import { animationControllerImpl } from './AnimationControllerImpl';

const AnimationControllerContext = createContext(animationControllerImpl);

/**
 * Allows overriding the default AnimationController that Recharts uses
 * internally to drive animations.
 * @since 3.9
 */
export const AnimationControllerProvider = AnimationControllerContext.Provider;

export function useAnimationController(animationControllerFromProps: unknown) {
	const animationControllerFromContext = useContext(AnimationControllerContext);
	return useMemo(
		() => animationControllerFromProps ?? animationControllerFromContext,
		[animationControllerFromProps, animationControllerFromContext],
	);
}
