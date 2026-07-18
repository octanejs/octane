// After a redeploy purges the previous build's hashed chunks, a stale tab's
// lazy route imports 404 and Vite reports `vite:preloadError`. The client
// router module reloads the page so the tab picks up the new deployment.
// Within one page lifetime every failure after the first (a navigation loads
// layout + page chunks together) rides the scheduled reload; across reloads
// the guard is time-bounded, so a chunk that KEEPS failing surfaces its error
// instead of looping while a later redeploy can still self-heal.
// Each installStaleChunkReload() call below models one page lifetime sharing
// the tab's sessionStorage — what a real reload produces.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installStaleChunkReload } from '../src/app/stale-chunk-reload.ts';

beforeEach(() => {
	vi.useFakeTimers();
	sessionStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
});

function pageLifetime(href = 'https://octanejs.dev/docs') {
	const target = new EventTarget();
	const reload = vi.fn();
	installStaleChunkReload({
		addEventListener: target.addEventListener.bind(target),
		location: { href, reload },
		sessionStorage,
	});
	const failPreload = () => {
		const event = new Event('vite:preloadError', { cancelable: true });
		target.dispatchEvent(event);
		return event;
	};
	return { reload, failPreload };
}

describe('stale-chunk reload', () => {
	it('reloads when a lazy chunk fails to load', () => {
		const tab = pageLifetime();
		const event = tab.failPreload();
		expect(tab.reload).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it('parallel chunk failures (layout + page) all ride the one scheduled reload', () => {
		const tab = pageLifetime();
		const first = tab.failPreload();
		const second = tab.failPreload();
		expect(tab.reload).toHaveBeenCalledTimes(1);
		expect(first.defaultPrevented).toBe(true);
		expect(second.defaultPrevented).toBe(true);
	});

	it('does not loop when the chunk still fails after the reload — the error surfaces', () => {
		pageLifetime().failPreload();
		vi.advanceTimersByTime(2_000); // a realistic reload round-trip
		const reloaded = pageLifetime();
		const event = reloaded.failPreload();
		expect(reloaded.reload).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it('recovers from a LATER redeploy on the same URL in a long-lived tab', () => {
		pageLifetime().failPreload();
		vi.advanceTimersByTime(60 * 60 * 1000); // the next deployment, an hour on
		const later = pageLifetime();
		later.failPreload();
		expect(later.reload).toHaveBeenCalledTimes(1);
	});

	it('a failure on a different URL still gets its own reload', () => {
		pageLifetime('https://octanejs.dev/docs').failPreload();
		vi.advanceTimersByTime(2_000);
		const other = pageLifetime('https://octanejs.dev/benchmarks');
		other.failPreload();
		expect(other.reload).toHaveBeenCalledTimes(1);
	});
});
