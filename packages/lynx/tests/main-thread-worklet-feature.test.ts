import { describe, expect, it, vi } from 'vitest';

import {
	createReplaceableLynxMainThreadWorkletRegistry,
	createUnavailableLynxMainThreadWorkletRegistry,
	provideLynxMainThreadWorkletFeature,
	subscribeLynxMainThreadWorkletFeature,
	type LynxMainThreadWorkletFeature,
} from '../src/core/main-thread-worklet-feature.js';
import type { LynxMainThreadWorkletRegistry } from '../src/core/worklets.js';

describe.sequential('optional Lynx main-thread worklet feature', () => {
	it('notifies a receiver that subscribes before a late feature chunk evaluates', () => {
		const observed: LynxMainThreadWorkletFeature[] = [];
		const feature = Object.freeze({}) as LynxMainThreadWorkletFeature;
		const unsubscribe = subscribeLynxMainThreadWorkletFeature((value) => observed.push(value));

		expect(observed).toEqual([]);
		provideLynxMainThreadWorkletFeature(feature);
		expect(observed).toEqual([feature]);

		unsubscribe();
	});

	it('upgrades existing host containers through one stable registry identity', () => {
		const unavailable = createUnavailableLynxMainThreadWorkletRegistry();
		const registry = createReplaceableLynxMainThreadWorkletRegistry(unavailable);
		const close = vi.fn();
		const replacement = { ...unavailable, close } as LynxMainThreadWorkletRegistry;

		expect(registry.isActive(1)).toBe(false);
		registry.replace(replacement);
		registry.close();

		expect(close).toHaveBeenCalledOnce();
	});
});
