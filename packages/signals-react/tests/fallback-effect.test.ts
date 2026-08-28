import type { Signal } from '@preact/signals-core';
import { signal } from '@preact/signals-core';
import { cleanup, render } from '@octanejs/testing-library';
import { createElement, type OctaneNode } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@preact/signals-core', async function mockSignalsCore(importOriginal) {
	const actual = await importOriginal<typeof import('@preact/signals-core')>();
	return {
		...actual,
		effect: function effectWithoutReceiver(
			callback: Parameters<typeof actual.effect>[0],
			options?: Parameters<typeof actual.effect>[1],
		) {
			return actual.effect(function runWithoutReceiver() {
				return Reflect.apply(callback, undefined, []);
			}, options);
		},
	};
});

import { useSignals, type EffectStore } from '../src/runtime/index.ts';

let capturedStore: EffectStore | undefined;

function SignalReader(props: { source: Signal<number> }): OctaneNode {
	capturedStore = useSignals();
	return createElement('p', null, String(props.source.value));
}

afterEach(function cleanupRender() {
	capturedStore = undefined;
	cleanup();
	vi.restoreAllMocks();
});

describe('fallback tracking effect', function fallbackTrackingEffect() {
	it('disposes the fallback effect when the store unsubscribes', function disposeFallback() {
		const view = render(createElement(SignalReader, { source: signal(0) }));
		const trackingEffect = capturedStore?.effect as EffectStore['effect'] & {
			dispose(): void;
		};
		const dispose = vi.spyOn(trackingEffect, 'dispose');

		view.unmount();

		expect(dispose).toHaveBeenCalledTimes(1);
	});
});
