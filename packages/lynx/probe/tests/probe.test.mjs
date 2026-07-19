import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';

import { PHASE_0_LISTENER_ID, PHASE_0_PROTOCOL } from '../src/protocol.mjs';
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

test(
	'the dual-thread probe renders when the background runtime starts first',
	{ timeout: 1_000 },
	async () => {
		const environment = createEnvironment();
		environment.switchToBackgroundThread();
		const background = installPhase0Background(globalThis);

		// Model independently evaluated runtimes by letting background startup reach
		// the unbuffered transport before the main runtime begins.
		await new Promise(setImmediate);

		environment.switchToMainThread();
		const mainThread = installPhase0MainThread(globalThis);
		await background.ready;

		const counter = mainThread.papi.page.querySelector('[data-testid="phase-0-counter"]');
		assert.ok(counter, 'startup ordering must not drop the initial native tree');
		assert.equal(counter.textContent, 'Count: 0');

		await background.destroy();
		assert.equal(mainThread.papi.page.childElementCount, 0);
		mainThread.destroy();
	},
);

test(
	'a delayed commit acknowledgement cannot complete terminal destroy',
	{ timeout: 1_000 },
	async () => {
		const environment = createEnvironment();
		environment.switchToMainThread();
		const context = globalThis.lynx.getJSContext();
		const dispatchMessage = context.dispatchEvent.bind(context);
		let delayedCommitAcknowledgement;
		context.dispatchEvent = (event) => {
			const message = event?.data;
			if (
				message?.type === 'octane-lynx-phase-0:ack' &&
				message.acknowledgement?.type === 'ack' &&
				message.acknowledgement.acceptedVersion === 2
			) {
				delayedCommitAcknowledgement = message;
				return dispatchMessage({
					type: 'message',
					data: {
						type: 'octane-lynx-phase-0:ack',
						requestId: message.requestId,
						rejection: {
							...PHASE_0_PROTOCOL,
							type: 'reject',
							version: 2,
							message: 'simulated delayed commit acknowledgement',
						},
					},
				});
			}
			if (message?.type === 'octane-lynx-phase-0:batch' && message.batch?.type === 'destroy') {
				assert.ok(delayedCommitAcknowledgement);
				environment.switchToMainThread();
				dispatchMessage({ type: 'message', data: delayedCommitAcknowledgement });
				environment.switchToBackgroundThread();
				setImmediate(() => {
					environment.switchToBackgroundThread();
					dispatchMessage(event);
				});
				return;
			}
			return dispatchMessage(event);
		};

		const mainThread = installPhase0MainThread(globalThis);
		environment.switchToBackgroundThread();
		const background = installPhase0Background(globalThis);
		await background.ready;

		await assert.rejects(
			background.deliverNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
			/simulated delayed commit acknowledgement/,
		);
		assert.equal(
			mainThread.papi.page.querySelector('[data-testid="phase-0-counter"]')?.textContent,
			'Count: 1',
		);

		await background.destroy();

		assert.equal(mainThread.receiver.destroyed, true);
		assert.equal(mainThread.papi.page.childElementCount, 0);
		mainThread.destroy();
	},
);

test(
	'background startup can be destroyed before the main runtime begins',
	{ timeout: 1_000 },
	async () => {
		const environment = createEnvironment();
		environment.switchToBackgroundThread();
		const background = installPhase0Background(globalThis);

		const destroy = background.destroy();
		await assert.rejects(background.ready, /destroyed before main ready/);
		await destroy;

		assert.equal(background.probe.destroyed, true);
	},
);
