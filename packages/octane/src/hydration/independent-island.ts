import { formatClientError } from '../error-codes.client.generated.js';
import { decodeSignalValue } from '../data-encoding.js';
import type { ScopeSeed, SignalOwner, SignalRendererOwnerIdentity } from '../signals/types.js';
import { captureInitialDocumentSignals } from '../signals/native-read-seeds.js';
import {
	HYDRATE_ID_ATTR,
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
	heldHydrationReplays,
	hydrationMarkerInteractionStatus,
	initializeIndependentHydrationEventCapture,
	isHydrationSelectionIntentCurrent,
	isNativeHydrationIntentCurrent,
	registerHydrationIntentBoundary,
	takePendingHydrationIntents,
	unregisterHydrationIntentBoundary,
	type HydrationIntentBoundary,
	type HydrationReplayIntent,
} from './event-capture.js';
import { isHydrationLifecycleEvent } from './interaction-config.js';
import type { HydrationStrategy } from './types.js';

export interface IndependentHydrateActivationContext {
	readonly element: Element;
	readonly manifest: IndependentHydrateManifest;
	readonly captures: readonly unknown[];
	readonly intents: readonly HydrationReplayIntent[];
	readonly signalOwner?: SignalOwner;
	/** Initial document history shared with the matching server renderer. */
	readonly initialDocumentSignals?: ScopeSeed;
}

export type IndependentHydrateActivator = (
	context: IndependentHydrateActivationContext,
) => void | { unmount(): void } | Promise<void | { unmount(): void }>;

/**
 * Rebuilds each automatic strategy an independent wrapper can serialize, from
 * that wrapper's attributes. `octane/hydration/independent-strategies` exports
 * the built-in implementation.
 */
export type IndependentHydrateStrategies = Readonly<
	Record<'idle' | 'visible' | 'media', (element: Element) => HydrationStrategy>
>;

export interface IndependentHydrateRegistration {
	readonly load: () => Promise<Record<string, unknown>>;
	readonly loadStyles: (styles: readonly string[]) => void | Promise<void>;
	/**
	 * Arms an `idle`, `visible` or `media` trigger during registration. When it is
	 * omitted, such an island loads the built-in strategies and arms once they
	 * resolve, so a page without such islands never ships them.
	 */
	readonly strategies?: IndependentHydrateStrategies;
	readonly signalOwner?: SignalOwner;
	/** Initial document history shared with the matching server renderer. */
	readonly initialDocumentSignals?: ScopeSeed;
	readonly onError?: (error: unknown) => void;
}

export interface IndependentHydrateBootstrapOptions {
	/** Executing client build authority, not a value adopted from a sidecar. */
	readonly buildId?: string;
	readonly loadModule: (moduleId: string) => Promise<Record<string, unknown>>;
	readonly loadStyles: (styles: readonly string[]) => void | Promise<void>;
	/** See {@link IndependentHydrateRegistration.strategies}. */
	readonly strategies?: IndependentHydrateStrategies;
	readonly signalOwner?: SignalOwner;
	/** Initial document history shared with the matching server renderer. */
	readonly initialDocumentSignals?: ScopeSeed;
	readonly onError?: (error: unknown) => void;
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
		throw new TypeError(formatClientError(215));
	}
	if (element.getAttribute(HYDRATE_ID_ATTR) !== manifest.boundaryId) {
		throw new Error(formatClientError(216));
	}
	const { load, loadStyles, strategies, signalOwner, onError } = registration;
	let initialDocumentSignals =
		registration.initialDocumentSignals === undefined
			? undefined
			: captureInitialDocumentSignals(
					registration.initialDocumentSignals,
					((signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner)
						?.scopeKey ?? 'octane:document',
				);
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
	// `interaction` is owned by pre-root capture and `never` stays inert; the
	// server and compiler reject `condition` and function-form `when` here.
	const automatic = when === 'idle' || when === 'visible' || when === 'media';
	let strategy = automatic ? strategies?.[when](element) : undefined;
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
				if (!disposed && generation === attempt) return loadStyles(manifest.styles);
			})
			.then(() => {
				if (!disposed && generation === attempt) return load();
			})
			.then((module) => {
				if (disposed || generation !== attempt || module === undefined) return;
				const candidate = module[manifest.exportName];
				if (typeof candidate !== 'function') {
					throw new TypeError(formatClientError(217));
				}
				const replays = intents.splice(0);
				const nativeAuthority =
					replays.length !== 0 && replays.every((intent) => intent.current !== undefined);
				for (let index = replays.length - 1; index >= 0; index--) {
					if (
						!isHydrationSelectionIntentCurrent(replays[index]) ||
						!isNativeHydrationIntentCurrent(replays[index])
					)
						replays.splice(index, 1);
				}
				// An expired native command cannot complete activation or retire the
				// island. Automatic triggers and ordinary selection behavior remain
				// independent; a future valid command can start another attempt.
				if (nativeAuthority && replays.length === 0 && !triggered) {
					active = false;
					return;
				}
				replayReady = true;
				return (candidate as IndependentHydrateActivator)({
					element,
					manifest,
					captures: manifest.captures.map((value) => decodeSignalValue(value)),
					intents: replays,
					...(signalOwner === undefined ? {} : { signalOwner }),
					...(initialDocumentSignals === undefined ? {} : { initialDocumentSignals }),
				});
			})
			.then((value) => {
				if (disposed || generation !== attempt) {
					if (value && typeof value === 'object') value.unmount();
					return;
				}
				if (!active) return;
				if (value && typeof value === 'object') root = value;
				hydrated = true;
				active = false;
			})
			.catch((error) => {
				if (disposed || generation !== attempt) return;
				active = false;
				replayReady = false;
				onError?.(error);
			});
	};
	const boundary: HydrationIntentBoundary = (eventType, intent) => {
		// An activated island still captures while its activator owes replays, so
		// later input queues behind them instead of overtaking them.
		const queue = hydrated || replayReady ? heldHydrationReplays(element) : intents;
		if (queue === null) return 'hydrated';
		if (disposed) return 'never';
		const status = hydrationMarkerInteractionStatus(element, eventType);
		if (status === 'never') return status;
		if (intent !== undefined) {
			// A held queue already carries the captured press its activator owes.
			if (queue !== intents) appendHydrationReplayIntent(queue, intent);
			// Pointer movement and cancellation extend a loading or retained press;
			// they never start or retry activation themselves.
			else if (!isHydrationLifecycleEvent(eventType)) {
				appendHydrationReplayIntent(intents, intent);
				activate();
			} else if (active || intents.length !== 0) {
				appendHydrationReplayIntent(intents, intent);
			}
		}
		return status;
	};
	registerHydrationIntentBoundary(element, boundary);
	arm();
	if (automatic && !strategies) {
		// Most islands pages never need the strategies, so they load on demand. Arm
		// once they resolve, unless disposed; resume arms a paused island. A failed
		// load or arm reports like one during registration would have.
		import('./independent-strategies.js')
			.then((module) => {
				if (disposed) return;
				strategy = module.independentHydrationStrategies[when](element);
				if (!paused) arm();
			})
			.catch((error) => {
				if (!disposed) onError?.(error);
			});
	}
	if (intents.length !== 0 || triggered) activate();
	return Object.assign(
		() => {
			if (disposed) return;
			disposed = true;
			generation++;
			initialDocumentSignals = undefined;
			unarm();
			unregisterHydrationIntentBoundary(element, boundary);
			const activatedRoot = root;
			root = undefined;
			activatedRoot?.unmount();
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
	const { buildId, loadModule, loadStyles, strategies, signalOwner, onError } = options;
	let initialDocumentSignals =
		options.initialDocumentSignals === undefined
			? undefined
			: captureInitialDocumentSignals(
					options.initialDocumentSignals,
					((signalOwner as SignalRendererOwnerIdentity | undefined)?.documentOwner ?? signalOwner)
						?.scopeKey ?? 'octane:document',
				);
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
				throw new TypeError(formatClientError(218));
			}
			if (buildId !== undefined && manifest.buildId !== buildId) {
				throw new Error(formatClientError(219));
			}
			const element = sidecar.parentElement;
			if (element === null) throw new Error(formatClientError(220));
			if (cleanups.has(element)) throw new Error(formatClientError(221));
			cleanups.set(
				element,
				registerIndependentHydrationIsland(element, manifest, {
					load: () => loadModule(manifest.moduleId),
					loadStyles,
					...(strategies === undefined ? {} : { strategies }),
					...(signalOwner === undefined ? {} : { signalOwner }),
					...(initialDocumentSignals === undefined ? {} : { initialDocumentSignals }),
					...(onError === undefined ? {} : { onError }),
				}),
			);
			sidecar.remove();
		} catch (error) {
			onError?.(error);
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
			initialDocumentSignals = undefined;
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
