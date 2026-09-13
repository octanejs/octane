import { describe, it, expect } from 'vitest';
import { mount } from './_helpers.js';
import { createRoot, flushSync, delegateEvents } from '../src/index.js';
import {
	getOwnerFromHostInstance,
	getOwnerStackFromHost,
	isInstrumentationActive,
	pauseUpdates,
} from '../src/inspect.js';
import { InspectCounter, InspectLabel } from './_fixtures/inspect.tsrx';
import { InspectOuter } from './_fixtures/inspect-nested.tsx';
import { InspectOverlayEffect } from './_fixtures/inspect-overlay-effect.tsx';

describe('octane/inspect', () => {
	it('registers roots and maps host nodes to owners', () => {
		const r = mount(InspectLabel, { text: 'hello' });
		expect(isInstrumentationActive()).toBe(true);
		const host = r.find('[data-testid="label"]');
		const owner = getOwnerFromHostInstance(host);
		expect(owner).not.toBeNull();
		expect(typeof owner!.displayName).toBe('string');
		expect(getOwnerStackFromHost(host).length).toBeGreaterThan(0);
		r.unmount();
	});

	it('maps nested single-root hosts through the owner stack', () => {
		const r = mount(InspectOuter);
		const inner = r.find('[data-testid="inspect-inner"]');
		const owner = getOwnerFromHostInstance(inner);
		expect(owner).not.toBeNull();
		const stackNames = getOwnerStackFromHost(inner).map((frame) => frame.name);
		const dump = JSON.stringify({ owner: owner!.displayName, stackNames });
		// Before single-root marker containment, the walk stopped at the root and
		// never reached nested component frames.
		expect(stackNames, dump).toContain('InspectInner');
		expect(stackNames, dump).toContain('InspectOuter');
		r.unmount();
	});

	it('pauses scheduled updates until resume', async () => {
		let setCount: ((n: number) => void) | undefined;
		const r = mount(InspectCounter, {
			expose(set) {
				setCount = set;
			},
		});
		expect(r.find('[data-testid="count"]').textContent).toBe('0');

		const resume = pauseUpdates();
		setCount!(1);
		await Promise.resolve();
		expect(r.find('[data-testid="count"]').textContent).toBe('0');

		resume();
		await Promise.resolve();
		await Promise.resolve();
		expect(r.find('[data-testid="count"]').textContent).toBe('1');
		r.unmount();
	});

	it('inspect:false roots keep mounting effects and updates while paused', async () => {
		let setAppCount: ((n: number) => void) | undefined;
		let setOverlayCount: ((n: number) => void) | undefined;
		let overlayEffectRan = false;

		const app = mount(InspectCounter, {
			expose(set) {
				setAppCount = set;
			},
		});

		const overlayHost = document.createElement('div');
		document.body.appendChild(overlayHost);
		const overlayRoot = createRoot(overlayHost, { inspect: false });

		const resume = pauseUpdates();

		overlayRoot.render(InspectOverlayEffect, {
			onMountEffect() {
				overlayEffectRan = true;
			},
			expose(set) {
				setOverlayCount = set;
			},
		});

		// Post-paint passives + any scheduled overlay flush.
		await Promise.resolve();
		await Promise.resolve();
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
		});

		expect(overlayEffectRan, 'overlay useEffect must run while app is paused').toBe(true);
		expect(overlayHost.querySelector('[data-testid="overlay-effect"]')).not.toBeNull();

		setOverlayCount!(7);
		await Promise.resolve();
		await Promise.resolve();
		expect(
			overlayHost.querySelector('[data-testid="overlay-effect"]')!.getAttribute('data-count'),
		).toBe('7');

		setAppCount!(1);
		await Promise.resolve();
		expect(app.find('[data-testid="count"]').textContent).toBe('0');

		resume();
		await Promise.resolve();
		await Promise.resolve();
		expect(app.find('[data-testid="count"]').textContent).toBe('1');

		overlayRoot.unmount();
		overlayHost.remove();
		app.unmount();
	});

	it('createRoot with inspect:false skips inspect registration', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container, { inspect: false });
		root.render(InspectLabel, { text: 'hidden' });
		flushSync(() => {});
		const host = container.querySelector('[data-testid="label"]')!;
		expect(host).not.toBeNull();
		// The host is rendered but NOT findable via inspect — the root was never
		// registered, so getOwnerFromHostInstance cannot resolve it.
		expect(getOwnerFromHostInstance(host)).toBeNull();
		root.unmount();
		container.remove();
	});

	it('normal createRoot still registers for inspect', () => {
		const r = mount(InspectLabel, { text: 'visible' });
		expect(isInstrumentationActive()).toBe(true);
		const host = r.find('[data-testid="label"]');
		expect(getOwnerFromHostInstance(host)).not.toBeNull();
		r.unmount();
	});
});
