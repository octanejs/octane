/**
 * The demo's network faults, and the log of what reached the network, for one
 * account. Whatever makes an account's requests applies the faults: a page's
 * own store in its transport, or the account's data worker in its own. The
 * worker and the account's pages tell each other about the faults and each
 * request on a BroadcastChannel, so the switches and the Network panel act
 * wherever the requests are made.
 */
import type { DataRequest, Transport } from 'octane/data';

export interface Faults {
	/** Deliver the next write, then lose its reply. */
	readonly dropNextReply: boolean;
	/** Fail every request before it is sent. */
	readonly offline: boolean;
}

export const NO_FAULTS: Faults = { dropNextReply: false, offline: false };

/** What an account's pages and its data worker tell each other. */
export type FaultMessage =
	/** A page asks for the faults the worker applies. */
	| { readonly t: 'ask' }
	/** A page turned a switch. */
	| { readonly t: 'set'; readonly faults: Faults }
	/** The faults the worker applies from now on. */
	| { readonly t: 'faults'; readonly faults: Faults }
	/** The worker sent a request. */
	| { readonly t: 'sent'; readonly label: string };

export function faultChannel(partition: string): BroadcastChannel {
	return new BroadcastChannel(`shelf-faults:${partition}`);
}

/** A request as the Network panel lists it. */
export function describe(request: DataRequest): string {
	const count = request.refresh?.length ?? 0;
	const refreshed = count === 0 ? '' : ` + ${count} read${count === 1 ? '' : 's'} back`;
	return `${request.kind} ${request.name}${refreshed}`;
}

/** `call`, with `faults` applied, reporting each request it sends to `sent`. */
export function withFaults(
	call: Transport,
	faults: { get(): Faults; set(next: Faults): void },
	sent: (label: string) => void,
): Transport {
	return async (request, signal) => {
		if (faults.get().offline) throw new Error('offline');
		sent(describe(request));
		const reply = await call(request, signal);
		if (request.kind === 'write' && faults.get().dropNextReply) {
			faults.set({ ...faults.get(), dropNextReply: false });
			throw new Error('connection reset after the server replied');
		}
		return reply;
	};
}
