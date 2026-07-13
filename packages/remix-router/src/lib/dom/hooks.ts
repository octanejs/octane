// DOM hooks — transcribed from react-router@8.2.0 lib/dom/lib.tsx onto
// octane. This PR ships useLinkClickHandler (Link's engine); the remaining DOM
// hooks (useSearchParams, useSubmit, useFetcher, …) land in later phases per
// docs/remix-router-port-plan.md.
import { startTransition, useCallback } from 'octane';
import type { To } from '../router/history';
import { createPath } from '../router/history';
import type { RelativeRoutingType } from '../router/router';
import { shouldProcessLinkClick } from './dom';
import { useLocation, useNavigate, useResolvedPath } from '../hooks';
import { splitSlot, subSlot } from '../../internal';

/**
 * Handles the click behavior for router `<Link>` components. This is useful if
 * you need to create custom `<Link>` components with the same click behavior we
 * use in our exported `<Link>`.
 */
export function useLinkClickHandler<E extends Element = HTMLAnchorElement>(
	to: To,
	...rest: unknown[]
): (event: MouseEvent & { currentTarget: E }) => void {
	const [user, slot] = splitSlot(rest as any[]);
	const {
		target,
		replace: replaceProp,
		mask,
		state,
		preventScrollReset,
		relative,
		viewTransition,
		defaultShouldRevalidate,
		useTransitions,
	} = (user[0] ?? {}) as {
		target?: string;
		replace?: boolean;
		mask?: To;
		state?: any;
		preventScrollReset?: boolean;
		relative?: RelativeRoutingType;
		viewTransition?: boolean;
		defaultShouldRevalidate?: boolean;
		useTransitions?: boolean;
	};
	const navigate = useNavigate(subSlot(slot, 'ulch:nav')) as (to: To, opts?: any) => void;
	const location = useLocation();
	const path = useResolvedPath(to, { relative }, subSlot(slot, 'ulch:path')) as any;

	return useCallback(
		(event: MouseEvent) => {
			if (shouldProcessLinkClick(event as any, target)) {
				event.preventDefault();

				// If the URL hasn't changed, a regular <a> will do a replace instead of
				// a push, so do the same here unless the replace prop is explicitly set
				const replace =
					replaceProp !== undefined ? replaceProp : createPath(location) === createPath(path);

				const doNavigate = () =>
					navigate(to, {
						replace,
						mask,
						state,
						preventScrollReset,
						relative,
						viewTransition,
						defaultShouldRevalidate,
					});

				if (useTransitions) {
					startTransition(() => doNavigate());
				} else {
					doNavigate();
				}
			}
		},
		[
			location,
			navigate,
			path,
			replaceProp,
			mask,
			state,
			target,
			to,
			preventScrollReset,
			relative,
			viewTransition,
			defaultShouldRevalidate,
			useTransitions,
		],
		subSlot(slot, 'ulch:cb'),
	);
}
