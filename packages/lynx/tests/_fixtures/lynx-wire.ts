/**
 * The wire, as a test has to see it.
 *
 * Once the transport owns encoding, the `data` crossing a `ContextProxy` is a
 * string. So a test standing in for the other thread has to put a string on the
 * wire, and a test reading what Octane sent has to take one off — the same two
 * operations the real receiver performs, which is what keeps the harness an
 * honest stand-in rather than a private channel with looser rules.
 *
 * The encoding rules themselves live in `src/core/transport-codec.ts` and are
 * proved there. What lives here is the two directions, named for the role the
 * test is playing, and the conforming proxy that refuses anything else.
 */
import {
	decodeLynxTransportValue,
	encodeLynxTransportValue,
} from '../../src/core/transport-codec.js';
import type { LynxContextProxy, LynxContextProxyEvent } from '../../src/core/protocol.js';

/** What the other thread's transport would have put on the wire. */
export function wire(message: unknown): string {
	return encodeLynxTransportValue(message);
}

/**
 * What the other thread's receiver takes off the wire.
 *
 * This throws on anything that is not this codec's output, so every test that
 * reads a message is also asserting that a string was what crossed. That is
 * most of the suite's coverage of the boundary, and it is why the conforming
 * proxy below only has to add the sends nobody reads.
 */
export function unwire(data: unknown): unknown {
	return decodeLynxTransportValue(data);
}

/** What a conforming proxy observed, so a run cannot pass by doing nothing. */
export interface LynxWireConformance {
	/** Payloads that crossed, in order, as they appeared on the wire. */
	readonly crossings: string[];
	/** Total bytes those payloads occupied. */
	bytes(): number;
}

/**
 * Wrap a `ContextProxy` so that nothing can cross it except this codec's
 * output, and record what did.
 *
 * The proposition this pins is deliberately platform-independent: **the
 * transport hands the receiver only receiver-local ordinary values.** It is not
 * "`Reflect.ownKeys` throws on a bridged value" — that is one engine's symptom,
 * reproducible only on a device, and a harness that simulated it would be
 * asserting the symptom rather than the rule. A string cannot be a host-backed
 * reference on any engine, so once every payload is a string the property holds
 * by construction rather than by inspection.
 */
export function conformingContextProxy(delegate: LynxContextProxy): {
	readonly context: LynxContextProxy;
	readonly conformance: LynxWireConformance;
} {
	const crossings: string[] = [];
	const conformance: LynxWireConformance = {
		crossings,
		bytes: () => crossings.reduce((total, payload) => total + payload.length, 0),
	};
	const context: LynxContextProxy = {
		dispatchEvent(event: LynxContextProxyEvent): unknown {
			if (typeof event.data !== 'string') {
				throw new TypeError(
					`Octane Lynx sent ${event.data === null ? 'null' : typeof event.data} on "${event.type}" where the wire carries a string. An unencoded value is a live composite, and on device that can be a host-backed reference the receiver must never reflect on.`,
				);
			}
			// Decoding here is the strict half: a string that is not this codec's
			// output would still be receiver-local, but it would mean a sender
			// bypassed the transport, which is the same defect one step later.
			decodeLynxTransportValue(event.data);
			crossings.push(event.data);
			return delegate.dispatchEvent(event);
		},
		addEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
			delegate.addEventListener(type, listener);
		},
		removeEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
			delegate.removeEventListener(type, listener);
		},
	};
	return { context, conformance };
}
