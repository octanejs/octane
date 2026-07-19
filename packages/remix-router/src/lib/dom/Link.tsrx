// Link — transcribed from react-router@8.2.0 lib/dom/lib.tsx onto octane.
// forwardRef → ref-as-prop (octane refs are props; documented divergence).
// Framework-mode prefetching (usePrefetchBehavior / PrefetchPageLinks) is
// inert outside a FrameworkContext upstream and is dropped here — the
// `prefetch` prop is accepted and ignored (framework mode is out of scope).
import { useContext } from 'octane';
import type { OctaneNode } from 'octane';
import { NavigationContext } from '../context.ts';
import type { To } from '../router/history.ts';
import type { RelativeRoutingType } from '../router/router.ts';
import { ABSOLUTE_URL_REGEX } from '../router/url.ts';
import { parseToInfo, resolveTo, joinPaths } from '../router/utils.ts';
import { useHref, useLocation } from '../hooks.ts';
import { useLinkClickHandler } from './hooks.ts';

type LinkProps = {
	to: To;
	children?: OctaneNode;
	onClick?: (event: MouseEvent) => void;
	discover?: 'render' | 'none';
	prefetch?: 'none' | 'intent' | 'render' | 'viewport';
	relative?: RelativeRoutingType;
	reloadDocument?: boolean;
	replace?: boolean;
	mask?: To;
	state?: any;
	target?: string;
	preventScrollReset?: boolean;
	viewTransition?: boolean;
	defaultShouldRevalidate?: boolean;
	ref?: { current: HTMLAnchorElement | null } | ((node: HTMLAnchorElement | null) => void);
	[key: string]: unknown;
};

export function Link(props: LinkProps) @{
	const {
		onClick,
		discover = 'render',
		prefetch = 'none',
		relative,
		reloadDocument,
		replace,
		mask,
		state,
		target,
		to: toProp,
		preventScrollReset,
		viewTransition,
		defaultShouldRevalidate,
		ref,
		children,
		...rest
	} = props;

	const { basename, navigator, useTransitions } = useContext(NavigationContext);
	const isAbsolute = typeof toProp === 'string' && ABSOLUTE_URL_REGEX.test(toProp);

	const parsed = parseToInfo(toProp, basename);
	const to = parsed.to;

	// Rendered into <a href> for relative URLs
	const href = useHref(to, { relative });
	const location = useLocation();

	let maskedHref = null;

	if (mask) {
		// Inlined version of the `useHref` logic operating off the masked location
		// instead of the current location
		const resolved = resolveTo(mask, [], location.mask ? location.mask.pathname : '/', true);

		// If we're operating within a basename, prepend it to the pathname prior
		// to creating the href.  If this is a root navigation, then just use the raw
		// basename which allows the basename to have full control over the presence
		// of a trailing slash on root links
		if (basename !== '/') {
			resolved.pathname = resolved.pathname === '/'
				? basename
				: joinPaths([basename, resolved.pathname]);
		}

		maskedHref = navigator.createHref(resolved);
	}

	const internalOnClick = useLinkClickHandler(to, {
		replace,
		mask,
		state,
		target,
		preventScrollReset,
		relative,
		viewTransition,
		defaultShouldRevalidate,
		useTransitions,
	});
	function handleClick(event: MouseEvent) {
		if (onClick) onClick(event);
		if (!event.defaultPrevented) {
			// Delegated listener — currentTarget is the <a> this handler renders on.
			internalOnClick(event as MouseEvent & { currentTarget: HTMLAnchorElement });
		}
	}

	const isSpaLink = !(parsed.isExternal || reloadDocument);

	<a
		{...rest}
		href={(isSpaLink ? maskedHref : undefined) || parsed.absoluteURL || href}
		onClick={isSpaLink ? handleClick : onClick}
		ref={ref}
		target={target}
		data-discover={!isAbsolute && discover === 'render' ? 'true' : undefined}
	>{children}</a>
}
