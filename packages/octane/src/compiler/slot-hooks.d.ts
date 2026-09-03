import type { CompilerProgram, CompileSourceMap } from './index.js';

/** Options for the plain-module hook transform used by compiler adapters. */
export interface SlotHooksOptions {
	environment?: 'client' | 'server';
	strong?: boolean;
	nativeReads?: boolean;
	hmr?: boolean;
	dev?: boolean;
	profile?: boolean;
	profileFilename?: string;
	inlineHookMemo?: boolean;
	manualSlots?: boolean;
	/** Opaque activation signal; the transform only checks its presence. */
	universalRuntime?: unknown;
	renderer?: { target?: string };
	isVoidComponentImport?: (request: string, imported: string) => boolean;
}

export interface SlotHooksResult {
	code: string;
	/** The surgical transform preserves source lines and returns no map. */
	map: CompileSourceMap | null;
}

export interface VoidComponentImport {
	request: string;
	imported: string;
}

/** Returns null when the module can pass through unchanged. */
export function slotHooks(
	source: string,
	id: string,
	options?: SlotHooksOptions,
): SlotHooksResult | null;

export function findVoidRootImports(source: string, id: string): VoidComponentImport[];

export function findVoidComponentImports(
	source: string | CompilerProgram,
	id: string,
): VoidComponentImport[];
