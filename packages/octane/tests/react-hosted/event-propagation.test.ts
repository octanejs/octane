/**
 * Phase 0 spike — §8: native event propagation through a React-owned host with
 * unmanaged Octane descendants. No adapter, no synthetic mirroring: React's
 * root-container listeners and Octane's island-host delegated listeners see
 * the same native event, so the order must be
 *
 *   React capture → Octane host capture → target → Octane host bubble → React bubble
 *
 * and a plain native `stopPropagation()` from any position must cut off every
 * later stage — including React's bubble-phase synthetic dispatch.
 *
 * jsdom dispatches capture/bubble faithfully; browser E2E re-verifies focus/
 * enter-leave families and real user activation (§13 — deferred, see plan).
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { h, octaneChild, mountReactHost, reactAct, OctaneCompatSpike } from './_react-host.js';
import { CounterEventIsland, EventIsland } from './_fixtures/event-island.tsrx';
import { GreetingIsland } from './_fixtures/islands.tsrx';

interface EventApp {
	log: string[];
	mounted: Awaited<ReturnType<typeof mountReactHost>>;
	target: HTMLElement;
}

async function mountEventApp(options?: {
	stopAt?: string;
	reactCaptureStops?: boolean;
	nativeTargetStops?: boolean;
}): Promise<EventApp> {
	const log: string[] = [];
	const mounted = await mountReactHost(
		h(
			'section',
			{
				onClickCapture: (event: React.MouseEvent) => {
					log.push('react-capture');
					if (options?.reactCaptureStops) event.stopPropagation();
				},
				onClick: () => log.push('react-bubble'),
			},
			h(
				OctaneCompatSpike,
				null,
				octaneChild(EventIsland, {
					log: (entry: string) => log.push(entry),
					stopAt: options?.stopAt,
				}),
			),
		),
	);
	const target = mounted.host().querySelector('.octane-target') as HTMLElement;
	// A native listener directly on the Octane-created target pins the real
	// target phase between the host capture and host bubble dispatches.
	target.addEventListener('click', (event) => {
		log.push('native-target');
		if (options?.nativeTargetStops) event.stopPropagation();
	});
	return { log, mounted, target };
}

describe('react-hosted island — native event propagation (§8)', () => {
	it('interleaves React and Octane listeners in native capture/target/bubble order', async () => {
		const app = await mountEventApp();
		await reactAct(async () => app.target.click());
		expect(app.log).toEqual([
			'react-capture',
			'octane-capture',
			'native-target',
			'octane-bubble-target',
			'octane-bubble-outer',
			'react-bubble',
		]);
		await app.mounted.unmount();
	});

	it('stopPropagation from the React capture phase suppresses all Octane dispatch', async () => {
		const app = await mountEventApp({ reactCaptureStops: true });
		await reactAct(async () => app.target.click());
		expect(app.log).toEqual(['react-capture']);
		await app.mounted.unmount();
	});

	it('stopPropagation from the Octane capture phase suppresses target, bubble, and React bubble', async () => {
		const app = await mountEventApp({ stopAt: 'octane-capture' });
		await reactAct(async () => app.target.click());
		expect(app.log).toEqual(['react-capture', 'octane-capture']);
		await app.mounted.unmount();
	});

	it('stopPropagation from a native target listener suppresses Octane bubble and React bubble', async () => {
		const app = await mountEventApp({ nativeTargetStops: true });
		await reactAct(async () => app.target.click());
		expect(app.log).toEqual(['react-capture', 'octane-capture', 'native-target']);
		await app.mounted.unmount();
	});

	it('stopPropagation from an Octane bubble handler suppresses the later React bubble', async () => {
		const app = await mountEventApp({ stopAt: 'octane-bubble-target' });
		await reactAct(async () => app.target.click());
		expect(app.log).toEqual([
			'react-capture',
			'octane-capture',
			'native-target',
			'octane-bubble-target',
		]);
		await app.mounted.unmount();
	});

	it('reports the real Octane target and default-prevented state to a React ancestor', async () => {
		let seenTarget: EventTarget | null = null;
		let seenCurrentTarget: EventTarget | null = null;
		let seenDefaultPrevented: boolean | null = null;
		const mounted = await mountReactHost(
			h(
				'section',
				{
					onClick: (event: React.MouseEvent) => {
						seenTarget = event.target;
						seenCurrentTarget = event.currentTarget;
						seenDefaultPrevented = event.defaultPrevented;
					},
				},
				h(OctaneCompatSpike, null, octaneChild(EventIsland, { log: () => {} })),
			),
		);
		const target = mounted.host().querySelector('.octane-target') as HTMLElement;
		target.addEventListener('click', (event) => event.preventDefault());
		await reactAct(async () =>
			target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
		);
		expect(seenTarget).toBe(target);
		expect((seenCurrentTarget as Element | null)?.tagName).toBe('SECTION');
		expect(seenDefaultPrevented).toBe(true);
		await mounted.unmount();
	});

	it('commits Octane-local discrete updates before the outer React bubble handler observes the DOM', async () => {
		// Octane flushes discrete events synchronously inside its own delegated
		// dispatch at the island host — which runs BEFORE the React root bubble
		// listener — so a React ancestor observes the post-update island DOM.
		const observed: string[] = [];
		const mounted = await mountReactHost(
			h(
				'section',
				{
					onClick: () => {
						observed.push(
							document.querySelector('[data-octane-compat] .count')?.textContent ?? 'missing',
						);
					},
				},
				h(OctaneCompatSpike, null, octaneChild(GreetingIsland, { name: 'discrete' })),
			),
		);
		const button = mounted.host().querySelector('.count') as HTMLElement;
		expect(button.textContent).toBe('count:0');
		await reactAct(async () => button.click());
		expect(observed).toEqual(['count:1']);
		await mounted.unmount();
	});

	it('batches a React state round-trip from an Octane handler exactly like a nested React tree', async () => {
		// When the island handler calls a REACT state setter, React batches the
		// discrete update: its own bubble listener for the same native event still
		// observes the pre-update DOM (identical to a child→parent setState in a
		// pure React tree), and the round-tripped props commit right after the
		// event. Phase 0 evidence: there is no flush-before-React-bubble, and no
		// ordering divergence to paper over.
		const observed: string[] = [];
		let setCount!: (updater: (count: number) => number) => void;
		function App() {
			const [count, set] = React.useState(0);
			setCount = set;
			return h(
				'section',
				{
					onClick: () => {
						observed.push(
							document.querySelector('[data-octane-compat] .evt-count')?.textContent ?? 'missing',
						);
					},
				},
				h(
					OctaneCompatSpike,
					null,
					octaneChild(CounterEventIsland, {
						count,
						onIncrement: () => setCount((current) => current + 1),
					}),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		const button = mounted.host().querySelector('.evt-count') as HTMLElement;
		expect(button.textContent).toBe('count:0');

		await reactAct(async () => button.click());
		expect(observed).toEqual(['count:0']);
		expect(mounted.host().querySelector('.evt-count')?.textContent).toBe('count:1');
		await mounted.unmount();
	});
});
