import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@octanejs/testing-library';
import autoAnimate, { getTransitionSizes } from '@octanejs/auto-animate';
import { useAutoAnimate } from '@octanejs/auto-animate/react';

afterEach(function resetDom() {
	cleanup();
	document.body.replaceChildren();
});

describe('vanilla core', function vanillaCore() {
	it('re-exports autoAnimate and getTransitionSizes from the pinned core', function reexports() {
		expect(typeof autoAnimate).toBe('function');
		expect(typeof getTransitionSizes).toBe('function');
	});

	it('returns a controller for an HTMLElement', function controller() {
		const el = document.createElement('ul');
		document.body.appendChild(el);
		// OCTANE DIVERGENCE: jsdom matchMedia often reports reduced motion, which
		// leaves the controller disabled until enable() or disrespectUserMotionPreference.
		const control = autoAnimate(el, { disrespectUserMotionPreference: true });
		expect(control.parent).toBe(el);
		control.enable();
		expect(control.isEnabled()).toBe(true);
		control.disable();
		expect(control.isEnabled()).toBe(false);
		control.enable();
		expect(control.isEnabled()).toBe(true);
		control.destroy?.();
	});
});

describe('useAutoAnimate', function useAutoAnimateSuite() {
	// Per packages/auto-animate/upstream/src/react/index.ts
	it('returns a ref callback and setEnabled', function returnsTuple() {
		const { result } = renderHook(function useHook() {
			return useAutoAnimate();
		});
		expect(Array.isArray(result.current)).toBe(true);
		expect(typeof result.current[0]).toBe('function');
		expect(typeof result.current[1]).toBe('function');
	});

	it('attaches a controller when the ref receives an HTMLElement', function attaches() {
		const { result } = renderHook(function useHook() {
			return useAutoAnimate();
		});
		const parent = document.createElement('ul');
		document.body.appendChild(parent);
		result.current[0](parent);
		const child = document.createElement('li');
		parent.appendChild(child);
		result.current[1](false);
		result.current[1](true);
		result.current[0](null);
	});
});
