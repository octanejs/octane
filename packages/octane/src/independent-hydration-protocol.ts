import { decodeSignalValue, encodeSignalValue } from './data-encoding.js';
import type { EncodedSignalValue } from './signals/types.js';

export interface IndependentHydrateCapture {
	readonly name: string;
	readonly type: 'json';
}

export interface IndependentHydrateManifestTemplate {
	readonly version: 1;
	readonly boundaryId: string;
	readonly exportName: string;
	readonly captureSchema: readonly IndependentHydrateCapture[];
	readonly hookSeed: number;
	readonly idSeed: number;
	readonly signalSites: readonly string[];
	readonly parentDependencies: false;
}

export interface IndependentHydrateBuildRecord {
	readonly moduleId: string;
	readonly styles: readonly string[];
}

/** Compiler proof plus request-specific encoded captures for one island. */
export interface IndependentHydrateManifest extends IndependentHydrateManifestTemplate {
	readonly buildId: string;
	/** Per-render instance boundary, not the compiler template lookup key. */
	readonly boundaryId: string;
	readonly moduleId: string;
	readonly captures: readonly EncodedSignalValue[];
	readonly styles: readonly string[];
}

function plainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return false;
	return Reflect.ownKeys(value).every((key) => {
		if (typeof key !== 'string') return false;
		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
		return descriptor.enumerable && 'value' in descriptor;
	});
}

function key(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function uniqueKeys(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every(key) && new Set(value).size === value.length;
}

function captures(value: unknown, count: number): value is readonly EncodedSignalValue[] {
	if (!Array.isArray(value) || value.length !== count) return false;
	try {
		for (const capture of value) decodeSignalValue(capture as EncodedSignalValue);
		return true;
	} catch {
		return false;
	}
}

export function isIndependentHydrateManifest(value: unknown): value is IndependentHydrateManifest {
	if (!plainRecord(value)) return false;
	const allowed = new Set([
		'version',
		'buildId',
		'boundaryId',
		'moduleId',
		'exportName',
		'captureSchema',
		'captures',
		'hookSeed',
		'idSeed',
		'signalSites',
		'styles',
		'parentDependencies',
	]);
	if (!Object.keys(value).every((name) => allowed.has(name))) return false;
	if (
		value.version !== 1 ||
		!key(value.buildId) ||
		!key(value.boundaryId) ||
		!key(value.moduleId) ||
		!key(value.exportName) ||
		!Number.isSafeInteger(value.hookSeed) ||
		(value.hookSeed as number) < 0 ||
		!Number.isSafeInteger(value.idSeed) ||
		(value.idSeed as number) < 0 ||
		value.parentDependencies !== false ||
		!uniqueKeys(value.signalSites) ||
		!uniqueKeys(value.styles) ||
		!Array.isArray(value.captureSchema)
	) {
		return false;
	}
	const names = new Set<string>();
	for (const capture of value.captureSchema) {
		if (
			!plainRecord(capture) ||
			Object.keys(capture).length !== 2 ||
			!key(capture.name) ||
			capture.type !== 'json' ||
			names.has(capture.name)
		) {
			return false;
		}
		names.add(capture.name);
	}
	return captures(value.captures, value.captureSchema.length);
}

export function createIndependentHydrateManifest(
	template: IndependentHydrateManifestTemplate,
	values: readonly unknown[],
	instanceBoundaryId: string,
	buildId: string,
	build: IndependentHydrateBuildRecord,
): IndependentHydrateManifest {
	const manifest = {
		...template,
		buildId,
		boundaryId: instanceBoundaryId,
		moduleId: build.moduleId,
		captures: values.map((value) => encodeSignalValue(value)),
		styles: build.styles,
	};
	if (!isIndependentHydrateManifest(manifest)) {
		throw new TypeError('Invalid independent Hydrate manifest inputs.');
	}
	return Object.freeze(manifest);
}

export function serializeIndependentHydrateManifest(manifest: IndependentHydrateManifest): string {
	if (!isIndependentHydrateManifest(manifest)) {
		throw new TypeError('Invalid independent Hydrate manifest.');
	}
	return JSON.stringify(manifest)
		.replace(/&/g, '\\u0026')
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}
