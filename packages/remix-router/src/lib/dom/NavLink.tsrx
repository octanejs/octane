// NavLink — transcribed from react-router@8.2.0 lib/dom/lib.tsx onto octane.
// forwardRef → ref-as-prop. Renders <Link> with active/pending-derived
// className/style/aria-current; `className`, `style`, and `children` accept
// render props receiving { isActive, isPending, isTransitioning }. Octane
// note: a render-prop children is a plain function; the natural block
// children pass through untouched (isChildrenBlock guard, as in Await).
import { isChildrenBlock, useContext } from 'octane';
import { DataRouterStateContext, NavigationContext } from '../context.ts';
import { stripBasename } from '../router/utils.ts';
import { useLocation, useResolvedPath } from '../hooks.ts';
import { useViewTransitionState } from './lib.ts';
import { Link } from './Link.tsrx';

export function NavLink(props) @{
	const {
		'aria-current': ariaCurrentProp = 'page',
		caseSensitive = false,
		className: classNameProp = '',
		end = false,
		style: styleProp,
		to,
		viewTransition,
		children,
		ref,
		...rest
	} = props;

	const path = useResolvedPath(to, { relative: rest.relative });
	const location = useLocation();
	const routerState = useContext(DataRouterStateContext);
	const { navigator, basename } = useContext(NavigationContext);
	const isTransitioning =
		routerState != null &&
			// Conditional usage is OK here because the usage of a data router is static
			useViewTransitionState(path) &&
			viewTransition === true;

	let toPathname = navigator.encodeLocation
		? navigator.encodeLocation(path).pathname
		: path.pathname;
	let locationPathname = location.pathname;
	let nextLocationPathname =
		routerState && routerState.navigation && routerState.navigation.location
			? routerState.navigation.location.pathname
			: null;

	if (!caseSensitive) {
		locationPathname = locationPathname.toLowerCase();
		nextLocationPathname = nextLocationPathname ? nextLocationPathname.toLowerCase() : null;
		toPathname = toPathname.toLowerCase();
	}

	if (nextLocationPathname && basename) {
		nextLocationPathname = stripBasename(nextLocationPathname, basename) || nextLocationPathname;
	}

	// If the `to` has a trailing slash, look at that exact spot.  Otherwise,
	// we're looking for a slash _after_ what's in `to`.  For example:
	//
	// <NavLink to="/users"> and <NavLink to="/users/">
	// both want to look for a / at index 6 to match URL `/users/matt`
	const endSlashPosition =
		toPathname !== '/' && toPathname.endsWith('/') ? toPathname.length - 1 : toPathname.length;
	const isActive =
		locationPathname === toPathname ||
			!end && locationPathname.startsWith(toPathname) &&
				locationPathname.charAt(endSlashPosition) === '/';

	const isPending =
		nextLocationPathname != null &&
			(nextLocationPathname === toPathname ||
				!end && nextLocationPathname.startsWith(toPathname) &&
					nextLocationPathname.charAt(toPathname.length) === '/');

	const renderProps = {
		isActive,
		isPending,
		isTransitioning,
	};

	const ariaCurrent = isActive ? ariaCurrentProp : undefined;

	let className;
	if (typeof classNameProp === 'function') {
		className = classNameProp(renderProps);
	} else {
		// If the className prop is not a function, we use a default `active`
		// class for <NavLink />s that are active. In v5 `active` was the default
		// value for `activeClassName`, but we are removing that API and can still
		// use the old default behavior for a cleaner upgrade path and keep the
		// simple styling rules working as they currently do.
		className = [
			classNameProp,
			isActive ? 'active' : null,
			isPending ? 'pending' : null,
			isTransitioning ? 'transitioning' : null,
		].filter(Boolean).join(' ');
	}

	const style =
		typeof styleProp === 'function' ? styleProp(renderProps) : styleProp;

	// Render-prop children are called with the state object; block children
	// pass through untouched (PROP position — see the children-forwarding rule).
	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children) ? children(renderProps) : children;

	<Link
		{...rest}
		aria-current={ariaCurrent}
		className={className}
		ref={ref}
		style={style}
		to={to}
		viewTransition={viewTransition}
		children={resolvedChildren}
	/>
}
