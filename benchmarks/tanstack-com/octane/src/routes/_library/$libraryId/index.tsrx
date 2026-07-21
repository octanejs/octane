import { redirect, createFileRoute } from '@octanejs/tanstack-router';

export const Route = createFileRoute('/_library/$libraryId/')({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: '/$libraryId/$version',
			params: { libraryId: params.libraryId, version: 'latest' } as never,
		});
	},
});
