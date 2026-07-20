import { createFileRoute, notFound } from '@octanejs/tanstack-router';
import { ErrorCodeDecoder } from '../pages/error-codes/ErrorCodes.tsrx';

export const Route = createFileRoute('/errors/$code')({
	beforeLoad: async ({ params }) => {
		// Route definitions are part of the initial router graph even when their
		// components are split. Load the catalog only after this route matches so
		// the decoder's messages never inflate unrelated page bundles.
		const { findErrorCode } = await import('../content/error-codes.ts');
		if (!findErrorCode(params.code)) throw notFound();
	},
	component: ErrorCodeDecoder,
});
