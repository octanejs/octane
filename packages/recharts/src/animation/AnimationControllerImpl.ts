// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import {
	AnimationController,
	AnimationControllerHandle,
	OnAnimationStateUpdate,
} from './AnimationController';
import { CancelableTimeout, TimeoutController } from './timeoutController';

/**
 * JavaScript animations require trigger and repaint as soon as possible,
 * so this class uses the timeoutController to trigger updates as quickly as the controller allows.
 *
 * JavaScript animation progress is represented as a stream of values. The exact type depends on the animationHandle type.
 * Each individual consumer is then responsible for mapping those values onto a React component.
 */
export const animationControllerImpl: AnimationController = <T extends number | string>(
	timeoutController: TimeoutController,
	animationHandle: AnimationControllerHandle<T>,
	listener: OnAnimationStateUpdate<T>,
): CancelableTimeout => {
	let cancellable: CancelableTimeout | undefined;
	const nextUpdate = (now: number) => {
		const timeRemaining = animationHandle.tick(now);
		if (animationHandle.getState() === 'active') {
			listener(animationHandle.getInterpolated());
			if (animationHandle.getProgress() === 1) {
				animationHandle.complete();
				cancellable = undefined;
				return;
			}
			cancellable = timeoutController.setTimeout(nextUpdate, timeRemaining);
			return;
		}
		cancellable = timeoutController.setTimeout(nextUpdate, timeRemaining);
	};

	cancellable = timeoutController.setTimeout(nextUpdate, 0);

	return () => cancellable?.();
};
