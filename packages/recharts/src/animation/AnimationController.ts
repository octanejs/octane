// Port of animation/AnimationController.ts — upstream ships this module as
// types only (its compiled `es6/animation/AnimationController.js` is `export {}`),
// so the vendoring pass that copies recharts' compiled JS skipped it and left
// `CSSTransitionAnimate` importing a module that does not exist.
//
// `TimeoutController`, `CallbackType` and `CancelableTimeout` live in
// `animation/timeoutController.ts` upstream, and `AnimationHandle` is exported
// as a type from `animation/AnimationHandle.ts`. Both of those modules are
// vendored here as compiled `.js`, which carries their runtime classes but
// erases every type-only export, so they cannot be imported by name yet. They
// are co-located here until those two modules are typed; move them back to
// their upstream homes at that point rather than growing this module.
import type { CSSTransitionAnimation, JavascriptAnimation } from './AnimationHandle';

/**
 * Callback type for the timeout function.
 * Receives current time as an argument.
 */
export type CallbackType = (now: number) => void;

/**
 * A function that, when called, cancels the timeout.
 *
 * @since 3.9
 */
export type CancelableTimeout = () => void;

/**
 * TimeoutController is responsible for controlling the movement of time.
 * Think of it as a clock.
 *
 * Recharts default implementation uses requestAnimationFrame which works great
 * in a browser. You may choose to override this which is especially useful if
 * you want to control animations.
 *
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animation guide}
 *
 * @since 3.9
 */
export interface TimeoutController {
	/**
	 * Sets a timeout that executes a callback after a specified delay.
	 * Allows setting multiple timeouts and provides a way to cancel them
	 * independently.
	 *
	 * The input (`delay`) is relative — "wait for this long". The output (`now`,
	 * the callback's parameter) is absolute — "this is the time now".
	 */
	setTimeout(callback: CallbackType, delay?: number): CancelableTimeout;
}

/**
 * Recharts animation state machine.
 *
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animation guide}
 *
 * @since 3.9
 */
export type AnimationHandle = JavascriptAnimation | CSSTransitionAnimation;

/**
 * It's actually always the case that JavaScript-based animations produce numbers,
 * and CSS transition-based animations always produce strings,
 * but it's so much easier to just have them together than to deal with all the generics.
 *
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animation guide}
 *
 * @since 3.9
 */
export type OnAnimationStateUpdate = (newState: number | string) => void;

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
export type AnimationController = (
	timeoutController: TimeoutController,
	animationHandle: AnimationHandle,
	listener: OnAnimationStateUpdate,
) => CancelableTimeout;
