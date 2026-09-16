import { join } from 'node:path';
import {
	createDiagnosticWriter,
	diagnosticError,
	diagnosticUrl,
} from './browser-diagnostics-lib.mjs';

// Opt-in observer for the repository's pinned Vitest Playwright provider.
// openBrowserPage is wrapped so listeners exist before the orchestrator navigates.
export default class BrowserLifecycleReporter {
	providers = new Map();
	servers = new WeakSet();
	pages = new WeakSet();
	browsers = new WeakSet();
	finished = false;
	pageCount = 0;

	constructor({ directory = process.env.OCTANE_BROWSER_DIAGNOSTICS_DIR } = {}) {
		this.write = directory
			? createDiagnosticWriter(join(directory, 'browser-events.jsonl'))
			: () => {};
	}

	record(event, details = {}) {
		this.write(event, { finished: this.finished, ...details });
	}

	observePage(page, project) {
		if (this.pages.has(page)) return;
		this.pages.add(page);
		const pageId = ++this.pageCount;
		let socketCount = 0;
		const record = (event, details = {}) =>
			this.record(event, { project, page: pageId, ...details });
		record('page-observed');
		page.on('crash', () => record('page-crash'));
		page.on('close', () => record('page-close'));
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame())
				record('main-frame-navigation', { url: diagnosticUrl(frame.url()) });
		});
		page.on('websocket', (socket) => {
			const url = diagnosticUrl(socket.url());
			const socketId = ++socketCount;
			record('websocket-open', { socket: socketId, url });
			// Playwright forwards Chromium's Network.webSocketFrameError.errorMessage.
			socket.on('socketerror', (error) =>
				record('websocket-error', { socket: socketId, url, error: diagnosticError(error) }),
			);
			socket.on('close', () => record('websocket-close', { socket: socketId, url }));
		});
		const browser = page.context().browser();
		if (browser && !this.browsers.has(browser)) {
			this.browsers.add(browser);
			browser.on('disconnected', () => record('browser-disconnected'));
		}
	}

	onBrowserInit(project) {
		const server = project.browser;
		if (!server || this.servers.has(server)) return;
		this.servers.add(server);
		const initialize = server.initBrowserProvider;
		if (typeof initialize !== 'function') {
			this.record('observer-unavailable', {
				project: project.name,
				reason: 'Expected browser provider initialization hook',
			});
			return;
		}
		const reporter = this;
		server.initBrowserProvider = async function (...args) {
			const result = await initialize.apply(this, args);
			try {
				reporter.observeProvider(project);
			} catch (error) {
				reporter.record('observer-error', { project: project.name, error: diagnosticError(error) });
			}
			return result;
		};
	}

	observeProvider(project) {
		const server = project.browser;
		const provider = server?.provider;
		if (!provider || this.providers.has(provider)) return;
		this.providers.set(provider, project.name);
		const record = (event, details = {}) =>
			this.record(event, { project: project.name, ...details });
		if (typeof provider.openBrowserPage !== 'function') {
			record('observer-unavailable', { reason: 'Expected Playwright openBrowserPage' });
			return;
		}
		const reporter = this;
		const openPage = provider.openBrowserPage;
		provider.openBrowserPage = async function (...args) {
			const page = await openPage.apply(this, args);
			try {
				reporter.observePage(page, project.name);
			} catch (error) {
				record('observer-error', { error: diagnosticError(error) });
			}
			return page;
		};
		for (const [target, method, event] of [
			[provider, 'close', 'provider-close-called'],
			[server.vite, 'close', 'vite-close-called'],
		]) {
			if (typeof target?.[method] !== 'function') continue;
			const original = target[method];
			target[method] = function (...args) {
				record(event);
				return original.apply(this, args);
			};
		}
		server.vite?.httpServer?.on('close', () => record('http-server-close'));
		const ws = server.vite?.ws;
		if (typeof ws?.send === 'function') {
			const send = ws.send;
			ws.send = function (...args) {
				if (args[0]?.type === 'full-reload') record('vite-full-reload');
				return send.apply(this, args);
			};
		}
	}

	onTestRunEnd(_modules, errors) {
		this.record('run-end', { errorCount: errors.length });
		this.finished = true;
	}
}
