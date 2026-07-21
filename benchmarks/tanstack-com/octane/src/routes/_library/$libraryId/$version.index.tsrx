import { createFileRoute, notFound, redirect } from '@octanejs/tanstack-router';
import { findLibrary } from '~/libraries';
import { validateLibraryVersion } from '../../-library-landing';

export const Route = createFileRoute('/_library/$libraryId/$version/')({
	beforeLoad: ({ params, location }) => {
		const library = findLibrary(params.libraryId);

		if (!library) {
			throw notFound();
		}

		library.handleRedirects?.(location.href);

		validateLibraryVersion(library.id, params.version, () => {
			throw redirect({ href: `/${library.id}/latest` });
		});

		redirectToStaticLanding(library.id, params.version);
	},
});

function redirectToStaticLanding(libraryId: string, version: string) {
	switch (libraryId) {
		case 'ai':
			throw redirect({ to: '/ai/$version', params: { version } });
		case 'cli':
			throw redirect({ to: '/cli/$version', params: { version } });
		case 'config':
			throw redirect({ to: '/config/$version', params: { version } });
		case 'db':
			throw redirect({ to: '/db/$version', params: { version } });
		case 'devtools':
			throw redirect({ to: '/devtools/$version', params: { version } });
		case 'form':
			throw redirect({ to: '/form/$version', params: { version } });
		case 'hotkeys':
			throw redirect({ to: '/hotkeys/$version', params: { version } });
		case 'intent':
			throw redirect({ to: '/intent/$version', params: { version } });
		case 'pacer':
			throw redirect({ to: '/pacer/$version', params: { version } });
		case 'query':
			throw redirect({ to: '/query/$version', params: { version } });
		case 'ranger':
			throw redirect({ to: '/ranger/$version', params: { version } });
		case 'router':
			throw redirect({ to: '/router/$version', params: { version } });
		case 'start':
			throw redirect({ to: '/start/$version', params: { version } });
		case 'store':
			throw redirect({ to: '/store/$version', params: { version } });
		case 'table':
			throw redirect({ to: '/table/$version', params: { version } });
		case 'virtual':
			throw redirect({ to: '/virtual/$version', params: { version } });
		case 'workflow':
			throw redirect({ to: '/workflow/$version', params: { version } });
		default:
			throw notFound();
	}
}
