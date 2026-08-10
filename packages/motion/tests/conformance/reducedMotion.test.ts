import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';

import { flushEffects, mount } from '../_helpers';
import { ReducedMotionPreference } from '../_fixtures/reduced-motion.tsrx';

function installMatchMedia(initialMatches: boolean) {
	let matches = initialMatches;
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	const query = {
		get matches() {
			return matches;
		},
		media: '(prefers-reduced-motion: reduce)',
		onchange: null,
		addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.add(listener);
		}),
		removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
			listeners.delete(listener);
		}),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	} as unknown as MediaQueryList;

	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		value: vi.fn(() => query),
	});

	return {
		query,
		set(next: boolean) {
			matches = next;
			const event = { matches: next, media: query.media } as MediaQueryListEvent;
			for (const listener of listeners) listener(event);
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	delete (window as Partial<Window>).matchMedia;
});

describe('useReducedMotion', () => {
	it('renders the current preference and follows operating-system changes', async () => {
		const media = installMatchMedia(false);
		const result = mount(ReducedMotionPreference);
		flushEffects();

		const output = result.find('output');
		expect(output.textContent).toBe('no-preference');
		expect(output.getAttribute('data-reduced-motion')).toBe('false');

		flushSync(() => media.set(true));
		expect(output.textContent).toBe('reduce');
		expect(output.getAttribute('data-reduced-motion')).toBe('true');

		flushSync(() => media.set(false));
		expect(output.textContent).toBe('no-preference');
		expect(output.getAttribute('data-reduced-motion')).toBe('false');

		result.unmount();
		flushEffects();
		expect(media.query.removeEventListener).toHaveBeenCalledTimes(1);
	});
});
