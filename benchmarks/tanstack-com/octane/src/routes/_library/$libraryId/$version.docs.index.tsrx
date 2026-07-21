import { redirect, createFileRoute } from '@octanejs/tanstack-router';
import { getLibrary } from '~/libraries';

export const Route = createFileRoute('/_library/$libraryId/$version/docs/')({
	beforeLoad: (ctx) => {
		const { libraryId } = ctx.params;
		const library = getLibrary(libraryId);

		throw redirect({
			from: '/$libraryId/$version/docs',
			to: './$',
			params: {
				_splat: 'defaultDocs' in library ? library.defaultDocs : 'overview',
			},
		});
	},
});
