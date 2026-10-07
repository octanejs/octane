interface HostScheduler {
	postTask?: (callback: () => void) => unknown;
}

/**
 * Run `callback` in a new host task, after the current task and its entire
 * microtask checkpoint. Browsers paint and deliver input only between tasks, so
 * scheduler work that must not delay the commit before it (#1864) goes here
 * instead of `queueMicrotask`.
 *
 * Preference order:
 * - `scheduler.postTask`, at its default `user-visible` priority, so the
 *   browser schedules it alongside input and rendering;
 * - a `MessageChannel` message, which, unlike a timer, is neither clamped nor
 *   throttled in background tabs;
 * - `setTimeout(0)` on hosts with neither.
 *
 * Each `MessageChannel` post uses a fresh channel. Node delivers pending port
 * messages in port-creation order, not post order, so a long-lived port would
 * run ahead of a task that a newer port had posted first. A fresh port keeps
 * these tasks first in, first out on every host.
 */
export function postHostTask(callback: () => void): void {
	const scheduler = (globalThis as { scheduler?: HostScheduler }).scheduler;
	if (typeof scheduler?.postTask === 'function') {
		scheduler.postTask(callback);
		return;
	}
	if (typeof MessageChannel === 'function') {
		const channel = new MessageChannel();
		channel.port1.onmessage = () => {
			channel.port1.close();
			callback();
		};
		channel.port2.postMessage(null);
		return;
	}
	setTimeout(callback, 0);
}
