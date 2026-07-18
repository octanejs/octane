import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';

import { installPhase0Background, installPhase0MainThread } from '../src/runtime-bridge.mjs';

let activeEnvironment;

afterEach(() => {
	activeEnvironment?.clearGlobal();
	activeEnvironment = undefined;
	uninstallLynxTestingEnv(globalThis);
});

function createEnvironment() {
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'https://octane.test/',
	});
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	return activeEnvironment;
}

test('the React-free dual-thread probe renders, handles a native tap, and tears down', async () => {
	const environment = createEnvironment();
	environment.switchToMainThread();
	const mainThread = installPhase0MainThread(globalThis);

	environment.switchToBackgroundThread();
	const background = installPhase0Background(globalThis);
	// The official testing environment models native background-event delivery through
	// this framework injection point. It is intentionally kept out of the probe runtime:
	// the real-engine event ABI remains a Phase 0 contract gate.
	globalThis.lynxCoreInject.tt.publishEvent = background.deliverNativeEvent;
	await background.ready;

	const page = mainThread.papi.page;
	const counter = page.querySelector('[data-testid="phase-0-counter"]');
	assert.ok(counter, 'the acknowledged mount must expose the counter in the native tree');
	assert.equal(counter.textContent, 'Count: 0');
	const initialCounterIdentity = counter;

	const tap = new Event('bindEvent:tap');
	Object.assign(tap, {
		eventName: 'tap',
		eventType: 'bindEvent',
	});
	counter.dispatchEvent(tap);
	await background.lastEvent;

	assert.equal(page.querySelector('[data-testid="phase-0-counter"]'), initialCounterIdentity);
	assert.equal(counter.textContent, 'Count: 1');
	assert.equal(background.probe.acceptedVersion, 2);

	await background.destroy();
	assert.equal(page.querySelector('[data-testid="phase-0-counter"]'), null);
	assert.equal(page.childElementCount, 0);
	mainThread.destroy();
});
