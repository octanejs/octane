let timeout: ReturnType<typeof setTimeout> | null = null;
const timeoutQueue: Array<() => void> = [];

/**
 * Upstream onNextTick: coalesce callbacks onto a single 0ms timer and return an
 * unsubscribe that can cancel a pending callback before it runs.
 */
export function onNextTick(cb: () => void): () => void {
	timeoutQueue.push(cb);

	if (!timeout) {
		timeout = setTimeout(function drainQueue() {
			timeout = null;
			let item: (() => void) | undefined;
			while ((item = timeoutQueue.shift())) {
				item();
			}
		}, 0);
	}

	let isSubscribed = true;

	return function unsubscribe() {
		if (!isSubscribed) {
			return;
		}

		isSubscribed = false;

		const index = timeoutQueue.indexOf(cb);
		if (index === -1) {
			return;
		}

		timeoutQueue.splice(index, 1);

		if (!timeoutQueue.length && timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
	};
}

export default onNextTick;
