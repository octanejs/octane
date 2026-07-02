import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { ScrollAreaApp } from './_fixtures/scroll-area.tsx';

// jsdom has no ResizeObserver; the auto/hover scrollbars gate on RO-driven overflow
// measurement. This minimal stub records instances and lets a test fire all observer
// callbacks on demand (a real RO also fires on observe) after stubbing element sizes.
class FakeResizeObserver {
	static instances: FakeResizeObserver[] = [];
	cb: () => void;
	constructor(cb: () => void) {
		this.cb = cb;
		FakeResizeObserver.instances.push(this);
	}
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
	static fireAll(): void {
		for (const i of FakeResizeObserver.instances) i.cb();
	}
}

beforeAll(() => {
	vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});
afterAll(() => {
	vi.unstubAllGlobals();
});

// Simulate a viewport with 100px visible of 300px content.
function stubOverflow(viewport: HTMLElement): void {
	Object.defineProperty(viewport, 'offsetHeight', { value: 100, configurable: true });
	Object.defineProperty(viewport, 'scrollHeight', { value: 300, configurable: true });
	Object.defineProperty(viewport, 'offsetWidth', { value: 200, configurable: true });
	Object.defineProperty(viewport, 'scrollWidth', { value: 200, configurable: true });
}

// Fire the observers, then wait out the rAF delivery + the 10ms measure debounce.
async function measure(): Promise<void> {
	FakeResizeObserver.fireAll();
	await new Promise((res) => setTimeout(res, 60));
}

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

// ScrollArea never portals — scope queries to the mounted container so a failed
// earlier test (leaked mount) can't satisfy a later query.
const inC =
	(container: HTMLElement) =>
	(sel: string): HTMLElement | null =>
		container.querySelector(sel);

// jsdom has no layout or ResizeObserver, so thumb GEOMETRY (sizes, drag, wheel math)
// isn't observable here — those paths are pure functions ported verbatim. These tests
// cover the DOM structure, the scrollbar-enabled → viewport overflow wiring, and the
// hover / scroll visibility strategies (via forceMount + data-state, and real scroll
// events driving the state machine).
describe('@octanejs/radix — ScrollArea', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders viewport structure: hidden-native-scrollbar style, table content wrapper, overflow wiring', async () => {
		const r = mount(ScrollAreaApp, { type: 'always' as const });
		const $ = inC(r.container);
		await settle();
		const root = $('[data-testid="root"]')!;
		const viewport = $('[data-testid="viewport"]')!;
		// Corner CSS vars on the root.
		expect(root.style.getPropertyValue('--radix-scroll-area-corner-width')).toBe('0px');
		expect(root.style.position).toBe('relative');
		// The injected style hides native scrollbars.
		const style = r.container.querySelector('style')!;
		expect(style.textContent).toContain('[data-radix-scroll-area-viewport]');
		expect(style.textContent).toContain('scrollbar-width:none');
		// Viewport marker attr + content wrapper measured via display: table.
		expect(viewport.getAttribute('data-radix-scroll-area-viewport')).toBe('');
		const content = $('[data-testid="content-inner"]')!.parentElement!;
		expect(content.style.display).toBe('table');
		expect(content.style.minWidth).toBe('100%');
		// Only the vertical scrollbar is mounted → overflow-y scroll, overflow-x hidden.
		expect(viewport.style.overflowY).toBe('scroll');
		expect(viewport.style.overflowX).toBe('hidden');
		r.unmount();
	});

	it('type="always" renders the scrollbar immediately; thumb waits for measurable overflow', async () => {
		const r = mount(ScrollAreaApp, { type: 'always' as const });
		const $ = inC(r.container);
		await settle();
		const scrollbar = $('[data-testid="scrollbar-y"]')!;
		expect(scrollbar).not.toBe(null);
		expect(scrollbar.getAttribute('data-state')).toBe('visible');
		expect(scrollbar.getAttribute('data-orientation')).toBe('vertical');
		expect(scrollbar.style.position).toBe('absolute');
		// No layout in jsdom → thumb ratio stays 0 → no thumb without forceMount.
		expect($('[data-testid="thumb-y"]')).toBe(null);
		r.unmount();
	});

	it('horizontal + vertical scrollbars enable both overflow axes', async () => {
		const r = mount(ScrollAreaApp, { type: 'always' as const, horizontal: true });
		const $ = inC(r.container);
		await settle();
		const viewport = $('[data-testid="viewport"]')!;
		expect(viewport.style.overflowX).toBe('scroll');
		expect(viewport.style.overflowY).toBe('scroll');
		expect($('[data-testid="scrollbar-x"]')!.getAttribute('data-orientation')).toBe('horizontal');
		r.unmount();
	});

	it('type="hover" shows on pointerenter (with measured overflow + thumb), hides after scrollHideDelay', async () => {
		const r = mount(ScrollAreaApp, { type: 'hover' as const, scrollHideDelay: 30 });
		const $ = inC(r.container);
		await settle();
		stubOverflow($('[data-testid="viewport"]')!);
		// Hidden until hover — the scrollbar subtree isn't mounted at all.
		expect($('[data-testid="scrollbar-y"]')).toBe(null);

		// pointerenter on the root mounts the auto layer, which measures the overflow.
		flushSync(() => {
			$('[data-testid="root"]')!.dispatchEvent(new MouseEvent('pointerenter', { bubbles: false }));
		});
		await settle();
		await measure();
		await settle();
		const scrollbar = $('[data-testid="scrollbar-y"]')!;
		expect(scrollbar).not.toBe(null);
		expect(scrollbar.getAttribute('data-state')).toBe('visible');
		// The revealed scrollbar registered its OWN observers — fire a second round so
		// its sizes flow in: 100px viewport of 300px content → thumb ratio 1/3 → thumb.
		await measure();
		await settle();
		expect($('[data-testid="thumb-y"]')).not.toBe(null);

		// pointerleave hides it after the delay.
		flushSync(() => {
			$('[data-testid="root"]')!.dispatchEvent(new MouseEvent('pointerleave', { bubbles: false }));
		});
		await settle();
		expect($('[data-testid="scrollbar-y"]')).not.toBe(null); // not yet
		await new Promise((res) => setTimeout(res, 50));
		await settle();
		expect($('[data-testid="scrollbar-y"]')).toBe(null);
		r.unmount();
	});

	it('type="scroll" state machine: scroll shows, scroll-end + hide delay hides', async () => {
		const r = mount(ScrollAreaApp, {
			type: 'scroll' as const,
			scrollHideDelay: 30,
			forceMount: true as const,
		});
		const $ = inC(r.container);
		await settle();
		const scrollbar = $('[data-testid="scrollbar-y"]')!;
		const viewport = $('[data-testid="viewport"]')!;
		expect(scrollbar.getAttribute('data-state')).toBe('hidden');

		// A scroll position change dispatches SCROLL → 'scrolling'.
		flushSync(() => {
			viewport.scrollTop = 100;
			viewport.dispatchEvent(new Event('scroll'));
		});
		await settle();
		expect(scrollbar.getAttribute('data-state')).toBe('visible');

		// 100ms debounce fires SCROLL_END → 'idle', then scrollHideDelay → 'hidden'.
		await new Promise((res) => setTimeout(res, 160));
		await settle();
		expect(scrollbar.getAttribute('data-state')).toBe('hidden');
		r.unmount();
	});

	it('corner renders only when both scrollbars exist (none in jsdom without both mounted)', async () => {
		const r = mount(ScrollAreaApp, { type: 'always' as const });
		const $ = inC(r.container);
		await settle();
		// Only the vertical scrollbar is mounted → no corner.
		expect($('[data-testid="corner"]')).toBe(null);
		r.unmount();
	});
});
