import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';

import { createPhase0PAPIAdapter } from '../src/papi.mjs';
import {
	createPhase0BackgroundProbe,
	createPhase0MainThreadReceiver,
	PHASE_0_LISTENER_ID,
	PHASE_0_PROTOCOL,
} from '../src/protocol.mjs';

let activeEnvironment;

afterEach(() => {
	activeEnvironment?.clearGlobal();
	activeEnvironment = undefined;
	uninstallLynxTestingEnv(globalThis);
});

test('protocol validation rejects the complete invalid batch before exposing native mutation', () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	const before = papi.page.outerHTML;

	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 1,
				commands: [
					{
						type: 'create',
						id: 'would-have-been-visible',
						hostType: 'view',
						parentId: 'page',
					},
					{
						type: 'text',
						id: 'missing-host',
						value: 'invalid',
					},
				],
			}),
		/missing-host/,
	);

	assert.equal(papi.page.outerHTML, before);
	assert.equal(receiver.acceptedVersion, 0);
	assert.equal(papi.flushCount, 0);
});

function acknowledge(batch) {
	return {
		...PHASE_0_PROTOCOL,
		type: 'ack',
		acceptedVersion: batch.version,
	};
}

test('background state advances only after the native commit is acknowledged', async () => {
	let acknowledgeUpdate;
	const updateStarted = Promise.withResolvers();
	const probe = createPhase0BackgroundProbe((batch) => {
		if (batch.version === 1) return acknowledge(batch);
		updateStarted.resolve(batch);
		return new Promise((resolve) => {
			acknowledgeUpdate = () => resolve(acknowledge(batch));
		});
	});

	await probe.mount();
	const update = probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' });
	const batch = await updateStarted.promise;

	assert.equal(batch.commands[0].value, 'Count: 1');
	assert.equal(probe.count, 0);
	assert.equal(probe.acceptedVersion, 1);

	acknowledgeUpdate();
	await update;

	assert.equal(probe.count, 1);
	assert.equal(probe.acceptedVersion, 2);
});

test('background state remains unchanged for a malformed transport response', async () => {
	const probe = createPhase0BackgroundProbe((batch) => {
		if (batch.version === 1) return acknowledge(batch);
		return {
			...PHASE_0_PROTOCOL,
			type: 'reject',
			version: batch.version,
			message: 'native mutation rejected',
		};
	});

	await probe.mount();
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		/transport response must be an acknowledgement/,
	);

	assert.equal(probe.count, 0);
	assert.equal(probe.acceptedVersion, 1);
});

test('background state remains unchanged when the transport rejects the commit', async () => {
	const transportError = new Error('native mutation rejected');
	const probe = createPhase0BackgroundProbe((batch) => {
		if (batch.version === 1) return acknowledge(batch);
		return Promise.reject(transportError);
	});

	await probe.mount();
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		transportError,
	);

	assert.equal(probe.count, 0);
	assert.equal(probe.acceptedVersion, 1);
	assert.equal(probe.fault, transportError);
});
