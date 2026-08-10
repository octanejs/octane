import { describe, expect, it } from 'vitest';
import {
	decodeLynxNativeEventToken,
	encodeLynxNativeEventToken,
	parseLynxMainThreadEventProp,
	parseLynxNativeEventProp,
	snapshotLynxNativeEventPayload,
} from '../src/core/native-events.js';

describe('Lynx native event boundary', () => {
	it('maps every background event prefix to its exact Element PAPI type', () => {
		expect(parseLynxNativeEventProp('bindtap')).toEqual({
			prefix: 'bind',
			type: 'bindEvent',
			name: 'tap',
		});
		expect(parseLynxNativeEventProp('catchTap')).toEqual({
			prefix: 'catch',
			type: 'catchEvent',
			name: 'Tap',
		});
		expect(parseLynxNativeEventProp('capture-bindtouchstart')).toEqual({
			prefix: 'capture-bind',
			type: 'capture-bind',
			name: 'touchstart',
		});
		expect(parseLynxNativeEventProp('capture-catchtouchend')).toEqual({
			prefix: 'capture-catch',
			type: 'capture-catch',
			name: 'touchend',
		});
		expect(parseLynxNativeEventProp('global-bindscroll')).toEqual({
			prefix: 'global-bind',
			type: 'global-bindEvent',
			name: 'scroll',
		});
	});

	it('maps direct main-thread event props without classifying them as background callbacks', () => {
		expect(parseLynxMainThreadEventProp('main-thread:capture-catchtap')).toEqual({
			prop: 'main-thread:capture-catchtap',
			prefix: 'capture-catch',
			type: 'capture-catch',
			name: 'tap',
		});
		expect(parseLynxMainThreadEventProp('bindtap')).toBeNull();
		expect(parseLynxMainThreadEventProp('main-thread:gesture')).toBeNull();
	});

	it('does not classify malformed, main-thread, or ordinary props as background events', () => {
		for (const name of [
			'bind',
			'bindtap2',
			'bindtap-now',
			'bind:tap',
			'main-thread:bindtap',
			'onTap',
			'className',
		]) {
			expect(parseLynxNativeEventProp(name)).toBeNull();
		}
	});

	it('keeps native and main-thread event classifications correct across many distinct event names', () => {
		for (let index = 0; index < 300; index++) {
			const suffix =
				String.fromCharCode(97 + (index % 26)) + String.fromCharCode(97 + Math.floor(index / 26));
			expect(parseLynxNativeEventProp(`bind${suffix}`)).toEqual({
				prefix: 'bind',
				type: 'bindEvent',
				name: suffix,
			});
			expect(parseLynxMainThreadEventProp(`main-thread:catch${suffix}`)).toEqual({
				prop: `main-thread:catch${suffix}`,
				prefix: 'catch',
				type: 'catchEvent',
				name: suffix,
			});
		}
		expect(parseLynxNativeEventProp('bindtap')).toEqual({
			prefix: 'bind',
			type: 'bindEvent',
			name: 'tap',
		});
		expect(parseLynxNativeEventProp('bindtap2')).toBeNull();
		expect(parseLynxMainThreadEventProp('main-thread:gesture')).toBeNull();
	});

	it('round-trips one versionless root, host generation, and listener identity', () => {
		const identity = {
			root: 7,
			id: 11,
			generation: 3,
			listener: 29,
			priority: 'discrete',
		} as const;
		const token = encodeLynxNativeEventToken(identity);

		expect(decodeLynxNativeEventToken(token)).toEqual(identity);
		expect(decodeLynxNativeEventToken(token)).not.toHaveProperty('version');
		expect(encodeLynxNativeEventToken(identity)).toBe(token);
		expect(encodeLynxNativeEventToken({ ...identity, generation: 4 })).not.toBe(token);
	});

	it('rejects non-canonical, unsafe, and version-bearing listener identities', () => {
		for (const identity of [
			{ root: 0, id: 1, generation: 1, listener: 1, priority: 'discrete' },
			{ root: 1, id: -1, generation: 1, listener: 1, priority: 'discrete' },
			{
				root: 1,
				id: 1,
				generation: Number.MAX_SAFE_INTEGER + 1,
				listener: 1,
				priority: 'discrete',
			},
			{ root: 1, id: 1, generation: 1, listener: 1, priority: 'discrete', version: 4 },
			{ root: 1, id: 1, generation: 1, listener: 1 },
			{ root: 1, id: 1, generation: 1, listener: 1, priority: 'urgent' },
		]) {
			expect(() => encodeLynxNativeEventToken(identity as never)).toThrow(/native event token/);
		}
		for (const token of [
			null,
			'',
			'octane-lynx:event:01:1:1:1:discrete',
			'octane-lynx:event:1:1:1:0:discrete',
			'octane-lynx:event:1:1:1:1:2',
			'octane-lynx:event:1:1:1:1',
			'octane-lynx:event:1:1:1:1:urgent',
			'octane-lynx:event:1:1:1:9007199254740992:discrete',
		]) {
			expect(() => decodeLynxNativeEventToken(token)).toThrow(/native event token/);
		}
	});

	it('rejects accessor-backed token identities without executing untrusted getters', () => {
		let reads = 0;
		const identity = {
			root: 1,
			get id() {
				reads += 1;
				return 2;
			},
			generation: 1,
			listener: 3,
			priority: 'default' as const,
		};
		expect(() => encodeLynxNativeEventToken(identity)).toThrow(/own data property/);
		expect(reads).toBe(0);
	});

	it('snapshots event data without retaining live targets, prototypes, or methods', () => {
		class LiveTarget {
			readonly extra = 'must not cross';

			constructor(
				readonly id: string,
				readonly uid: number,
				readonly dataset: Record<string, unknown>,
			) {}

			measure(): void {}
		}

		class LiveTapEvent {
			readonly target = new LiveTarget('source', 10, { item: 'a' });
			readonly currentTarget = new LiveTarget('listener', 11, { role: 'button' });
			readonly detail = {
				x: 4,
				y: 9,
				nested: Object.assign(Object.create({ inherited: true }), {
					keep: 'value',
					drop: () => 'live',
				}),
			};
			readonly touches = [{ identifier: 1, pageX: 20, pageY: 30 }];
			readonly preventDefault = () => {};
			readonly stopPropagation = () => {};
			readonly stopImmediatePropagation = () => {};
			readonly callback = () => {};

			get type(): string {
				return 'tap';
			}

			get timestamp(): number {
				return 123;
			}
		}

		const event = new LiveTapEvent();
		const snapshot = snapshotLynxNativeEventPayload(event);

		expect(snapshot).toEqual({
			type: 'tap',
			timestamp: 123,
			detail: { x: 4, y: 9, nested: { keep: 'value' } },
			touches: [{ identifier: 1, pageX: 20, pageY: 30 }],
			target: { id: 'source', uid: 10, dataset: { item: 'a' } },
			currentTarget: { id: 'listener', uid: 11, dataset: { role: 'button' } },
		});
		expect(Object.getPrototypeOf(snapshot)).toBeNull();
		expect(Object.getPrototypeOf(snapshot.detail as object)).toBeNull();
		expect(Object.getPrototypeOf((snapshot.detail as { nested: object }).nested)).toBeNull();
		expect('preventDefault' in snapshot).toBe(false);
		expect('stopPropagation' in snapshot).toBe(false);
		expect('stopImmediatePropagation' in snapshot).toBe(false);
		expect('callback' in snapshot).toBe(false);

		event.target.dataset.item = 'mutated';
		event.detail.x = 100;
		expect(snapshot.target).toEqual({ id: 'source', uid: 10, dataset: { item: 'a' } });
		expect(snapshot.detail).toMatchObject({ x: 4 });
	});

	it('preserves image, input, scroll, and custom enumerable payload data', () => {
		const snapshot = snapshotLynxNativeEventPayload({
			type: 'input',
			timeStamp: 456,
			detail: {
				value: 'Octane',
				selectionStart: 1,
				selectionEnd: 6,
				scrollTop: 12,
				deltaY: 3,
			},
			width: 320,
			height: 180,
			src: 'asset://hero.png',
			custom: { state: 'ready' },
		});

		expect(snapshot).toEqual({
			type: 'input',
			timestamp: 456,
			detail: {
				value: 'Octane',
				selectionStart: 1,
				selectionEnd: 6,
				scrollTop: 12,
				deltaY: 3,
			},
			width: 320,
			height: 180,
			src: 'asset://hero.png',
			custom: { state: 'ready' },
		});
	});

	it('normalizes testing-environment targets from $$uiSign without leaking the host object', () => {
		const currentTarget = {
			id: 'listener',
			$$uiSign: 42,
			dataset: { role: 'button' },
			measure: () => {},
		};

		const snapshot = snapshotLynxNativeEventPayload({ type: 'tap', currentTarget });

		expect(snapshot.currentTarget).toEqual({
			id: 'listener',
			uid: 42,
			dataset: { role: 'button' },
		});
		expect(snapshot.currentTarget).not.toBe(currentTarget);
		expect(Object.getPrototypeOf(snapshot.currentTarget as object)).toBeNull();
	});

	it('snapshots an element with no author id to a null target id, from either host convention', () => {
		// @lynx-js/web-core delivers `id: null` for an element with no id attribute;
		// a plain host object simply omits the field (`id: undefined`). Both mean
		// "no id" and must snapshot to null, not throw and not coerce to '' — the
		// null keeps "no author id" distinct from an author-assigned empty id.
		const fromWebCore = snapshotLynxNativeEventPayload({
			type: 'tap',
			target: { id: null, uid: 7, dataset: { role: 'row' } },
			currentTarget: { id: null, $$uiSign: 8, dataset: {} },
		});
		expect(fromWebCore.target).toEqual({ id: null, uid: 7, dataset: { role: 'row' } });
		expect(fromWebCore.currentTarget).toEqual({ id: null, uid: 8, dataset: {} });

		const fromOmittedField = snapshotLynxNativeEventPayload({
			type: 'tap',
			target: { uid: 9, dataset: { role: 'cell' } },
		});
		expect(fromOmittedField.target).toEqual({ id: null, uid: 9, dataset: { role: 'cell' } });
	});

	it('strips non-data array entries without shifting native payload indexes', () => {
		expect(
			snapshotLynxNativeEventPayload({
				type: 'custom',
				detail: [1, () => {}, undefined, Symbol('live')],
			}),
		).toEqual({ type: 'custom', detail: [1, null, null, null] });
	});

	it('rejects cycles, non-finite numbers, and bigints', () => {
		const cyclic: Record<string, unknown> = { type: 'tap' };
		cyclic.self = cyclic;

		for (const payload of [
			cyclic,
			{ type: 'scroll', detail: { deltaY: Number.NaN } },
			{ type: 'load', width: Number.POSITIVE_INFINITY },
			{ type: 'custom', detail: 1n },
		]) {
			expect(() => snapshotLynxNativeEventPayload(payload)).toThrow(/native event payload/);
		}
	});
});
