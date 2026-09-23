import { decodeSignalValue } from '../data-encoding.js';
import type { SignalOwner } from '../signals/types.js';
import {
	HYDRATE_ID_ATTR,
	HYDRATE_IDLE_TIMEOUT_ATTR,
	HYDRATE_MEDIA_ATTR,
	HYDRATE_VISIBLE_MARGIN_ATTR,
	HYDRATE_VISIBLE_THRESHOLD_ATTR,
	HYDRATE_WHEN_ATTR,
	HYDRATE_INDEPENDENT_ATTR,
	INDEPENDENT_HYDRATE_MANIFEST_ATTR,
} from '../hydration-markers.js';
import {
	isIndependentHydrateManifest,
	type IndependentHydrateManifest,
} from '../independent-hydration-protocol.js';
import {
	appendHydrationReplayIntent,
	hydrationMarkerInteractionStatus,
	initializeIndependentHydrationEventCapture,
	isHydrationSelectionIntentCurrent,
	registerHydrationIntentBoundary,
	takePendingHydrationIntents,
	unregisterHydrationIntentBoundary,
	type HydrationIntentBoundary,
	type HydrationReplayIntent,
} from './event-capture.js';
import { idle } from './idle.js';
import { media } from './media.js';
import type { HydrationStrategy } from './types.js';
import { visible } from './visible.js';

export interface IndependentHydrateActivationContext {
	readonly element: Element;
	readonly manifest: IndependentHydrateManifest;
	readonly captures: readonly unknown[];
	readonly intents: readonly HydrationReplayIntent[];
	readonly signalOwner?: SignalOwner;
}

export type IndependentHydrateActivator = (
	context: IndependentHydrateActivationContext,
) => void | { unmount(): void } | Promise<void | { unmount(): void }>;

export interface IndependentHydrateRegistration {
	readonly load: () => Promise<Record<string, unknown>>;
	readonly loadStyles: (styles: readonly string[]) => void | Promise<void>;
	readonly signalOwner?: SignalOwner;
	readonly onError?: (error: unknown) => void;
}

export interface IndependentHydrateBootstrapOptions {
	/** Executing client build authority, not a value adopted from a sidecar. */
	readonly buildId?: string;
	readonly loadModule: (moduleId: string) => Promise<Record<string, unknown>>;
	readonly loadStyles: (styles: readonly string[]) => void | Promise<void>;
	readonly signalOwner?: SignalOwner;
	readonly onError?: (error: unknown) => void;
}

/**
 * Rebuild the built-in automatic strategy the server serialized for this
 * boundary. The lexical parent that evaluated `when` never runs here, so the
 * server encodes each strategy's `_p` parameters on the wrapper. `interaction` is
 * owned by pre-root capture and `never` stays inert; the server and compiler
 * reject `condition` and function-form `when` for independent boundaries.
 */
function automaticStrategy(element: Element, when: string | null): HydrationStrategy | null {
	if (when === 'idle') {
		const timeout = element.getAttribute(HYDRATE_IDLE_TIMEOUT_ATTR);
		return idle(timeout === null ? {} : { timeout: Number(timeout) });
	}
	if (when === 'visible') {
		const rootMargin = element.getAttribute(HYDRATE_VISIBLE_MARGIN_ATTR);
		const threshold = element.getAttribute(HYDRATE_VISIBLE_THRESHOLD_ATTR);
		return visible({
			...(rootMargin === null ? {} : { rootMargin }),
			...(threshold === null ? {} : { threshold: threshold.split(',').map(Number) }),
		});
	}
	if (when === 'media') return media(element.getAttribute(HYDRATE_MEDIA_ATTR) ?? '');
	return null;
}

export interface IndependentHydrateLifecycle {
	(): void;
	pause(): void;
	resume(): void;
}

/**
 * Register one compiler/bundler-proven island with the pre-root intent capture.
 * Loading this island never evaluates its lexical parent or a sibling module.
 */
export function registerIndependentHydrationIsland(
	element: Element,
	manifest: IndependentHydrateManifest,
	registration: IndependentHydrateRegistration,
): IndependentHydrateLifecycle {
	if (!isIndependentHydrateManifest(manifest)) {
		throw new TypeError('Invalid independent Hydrate manifest.');
	}
	if (element.getAttribute(HYDRATE_ID_ATTR) !== manifest.boundaryId) {
		throw new Error('Independent Hydrate boundary identity mismatch.');
	}
	element.setAttribute(HYDRATE_INDEPENDENT_ATTR, '');
	initializeIndependentHydrationEventCapture(element.ownerDocument);
	let generation = 0;
	let active = false;
	let hydrated = false;
	let replayReady = false;
	let disposed = false;
	let paused = false;
	let root: { unmount(): void } | undefined;
	const intents: HydrationReplayIntent[] = takePendingHydrationIntents(element) ?? [];
	const when = element.getAttribute(HYDRATE_WHEN_ATTR);
	const strategy = automaticStrategy(element, when);
	// A fired automatic strategy is a standing activation request, like a
	// retained intent: pause defers it and resume honors it without re-arming.
	let triggered = when === 'load';
	let disarm: void | (() => void);
	const fire = (): void => {
		triggered = true;
		disarm?.();
		disarm = undefined;
		activate();
	};
	const arm = (): void => {
		if (triggered || disarm !== undefined || strategy?._s === undefined) return;
		const cleanup = strategy._s({
			element,
			gate: { resolved: false, resolve: fire },
		});
		// A strategy may resolve synchronously (a matching query, no observer).
		if (triggered) cleanup?.();
		else disarm = cleanup ?? (() => {});
	};
	const unarm = (): void => {
		disarm?.();
		disarm = undefined;
	};
	const activate = (): void => {
		if (disposed || paused || active || hydrated) return;
		active = true;
		const attempt = ++generation;
		void Promise.resolve()
			.then(() => {
				if (!disposed && generation === attempt) return registration.loadStyles(manifest.styles);
			})
			.then(() => {
				if (!disposed && generation === attempt) return registration.load();
			})
			.then((module) => {
				if (disposed || generation !== attempt || module === undefined) return;
				const candidate = module[manifest.exportName];
				if (typeof candidate !== 'function') {
					throw new TypeError('Independent Hydrate activation export is not a function.');
				}
				replayReady = true;
				const replays = intents.splice(0);
				for (let index = replays.length - 1; index >= 0; index--) {
					if (!isHydrationSelectionIntentCurrent(replays[index])) replays.splice(index, 1);
				}
				return (candidate as IndependentHydrateActivator)({
					element,
					manifest,
					captures: manifest.captures.map((value) => decodeSignalValue(value)),
					intents: replays,
					...(registration.signalOwner === undefined
						? {}
						: { signalOwner: registration.signalOwner }),
				});
			})
			.then((value) => {
				if (disposed || generation !== attempt) {
					if (value && typeof value === 'object') value.unmount();
					return;
				}
				if (value && typeof value === 'object') root = value;
				hydrated = true;
				active = false;
			})
			.catch((error) => {
				if (disposed || generation !== attempt) return;
				active = false;
				replayReady = false;
				registration.onError?.(error);
			});
	};
	const boundary: HydrationIntentBoundary = (eventType, intent) => {
		if (hydrated || replayReady) return 'hydrated';
		if (disposed) return 'never';
		const status = hydrationMarkerInteractionStatus(element, eventType);
		if (status === 'never') return status;
		if (intent !== undefined) {
			appendHydrationReplayIntent(intents, intent);
			activate();
		}
		return status;
	};
	registerHydrationIntentBoundary(element, boundary);
	arm();
	if (intents.length !== 0 || triggered) activate();
	return Object.assign(
		() => {
			if (disposed) return;
			disposed = true;
			generation++;
			unarm();
			unregisterHydrationIntentBoundary(element, boundary);
			root?.unmount();
		},
		{
			pause() {
				if (disposed || paused) return;
				paused = true;
				unarm();
				// Once an activator has entered, its live DOM belongs to that root.
				// Freeze read work separately; do not unmount a persisted widget.
				if (!replayReady) {
					generation++;
					active = false;
				}
			},
			resume() {
				if (disposed || !paused) return;
				paused = false;
				arm();
				if (intents.length || triggered) activate();
			},
		},
	);
}

/**
 * Register every inert SSR sidecar before a parent root can claim its DOM.
 * Module resolution is host-owned so a bundler can map exact emitted chunk IDs
 * without retaining the lexical parent module.
 */
export function bootstrapIndependentHydration(
	root: ParentNode,
	options: IndependentHydrateBootstrapOptions,
): IndependentHydrateLifecycle {
	const cleanups = new Map<Element, IndependentHydrateLifecycle>();
	const selector = `script[type="application/json"][${INDEPENDENT_HYDRATE_MANIFEST_ATTR}]`;
	const ownerDocument = root.nodeType === 9 ? (root as Document) : root.ownerDocument!;
	initializeIndependentHydrationEventCapture(ownerDocument);
	let disposed = false;
	let paused = false;
	const register = (sidecar: Element, documentComplete = false): void => {
		if (
			disposed ||
			paused ||
			!root.contains(sidecar) ||
			(!documentComplete && !sidecar.textContent)
		)
			return;
		try {
			let manifest: unknown;
			try {
				manifest = JSON.parse(sidecar.textContent || 'null') as unknown;
			} catch (error) {
				// The HTML parser exposes script text incrementally across network
				// chunks. Retry on text changes, then report malformed JSON at EOF.
				if (!documentComplete && ownerDocument.readyState === 'loading') return;
				throw error;
			}
			if (!isIndependentHydrateManifest(manifest)) {
				throw new TypeError('Invalid independent Hydrate sidecar.');
			}
			if (options.buildId !== undefined && manifest.buildId !== options.buildId) {
				throw new Error('Independent Hydrate build identity mismatch.');
			}
			const element = sidecar.parentElement;
			if (element === null) throw new Error('Independent Hydrate sidecar has no boundary.');
			if (cleanups.has(element))
				throw new Error('Independent Hydrate boundary already registered.');
			cleanups.set(
				element,
				registerIndependentHydrationIsland(element, manifest, {
					load: () => options.loadModule(manifest.moduleId),
					loadStyles: options.loadStyles,
					...(options.signalOwner === undefined ? {} : { signalOwner: options.signalOwner }),
					...(options.onError === undefined ? {} : { onError: options.onError }),
				}),
			);
			sidecar.remove();
		} catch (error) {
			options.onError?.(error);
		}
	};
	const scan = (node: Node): void => {
		if (node.nodeType !== 1) return;
		const element = node as Element;
		if (element.matches(selector)) register(element);
		else for (const sidecar of element.querySelectorAll(selector)) register(sidecar);
	};
	// Pay for observation only in the independent bootstrap. Streaming can add a
	// sidecar after its boundary (and its first interaction) is already visible.
	const observer = new (ownerDocument.defaultView?.MutationObserver ?? MutationObserver)(
		(records) => {
			if (disposed || paused) return;
			let removedBoundary = false;
			for (const record of records) {
				if (record.type === 'characterData') {
					const parent = record.target.parentElement;
					if (parent?.matches(selector)) register(parent);
					continue;
				}
				if (record.target.nodeType === 1 && (record.target as Element).matches(selector)) {
					register(record.target as Element);
				}
				for (const node of record.addedNodes) scan(node);
				for (const node of record.removedNodes) {
					if (node.nodeType === 1 && !(node as Element).matches(selector)) removedBoundary = true;
				}
			}
			if (removedBoundary) {
				for (const [element, cleanup] of cleanups) {
					// Moving within the same scope preserves the live island and its state.
					if (root.contains(element)) continue;
					cleanups.delete(element);
					cleanup();
				}
			}
		},
	);
	observer.observe(root, { childList: true, subtree: true, characterData: true });
	const complete = (): void => {
		for (const sidecar of root.querySelectorAll(selector)) register(sidecar, true);
	};
	if (ownerDocument.readyState === 'loading') {
		ownerDocument.addEventListener('DOMContentLoaded', complete, { once: true });
	}
	for (const sidecar of root.querySelectorAll(selector)) register(sidecar);
	return Object.assign(
		() => {
			if (disposed) return;
			disposed = true;
			observer.disconnect();
			ownerDocument.removeEventListener('DOMContentLoaded', complete);
			for (const cleanup of cleanups.values()) cleanup();
			cleanups.clear();
		},
		{
			pause() {
				if (disposed || paused) return;
				paused = true;
				observer.disconnect();
				for (const cleanup of cleanups.values()) cleanup.pause();
			},
			resume() {
				if (disposed || !paused) return;
				paused = false;
				for (const [element, cleanup] of cleanups) {
					if (root.contains(element)) cleanup.resume();
					else {
						cleanup();
						cleanups.delete(element);
					}
				}
				observer.observe(root, { childList: true, subtree: true, characterData: true });
				for (const sidecar of root.querySelectorAll(selector))
					register(sidecar, ownerDocument.readyState !== 'loading');
			},
		},
	);
}
