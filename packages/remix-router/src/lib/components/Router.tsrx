'use strong';

// Router — transcribed from react-router@8.2.0 lib/components.tsx. The
// low-level context provider every router variant renders through.
import {
	startTransition,
	useCallback,
	useLayoutEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from 'octane';
import type { OctaneNode } from 'octane';
import { LocationContext, NavigationContext } from '../context.ts';
import type { Navigator } from '../context.ts';
import { Action as NavigationType, invariant, parsePath, warning } from '../router/history.ts';
import type { History, Location, Update } from '../router/history.ts';
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

// A router owns the same History for its lifetime. Location changes are
// subscribed in layout below so they can still run in a transition.
const unsubscribe = () => {};
const subscribeToIdentity = () => unsubscribe;

export function useOwnedHistoryNavigation(
	ref: { readonly current: History },
	useTransitions?: boolean,
) {
	const getHistory = () => ref.current;
	const history = useSyncExternalStore(subscribeToIdentity, getHistory, getHistory);
	return useHistoryNavigation(history, useTransitions);
}

// Replacing a caller-supplied history must resubscribe even when it shares
// its listen function with the previous instance.
function listenToHistory(history: History, onChange: (update: Update) => void) {
	return history.listen(onChange);
}

export function useHistoryNavigation(history: History, useTransitions?: boolean) {
	const [state, setState] = useState(() => ({
		action: history.action,
		location: history.location,
	}));
	const onChange = useCallback((update: Update) => {
		if (useTransitions === false) {
			setState(update);
		} else {
			startTransition(() => setState(update));
		}
	});
	useLayoutEffect(() => listenToHistory(history, onChange));

	return { navigator: history, location: state.location, navigationType: state.action };
}

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
		<NavigationContext value={navigationContext}>
			<LocationContext value={locationContext}>{children}</LocationContext>
		</NavigationContext>
	}
}
