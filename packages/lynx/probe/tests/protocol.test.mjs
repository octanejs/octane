import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';

import { createPhase0PAPIAdapter } from '../src/papi.mjs';
import { createPhase0MainThreadReceiver, PHASE_0_PROTOCOL } from '../src/protocol.mjs';

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
