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
		browser: { vite: { ws: new EventEmitter(), httpServer: new EventEmitter() } },
		test: {
			browser: { provider: { name: 'playwright', providerFactory: () => provider } },
		},
	};
	assert.equal(withBrowserLifecycleDiagnostics(project), project);
	assert.equal(cdp.eventNames().length, 0);
	process.env.REACT_PARITY_BROWSER_DIAGNOSTICS = '1';
	const output = [];
	let failOutput = false;
	t.mock.method(process.stderr, 'write', (message) => {
		if (failOutput) throw new Error('private diagnostic failure');
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
	for (const [errorMessage, category] of [
		['net::ERR_CONNECTION_RESET', 'connection-reset'],
		['net::ERR_CONNECTION_CLOSED', 'connection-closed'],
		['Connection closed', 'connection-closed'],
		['Insufficient resources', 'resource-exhausted'],
		['net::ERR_ABORTED', 'aborted'],
		['Invalid frame header', 'protocol-error'],
		['private error ws://localhost/?token=private', 'other'],
	]) {
		cdp.emit('Network.webSocketFrameError', { requestId: 'socket', errorMessage });
		assert.equal(output.at(-1).category, category);
	}
	const ignored = new EventEmitter();
	project.browser.vite.httpServer.emit('upgrade', { url: '/?token=private' }, ignored);
	assert.equal(ignored.eventNames().length, 0);
	for (const type of ['orchestrator', 'tester']) {
		const socket = new EventEmitter();
		project.browser.vite.httpServer.emit(
			'upgrade',
			{ url: `/__vitest_browser_api__?type=${type}&token=private&rpcId=private` },
			socket,
		);
		const begin = output.at(-1);
		assert.equal(begin.event, 'rpc-tcp-upgrade');
		assert.equal(begin.role, type);
		assert.equal(socket.listenerCount('data'), 0);
		assert.equal(socket.listenerCount('error'), 0);
		socket.emit('end');
		const failure = Object.assign(new Error('private transport error'), { code: 'ECONNRESET' });
		assert.throws(
			() => socket.emit('error', failure),
			(error) => error === failure,
		);
		socket.emit('close', true);
		assert.deepEqual(
			output.slice(-3).map(({ event, code, hadError, role, connectionId }) => ({
				event,
				code,
				hadError,
				role,
				connectionId,
			})),
			[
				{
					event: 'rpc-tcp-end',
					code: undefined,
					hadError: undefined,
					role: type,
					connectionId: begin.connectionId,
				},
				{
					event: 'rpc-tcp-error',
					code: 'ECONNRESET',
					hadError: undefined,
					role: type,
					connectionId: begin.connectionId,
				},
				{
					event: 'rpc-tcp-close',
					code: undefined,
					hadError: true,
					role: type,
					connectionId: begin.connectionId,
				},
			],
		);
		const unknown = Object.assign(new Error('private transport error'), { code: 'E_PRIVATE' });
		assert.throws(
			() => socket.emit('error', unknown),
			(error) => error === unknown,
		);
		assert.equal(output.at(-1).code, undefined);
	}
	assert.doesNotMatch(JSON.stringify(output), /private/);
	failOutput = true;
	assert.doesNotThrow(() =>
		cdp.emit('Network.webSocketFrameError', { requestId: 'socket', errorMessage: 'private' }),
	);
	assert.equal(observed.close(), 'closed');
});
