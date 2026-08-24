// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { CancelableTimeout, TimeoutController } from './timeoutController';
import { AnimationHandle } from './AnimationHandle';

/**
 * JavaScript animations produce numbers and CSS transitions produce strings.
 * Keep the listener's value type tied to the supplied animation handle.
 *
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animation guide}
 *
 * @since 3.9
 */
export type OnAnimationStateUpdate<T extends number | string = number | string> = (
	newState: T,
) => void;

export type AnimationControllerHandle<T extends number | string> = Omit<
	AnimationHandle,
	'getInterpolated'
> & {
	getInterpolated(): T;
};

/**
 * AnimationController accepts the animation state machine (= RechartsAnimation) plus a timeout controller,
 * and manages the animation by calling the tick method of the animation state machine at the right time.
 *
 * One controller is only responsible for one animation. Every new animation will create a new controller.
 *
 * The animation state machine is responsible for calculating the animation progress
 * and calling the onAnimationStart and onAnimationEnd callbacks at the right time,
 * while the AnimationController is responsible for calling the tick method of the animation state machine.
 *
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animation guide}
 *
 * @since 3.9
 */
export type AnimationController = <T extends number | string>(
	timeoutController: TimeoutController,
	animationHandle: AnimationControllerHandle<T>,
	listener: OnAnimationStateUpdate<T>,
) => CancelableTimeout;
