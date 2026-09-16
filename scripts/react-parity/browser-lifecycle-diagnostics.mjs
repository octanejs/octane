import { errorMonitor } from 'node:events';

// Temporary, opt-in evidence for browser parity disconnects. Observe the provider
// after its initial navigation; never inject into tests or retry a failed session.
let observedServers;

function reportDiagnostic(details) {
	try {
		process.stderr.write(
			`${JSON.stringify({ diagnostic: 'parity-browser', at: new Date().toISOString(), ...details })}\n`,
		);
	} catch {
		// Observation must not change the provider or socket's original outcome.
	}
}

function diagnosticErrorCode(error) {
	try {
		const code = error?.code;
		return typeof code === 'string' &&
			/^(?:E(?:CONNRESET|CONNABORTED|CONNREFUSED|PIPE|TIMEDOUT|HOSTUNREACH|NETUNREACH|NOTFOUND|AI_AGAIN)|WS_ERR_(?:EXPECTED_FIN|EXPECTED_MASK|INVALID_CLOSE_CODE|INVALID_CONTROL_PAYLOAD_LENGTH|INVALID_OPCODE|INVALID_UTF8|TOO_MANY_BUFFERED_PARTS|UNEXPECTED_MASK|UNEXPECTED_RSV_[123]|UNSUPPORTED_DATA_PAYLOAD_LENGTH|UNSUPPORTED_MESSAGE_LENGTH))$/.test(
				code,
			)
			? code
			: undefined;
	} catch {
		return undefined;
	}
}

function diagnosticTransportCategory(message) {
	switch (message) {
		case 'net::ERR_CONNECTION_RESET':
			return 'connection-reset';
		case 'net::ERR_CONNECTION_CLOSED':
		case 'Connection closed':
			return 'connection-closed';
		case 'Insufficient resources':
			return 'resource-exhausted';
		case 'net::ERR_CONNECTION_REFUSED':
			return 'connection-refused';
		case 'net::ERR_CONNECTION_TIMED_OUT':
		case 'net::ERR_TIMED_OUT':
			return 'timeout';
		case 'net::ERR_NETWORK_CHANGED':
			return 'network-changed';
		case 'net::ERR_INTERNET_DISCONNECTED':
			return 'offline';
		case 'net::ERR_ABORTED':
			return 'aborted';
		case 'Invalid frame header':
		case 'Received unexpected continuation frame.':
			return 'protocol-error';
		case 'Connection closed before receiving a handshake response':
			return 'handshake-closed';
		default:
			return 'other';
	}
}

function observeServer(project) {
	const server = project.browser.vite;
	if (observedServers?.has(server)) return;
	(observedServers ??= new WeakSet()).add(server);
	const report = (event, details = {}) =>
		reportDiagnostic({ project: project.name, event, ...details });
	for (const method of ['close', 'restart']) {
		const original = server[method];
		server[method] = function (...args) {
			try {
				// Retain caller names only, never stack URLs, paths, or error messages.
				const stack = new Error().stack;
				const callers =
					typeof stack === 'string'
						? stack
								.split('\n')
								.slice(2, 8)
								.map((line) => line.match(/^\s*at (?:async )?([\w$.]+) \(/)?.[1] ?? 'anonymous')
						: undefined;
				report(`server-${method}-start`, { callers });
			} catch {
				// Diagnostic formatting or output cannot prevent the original operation.
			}
			return original.apply(this, args);
		};
	}
	server.httpServer?.on('close', () => report('http-server-close'));
	server.httpServer?.on(errorMonitor, (error) => {
		report('http-server-error', { code: diagnosticErrorCode(error) });
	});
	let rpcConnectionId = 0;
	// Vitest's RPC WebSocketServer is private. The HTTP upgrade exposes its TCP
	// socket without wrapping ws internals or reading frames. Only classify the
	// known endpoint/role; do not retain the URL, session IDs, or API token.
	server.httpServer?.on('upgrade', (request, socket) => {
		try {
			if (typeof request.url !== 'string') return;
			const url = new URL(request.url, 'http://localhost');
			if (url.pathname !== '/__vitest_browser_api__') return;
			const role = url.searchParams.get('type');
			if (role !== 'tester' && role !== 'orchestrator') return;
			const details = { connectionId: ++rpcConnectionId, role };
			socket.on('end', () => report('rpc-tcp-end', details));
			socket.on('close', (hadError) => {
				report('rpc-tcp-close', { ...details, hadError: hadError === true });
			});
			socket.on(errorMonitor, (error) => {
				report('rpc-tcp-error', { ...details, code: diagnosticErrorCode(error) });
			});
			report('rpc-tcp-upgrade', details);
		} catch {
			report('server-observation-failed');
		}
	});
	let connectionId = 0;
	// Vite's WebSocket transport is separate from the browser RPC server.
	server.ws.on('connection', (socket) => {
		const id = ++connectionId;
		try {
			socket.on('close', (code) => {
				report('vite-ws-close', {
					connectionId: id,
					code: Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : undefined,
				});
			});
			// errorMonitor observes without handling an otherwise-unhandled error.
			socket.on(errorMonitor, (error) => {
				report('vite-ws-error', { connectionId: id, code: diagnosticErrorCode(error) });
			});
		} catch {
			report('server-observation-failed');
		}
	});
	report('server-observation-ready');
}

function diagnosticUrl(url) {
	if (!url || !URL.canParse(url)) return undefined;
	const parsed = new URL(url);
	return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)
		? `${parsed.origin}${parsed.pathname}`
		: parsed.protocol;
}

async function observePage(provider, sessionId, project) {
	const page = provider.getPage(sessionId);
	const report = (event, details = {}) =>
		reportDiagnostic({ project, sessionId, event, ...details });
	page.on('close', () => report('page-close'));
	page.on('crash', () => report('page-crash'));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame()) report('top-navigation', { url: diagnosticUrl(frame.url()) });
	});
	const cdp = await page.context().newCDPSession(page);
	await Promise.all([cdp.send('Page.enable'), cdp.send('Network.enable')]);
	const { frameTree } = await cdp.send('Page.getFrameTree');
	let topFrameId = frameTree.frame.id;
	const sockets = new Map();
	cdp.on('Network.webSocketCreated', ({ requestId, url }) => {
		sockets.set(requestId, diagnosticUrl(url));
	});
	for (const [event, direction] of [
		['Network.webSocketFrameSent', 'sent'],
		['Network.webSocketFrameReceived', 'received'],
	]) {
		cdp.on(event, ({ requestId, response }) => {
			if (response.opcode !== 8) return;
			// CDP encodes non-text frames as base64. Retain only the close code,
			// never application frames, the close reason, or URL query tokens.
			const payload = Buffer.from(response.payloadData, 'base64');
			const code = payload.length >= 2 ? payload.readUInt16BE(0) : undefined;
			report('websocket-close-frame', {
				requestId,
				direction,
				url: sockets.get(requestId),
				code: code >= 1000 && code <= 4999 ? code : undefined,
			});
		});
	}
	cdp.on('Network.webSocketClosed', ({ requestId }) => {
		report('websocket-closed', { requestId, url: sockets.get(requestId) });
		sockets.delete(requestId);
	});
	cdp.on('Network.webSocketFrameError', ({ requestId, errorMessage }) => {
		report('websocket-frame-error', {
			requestId,
			url: sockets.get(requestId),
			category: diagnosticTransportCategory(errorMessage),
		});
	});
	cdp.on('Page.frameNavigated', ({ frame }) => {
		if (!frame.parentId) topFrameId = frame.id;
	});
	for (const event of ['Page.frameRequestedNavigation', 'Page.frameScheduledNavigation']) {
		cdp.on(event, ({ frameId, reason, url }) => {
			if (frameId === topFrameId) report(event, { reason, url: diagnosticUrl(url) });
		});
	}
	cdp.on('Network.requestWillBeSent', ({ frameId, type, request, initiator }) => {
		if (frameId !== topFrameId || type !== 'Document') return;
		report('top-document-request', {
			url: diagnosticUrl(request.url),
			initiator: {
				type: initiator.type,
				url: diagnosticUrl(initiator.url),
				lineNumber: initiator.lineNumber,
				stack: initiator.stack?.callFrames.slice(0, 8).map((frame) => ({
					functionName: frame.functionName,
					url: diagnosticUrl(frame.url),
					lineNumber: frame.lineNumber,
					columnNumber: frame.columnNumber,
				})),
			},
		});
	});
	report('observation-ready', { url: diagnosticUrl(page.url()) });
}

export function withBrowserLifecycleDiagnostics(project) {
	const browser = project.test?.browser;
	const option = browser?.provider;
	if (process.env.REACT_PARITY_BROWSER_DIAGNOSTICS !== '1' || option?.name !== 'playwright') {
		return project;
	}
	return {
		...project,
		test: {
			...project.test,
			browser: {
				...browser,
				provider: {
					...option,
					providerFactory(...args) {
						const provider = option.providerFactory.apply(this, args);
						if (provider.browserName !== 'chromium') return provider;
						try {
							observeServer(args[0]);
						} catch {
							reportDiagnostic({ project: args[0].name, event: 'server-observation-failed' });
						}
						const openPage = provider.openPage;
						provider.openPage = async function (...pageArgs) {
							const result = await openPage.apply(this, pageArgs);
							try {
								await observePage(this, pageArgs[0], args[0].name);
							} catch {
								// Diagnostic setup cannot replace the original provider outcome.
								reportDiagnostic({
									project: args[0].name,
									sessionId: pageArgs[0],
									event: 'observation-failed',
								});
							}
							return result;
						};
						const close = provider.close;
						provider.close = function (...closeArgs) {
							reportDiagnostic({ project: args[0].name, event: 'provider-close-start' });
							return close.apply(this, closeArgs);
						};
						return provider;
					},
				},
			},
		},
	};
}
