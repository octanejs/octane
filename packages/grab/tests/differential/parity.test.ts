/**
 * Differential parity between the published react-grab@0.2.0 dist and the
 * Octane port: same API contract, same pure-function outputs, same lifecycle
 * observables in the same jsdom environment.
 *
 * __REACT_GRAB_DISABLED__ suppresses both packages' import-time auto-init so
 * each side can be driven through init() independently.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

(globalThis as { __REACT_GRAB_DISABLED__?: boolean }).__REACT_GRAB_DISABLED__ = true;

type UpstreamModule = typeof import('react-grab');
type OctaneModule = typeof import('@octanejs/grab');

let upstream: UpstreamModule;
let octane: OctaneModule;

beforeAll(async () => {
	upstream = await import('react-grab');
	octane = await import('@octanejs/grab');
});

afterEach(() => {
	document.body.innerHTML = '';
});

describe('disabled init parity', () => {
	it('init({ enabled: false }) returns an inert API on both', () => {
		for (const mod of [upstream, octane]) {
			const api = mod.init({ enabled: false });
			expect(api.isActive()).toBe(false);
			expect(api.isEnabled()).toBe(false);
			expect(api.getToolbarState()).toBeNull();
			expect(() => api.activate()).not.toThrow();
			expect(() => api.dispose()).not.toThrow();
		}
	});
});

describe('lifecycle parity', () => {
	const runLifecycle = (mod: UpstreamModule | OctaneModule) => {
		const api = mod.init();
		const observed = {
			enabled: api.isEnabled(),
			activeInitially: api.isActive(),
			hostMounted: document.querySelector('[data-react-grab]') !== null,
		};
		api.activate();
		const activeAfterActivate = api.isActive();
		api.deactivate();
		const activeAfterDeactivate = api.isActive();
		api.dispose();
		const hostAfterDispose = document.querySelector('[data-react-grab]') !== null;
		return {
			...observed,
			activeAfterActivate,
			activeAfterDeactivate,
			hostAfterDispose,
		};
	};

	it('observes the same mount/activate/deactivate/dispose contract', () => {
		const octaneObserved = runLifecycle(octane);
		const upstreamObserved = runLifecycle(upstream);
		expect(octaneObserved).toEqual(upstreamObserved);
		// Upstream dispose unmounts the renderer but leaves the host element in
		// the DOM (reattach-on-recheck semantics) — hostAfterDispose stays true.
		expect(octaneObserved).toEqual({
			enabled: true,
			activeInitially: false,
			hostMounted: true,
			activeAfterActivate: true,
			activeAfterDeactivate: false,
			hostAfterDispose: true,
		});
	});
});

describe('pure surface parity', () => {
	it('DEFAULT_THEME is identical', () => {
		expect(octane.DEFAULT_THEME).toEqual(upstream.DEFAULT_THEME);
	});

	it('isInstrumentationActive agrees without a devtools hook', () => {
		expect(octane.isInstrumentationActive()).toBe(upstream.isInstrumentationActive());
	});

	it('error classes produce identical messages and names', () => {
		const cause = new Error('boom');
		const pairs: Array<[Error, Error]> = [
			[new octane.FreezeError(cause), new upstream.FreezeError(cause)],
			[
				new octane.OpenFileError('/src/App.tsx', 12, cause),
				new upstream.OpenFileError('/src/App.tsx', 12, cause),
			],
			[
				new octane.PluginSetupError('my-plugin', cause),
				new upstream.PluginSetupError('my-plugin', cause),
			],
			[new octane.ReactGrabError('plain'), new upstream.ReactGrabError('plain')],
		];
		for (const [ours, theirs] of pairs) {
			expect(ours.name).toBe(theirs.name);
			expect(ours.message).toBe(theirs.message);
			expect(ours instanceof Error).toBe(true);
		}
	});
});

describe('element info parity', () => {
	it('formatElementInfo produces identical output for the same DOM', async () => {
		const fixture = document.createElement('div');
		fixture.id = 'fixture';
		fixture.className = 'card highlighted';
		fixture.textContent = 'Hello';
		document.body.appendChild(fixture);

		const [ours, theirs] = await Promise.all([
			octane.formatElementInfo(fixture),
			upstream.formatElementInfo(fixture),
		]);
		expect(ours).toEqual(theirs);
	});
});
