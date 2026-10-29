// Ported from react-hot-toast@2.6.1 src/core/use-toaster.ts
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: the hooks come from octane. Every dependency array is
// upstream's own, so Octane keeps React's exact behavior for each of them.
// Upstream also imports the store's `dispatch`, but the local `dispatch` below
// shadows it everywhere in this hook, so the unused import is dropped.
import { useCallback, useEffect, useRef } from 'octane';
import { ActionType, createDispatch, useStore } from './store';
import { toast } from './toast';
import type { DefaultToastOptions, Toast, ToastPosition } from './types';

export const REMOVE_DELAY = 1000;

export const useToaster = (toastOptions?: DefaultToastOptions, toasterId: string = 'default') => {
	const { toasts, pausedAt } = useStore(toastOptions, toasterId);
	const toastTimeouts = useRef(new Map<Toast['id'], ReturnType<typeof setTimeout>>()).current;

	const addToRemoveQueue = useCallback((toastId: string, removeDelay = REMOVE_DELAY) => {
		if (toastTimeouts.has(toastId)) {
			return;
		}

		const timeout = setTimeout(() => {
			toastTimeouts.delete(toastId);
			dispatch({
				type: ActionType.REMOVE_TOAST,
				toastId: toastId,
			});
		}, removeDelay);

		toastTimeouts.set(toastId, timeout);
	}, []);

	useEffect(() => {
		if (pausedAt) {
			return;
		}

		const now = Date.now();
		const timeouts = toasts.map((t) => {
			if (t.duration === Infinity) {
				return;
			}

			const durationLeft = (t.duration || 0) + t.pauseDuration - (now - t.createdAt);

			if (durationLeft < 0) {
				if (t.visible) {
					toast.dismiss(t.id);
				}
				return;
			}
			return setTimeout(() => toast.dismiss(t.id, toasterId), durationLeft);
		});

		return () => {
			timeouts.forEach((timeout) => timeout && clearTimeout(timeout));
		};
	}, [toasts, pausedAt, toasterId]);

	const dispatch = useCallback(createDispatch(toasterId), [toasterId]);

	const startPause = useCallback(() => {
		dispatch({
			type: ActionType.START_PAUSE,
			time: Date.now(),
		});
	}, [dispatch]);

	const updateHeight = useCallback(
		(toastId: string, height: number) => {
			dispatch({
				type: ActionType.UPDATE_TOAST,
				toast: { id: toastId, height },
			});
		},
		[dispatch],
	);

	const endPause = useCallback(() => {
		if (pausedAt) {
			dispatch({ type: ActionType.END_PAUSE, time: Date.now() });
		}
	}, [pausedAt, dispatch]);

	const calculateOffset = useCallback(
		(
			toast: Toast,
			opts?: {
				reverseOrder?: boolean;
				gutter?: number;
				defaultPosition?: ToastPosition;
			},
		) => {
			const { reverseOrder = false, gutter = 8, defaultPosition } = opts || {};

			const relevantToasts = toasts.filter(
				(t) => (t.position || defaultPosition) === (toast.position || defaultPosition) && t.height,
			);
			const toastIndex = relevantToasts.findIndex((t) => t.id === toast.id);
			const toastsBefore = relevantToasts.filter(
				(toast, i) => i < toastIndex && toast.visible,
			).length;

			const offset = relevantToasts
				.filter((t) => t.visible)
				.slice(...(reverseOrder ? [toastsBefore + 1] : [0, toastsBefore]))
				.reduce((acc, t) => acc + (t.height || 0) + gutter, 0);

			return offset;
		},
		[toasts],
	);

	// Keep track of dismissed toasts and remove them after the delay
	useEffect(() => {
		toasts.forEach((toast) => {
			if (toast.dismissed) {
				addToRemoveQueue(toast.id, toast.removeDelay);
			} else {
				// If toast becomes visible again, remove it from the queue
				const timeout = toastTimeouts.get(toast.id);
				if (timeout) {
					clearTimeout(timeout);
					toastTimeouts.delete(toast.id);
				}
			}
		});
	}, [toasts, addToRemoveQueue]);

	return {
		toasts,
		handlers: {
			updateHeight,
			startPause,
			endPause,
			calculateOffset,
		},
	};
};
