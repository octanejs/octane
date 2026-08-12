import { describe, it, expect } from 'vitest';
import { mount, createLog } from './_helpers';
import { Nested, SelfGuard } from './_fixtures/current-target.tsrx';
import { loadCompiledFixtureSource } from './_server-fixture';

const EVENT_PROBE_SOURCE = `
export function EventProbe(props) @{
	<section
		id="outer"
		onClickCapture={(event) => props.handle('capture', 'outer', event)}
		onClick={(event) => props.handle('bubble', 'outer', event)}
	>
		<button
			id="inner"
			onClickCapture={(event) => props.handle('capture', 'inner', event)}
			onClick={(event) => props.handle('bubble', 'inner', event)}
		>inner</button>
		<button
			id="nested"
			onClickCapture={(event) => props.handle('capture', 'nested', event)}
			onClick={(event) => props.handle('bubble', 'nested', event)}
		>nested</button>
	</section>
}
`;

type EventPhase = 'capture' | 'bubble';

function loadEventProbe() {
	return loadCompiledFixtureSource(EVENT_PROBE_SOURCE, {
		id: 'delegated-current-target-reentrancy.tsrx',
		mode: 'client',
		compileOptions: {
			hmr: false,
			dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod',
		},
	}).EventProbe;
}

// React parity: during DELEGATED dispatch, `event.currentTarget` is the element whose
// handler is firing — patched per-handler as the walk ascends (bubble) / descends
// (capture), and restored to native semantics after the dispatch. Surfaced by the
// @octanejs/radix RovingFocusGroup port, whose keyboard nav guards on
// `event.target === event.currentTarget` (ubiquitous in ported React code).

describe('delegated event currentTarget', () => {
	it('bubble handlers see their own element; capture runs root→target with per-element currentTarget', () => {
		const log = createLog();
		const r = mount(Nested, { log: log.push });
		r.click('#inner');
		expect(log.drain()).toEqual([
			// Capture: root → target.
			'capture-outer:outer',
			'capture-inner:inner',
			// Bubble: target → root; each handler's currentTarget is ITS element.
			'inner:inner:target=inner',
			'outer:outer:target=inner',
		]);
		r.unmount();
	});

	it('supports the `target === currentTarget` self-origin guard', () => {
		const log = createLog();
		const r = mount(SelfGuard, { log: log.push });
		r.click('#kid');
		expect(log.drain()).toEqual(['child']);
		r.click('#wrap');
		expect(log.drain()).toEqual(['self']);
		r.unmount();
	});

	it('restores native currentTarget semantics after the dispatch', () => {
		const log = createLog();
		const r = mount(SelfGuard, { log: log.push });
		const kid = r.find('#kid');
		const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
		kid.dispatchEvent(ev);
		// After dispatch completes, the shadowing own-property is removed — the native
		// getter reports null (dispatch is over), not a stale element.
		expect(ev.currentTarget).toBe(null);
		expect(Object.prototype.hasOwnProperty.call(ev, 'currentTarget')).toBe(false);
		r.unmount();
	});

	it('preserves native event identity and its public accessor throughout both phases', () => {
		let original: MouseEvent;
		const observations: Array<{
			phase: EventPhase;
			owner: string;
			target: string;
			currentTarget: string;
			sameEvent: boolean;
			accessor: boolean;
			configurable: boolean;
			enumerable: boolean;
		}> = [];
		const mounted = mount(loadEventProbe(), {
			handle(phase: EventPhase, owner: string, event: MouseEvent) {
				const descriptor = Object.getOwnPropertyDescriptor(event, 'currentTarget');
				observations.push({
					phase,
					owner,
					target: (event.target as Element).id,
					currentTarget: (event.currentTarget as Element).id,
					sameEvent: event === original,
					accessor: typeof descriptor?.get === 'function' && descriptor.set === undefined,
					configurable: descriptor?.configurable === true,
					enumerable: descriptor?.enumerable === true,
				});
			},
		});

		original = new MouseEvent('click', { bubbles: true, cancelable: true });
		mounted.find('#inner').dispatchEvent(original);

		expect(observations).toEqual(
			[
				['capture', 'outer'],
				['capture', 'inner'],
				['bubble', 'inner'],
				['bubble', 'outer'],
			].map(([phase, owner]) => ({
				phase,
				owner,
				target: 'inner',
				currentTarget: owner,
				sameEvent: true,
				accessor: true,
				configurable: true,
				enumerable: false,
			})),
		);
		expect(original.currentTarget).toBe(null);
		expect(Object.prototype.hasOwnProperty.call(original, 'currentTarget')).toBe(false);
		mounted.unmount();
	});

	it.each(['capture', 'bubble'] as const)(
		'preserves both active native events during nested %s dispatch',
		(triggerPhase) => {
			let outerEvent: MouseEvent;
			let nestedEvent: MouseEvent | undefined;
			let activeOuterTarget: EventTarget | null = null;
			const observed: string[] = [];
			const mounted = mount(loadEventProbe(), {
				handle(phase: EventPhase, owner: string, event: MouseEvent) {
					const target = (event.target as Element).id;
					observed.push(`${phase}:${owner}:${target}`);
					expect(event.currentTarget).toBe(mounted.find(`#${owner}`));

					if (event === nestedEvent) {
						expect(outerEvent.currentTarget).toBe(activeOuterTarget);
						if (triggerPhase === 'capture' && phase === 'capture' && owner === 'nested') {
							event.stopPropagation();
						}
						return;
					}

					const triggerOwner = triggerPhase === 'capture' ? 'outer' : 'inner';
					if (phase !== triggerPhase || owner !== triggerOwner) return;

					activeOuterTarget = event.currentTarget;
					nestedEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
					mounted.find('#nested').dispatchEvent(nestedEvent);
					expect(event.currentTarget).toBe(activeOuterTarget);
					expect(nestedEvent.currentTarget).toBe(null);
					expect(Object.prototype.hasOwnProperty.call(nestedEvent, 'currentTarget')).toBe(false);
				},
			});

			outerEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
			mounted.find('#inner').dispatchEvent(outerEvent);

			if (triggerPhase === 'capture') {
				expect(observed).toEqual([
					'capture:outer:inner',
					'capture:outer:nested',
					'capture:nested:nested',
					'capture:inner:inner',
					'bubble:inner:inner',
					'bubble:outer:inner',
				]);
			} else {
				expect(observed).toEqual([
					'capture:outer:inner',
					'capture:inner:inner',
					'bubble:inner:inner',
					'capture:outer:nested',
					'capture:nested:nested',
					'bubble:nested:nested',
					'bubble:outer:nested',
					'bubble:outer:inner',
				]);
			}
			expect(outerEvent.currentTarget).toBe(null);
			expect(Object.prototype.hasOwnProperty.call(outerEvent, 'currentTarget')).toBe(false);
			mounted.unmount();
		},
	);

	it.each(['replace', 'delete'] as const)(
		'restores each handler target after a consumer chooses to %s its own accessor',
		(change) => {
			const observed: string[] = [];
			const mounted = mount(loadEventProbe(), {
				handle(phase: EventPhase, owner: string, event: MouseEvent) {
					observed.push(`${phase}:${(event.currentTarget as Element).id}`);
					if (
						(phase !== 'capture' || owner !== 'outer') &&
						(phase !== 'bubble' || owner !== 'inner')
					) {
						return;
					}

					if (change === 'delete') {
						delete (event as { currentTarget?: EventTarget | null }).currentTarget;
					} else {
						Object.defineProperty(event, 'currentTarget', {
							configurable: true,
							get: () => document.body,
						});
					}
				},
			});

			const event = new MouseEvent('click', { bubbles: true, cancelable: true });
			mounted.find('#inner').dispatchEvent(event);
			expect(observed).toEqual(['capture:outer', 'capture:inner', 'bubble:inner', 'bubble:outer']);
			expect(event.currentTarget).toBe(null);
			expect(Object.prototype.hasOwnProperty.call(event, 'currentTarget')).toBe(false);
			mounted.unmount();
		},
	);
});
