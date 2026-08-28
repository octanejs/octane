import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, flushSync } from 'octane';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { FocusScope } from '../src/FocusScope';

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/radix — FocusScope', () => {
	it('creates delayed autofocus events in the scope owner document realm', () => {
		const result = mount(() =>
			createElement(FocusScope, {
				children: createElement('button', { type: 'button' }, 'inside'),
			}),
		);
		flushEffects();
		flushSync(() => {});
		flushEffects();
		vi.useFakeTimers();
		result.unmount();
		const ambientCustomEvent = globalThis.CustomEvent;
		class ForeignCustomEvent {
			defaultPrevented = false;
		}
		try {
			globalThis.CustomEvent = ForeignCustomEvent as unknown as typeof CustomEvent;
			expect(() => vi.runAllTimers()).not.toThrow();
		} finally {
			globalThis.CustomEvent = ambientCustomEvent;
		}
	});
});
