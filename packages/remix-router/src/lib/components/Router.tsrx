// Router — transcribed from react-router@8.2.0 lib/components.tsx. The
// low-level context provider every router variant renders through.
import { useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import { LocationContext, NavigationContext } from '../context.ts';
import type { Navigator } from '../context.ts';
import { Action as NavigationType, invariant, parsePath, warning } from '../router/history.ts';
import type { Location } from '../router/history.ts';
import { stripBasename } from '../router/utils.ts';
import { useInRouterContext } from '../hooks.ts';

type RouterProps = {
	basename?: string;
	children?: OctaneNode;
	location: Partial<Location> | string;
	navigationType?: NavigationType;
	navigator: Navigator;
	static?: boolean;
	useTransitions?: boolean;
};

export function Router(props: RouterProps) @{
	const {
		basename: basenameProp = '/',
		children = null,
		location: locationPropIn,
		navigationType = NavigationType.Pop,
		navigator,
		static: staticProp = false,
		useTransitions,
	} = props;

	invariant(
		!useInRouterContext(),
		`You cannot render a <Router> inside another <Router>.` +
			` You should never have more than one in your app.`,
	);

	// Preserve trailing slashes on basename, so we can let the user control
	// the enforcement of trailing slashes throughout the app
	const basename = basenameProp.replace(/^\/*/, '/');
	const navigationContext = useMemo(
		() => ({
			basename,
			navigator,
			static: staticProp,
			useTransitions,
			future: {},
		}),
		[basename, navigator, staticProp, useTransitions],
	);

	let locationProp = locationPropIn;
	if (typeof locationProp === 'string') {
		locationProp = parsePath(locationProp);
	}

	const {
		pathname = '/',
		search = '',
		hash = '',
		state = null,
		key = 'default',
		mask,
	} = locationProp;

	const locationContext = useMemo(() => {
		const trailingPathname = stripBasename(pathname, basename);

		if (trailingPathname == null) {
			return null;
		}

		return {
			location: {
				pathname: trailingPathname,
				search,
				hash,
				state,
				key,
				mask,
			},
			navigationType,
		};
	}, [basename, pathname, search, hash, state, key, navigationType, mask]);

	warning(
		locationContext != null,
		`<Router basename="${basename}"> is not able to match the URL ` +
			`"${pathname}${search}${hash}" because it does not start with the ` +
			`basename, so the <Router> won't render anything.`,
	);

	@if (locationContext == null) {
		<></>
	} @else {
		<NavigationContext.Provider value={navigationContext}>
			<LocationContext.Provider value={locationContext}>{children}</LocationContext.Provider>
		</NavigationContext.Provider>
	}
}
