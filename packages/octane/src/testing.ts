import { HOST_CLOCK, HostClockTimer, setHostClock } from './host-task.js';
import { flushSync } from './runtime.js';

const FRAME_MS = 16;
const CLOCK_STEP_LIMIT = 10_000;
// Captured at load so a test that stubs MessageChannel or fakes timers cannot
// stop the clock's own checkpoints.
const HostMessageChannel = globalThis.MessageChannel;
const hostSetTimeout = globalThis.setTimeout;

class ClockTimer extends HostClockTimer {
	time: number;
	seq: number;
	constructor(callback: () => void, time: number, seq: number) {
		super(callback);
		this.time = time;
		this.seq = seq;
	}
}

/**
 * A clock that owns Octane's timers, animation frames, host tasks, `now()`
 * and the dates its data cache stamps.
 */
export interface TestClock {
	/** The clock's current time in milliseconds. */
	now(): number;
	/** The clock's `Date.now()`: the real date at install, moved as the clock moves. */
	dateNow(): number;
	/**
	 * Move time forward by `ms`, running each timer, frame and host task that
	 * falls due, in time order, with a full microtask checkpoint after each.
	 * An idle callback is a task, due when it is requested.
	 */
	advance(ms: number): Promise<void>;
	/** Advance to the next animation frame and run it and the tasks it posts. */
	frame(): Promise<void>;
	/**
	 * Run everything the clock holds, moving time to each callback in turn,
	 * until nothing is left. Throws if work keeps scheduling more work.
	 */
	settle(): Promise<void>;
	/** Remove the clock. Work it still holds goes back to the real host timers. */
	uninstall(): void;
}

/**
 * Install a clock that owns the time Octane's runtime waits on: transitions
 * and deferred updates (host tasks), passive effects (frames and post-paint
 * tasks), Suspense reveal throttling, transition fallback timeouts, the
 * shared producer budget, idle and streamed hydration, and `octane/data`
 * freshness and retention. Nothing moves until the test calls `advance`,
 * `frame` or `settle`. `act()` still runs clock work that is already due, but
 * never moves time. The clock does not own the app's own `setTimeout` calls.
 */
export function installTestClock(): TestClock {
	if (HOST_CLOCK) throw new Error('installTestClock: a test clock is already installed.');
	let time = typeof performance === 'object' ? performance.now() : Date.now();
	const installedAt = time;
	const dateAtInstall = Date.now();
	const dateNow = () => dateAtInstall + (time - installedAt);
	let seq = 0;
	let queue: ClockTimer[] = [];

	const nextDue = (until: number): ClockTimer | null => {
		let next: ClockTimer | null = null;
		for (const timer of queue) {
			if (timer.callback === null || timer.time > until) continue;
			if (
				next === null ||
				timer.time < next.time ||
				(timer.time === next.time && timer.seq < next.seq)
			)
				next = timer;
		}
		return next;
	};
	const run = (timer: ClockTimer): void => {
		queue = queue.filter((entry) => entry !== timer && entry.callback !== null);
		if (timer.time > time) time = timer.time;
		const callback = timer.callback!;
		timer.callback = null;
		callback();
	};
	// A task after the whole promise queue, so every microtask a callback queued
	// runs before the next callback, as it would between two real tasks.
	const checkpoint = (): Promise<void> =>
		new Promise((resolve) => {
			const channel = new HostMessageChannel();
			channel.port1.onmessage = () => {
				channel.port1.close();
				resolve();
			};
			channel.port2.postMessage(null);
		});
	const drain = async (until: number): Promise<void> => {
		await checkpoint();
		for (let steps = 0; ; steps++) {
			const next = nextDue(until);
			if (next === null) return;
			if (steps === CLOCK_STEP_LIMIT)
				throw new Error(
					`TestClock: ${CLOCK_STEP_LIMIT} callbacks ran without the clock settling. ` +
						'Something keeps scheduling more work.',
				);
			run(next);
			await checkpoint();
		}
	};

	const clock = {
		now: () => time,
		dateNow,
		schedule(callback: () => void, delay: number, frame: boolean): HostClockTimer {
			const due = frame ? (Math.floor(time / FRAME_MS) + 1) * FRAME_MS : time + Math.max(0, delay);
			const timer = new ClockTimer(callback, due, seq++);
			queue.push(timer);
			return timer;
		},
		step(): boolean {
			const next = nextDue(time);
			if (next === null) return false;
			run(next);
			return true;
		},
	};
	setHostClock(clock);

	const advance = async (ms: number): Promise<void> => {
		if (!(ms >= 0)) throw new RangeError(`TestClock.advance: expected ms >= 0, got ${ms}.`);
		const target = time + ms;
		await drain(target);
		if (target > time) time = target;
	};
	return {
		now: () => time,
		dateNow,
		advance,
		frame: () => advance((Math.floor(time / FRAME_MS) + 1) * FRAME_MS - time),
		settle: () => drain(Infinity),
		uninstall() {
			if (HOST_CLOCK !== clock) return;
			setHostClock(null);
			// Dropping held work would strand the runtime: post-paint effects,
			// for one, arm only when their queue goes from empty to non-empty.
			for (const timer of queue) {
				if (timer.callback === null) continue;
				hostSetTimeout(
					() => {
						const callback = timer.callback;
						timer.callback = null;
						if (callback !== null) callback();
					},
					Math.max(0, timer.time - time),
				);
			}
			queue = [];
		},
	};
}

/**
 * Clamp jsdom's stored scroll position to the range its layout metrics report.
 * Browsers do this for programmatic scroll assignments, but jsdom can retain an
 * out-of-range value because it does not perform layout. Dispatch the native
 * event so components observe the normalized position through their public
 * scroll boundary.
 */
export function clampJsdomScrollTop(element: Element): void {
	const scrollTop = Number.isFinite(element.scrollTop) ? element.scrollTop : 0;
	const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
	const clampedScrollTop = Math.min(maxScrollTop, Math.max(0, scrollTop));
	if (clampedScrollTop === element.scrollTop) return;

	flushSync(() => {
		element.scrollTop = clampedScrollTop;
		element.dispatchEvent(new Event('scroll'));
	});
}
