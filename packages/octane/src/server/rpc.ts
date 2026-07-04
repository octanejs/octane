import * as devalue from 'devalue';

/**
 * Execute a `module server` function for an RPC request. The wire format is
 * devalue on both sides (matching @ripple-ts/adapter's client stub, and chosen
 * over JSON so Dates/Maps/Sets/undefined/cycles round-trip): the request body
 * is a devalue-encoded argument array, the response a devalue-encoded
 * `{ value }` envelope. The metaframework loads this through the SSR module
 * graph (`ssrLoadModule('octane/server')`) so the executor and the resolved
 * server function share one runtime.
 */
export async function executeServerFunction(
	fn: (...args: any[]) => unknown,
	body: string,
): Promise<string> {
	const args = devalue.parse(body);
	const value = await fn.apply(null, args);
	return devalue.stringify({ value });
}
