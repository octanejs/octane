/**
 * Background-thread receiver for native `bind*`/`catch*` events.
 *
 * `__AddEvent` installs an opaque Octane token as the handler for an element,
 * and the engine resolves that token by calling `lynxCoreInject.tt.publishEvent`
 * on the **background** thread. It never routes an ordinary background event
 * through main-thread JavaScript. Without this receiver the tokens are
 * installed correctly and every tap is dropped, which is exactly what an
 * application sees as "clicks do nothing".
 *
 * `lynxCoreInject` is a private core injection rather than a public API, so
 * this module is written defensively: it chains any previously installed
 * receiver, refuses to claim a token it does not own, and never lets a
 * framework error escape into the engine's dispatch.
 */
import { readLynxCoreInject, type LynxCoreInject } from './environment.js';
import {
	decodeLynxNativeEventToken,
	snapshotLynxNativeEventPayload,
	type LynxNativeEventPayloadSnapshot,
	type LynxNativeEventTokenIdentity,
} from './native-events.js';

/** One decoded native delivery bound for a background listener. */
export interface LynxBackgroundNativeEventDelivery {
	readonly identity: LynxNativeEventTokenIdentity;
	readonly payload: LynxNativeEventPayloadSnapshot;
}

export interface LynxNativeEventSink {
	/**
	 * Whether this sink owns the transport root named by a token. A root id is
	 * only known once main accepts a commit, so ownership is asked at delivery
	 * time rather than recorded at installation.
	 */
	claims(root: number): boolean;
	/** Deliver one native propagation path as a single background event scope. */
	deliver(deliveries: readonly LynxBackgroundNativeEventDelivery[]): void;
	report(error: Error): void;
	/** Scheduler used to coalesce one propagation path. */
	scheduleMicrotask(callback: () => void): void;
}

type EngineEventHandler = (handler: unknown, event: unknown) => unknown;

interface EngineEventTarget {
	publishEvent?: EngineEventHandler;
	publicComponentEvent?: (componentId: unknown, handler: unknown, event: unknown) => unknown;
}

const sinks = new Set<LynxNativeEventSink>();
const installations = new Map<
	EngineEventTarget,
	{
		count: number;
		readonly previousPublish: EngineEventHandler | undefined;
		readonly previousComponent: EngineEventTarget['publicComponentEvent'];
		readonly publish: EngineEventHandler;
		readonly component: NonNullable<EngineEventTarget['publicComponentEvent']>;
	}
>();

function engineTarget(target: object): EngineEventTarget {
	// An explicit host that already carries the injection owns it; this is how a
	// test or benchmark keeps its engine hooks off the global object. Otherwise
	// resolve the ambient injection, which under the official Rspeedy wrapper is
	// a lexical binding rather than a property of the root's background globals.
	const explicit = (target as { lynxCoreInject?: LynxCoreInject }).lynxCoreInject;
	const core = explicit ?? readLynxCoreInject();
	return (core.tt ??= {}) as EngineEventTarget;
}

/**
 * Coalesce the synchronous burst of `publishEvent` calls the engine makes while
 * walking one propagation path, so a tap that reaches a `catch` handler and its
 * ancestors produces a single Octane event scope rather than one per listener.
 */
function createPathBuffer(
	sink: LynxNativeEventSink,
): (delivery: LynxBackgroundNativeEventDelivery) => void {
	let pending: LynxBackgroundNativeEventDelivery[] | null = null;
	const flush = (): void => {
		const deliveries = pending;
		pending = null;
		if (deliveries === null || deliveries.length === 0) return;
		try {
			sink.deliver(deliveries);
		} catch (error) {
			sink.report(
				error instanceof Error ? error : new Error('Octane Lynx native event delivery failed.'),
			);
		}
	};
	return (delivery) => {
		if (pending !== null) {
			// A propagation path is one scope only while its listeners agree on a
			// priority. The transported message requires a single priority, so a
			// mixed path is split rather than rejected.
			if (pending[0]!.identity.priority === delivery.identity.priority) {
				pending.push(delivery);
				return;
			}
			flush();
		}
		pending = [delivery];
		sink.scheduleMicrotask(flush);
	};
}

const buffers = new WeakMap<LynxNativeEventSink, (d: LynxBackgroundNativeEventDelivery) => void>();

function routeToken(handler: unknown, event: unknown): boolean {
	if (typeof handler !== 'string' || !handler.startsWith('octane-lynx:event:')) return false;
	let identity: LynxNativeEventTokenIdentity;
	try {
		identity = decodeLynxNativeEventToken(handler);
	} catch {
		// A malformed token in our own namespace is ours to diagnose, but there is
		// no root to attribute it to, so it cannot be reported anywhere better.
		return false;
	}
	let sink: LynxNativeEventSink | undefined;
	for (const candidate of sinks) {
		if (candidate.claims(identity.root)) {
			sink = candidate;
			break;
		}
	}
	if (sink === undefined) return false;
	try {
		const payload = snapshotLynxNativeEventPayload(event);
		buffers.get(sink)!({ identity, payload });
	} catch (error) {
		sink.report(
			error instanceof Error ? error : new Error('Octane Lynx could not snapshot a native event.'),
		);
	}
	return true;
}

/**
 * Claim `publishEvent`/`publicComponentEvent` for one background root.
 *
 * Returns the uninstaller. The engine hooks are shared, so they are installed
 * once per target and released when the last root using them goes away.
 */
export function installLynxNativeEventReceiver(
	target: object,
	sink: LynxNativeEventSink,
): () => void {
	if (sinks.has(sink)) throw new Error('Octane Lynx native event sink is already installed.');
	const engine = engineTarget(target);
	sinks.add(sink);
	buffers.set(sink, createPathBuffer(sink));
	let installation = installations.get(engine);
	if (installation === undefined) {
		const previousPublish = engine.publishEvent;
		const previousComponent = engine.publicComponentEvent;
		const publish: EngineEventHandler = (handler, event) => {
			if (routeToken(handler, event)) return undefined;
			return previousPublish?.(handler, event);
		};
		const component: NonNullable<EngineEventTarget['publicComponentEvent']> = (
			componentId,
			handler,
			event,
		) => {
			if (routeToken(handler, event)) return undefined;
			return previousComponent?.(componentId, handler, event);
		};
		installation = { count: 0, previousPublish, previousComponent, publish, component };
		installations.set(engine, installation);
		engine.publishEvent = publish;
		engine.publicComponentEvent = component;
	}
	installation.count++;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		sinks.delete(sink);
		buffers.delete(sink);
		const current = installations.get(engine);
		if (current === undefined) return;
		current.count--;
		if (current.count !== 0) return;
		installations.delete(engine);
		// Only restore hooks this module still owns: a later installer may have
		// wrapped them, and clobbering that would be worse than leaving ours in
		// place, where it is inert once the last sink is gone.
		if (engine.publishEvent === current.publish) engine.publishEvent = current.previousPublish;
		if (engine.publicComponentEvent === current.component) {
			engine.publicComponentEvent = current.previousComponent;
		}
	};
}
