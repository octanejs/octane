import type { UniversalPortalTargetHandle } from 'octane/universal/native';
import { LYNX_RENDERER_ID } from '../config.js';

const LYNX_PORTAL_TARGET_ID = /^octane\.lynx\.portal:(\d+):(\d+):(\d+)$/;

export interface LynxPortalTargetIdentity {
	readonly root: number;
	readonly id: number;
	readonly generation: number;
}

function isPositiveSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

/** Encode the accepted Lynx host identity without transporting its public facade. */
export function encodeLynxPortalTargetId(identity: LynxPortalTargetIdentity): string {
	if (
		!isPositiveSafeInteger(identity.root) ||
		!isPositiveSafeInteger(identity.id) ||
		!isPositiveSafeInteger(identity.generation)
	) {
		throw new TypeError('Octane Lynx portal targets require a valid host identity.');
	}
	return `octane.lynx.portal:${identity.root}:${identity.id}:${identity.generation}`;
}

/** Decode an opaque portal target ID at the untrusted main-thread boundary. */
export function decodeLynxPortalTargetId(value: unknown): LynxPortalTargetIdentity | null {
	if (typeof value !== 'string') return null;
	const match = LYNX_PORTAL_TARGET_ID.exec(value);
	if (match === null) return null;
	const root = Number(match[1]);
	const id = Number(match[2]);
	const generation = Number(match[3]);
	if (
		!isPositiveSafeInteger(root) ||
		!isPositiveSafeInteger(id) ||
		!isPositiveSafeInteger(generation)
	) {
		return null;
	}
	return Object.freeze({ root, id, generation });
}

export function isLynxPortalTargetHandle(value: unknown): value is UniversalPortalTargetHandle {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const handle = value as Partial<UniversalPortalTargetHandle>;
	return (
		handle.$$kind === 'octane.universal.portal-target' &&
		handle.renderer === LYNX_RENDERER_ID &&
		typeof handle.root === 'number' &&
		isPositiveSafeInteger(handle.root) &&
		decodeLynxPortalTargetId(handle.id) !== null
	);
}

/** Stable map key for one universal-root-scoped target registration. */
export function lynxPortalTargetKey(handle: UniversalPortalTargetHandle): string {
	return `${handle.root}\u0000${String(handle.id)}`;
}
