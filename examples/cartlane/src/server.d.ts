/**
 * Type surface for the file-local `module server` boundary declared in
 * `App.tsrx`. The Octane compiler resolves `import { placeOrder } from
 * 'server'` itself — client builds receive an RPC stub and server builds the
 * real function — so this ambient module exists only for the TypeScript
 * program; it never runs.
 */
declare module 'server' {
	import type { CheckoutRequest, CheckoutState } from './domain.ts';

	/**
	 * The submitted cart crosses the RPC boundary as parsed-but-unverified
	 * JSON; `commitOrder` re-verifies it server-side.
	 */
	export function placeOrder(
		request: Omit<CheckoutRequest, 'lines'> & { lines: unknown },
	): Promise<CheckoutState>;
}
