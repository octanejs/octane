import { OCTANE_ELECTRON_GLOBAL } from '../common/channels';
import type { OctaneElectronAPI } from '../common/types';
import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({ slotlessPrefix: ':' });

export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

/** Active `window` / `globalThis` key the renderer reads for the bridge. */
let activeApiKey: string = OCTANE_ELECTRON_GLOBAL;

/**
 * Raised when renderer code needs the Electron bridge and the configured global
 * is missing: SSR, a plain browser tab, or a test that forgot to install a mock
 * host. If preload used a custom `apiKey`, call `setElectronBridgeKey` first.
 */
export class ElectronUnavailableError extends Error {
	constructor(what: string) {
		super(
			`${what} requires an Electron host: window.${activeApiKey} is not present. ` +
				'Run under Electron with @octanejs/electron/preload, or install a mock bridge in tests. ' +
				'If preload passed a custom apiKey, call setElectronBridgeKey with the same key before using the hooks.',
		);
		this.name = 'ElectronUnavailableError';
	}
}

/**
 * Point renderer hooks at a custom bridge global. Required when preload called
 * `exposeOctaneElectron({ apiKey })` with a non-default key — preload and the
 * renderer are separate realms, so the key must be configured on both sides.
 */
export function setElectronBridgeKey(apiKey: string = OCTANE_ELECTRON_GLOBAL): void {
	activeApiKey = apiKey;
}

export function getElectronBridgeKey(): string {
	return activeApiKey;
}

export function getElectronBridge(): OctaneElectronAPI | undefined {
	if (typeof globalThis === 'undefined') return undefined;
	const bridge = (globalThis as any)[activeApiKey];
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
	setElectronBridgeKey(apiKey);
	(globalThis as any)[apiKey] = api;
}

export function clearElectronBridge(apiKey?: string): void {
	const key = apiKey ?? activeApiKey;
	delete (globalThis as any)[key];
	if (key === activeApiKey) setElectronBridgeKey(OCTANE_ELECTRON_GLOBAL);
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
