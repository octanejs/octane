import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { withBrowserLifecycleDiagnostics } from './browser-lifecycle-diagnostics.mjs';

test('browser transport diagnostics are opt-in and do not expose socket contents', async (t) => {
	const original = process.env.REACT_PARITY_BROWSER_DIAGNOSTICS;
	t.after(() => {
		if (original === undefined) delete process.env.REACT_PARITY_BROWSER_DIAGNOSTICS;
		else process.env.REACT_PARITY_BROWSER_DIAGNOSTICS = original;
	});
	process.env.REACT_PARITY_BROWSER_DIAGNOSTICS = '0';
	const cdp = new EventEmitter();
	cdp.send = async () => ({ frameTree: { frame: { id: 'top' } } });
	const page = new EventEmitter();
	page.context = () => ({ newCDPSession: async () => cdp });
	page.url = () => 'http://localhost:63316/__vitest_test__/?sessionId=private';
	const provider = {
		browserName: 'chromium',
		openPage: async () => 'original result',
		getPage: () => page,
		close: () => 'closed',
	};
	const project = {
		name: 'diagnostic-fixture',
		browser: { vite: { ws: new EventEmitter() } },
		test: {
			browser: { provider: { name: 'playwright', providerFactory: () => provider } },
		},
	};
	assert.equal(withBrowserLifecycleDiagnostics(project), project);
	assert.equal(cdp.eventNames().length, 0);
	process.env.REACT_PARITY_BROWSER_DIAGNOSTICS = '1';
	const output = [];
	t.mock.method(process.stderr, 'write', (message) => {
		output.push(JSON.parse(message));
		return true;
	});
	const observed =
		withBrowserLifecycleDiagnostics(project).test.browser.provider.providerFactory(project);
	assert.equal(await observed.openPage('session'), 'original result');
	cdp.emit('Network.webSocketCreated', {
		requestId: 'socket',
		url: 'ws://localhost:63316/__vitest_api__?token=private',
	});
	const before = output.length;
	cdp.emit('Network.webSocketFrameSent', {
		requestId: 'socket',
		response: { opcode: 1, payloadData: 'private application data' },
	});
	assert.equal(output.length, before);
	const close = Buffer.concat([Buffer.from([3, 233]), Buffer.from('private close reason')]);
	cdp.emit('Network.webSocketFrameReceived', {
		requestId: 'socket',
		response: { opcode: 8, payloadData: close.toString('base64') },
	});
	cdp.emit('Network.webSocketFrameSent', {
		requestId: 'socket',
		response: { opcode: 8, payloadData: close.toString('base64') },
	});
	cdp.emit('Network.webSocketClosed', { requestId: 'socket' });
	cdp.emit('Network.webSocketFrameError', { requestId: 'socket', errorMessage: 'private error' });
	const transport = output.filter((entry) => entry.event.startsWith('websocket-'));
	assert.deepEqual(
		transport.map(({ event, direction, code, url }) => ({ event, direction, code, url })),
		[
			{
				event: 'websocket-close-frame',
				direction: 'received',
				code: 1001,
				url: 'ws://localhost:63316/__vitest_api__',
			},
			{
				event: 'websocket-close-frame',
				direction: 'sent',
				code: 1001,
				url: 'ws://localhost:63316/__vitest_api__',
			},
			{
				event: 'websocket-closed',
				direction: undefined,
				code: undefined,
				url: 'ws://localhost:63316/__vitest_api__',
			},
			{ event: 'websocket-frame-error', direction: undefined, code: undefined, url: undefined },
		],
	);
	assert.ok(transport.every((entry) => entry.requestId === 'socket'));
	assert.doesNotMatch(JSON.stringify(output), /private/);
	assert.equal(observed.close(), 'closed');
});
