// After a redeploy purges the previous build's hashed chunks, a stale tab's
// lazy route import 404s and Vite reports `vite:preloadError`. Importing the
// client router module installs a handler that reloads the page so the tab
// picks up the new deployment. The guard is time-bounded: a repeat failure on
// the same URL right after a reload surfaces the error instead of looping,
// but a long-lived tab that healed once can still recover from a LATER
// redeploy on the same URL.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../src/app/router-client.ts';

const reload = vi.fn();

beforeEach(() => {
	vi.useFakeTimers();
	sessionStorage.clear();
	reload.mockClear();
	Object.defineProperty(window, 'location', {
		value: { href: 'https://octanejs.dev/docs', reload },
		writable: true,
	});
});

afterEach(() => {
	vi.useRealTimers();
});

function failPreload(): Event {
	const event = new Event('vite:preloadError', { cancelable: true });
	window.dispatchEvent(event);
	return event;
}

describe('stale-chunk reload', () => {
	it('reloads when a lazy chunk fails to load', () => {
		const event = failPreload();
		expect(reload).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it('does not loop when the same URL keeps failing — the error surfaces', () => {
		failPreload();
		vi.advanceTimersByTime(2_000); // a realistic reload round-trip
		const second = failPreload();
		expect(reload).toHaveBeenCalledTimes(1);
		expect(second.defaultPrevented).toBe(false);
	});

	it('recovers from a LATER redeploy on the same URL in a long-lived tab', () => {
		failPreload();
		vi.advanceTimersByTime(60 * 60 * 1000); // the next deployment, an hour on
		failPreload();
		expect(reload).toHaveBeenCalledTimes(2);
	});

	it('a failure on a different URL still gets its own reload', () => {
		failPreload();
		(window.location as unknown as { href: string }).href = 'https://octanejs.dev/benchmarks';
		failPreload();
		expect(reload).toHaveBeenCalledTimes(2);
	});
});
