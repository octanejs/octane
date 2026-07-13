import * as devalue from 'devalue';

/**
 * Compiler target for browser calls to a `module server` export.
 * @internal
 */
export async function __serverRpc(hash: string, args: unknown[]): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch('/_$_ripple_rpc_$_/' + hash, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: devalue.stringify(args),
		});
	} catch {
		throw new Error('An error occurred while trying to call the Octane server function.');
	}

	if (!response.ok) {
		let message = `Server function call failed with status ${response.status}`;
		const body = await response.text().catch(() => '');
		if (body) {
			try {
				const parsed = JSON.parse(body);
				message = typeof parsed?.error === 'string' && parsed.error ? parsed.error : body;
			} catch {
				message = body;
			}
		}
		throw new Error(message);
	}

	const body = await response.text();
	if (body === '') {
		throw new Error(
			'The server function endpoint returned an empty response. Is the Octane server running?',
		);
	}
	return devalue.parse(body).value;
}
