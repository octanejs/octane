// Navigate — transcribed from react-router@7.18.1 lib/components.tsx.
// Renders nothing; navigates from an effect on mount/update. Plain .ts (no
// JSX needed); the hooks it composes handle a slotless caller via bare-tag
// sub-slots.
import { useContext, useEffect } from 'octane';
import { NavigationContext, RouteContext } from '../context';
import { invariant, warning } from '../router/history';
import type { To } from '../router/history';
import type { RelativeRoutingType } from '../router/router';
import { getResolveToMatches, resolveTo } from '../router/utils';
import { useInRouterContext, useLocation, useNavigate } from '../hooks';

export interface NavigateProps {
	to: To;
	replace?: boolean;
	state?: any;
	relative?: RelativeRoutingType;
}

/**
 * A component-based version of `useNavigate` to use in a render-prop-less
 * context — navigates to the given `to` value whenever it renders.
 */
export function Navigate(props: NavigateProps): null {
	const { to, replace, state, relative } = props;
	invariant(
		useInRouterContext(),
		`<Navigate> may be used only in the context of a <Router> component.`,
	);

	const { static: isStatic } = useContext(NavigationContext);

	warning(
		!isStatic,
		`<Navigate> must not be used on the initial render in a <StaticRouter>. ` +
			`This is a no-op, but you should modify your code so the <Navigate> is ` +
			`only ever rendered in response to some user interaction or state change.`,
	);

	const { matches } = useContext(RouteContext);
	const { pathname: locationPathname } = useLocation();
	const navigate = useNavigate() as (to: To, opts?: any) => void;

	// Resolve the path outside of the effect so repeat effect runs navigate to
	// the same place (upstream: StrictMode double-invoke safety).
	const path = resolveTo(to, getResolveToMatches(matches), locationPathname, relative === 'path');
	const jsonPath = JSON.stringify(path);

	// Plain-.ts component: hand-passed stable slot (state is keyed per
	// component-instance scope).
	useEffect(
		() => {
			navigate(JSON.parse(jsonPath), { replace, state, relative });
		},
		[navigate, jsonPath, relative, replace, state],
		Symbol.for('rr:navigate:eff') as any,
	);

	return null;
}
