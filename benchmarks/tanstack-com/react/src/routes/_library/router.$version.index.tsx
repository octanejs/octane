import { createFileRoute } from '@tanstack/react-router';
import RouterLanding from '~/components/landing/RouterLanding';
import {
	LibraryNavbarTitle,
	beforeLoadLibraryLanding,
	getLibraryLandingHead,
	getLibraryLandingHeaders,
	libraryLandingStaleTime,
	loadLibraryLandingRouteData,
} from '../-library-landing-route';

export const Route = createFileRoute('/_library/router/$version/')({
	staleTime: libraryLandingStaleTime,
	beforeLoad: ({ params, location }) => {
		beforeLoadLibraryLanding('router', params.version, location.href);
	},
	loader: ({ params, context: { queryClient } }) =>
		loadLibraryLandingRouteData('router', params.version, queryClient),
	head: () => getLibraryLandingHead('router'),
	headers: () => getLibraryLandingHeaders('router'),
	staticData: {
		Title: RouterNavbarTitle,
	},
	component: RouterLandingRoute,
});

function RouterNavbarTitle() {
	return <LibraryNavbarTitle libraryId="router" />;
}

function RouterLandingRoute() {
	return <RouterLanding />;
}
