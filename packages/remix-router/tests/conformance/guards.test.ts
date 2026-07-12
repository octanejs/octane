/**
 * Phase E — useBlocker / unstable_usePrompt / ScrollRestoration /
 * useBeforeUnload / unstable_useRoute / unstable_useRouterState /
 * useViewTransitionState. Ported per react-router
 * __tests__/dom/use-blocker-test.tsx, __tests__/dom/use-prompt-test.tsx and
 * __tests__/dom/scroll-restoration-test.tsx.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	BlockerApp,
	PromptApp,
	ScrollApp,
	BeforeUnloadApp,
	RouterStateApp,
	unloadLog,
	stateGate,
} from '../_fixtures/guards.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('useBlocker', () => {
	it('unblocked navigations proceed; blocked ones park in "blocked" until proceed()', async () => {
		// Per use-blocker-test.tsx "navigates when not blocked" / "blocks navigations".
		const r = mount(BlockerApp, {});
		await flush();
		expect(r.find('#b-state').textContent).toBe('unblocked');

		// Not armed — navigation goes through.
		r.click('#to-away');
		await flush();
		expect(r.find('h1').textContent).toBe('Away');

		// Arm the blocker, try to navigate home — blocked, still on Away.
		r.click('#b-toggle');
		await flush();
		r.click('#to-home');
		await flush();
		expect(r.find('#b-state').textContent).toBe('blocked');
		expect(r.find('h1').textContent).toBe('Away');

		// proceed() completes the blocked navigation ('proceeding' is transient;
		// once the navigation lands the blocker returns to unblocked).
		r.click('#b-proceed');
		await flush();
		expect(r.find('h1').textContent).toBe('Home');
		expect(r.find('#b-state').textContent).toBe('unblocked');
		r.unmount();
	});

	it('reset() returns the blocker to unblocked and stays on the page', async () => {
		// Per use-blocker-test.tsx "reset".
		const r = mount(BlockerApp, {});
		await flush();
		r.click('#b-toggle');
		await flush();
		r.click('#to-away');
		await flush();
		expect(r.find('#b-state').textContent).toBe('blocked');
		expect(r.find('h1').textContent).toBe('Home');

		r.click('#b-reset');
		await flush();
		expect(r.find('#b-state').textContent).toBe('unblocked');
		expect(r.find('h1').textContent).toBe('Home');
		r.unmount();
	});
});

describe('unstable_usePrompt', () => {
	beforeEach(() => {
		unloadLog.length = 0;
	});

	it('confirm=true proceeds with the navigation', async () => {
		// Per use-prompt-test.tsx "proceeds on confirm".
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
		const r = mount(PromptApp, {});
		await flush();
		r.click('#p-arm');
		await flush();
		r.click('#to-away');
		await flush();
		await new Promise((res) => setTimeout(res, 10)); // usePrompt proceeds via setTimeout(0)
		await flush();
		expect(confirmSpy).toHaveBeenCalledWith('Leave?');
		expect(r.find('h1').textContent).toBe('Away');
		confirmSpy.mockRestore();
		r.unmount();
	});

	it('confirm=false resets and stays', async () => {
		// Per use-prompt-test.tsx "resets on cancel".
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const r = mount(PromptApp, {});
		await flush();
		r.click('#p-arm');
		await flush();
		r.click('#to-away');
		await flush();
		expect(confirmSpy).toHaveBeenCalledWith('Leave?');
		expect(r.find('h1').textContent).toBe('Home');
		confirmSpy.mockRestore();
		r.unmount();
	});
});

describe('ScrollRestoration', () => {
	it('saves the scroll position per location and restores it on back-navigation', async () => {
		// Per scroll-restoration-test.tsx "restores the scroll position".
		let scrollY = 0;
		const scrollTo = vi.fn((_x: number, y: number) => {
			scrollY = y;
		});
		Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY });
		vi.stubGlobal('scrollTo', scrollTo);
		window.scrollTo = scrollTo as any;
		sessionStorage.clear();

		const r = mount(ScrollApp, {});
		await flush();

		// Scroll down on Home, then navigate away — new locations go to the top.
		scrollY = 250;
		r.click('#to-away');
		await flush();
		expect(scrollTo).toHaveBeenCalledWith(0, 0);

		// POP back to Home — the position saved under Home's location.key is
		// restored (a PUSH to '/' would mint a NEW key and go to the top, like
		// the browser).
		scrollTo.mockClear();
		r.click('#go-back');
		await flush();
		expect(scrollTo).toHaveBeenCalledWith(0, 250);
		r.unmount();
		vi.unstubAllGlobals();
	});
});

describe('useBeforeUnload', () => {
	it('registers a window beforeunload listener for the component lifetime', async () => {
		unloadLog.length = 0;
		const r = mount(BeforeUnloadApp, {});
		await flush();
		window.dispatchEvent(new Event('beforeunload'));
		expect(unloadLog).toEqual(['beforeunload']);

		// Passive unmount cleanup is deferred (React parity) — flush before
		// asserting the listener is gone.
		r.unmount();
		await flush();
		window.dispatchEvent(new Event('beforeunload'));
		expect(unloadLog).toEqual(['beforeunload']); // removed on unmount
	});
});

describe('unstable_useRoute / unstable_useRouterState / useViewTransitionState', () => {
	it('exposes handle/loaderData by id, the active state, and a pending variant during navigation', async () => {
		stateGate.resolve = null;
		const r = mount(RouterStateApp, {});
		await flush();
		expect(r.find('#rs-active').textContent).toBe('/||POP');
		expect(r.find('#rs-matches').textContent).toBe('shell,probe');
		expect(r.find('#rs-pending').textContent).toBe('(idle)');
		expect(r.find('#route-handle').textContent).toBe('shell-handle');
		expect(r.find('#route-by-id').textContent).toBe('probe-data');
		// VT paths are dormant (no startViewTransition in jsdom) — always false.
		expect(r.find('#vt-state').textContent).toBe('false');

		r.click('#to-slow');
		await flush();
		expect(r.find('#rs-pending').textContent).toBe('loading:/slow');
		expect(r.find('#rs-active').textContent).toBe('/||POP'); // active untouched while pending

		stateGate.resolve!(null);
		await flush();
		expect(r.find('#rs-pending').textContent).toBe('(idle)');
		expect(r.find('#rs-active').textContent).toBe('/slow|a=1|PUSH');
		expect(r.find('#rs-matches').textContent).toBe('shell,slow');
		expect(r.find('#route-by-id').textContent).toBe('(no match)');
		r.unmount();
	});
});
