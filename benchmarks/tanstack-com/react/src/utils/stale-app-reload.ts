import { getSessionStorageItem, setSessionStorageItem } from '~/utils/browser-storage';

const staleAppReloadKey = 'tanstack-stale-app-reload-at';
const staleAppReloadWindowMs = 10_000;

const staleAppErrorPatterns = [
	'ChunkLoadError',
	'Failed to fetch dynamically imported module',
	'Importing a module script failed',
	'error loading dynamically imported module',
	'Expected a JavaScript-or-Wasm module script',
	'server responded with a MIME type',
	'Unable to preload CSS',
	'Seroval Error',
];

let handlersInstalled = false;
let lastReloadAt = 0;

export function installStaleAppReloadHandlers() {
	if (typeof window === 'undefined' || handlersInstalled) return;
	handlersInstalled = true;
	installConsoleReloadHandler('error');
	installConsoleReloadHandler('warn');

	window.addEventListener('unhandledrejection', (event) => {
		if (reloadOnStaleAppError(event.reason)) {
			event.preventDefault();
		}
	});

	window.addEventListener(
		'error',
		(event) => {
			if (reloadOnStaleAppError([event.error, event.message, event])) {
				event.preventDefault();
			}
		},
		true,
	);
}

export function reloadOnStaleAppError(error: unknown) {
	if (typeof window === 'undefined' || !isStaleAppError(error)) {
		return false;
	}

	const lastReload = readLastReloadAt();
	const now = Date.now();

	if (!Number.isFinite(lastReload) || now - lastReload > staleAppReloadWindowMs) {
		writeLastReloadAt(now);
		window.location.reload();
		return true;
	}

	return false;
}

export function isStaleAppError(error: unknown) {
	if (Array.isArray(error)) {
		return error.some(isStaleAppError);
	}

	if (isFailedAppAssetEvent(error)) {
		return true;
	}

	const message = getErrorText(error);
	return staleAppErrorPatterns.some((pattern) => message.includes(pattern));
}

function getErrorText(error: unknown): string {
	if (Array.isArray(error)) {
		return error.map(getErrorText).filter(Boolean).join('\n');
	}

	if (error instanceof Error) {
		return [error.name, error.message, error.stack].filter(Boolean).join('\n');
	}

	if (typeof Event !== 'undefined' && error instanceof Event) {
		return getEventText(error);
	}

	if (typeof error === 'string') {
		return error;
	}

	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message = error.message;
		if (typeof message === 'string') {
			return message;
		}
	}

	return '';
}

function installConsoleReloadHandler(method: 'error' | 'warn') {
	const original = console[method].bind(console);

	console[method] = (...args) => {
		if (!reloadOnStaleAppError(args)) {
			original(...args);
		}
	};
}

function readLastReloadAt() {
	const value = getSessionStorageItem(staleAppReloadKey);
	if (value) {
		return Number.parseInt(value, 10);
	}

	return lastReloadAt;
}

function writeLastReloadAt(value: number) {
	lastReloadAt = value;
	setSessionStorageItem(staleAppReloadKey, value.toString());
}

function isFailedAppAssetEvent(error: unknown) {
	if (
		typeof window === 'undefined' ||
		typeof HTMLScriptElement === 'undefined' ||
		typeof HTMLLinkElement === 'undefined' ||
		!(error instanceof Event)
	) {
		return false;
	}

	const target = error.target;
	const assetUrl =
		target instanceof HTMLScriptElement
			? target.src
			: target instanceof HTMLLinkElement
				? target.href
				: '';

	return isAppChunkUrl(assetUrl);
}

function getEventText(event: Event) {
	const target = event.target;

	if (typeof HTMLScriptElement !== 'undefined' && target instanceof HTMLScriptElement) {
		return [event.type, target.src].filter(Boolean).join('\n');
	}

	if (typeof HTMLLinkElement !== 'undefined' && target instanceof HTMLLinkElement) {
		return [event.type, target.href].filter(Boolean).join('\n');
	}

	return event.type;
}

function isAppChunkUrl(url: string) {
	if (!url) return false;

	try {
		const parsed = new URL(url, window.location.href);
		return (
			parsed.origin === window.location.origin &&
			parsed.pathname.startsWith('/assets/') &&
			(parsed.pathname.endsWith('.js') || parsed.pathname.endsWith('.css'))
		);
	} catch {
		return url.includes('/assets/') && (url.includes('.js') || url.includes('.css'));
	}
}
