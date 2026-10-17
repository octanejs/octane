// Profiling probes
//
// The profiling build's component override and attribution, and the DevTools
// scope inspectors. Only profile-guarded code imports this module, and the dev
// server's profile fold removes those imports, so it never loads while
// profiling is off. It is not in the evaluation chain.

import {
	__profileTrackComponent,
	__profileHasComponentMetadata,
	__profileGetComponent,
} from '../profiling.js';
import { ELEMENT_TAG } from '../runtime-tags.js';
import type { Scope, Block } from './types.js';
import { componentName } from './engine.js';
import { forEachSubtreeChild } from './activity.js';

let PROFILE_COMPONENT_OVERRIDE: { target: Function; component: Function | null } | null = null;

export function withProfileComponentOverride<T>(
	target: Function,
	component: Function | null,
	run: () => T,
): T {
	const previous = PROFILE_COMPONENT_OVERRIDE;
	PROFILE_COMPONENT_OVERRIDE = { target, component };
	try {
		return run();
	} finally {
		PROFILE_COMPONENT_OVERRIDE = previous;
	}
}

export function profileTrackComponent(subject: object, fallback: Function): void {
	const override = PROFILE_COMPONENT_OVERRIDE;
	__profileTrackComponent(
		subject,
		override !== null && override.target === fallback ? override.component : fallback,
	);
}

export function profilePortalComponent(rawBody: unknown, body: Function): Function | null {
	if (typeof rawBody === 'function' && __profileHasComponentMetadata(rawBody)) return rawBody;
	// Only a component element unwrapped into the portal block is that block's
	// component. A keyed one renders through childSlot, which tracks its own block.
	const descriptor = rawBody as any;
	return descriptor != null && descriptor.$$kind === ELEMENT_TAG && descriptor.type === body
		? body
		: null;
}

export function inspectDevtoolsChildScopes(
	scope: import('../devtools-hook.js').DevtoolsScopeLike,
	visit: (child: import('../devtools-hook.js').DevtoolsScopeLike) => void,
): void {
	forEachSubtreeChild(scope as Scope, visit);
}

export function inspectDevtoolsName(
	scope: import('../devtools-hook.js').DevtoolsScopeLike,
): string {
	const component = __profileGetComponent(scope);
	if (component !== undefined) return componentName({ body: component } as Block);
	return scope.body === undefined ? 'Unknown' : componentName(scope as Block);
}
