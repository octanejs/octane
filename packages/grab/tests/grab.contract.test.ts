/**
 * Package-authored Octane conformance for `@octanejs/grab`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	__inspectRegisterRoot,
	__inspectUnregisterRoot,
	getOwnerFromHostInstance,
	isInspectUpdatesPaused,
	pauseUpdates,
} from 'octane/inspect';
import { isElementGrabbable, freeze, unfreeze, isFreezeActive } from '../src/primitives.js';
import {
	getFiberFromHostInstance,
	isInstrumentationActive,
	__setInstrumentationActiveForTests,
	normalizeFileName,
	isSourceFile,
	parseStack,
} from '../src/octane-adapter.js';
import { getGlobalApi, setGlobalApi, clearGlobalApi } from '../src/global-api.js';
import type { ReactGrabAPI } from '../src/types.js';

describe('@octanejs/grab package contract', () => {
	beforeEach(() => {
		(window as Window & { __OCTANE_GRAB_DISABLED__?: boolean }).__OCTANE_GRAB_DISABLED__ = true;
		(window as Window & { __REACT_GRAB_DISABLED__?: boolean }).__REACT_GRAB_DISABLED__ = true;
		__setInstrumentationActiveForTests(false);
	});

	afterEach(() => {
		try {
			unfreeze();
		} catch {
			/* ignore */
		}
		__setInstrumentationActiveForTests(false);
	});

	// @parity-case grab:contract-is-element-grabbable
	it('isElementGrabbable accepts ordinary elements and rejects html/body', () => {
		const div = document.createElement('div');
		document.body.appendChild(div);
		expect(isElementGrabbable(div)).toBe(true);
		expect(isElementGrabbable(document.documentElement)).toBe(false);
		expect(isElementGrabbable(document.body)).toBe(false);
		div.remove();
	});

	// @parity-case grab:contract-freeze-updates
	it('freezeUpdates pauses Octane scheduling via the adapter', async () => {
		const { freezeUpdatesOrThrow } = await import('../src/utils/freeze-updates.js');
		expect(isInspectUpdatesPaused()).toBe(false);
		const resume = freezeUpdatesOrThrow();
		expect(isInspectUpdatesPaused()).toBe(true);
		resume();
		expect(isInspectUpdatesPaused()).toBe(false);
		// Direct pauseUpdates is the same primitive the adapter wraps.
		const resume2 = pauseUpdates();
		expect(isInspectUpdatesPaused()).toBe(true);
		resume2();
		expect(isInspectUpdatesPaused()).toBe(false);
	});

	// @parity-case grab:contract-freeze-lifecycle
	it('isFreezeActive tracks full freeze lifecycle when animations are stubbed', () => {
		const div = document.createElement('div');
		document.body.appendChild(div);
		const empty = () => [] as Animation[];
		(Document.prototype as unknown as { getAnimations: () => Animation[] }).getAnimations = empty;
		(Element.prototype as unknown as { getAnimations: () => Animation[] }).getAnimations = empty;
		expect(isFreezeActive()).toBe(false);
		freeze([div]);
		expect(isFreezeActive()).toBe(true);
		unfreeze();
		expect(isFreezeActive()).toBe(false);
		div.remove();
	});

	// @parity-case grab:contract-host-owner-mapping
	it('adapter maps registered host nodes to owners and reports instrumentation', () => {
		const host = document.createElement('section');
		document.body.appendChild(host);
		const start = document.createComment('octane-start');
		const end = document.createComment('octane-end');
		host.appendChild(start);
		const target = document.createElement('button');
		host.appendChild(target);
		host.appendChild(end);

		const block = {
			body: function GrabProbe() {
				return null;
			},
			parentBlock: null,
			startMarker: start,
			endMarker: end,
			disposed: false,
			children: null,
		};
		(block.body as { displayName?: string }).displayName = 'GrabProbe';
		__inspectRegisterRoot(block as never);
		__setInstrumentationActiveForTests(true);

		expect(isInstrumentationActive()).toBe(true);
		const owner = getOwnerFromHostInstance(target);
		expect(owner?.displayName).toBe('GrabProbe');
		const fiber = getFiberFromHostInstance(target);
		expect(fiber).not.toBeNull();
		expect(fiber?.type).toBe('GrabProbe');

		__inspectUnregisterRoot(block as never);
		host.remove();
	});

	// @parity-case grab:contract-source-helpers
	it('adapter source helpers normalize paths and parse stacks', () => {
		expect(normalizeFileName('webpack://./src/App.tsx?v=1')).toContain('src/App.tsx');
		expect(isSourceFile('/app/src/Button.tsx')).toBe(true);
		expect(isSourceFile('/app/node_modules/foo/index.js')).toBe(false);
		const frames = parseStack('Error\n    at Foo (/app/src/Foo.ts:10:4)');
		expect(frames[0]?.functionName).toBe('Foo');
		expect(frames[0]?.lineNumber).toBe(10);
	});

	// @parity-case grab:contract-global-api
	it('global API registry mirrors window __OCTANE_GRAB__', () => {
		const stub = {
			getState: () => ({}) as never,
			destroy: () => {},
		} as unknown as ReactGrabAPI;
		setGlobalApi(stub);
		expect(getGlobalApi()).toBe(stub);
		expect(window.__OCTANE_GRAB__).toBe(stub);
		expect(window.__REACT_GRAB__).toBe(stub);
		clearGlobalApi(stub);
		expect(window.__OCTANE_GRAB__).toBeUndefined();
	});
});
