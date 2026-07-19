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

test('removing a subtree invalidates descendant commands before native mutation', () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	receiver.receive({
		...PHASE_0_PROTOCOL,
		type: 'commit',
		version: 1,
		commands: [
			{ type: 'create', id: 'branch', hostType: 'view', parentId: 'page' },
			{ type: 'create', id: 'leaf', hostType: 'view', parentId: 'branch' },
			{ type: 'append', parentId: 'branch', childId: 'leaf' },
			{ type: 'append', parentId: 'page', childId: 'branch' },
		],
	});
	const before = papi.page.outerHTML;
	const leaf = receiver.getHost('leaf');

	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 2,
				commands: [
					{ type: 'remove', parentId: 'page', childId: 'branch' },
					{ type: 'dataset', id: 'leaf', name: 'stale', value: 'invalid' },
				],
			}),
		/dataset host "leaf" is missing/,
	);

	assert.equal(papi.page.outerHTML, before);
	assert.equal(receiver.getHost('leaf'), leaf);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(papi.flushCount, 1);
});

test('protocol validation rejects an ancestor cycle before exposing native mutation', () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	receiver.receive({
		...PHASE_0_PROTOCOL,
		type: 'commit',
		version: 1,
		commands: [
			{ type: 'create', id: 'branch', hostType: 'view', parentId: 'page' },
			{ type: 'create', id: 'leaf', hostType: 'view', parentId: 'branch' },
			{ type: 'append', parentId: 'branch', childId: 'leaf' },
			{ type: 'append', parentId: 'page', childId: 'branch' },
		],
	});
	const before = papi.page.outerHTML;

	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 2,
				commands: [
					{ type: 'dataset', id: 'branch', name: 'stale', value: 'invalid' },
					{ type: 'append', parentId: 'leaf', childId: 'branch' },
				],
			}),
		/append would create a cycle through "branch"/,
	);

	assert.equal(papi.page.outerHTML, before);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(papi.flushCount, 1);
});

test('append validation rejects conflicting staged and committed parents before native mutation', () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	const beforeMount = papi.page.outerHTML;
	const createTree = [
		{ type: 'create', id: 'first', hostType: 'view', parentId: 'page' },
		{ type: 'create', id: 'second', hostType: 'view', parentId: 'page' },
		{ type: 'create', id: 'child', hostType: 'view', parentId: 'first' },
		{ type: 'append', parentId: 'first', childId: 'child' },
		{ type: 'append', parentId: 'page', childId: 'first' },
		{ type: 'append', parentId: 'page', childId: 'second' },
	];

	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 1,
				commands: [...createTree, { type: 'append', parentId: 'second', childId: 'child' }],
			}),
		/host "child" is already attached to "first"/,
	);
	assert.equal(papi.page.outerHTML, beforeMount);
	assert.equal(receiver.acceptedVersion, 0);
	assert.equal(papi.flushCount, 0);

	receiver.receive({
		...PHASE_0_PROTOCOL,
		type: 'commit',
		version: 1,
		commands: createTree,
	});
	const beforeReparent = papi.page.outerHTML;
	const child = receiver.getHost('child');

	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 2,
				commands: [{ type: 'append', parentId: 'second', childId: 'child' }],
			}),
		/host "child" is already attached to "first"/,
	);
	assert.equal(papi.page.outerHTML, beforeReparent);
	assert.equal(receiver.getHost('child'), child);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(papi.flushCount, 1);
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
	const sentVersions = [];
	const probe = createPhase0BackgroundProbe((batch) => {
		sentVersions.push(batch.version);
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
	assert.match(probe.fault.message, /transport response must be an acknowledgement/);
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		/cannot commit after a transport fault/,
	);
	assert.deepEqual(sentVersions, [1, 2]);
});

test('background state remains unchanged and destroy cleans up when an update is rejected', async () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	const transportError = new Error('native mutation rejected');
	const sentTypes = [];
	let rejectUpdate = true;
	const probe = createPhase0BackgroundProbe((batch) => {
		sentTypes.push(batch.type);
		if (batch.type === 'commit' && batch.version === 2 && rejectUpdate) {
			rejectUpdate = false;
			return Promise.reject(transportError);
		}
		return receiver.receive(batch);
	});

	await probe.mount();
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		transportError,
	);

	assert.equal(probe.count, 0);
	assert.equal(probe.acceptedVersion, 1);
	assert.equal(probe.fault, transportError);

	await probe.destroy();

	assert.equal(papi.page.childElementCount, 0);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(probe.acceptedVersion, 1);
	assert.deepEqual(sentTypes, ['commit', 'commit', 'destroy']);
});

test('destroy tears down the native tree after a post-mount transport fault', async () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	const transportError = new Error('native update transport failed');
	const sentTypes = [];
	let rejectUpdate = true;
	const probe = createPhase0BackgroundProbe((batch) => {
		sentTypes.push(batch.type);
		if (batch.type === 'commit' && batch.version === 2 && rejectUpdate) {
			rejectUpdate = false;
			receiver.receive(batch);
			return Promise.reject(transportError);
		}
		return receiver.receive(batch);
	});

	await probe.mount();
	assert.ok(papi.page.querySelector('[data-testid="phase-0-counter"]'));
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		transportError,
	);
	assert.equal(papi.page.querySelector('[data-testid="phase-0-counter"]')?.textContent, 'Count: 1');
	assert.equal(receiver.acceptedVersion, 2);
	assert.equal(probe.acceptedVersion, 1);

	await probe.destroy();

	assert.equal(papi.page.querySelector('[data-testid="phase-0-counter"]'), null);
	assert.equal(papi.page.childElementCount, 0);
	assert.equal(receiver.acceptedVersion, 2);
	assert.equal(probe.acceptedVersion, 2);
	assert.equal(receiver.destroyed, true);
	assert.equal(probe.destroyed, true);
	assert.equal(probe.fault, transportError);
	assert.deepEqual(sentTypes, ['commit', 'commit', 'destroy']);
});

test('destroy waits for an in-flight mount and acknowledges native teardown', async () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	let acknowledgeMount;
	const mountStarted = Promise.withResolvers();
	const probe = createPhase0BackgroundProbe((batch) => {
		const acknowledgement = receiver.receive(batch);
		if (batch.version !== 1) return acknowledgement;
		return new Promise((resolve) => {
			acknowledgeMount = () => resolve(acknowledgement);
			mountStarted.resolve();
		});
	});

	const mount = probe.mount();
	await mountStarted.promise;
	const counter = papi.page.querySelector('[data-testid="phase-0-counter"]');
	assert.ok(counter);
	const firstDestroy = probe.destroy();
	const secondDestroy = probe.destroy();

	assert.equal(probe.destroyed, false);
	assert.equal(firstDestroy, secondDestroy);

	acknowledgeMount();
	await Promise.all([mount, firstDestroy, secondDestroy]);

	assert.equal(papi.page.querySelector('[data-testid="phase-0-counter"]'), null);
	assert.equal(papi.page.childElementCount, 0);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(probe.acceptedVersion, 1);
	assert.equal(probe.destroyed, true);
	const flushCount = papi.flushCount;
	assert.equal(receiver.receive({ ...PHASE_0_PROTOCOL, type: 'destroy' }).acceptedVersion, 1);
	assert.equal(papi.flushCount, flushCount);
	assert.throws(
		() =>
			receiver.receive({
				...PHASE_0_PROTOCOL,
				type: 'commit',
				version: 2,
				commands: [],
			}),
		/cannot receive a commit after destroy/,
	);
	await assert.rejects(
		probe.handleNativeEvent(PHASE_0_LISTENER_ID, { eventName: 'tap' }),
		/cannot deliver an event after destroy/,
	);
});

test('destroy requests terminal cleanup after an outcome-ambiguous failed mount', async () => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, { window: dom.window });
	activeEnvironment = globalThis.lynxTestingEnv;
	activeEnvironment.switchToMainThread();

	const papi = createPhase0PAPIAdapter(globalThis);
	const receiver = createPhase0MainThreadReceiver(papi);
	const mountError = new Error('native mount rejected');
	const sentTypes = [];
	const probe = createPhase0BackgroundProbe((batch) => {
		sentTypes.push(batch.type);
		const acknowledgement = receiver.receive(batch);
		if (batch.type === 'commit') return Promise.reject(mountError);
		return acknowledgement;
	});

	const mount = probe.mount();
	await assert.rejects(mount, mountError);
	assert.ok(papi.page.querySelector('[data-testid="phase-0-counter"]'));
	await probe.destroy();

	assert.equal(papi.page.childElementCount, 0);
	assert.equal(receiver.acceptedVersion, 1);
	assert.equal(probe.acceptedVersion, 1);
	assert.equal(receiver.destroyed, true);
	assert.equal(probe.destroyed, true);
	assert.equal(probe.fault, mountError);
	assert.deepEqual(sentTypes, ['commit', 'destroy']);
});

function createFaultablePAPI({ rootAppendError, rootAppendTiming } = {}) {
	const page = { children: [] };
	let flushCount = 0;
	let removeError;
	let removeTiming;
	return {
		page,
		create(hostType, parent, text) {
			return { children: [], hostType, parent, text };
		},
		append(parent, child) {
			if (parent === page && rootAppendError && rootAppendTiming === 'before') {
				const error = rootAppendError;
				rootAppendError = undefined;
				throw error;
			}
			parent.children.push(child);
			if (parent === page && rootAppendError && rootAppendTiming === 'after') {
				const error = rootAppendError;
				rootAppendError = undefined;
				throw error;
			}
		},
		setDataset(element, name, value) {
			element.dataset = { ...element.dataset, [name]: value };
		},
		setEvent(element, eventType, eventName, listenerId) {
			element.event = { eventName, eventType, listenerId };
		},
		setText(element, value) {
			element.text = value;
		},
		isChild(parent, child) {
			return parent.children.includes(child);
		},
		remove(parent, child) {
			const index = parent.children.indexOf(child);
			if (removeError && removeTiming === 'before') {
				const error = removeError;
				removeError = undefined;
				throw error;
			}
			if (index === -1) throw new Error('cannot remove an unattached child');
			parent.children.splice(index, 1);
			if (removeError && removeTiming === 'after') {
				const error = removeError;
				removeError = undefined;
				throw error;
			}
		},
		flush() {
			flushCount += 1;
		},
		failNextRemove(timing, error) {
			removeError = error;
			removeTiming = timing;
		},
		get flushCount() {
			return flushCount;
		},
	};
}

test('destroy removes a page root when native append mutates before throwing', async () => {
	const rootAppendError = new Error('root append failed after mutation');
	const papi = createFaultablePAPI({ rootAppendError, rootAppendTiming: 'after' });
	const receiver = createPhase0MainThreadReceiver(papi);
	const probe = createPhase0BackgroundProbe((batch) => receiver.receive(batch));

	await assert.rejects(probe.mount(), rootAppendError);
	assert.equal(papi.page.children.length, 1);
	const counter = papi.page.children[0];
	assert.equal(counter.event.listenerId, PHASE_0_LISTENER_ID);
	assert.equal(receiver.acceptedVersion, 0);

	await probe.destroy();

	assert.equal(papi.page.children.length, 0);
	assert.equal(counter.event.listenerId, undefined);
	assert.equal(papi.flushCount, 1);
	assert.equal(receiver.destroyed, true);
	assert.equal(probe.destroyed, true);
	assert.equal(probe.fault, rootAppendError);
});

test('destroy skips root removal when native append throws before mutation', async () => {
	const rootAppendError = new Error('root append failed before mutation');
	const papi = createFaultablePAPI({ rootAppendError, rootAppendTiming: 'before' });
	const receiver = createPhase0MainThreadReceiver(papi);
	const probe = createPhase0BackgroundProbe((batch) => receiver.receive(batch));

	await assert.rejects(probe.mount(), rootAppendError);
	assert.equal(papi.page.children.length, 0);
	const counter = receiver.getHost('counter');
	assert.equal(counter.event.listenerId, PHASE_0_LISTENER_ID);
	assert.equal(receiver.acceptedVersion, 0);

	await probe.destroy();

	assert.equal(papi.page.children.length, 0);
	assert.equal(counter.event.listenerId, undefined);
	assert.equal(papi.flushCount, 1);
	assert.equal(receiver.destroyed, true);
	assert.equal(probe.destroyed, true);
	assert.equal(probe.fault, rootAppendError);
});

test('destroy tolerates native remove mutating before throwing', async () => {
	const removeError = new Error('root remove failed after mutation');
	const papi = createFaultablePAPI();
	const receiver = createPhase0MainThreadReceiver(papi);
	const probe = createPhase0BackgroundProbe((batch) => receiver.receive(batch));

	await probe.mount();
	const counter = papi.page.children[0];
	papi.failNextRemove('after', removeError);
	await probe.destroy();

	assert.equal(papi.page.children.length, 0);
	assert.equal(counter.event.listenerId, undefined);
	assert.equal(papi.flushCount, 2);
	assert.equal(receiver.destroyed, true);
	assert.equal(probe.destroyed, true);
});
