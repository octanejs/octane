import { createServerEntry } from '@octanejs/tanstack-start/server-entry';

// Load Start's registry independently from the isolated router registry.
import type { Register as StartRegister } from '@octanejs/tanstack-start';

declare module '@octanejs/tanstack-start' {
	interface Register {
		server: {
			requestContext: {
				requestId: string;
			};
		};
	}
}

const entry = createServerEntry({
	async fetch(_request, options) {
		const requestId: string = options.context.requestId;
		return new Response(requestId);
	},
});

entry.fetch(new Request('https://example.test'), {
	context: { requestId: 'request-1' },
});

// @ts-expect-error registered request context makes options mandatory
entry.fetch(new Request('https://example.test'));
