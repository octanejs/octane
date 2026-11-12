import { __profileCount, ProfileCounter } from './profiling.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

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
	if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
		__profileCount(ProfileCounter.TASK_POST);
	if (HOST_CLOCK) {
		HOST_CLOCK.schedule(callback, 0, false);
		return;
	}
	const scheduler = (globalThis as { scheduler?: HostScheduler }).scheduler;
	if (typeof scheduler?.postTask === 'function') {
		scheduler.postTask(callback);
		return;
	}
	if (typeof MessageChannel === 'function') {
		const channel = new MessageChannel();
		// Node exposes the web-compatible handler, but its DOM-free typings omit it.
		(channel.port1 as typeof channel.port1 & { onmessage: () => void }).onmessage = () => {
			channel.port1.close();
			callback();
		};
		channel.port2.postMessage(null);
		return;
	}
	setTimeout(callback, 0);
}

/**
 * A replacement for the host's timers, frames, tasks and clock. Only
 * `octane/testing`'s `installTestClock` installs one; apps never do. Every
 * runtime site that waits on host time goes through the helpers below, so one
 * installed clock decides the order of all of them (#2508).
 */
export interface HostClock {
	now(): number;
	/** `Date.now()` on the clock: the date at install, moved as the clock moves. */
	dateNow(): number;
	/** A frame callback runs at the next frame boundary; otherwise at now + delay. */
	schedule(callback: () => void, delay: number, frame: boolean): HostClockTimer;
	/** Run one callback that is already due, without moving time. act() drains these. */
	step(): boolean;
}

/**
 * A callback an installed clock holds. `clearHostTimeout` cancels it by
 * clearing `callback`, which stays correct after the clock hands its pending
 * work back to the host.
 */
export class HostClockTimer {
	callback: (() => void) | null;
	constructor(callback: () => void) {
		this.callback = callback;
	}
}

/** @internal Read by `act()`; written only through `setHostClock`. */
export let HOST_CLOCK: HostClock | null = null;

/** @internal `octane/testing` installs and removes its clock here. */
export function setHostClock(clock: HostClock | null): void {
	HOST_CLOCK = clock;
}

export function hostNow(): number {
	if (HOST_CLOCK) return HOST_CLOCK.now();
	return typeof performance === 'object' ? performance.now() : Date.now();
}

/** `Date.now()`, for timestamps that are stored or compared across launches. */
export function hostDateNow(): number {
	return HOST_CLOCK ? HOST_CLOCK.dateNow() : Date.now();
}

export function setHostTimeout(callback: () => void, delay: number): unknown {
	if (HOST_CLOCK) return HOST_CLOCK.schedule(callback, delay, false);
	return setTimeout(callback, delay);
}

export function clearHostTimeout(handle: unknown): void {
	if (handle instanceof HostClockTimer) handle.callback = null;
	else clearTimeout(handle as ReturnType<typeof setTimeout>);
}

/**
 * Whether a frame will come: a hidden page or a host without
 * `requestAnimationFrame` may never get one. An installed clock draws frames
 * whenever the page is not hidden.
 */
export function hostFramesRun(): boolean {
	const host = globalThis as HostFrames;
	return (
		(HOST_CLOCK !== null || typeof host.requestAnimationFrame === 'function') &&
		(host.document === undefined || host.document.visibilityState !== 'hidden')
	);
}

/** Callers check `hostFramesRun()` first. */
export function requestHostFrame(callback: () => void): void {
	if (HOST_CLOCK) HOST_CLOCK.schedule(callback, 0, true);
	else (globalThis as HostFrames).requestAnimationFrame!(callback);
}

// This module is shared with DOM-free programs, so it names no DOM globals.
interface HostFrames {
	requestAnimationFrame?: (callback: () => void) => unknown;
	document?: { visibilityState?: string };
}
