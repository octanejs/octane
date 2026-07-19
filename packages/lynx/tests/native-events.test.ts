import { describe, expect, it } from 'vitest';
import {
	decodeLynxNativeEventToken,
	encodeLynxNativeEventToken,
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

	it('round-trips one versionless root, host generation, and listener identity', () => {
		const identity = { root: 7, id: 11, generation: 3, listener: 29 };
		const token = encodeLynxNativeEventToken(identity);

		expect(decodeLynxNativeEventToken(token)).toEqual(identity);
		expect(decodeLynxNativeEventToken(token)).not.toHaveProperty('version');
		expect(encodeLynxNativeEventToken(identity)).toBe(token);
		expect(encodeLynxNativeEventToken({ ...identity, generation: 4 })).not.toBe(token);
	});

	it('rejects non-canonical, unsafe, and version-bearing listener identities', () => {
		for (const identity of [
			{ root: 0, id: 1, generation: 1, listener: 1 },
			{ root: 1, id: -1, generation: 1, listener: 1 },
			{ root: 1, id: 1, generation: Number.MAX_SAFE_INTEGER + 1, listener: 1 },
			{ root: 1, id: 1, generation: 1, listener: 1, version: 4 },
		]) {
			expect(() => encodeLynxNativeEventToken(identity as never)).toThrow(/native event token/);
		}
		for (const token of [
			null,
			'',
			'octane-lynx:event:01:1:1:1',
			'octane-lynx:event:1:1:1:0',
			'octane-lynx:event:1:1:1:1:2',
			'octane-lynx:event:1:1:1:9007199254740992',
		]) {
			expect(() => decodeLynxNativeEventToken(token)).toThrow(/native event token/);
		}
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
