// Development diagnostics and profiling
//
// The profiling counters this runtime declares, component source locations, and
// HTML nesting validation. The profiling probes themselves live in
// profile-probes.ts.

// Evaluates after the module it names; runtime.ts explains the chain.
export {} from './elements.js';
import { __profileCounters } from '../profiling.js';
import {
	invalidHtmlNestingWithParent,
	invalidHtmlNestingWithAncestor,
	invalidHtmlTextNesting,
} from '../html-tree-validation.js';
import type { ComponentBody, Scope, Block, RootContainer } from './types.js';
import { CURRENT_SCOPE, CURRENT_BLOCK } from './render.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

declare const __OCTANE_PROFILE_ENABLED__: boolean;

// Every counter below has a profile-guarded probe in this module. A counter a
// renderer does not declare reads as absent rather than zero.
if (typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__)
	__profileCounters('dom', [
		'component.render',
		'component.renderSuspended',
		'component.renderErrored',
		'component.bailout',
		'block.create',
		'block.unmount',
		'arm.keep',
		'arm.swap',
		'boundary.fallback',
		'boundary.catch',
		'scheduler.drain',
		'commit.root',
		'rollback.root',
		'rollback.journalEntries',
		'rollback.capture',
		'component.renderPhaseReplay',
		'block.lite.mount',
		'block.lite.fallback',
		'block.deopt',
		'block.cacheHit',
		'arm.swapOffscreen',
		'for.skip',
		'for.empty.mount',
		'for.empty.unmount',
		'list.reconcile',
		'list.insert',
		'list.remove',
		'list.update',
		'list.move',
		'list.lis',
		'boundary.suspend',
		'boundary.hold',
		'boundary.reveal',
		'boundary.retry',
		'boundary.reset',
		'activity.hide',
		'activity.show',
		'viewTransition.flush',
		'rollback.journal',
		'rollback.transitionDiscarded',
		'rollback.renderInvalidated',
		'rollback.hydration',
		'row.park',
		'flush.sync',
		'flush.transition',
		'flush.deferred',
		'commit.effects',
		'task.post',
		'suspend.throw',
		'use.stratum',
		'cascade.layout',
		'cascade.layoutDepth',
		'effect.run.insertion',
		'effect.run.layout',
		'effect.run.passive',
		'effect.cleanup.insertion',
		'effect.cleanup.layout',
		'effect.cleanup.passive',
		'ref.attach',
		'ref.detach',
	]);

/**
 * DEV ONLY: format the source location of a slot (`childSlot`/`componentSlot`/control-flow/
 * text-hole, keyed by its slot index) as `App.tsrx:42:5`, for hydration-mismatch warnings.
 * Returns `''` when no dev LOC table is present (prod, or a slot without a recorded
 * position) so callers degrade gracefully. The structured table (`scope.locs`) stays
 * available for a future DevTools element→source layer. Used by the P2/P3 mismatch paths.
 */
export function siteLoc(scope: Scope, slotKey: number): string {
	const locs = scope.locs;
	if (locs === undefined) return '';
	const lc = locs[slotKey];
	if (lc === undefined) return '';
	return `${scope.locFile ?? '<unknown>'}:${lc[0]}:${lc[1]}`;
}

// Function source is immutable, so one scan per function is enough. Misses are
// cached too: dev-runtime ancestor walks repeat this for every mounted host.
const COMPONENT_SOURCE_LOCS: WeakMap<Function, string | undefined> | null =
	process.env.NODE_ENV === 'production' ? null : new WeakMap();

/** DEV root-location fallback for anonymous ESM default functions. */
export function componentSourceLoc(body: unknown): string | undefined {
	if (typeof body !== 'function') return undefined;
	try {
		const stamped = (body as any).__oct_loc;
		if (typeof stamped === 'string') return stamped;
	} catch {
		// A user proxy/getter must not turn a diagnostic fallback into a render error.
	}
	const cache = COMPONENT_SOURCE_LOCS;
	if (cache !== null && cache.has(body)) return cache.get(body);
	let loc: string | undefined;
	try {
		const source = Function.prototype.toString.call(body);
		const match = /["']__octane_loc:([^"'\\\s]+)["']/.exec(source);
		if (match !== null) loc = decodeURIComponent(match[1]);
	} catch {
		// Native/proxied functions may not expose useful source; omit the location.
	}
	cache?.set(body, loc);
	return loc;
}

export function warnRootUnmountArgument(): void {
	if (process.env.NODE_ENV !== 'production') {
		console.error(
			'does not support a callback argument. To execute a side effect after rendering, ' +
				'declare it in a component body with useEffect().',
		);
	}
}

export function warnRootLifecycleUnmount(): void {
	if (process.env.NODE_ENV !== 'production') {
		console.error(
			'Attempted to synchronously unmount a root while Octane was already rendering. ' +
				'Octane cannot finish unmounting the root until the current render has completed, ' +
				'which may lead to a race condition.',
		);
	}
}

let HTML_NESTING_WARNINGS: WeakMap<Block, Set<string>> | null = null;

/** Compiler ABI: validate an authored candidate and publish only from a DEV render. */
export function devHtmlNesting(
	childTag: string,
	ancestors: string[],
	childLocation?: string,
	ancestorLocation?: string,
): void {
	if (process.env.NODE_ENV !== 'production') {
		const activeBlock = CURRENT_SCOPE?.block ?? CURRENT_BLOCK;
		let message: string | null = null;
		if (ancestors.length === 0) {
			let parent = activeBlock?.parentNode ?? null;
			// Dependency-only keyed survivors intentionally skip renderBlock, so
			// CURRENT_SCOPE still belongs to their parent component. Recover the
			// actual list parent from the already-mounted row's authored location;
			// otherwise an intervening <ul> disappears from parser-scope checks.
			const ownedSlots = CURRENT_SCOPE?._slots;
			if (childLocation !== undefined && ownedSlots !== null && ownedSlots !== undefined) {
				for (const slot of ownedSlots) {
					if (
						slot?.__kind === 'forBlockSlot' &&
						(slot.head?.startMarker as Element & { __oct_loc?: string })?.__oct_loc ===
							childLocation
					) {
						parent = slot.start.parentNode;
						break;
					}
				}
			}
			const actualAncestors: string[] = [];
			while (parent !== null && parent.nodeType === 1) {
				const element = parent as Element;
				if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') break;
				actualAncestors.push(element.localName);
				const location = (element as Element & { __oct_loc?: string }).__oct_loc;
				message =
					actualAncestors.length === 1
						? invalidHtmlNestingWithParent(childTag, element.localName, childLocation, location)
						: invalidHtmlNestingWithAncestor(childTag, actualAncestors, childLocation, location);
				if (message !== null) break;
				parent = element.parentNode;
			}
		} else {
			message =
				childTag === '#text'
					? invalidHtmlTextNesting(childLocation ?? '', ancestors[0], ancestorLocation)
					: ancestors.length === 1
						? invalidHtmlNestingWithParent(childTag, ancestors[0], childLocation, ancestorLocation)
						: invalidHtmlNestingWithAncestor(childTag, ancestors, childLocation, ancestorLocation);
		}
		if (message === null) return;
		if (activeBlock !== null) {
			const warningSets = (HTML_NESTING_WARNINGS ??= new WeakMap());
			let warnings = warningSets.get(activeBlock);
			if (warnings === undefined) {
				warnings = new Set();
				warningSets.set(activeBlock, warnings);
			} else if (warnings.has(message)) {
				return;
			}
			warnings.add(message);
		}
		console.error(
			'Octane invalid HTML nesting: ' +
				message +
				'\n\nThe browser will repair this HTML before hydration. This can cause a hydration mismatch.',
		);
	}
}

/** Validate the supported Element root as the authored tree's outer HTML ancestor. */
export function validateRootHtmlNesting(
	container: RootContainer,
	body: ComponentBody,
	content: Node,
): void {
	if (process.env.NODE_ENV !== 'production') {
		if (container.nodeType !== 1) return;
		const element = container as Element;
		if (
			componentSourceLoc(body) === undefined ||
			element.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
			element.localName === 'div' ||
			element.localName === 'body' ||
			element.localName === 'html' ||
			element.localName.includes('-')
		) {
			return;
		}
		const root = (content as Element).firstElementChild;
		if (root === null) return;
		if (invalidHtmlNestingWithParent(root.localName, element.localName) !== null) {
			devHtmlNesting(root.localName, [element.localName]);
			return;
		}
		let child = root.firstElementChild;
		const ancestors = [root.localName, element.localName];
		while (child !== null && child.namespaceURI === 'http://www.w3.org/1999/xhtml') {
			if (invalidHtmlNestingWithAncestor(child.localName, ancestors) !== null) {
				devHtmlNesting(child.localName, ancestors);
				return;
			}
			ancestors.splice(ancestors.length - 1, 0, child.localName);
			child = child.firstElementChild;
		}
	}
}
