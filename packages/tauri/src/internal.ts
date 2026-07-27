import type { InvokeArgs } from '@tauri-apps/api/core';

const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareTagCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined) bareTagCache.set(tag, (bare = Symbol.for(':' + tag)));
		return bare;
	}
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let derived = byTag.get(tag);
	if (derived === undefined) {
		byTag.set(tag, (derived = Symbol.for((slot.description ?? '') + ':' + tag)));
	}
	return derived;
}

export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

/**
 * Raised where `@tauri-apps/api` would fault on a missing IPC bridge: during
 * SSR, in a plain browser tab, and in a test that forgot `mockIPC`. The bare
 * `window.__TAURI_INTERNALS__` TypeError names nothing the caller can act on.
 */
export class TauriUnavailableError extends Error {
	constructor(what: string) {
		super(
			`${what} requires a Tauri host: window.__TAURI_INTERNALS__ is not present. ` +
				'Run the app through Tauri, or install @tauri-apps/api/mocks in tests and browser previews.',
		);
		this.name = 'TauriUnavailableError';
	}
}

export function hasTauriHost(): boolean {
	return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ != null;
}

function isPlainRecord(args: InvokeArgs): args is Record<string, unknown> {
	return (
		typeof args === 'object' &&
		!Array.isArray(args) &&
		!ArrayBuffer.isView(args) &&
		!(args instanceof ArrayBuffer)
	);
}

function stableStringify(value: unknown): string {
	return JSON.stringify(value, (_key, raw) => {
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(raw as Record<string, unknown>).sort()) {
			sorted[key] = (raw as Record<string, unknown>)[key];
		}
		return sorted;
	});
}

/**
 * Default refetch key for a command's arguments. A record is serialized so the
 * ubiquitous `invoke('cmd', { id })` object literal does not refetch on every
 * render, which costs one pass over the record per render: fine for the small
 * argument objects commands take, and `options.deps` opts out when it is not.
 * Array and binary payloads are identity-compared instead, because serializing
 * a buffer per render is never the cheaper trade.
 */
export function argsKey(args: InvokeArgs | undefined): unknown {
	if (args === undefined) return undefined;
	return isPlainRecord(args) ? stableStringify(args) : args;
}

/**
 * Refetch key for `InvokeOptions.headers`. Headers reach the host on every
 * request, so a rotated `Authorization` value has to refetch exactly like a
 * changed argument would. Compared by value for the same reason `argsKey`
 * compares a record by value: the inline `{ Authorization: token }` literal is
 * the common case, and identity would refetch on every render.
 */
export function headersKey(headers: HeadersInit | undefined): unknown {
	if (headers === undefined) return undefined;
	// Header iteration is spec-ordered (lowercased, sorted), so it is canonical
	// already; the other two forms go through the same key sort as arguments.
	if (typeof Headers !== 'undefined' && headers instanceof Headers) {
		return stableStringify([...headers]);
	}
	return stableStringify(headers);
}
