import { OCTANE_ELECTRON_GLOBAL } from '../common/channels';
import type { OctaneElectronAPI } from '../common/types';

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
 * Raised when renderer code needs the Electron bridge and
 * `window.__OCTANE_ELECTRON__` is missing: SSR, a plain browser tab, or a test
 * that forgot to install a mock host.
 */
export class ElectronUnavailableError extends Error {
	constructor(what: string) {
		super(
			`${what} requires an Electron host: window.${OCTANE_ELECTRON_GLOBAL} is not present. ` +
				'Run under Electron with @octanejs/electron/preload, or install a mock bridge in tests.',
		);
		this.name = 'ElectronUnavailableError';
	}
}

export function getElectronBridge(): OctaneElectronAPI | undefined {
	if (typeof globalThis === 'undefined') return undefined;
	const bridge = (globalThis as any)[OCTANE_ELECTRON_GLOBAL];
	return bridge == null ? undefined : (bridge as OctaneElectronAPI);
}

export function hasElectronHost(): boolean {
	return getElectronBridge() !== undefined;
}

/** Install a bridge for tests or non-preload environments. */
export function installElectronBridge(
	api: OctaneElectronAPI,
	apiKey = OCTANE_ELECTRON_GLOBAL,
): void {
	(globalThis as any)[apiKey] = api;
}

export function clearElectronBridge(apiKey = OCTANE_ELECTRON_GLOBAL): void {
	delete (globalThis as any)[apiKey];
}

function isPlainRecord(args: unknown): args is Record<string, unknown> {
	return (
		typeof args === 'object' &&
		args !== null &&
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
 * Default refetch key for invoke arguments. A record is serialized so an inline
 * `{ id }` literal does not refetch every render; arrays and binary payloads
 * compare by identity.
 */
export function argsKey(args: unknown): unknown {
	if (args === undefined) return undefined;
	return isPlainRecord(args) ? stableStringify(args) : args;
}
