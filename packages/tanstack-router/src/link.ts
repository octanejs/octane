declare const process: { env: { NODE_ENV?: string } };

// useLinkProps / createLink / linkOptions — port of react-router's link.tsx
// (client path; SSR link rendering arrives with the SSR entries). All of Link's
// behavior lives here so both `<Link>` and custom `createLink` components share
// it: href building (mask-aware via publicHref), external-URL detection with
// dangerous-protocol blocking, active-state detection (exactPathTest /
// trailing-slash-aware fuzzy prefix + deepEqual partial search match),
// preloading ('intent' with delay + touchstart/focus, 'viewport' via
// IntersectionObserver, 'render' once on mount), the click handler (navigate
// with replace/resetScroll/hashScrollIntoView/viewTransition/startTransition/
// ignoreBlocker forwarded), and data-status/data-transitioning reflection.
import {
	useRef,
	useState,
	useEffect,
	useCallback,
	useMemo,
	flushSync,
	createElement,
} from 'octane';
import type { OctaneNode } from 'octane';
import type { Constrain } from '@tanstack/router-core';
export type { LinkComponentRoute } from './linkTypes';
import {
	deepEqual,
	getUrlScheme,
	exactPathTest,
	functionalUpdate,
	hasKeys,
	isDangerousProtocol,
	preloadWarning,
	removeTrailingSlash,
} from '@tanstack/router-core';
import { useRouter } from './context';
import { isServer } from '@tanstack/router-core/isServer';
import { useHydrated } from './ClientOnly.tsrx';
import { useStore } from './useStore';
import { splitSlot, subSlot } from './internal';
import { Link } from './Link.tsrx';
import type {
	ActiveOptions,
	AnyRouter,
	ParsedLocation,
	RegisteredRouter,
} from '@tanstack/router-core';
import type {
	LinkComponent,
	CreateLinkProps,
	OctaneAnchorProps,
	UseLinkPropsOptions,
} from './linkTypes';
import type { ValidateLinkOptions, ValidateLinkOptionsArray } from './typePrimitives';

const STATIC_EMPTY_OBJECT = {};
const STATIC_ACTIVE_OBJECT = { class: 'active' };
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true };
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' };
const STATIC_TRANSITIONING_PROPS = { 'data-transitioning': 'transitioning' };

const timeoutMap = new WeakMap<object, ReturnType<typeof setTimeout>>();
const cancelPreload = (target: object) => {
	clearTimeout(timeoutMap.get(target));
	timeoutMap.delete(target);
};
export const composeHandlers = (
	first: ((event: any) => void) | undefined,
	second: (event: any) => void,
) => {
	if (!first) return second;
	return (event: Event) =>
		event.defaultPrevented || (first(event), event.defaultPrevented || second(event));
};
type LinkState = [href: string | undefined, isActive?: boolean];
function useValueStable<T>(value: T, slot?: symbol): T {
	const ref = useRef(value, slot);
	if (!deepEqual(ref.current, value, { ignoreUndefined: false })) ref.current = value;
	return ref.current;
}
function isCtrlEvent(e: MouseEvent): boolean {
	return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey);
}
function compareLinkState(a: LinkState, b: LinkState) {
	return a[0] === b[0] && a[1] === b[1];
}

function resolveExternalLink(
	to: string | undefined,
	protocolAllowlist: AnyRouter['protocolAllowlist'],
): string | null | undefined {
	const scheme = typeof to === 'string' && getUrlScheme(to);
	if (!scheme) {
		return undefined;
	}
	if (!protocolAllowlist.has(scheme)) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn(`Blocked Link with dangerous protocol: ${to}`);
		}
		return null;
	}
	return to;
}

function resolveIsActive(
	location: ParsedLocation,
	next: ParsedLocation,
	activeOptions: ActiveOptions | undefined,
	basepath: string,
	isHydrated: boolean,
): boolean {
	const currentPath = removeTrailingSlash(location.pathname, basepath);
	const nextPath = removeTrailingSlash(next.pathname, basepath);

	// Both modes compare normalized paths; fuzzy matches need a segment boundary.
	if (
		activeOptions?.exact
			? currentPath !== nextPath
			: !(
					currentPath.startsWith(nextPath) &&
					(currentPath.length === nextPath.length || currentPath[nextPath.length] === '/')
				)
	) {
		return false;
	}

	if (activeOptions?.includeSearch ?? true) {
		const searchTest = deepEqual(location.search, next.search, {
			partial: !activeOptions?.exact,
			ignoreUndefined: !activeOptions?.explicitUndefined,
		});
		if (!searchTest) {
			return false;
		}
	}

	if (activeOptions?.includeHash) {
		return isHydrated && location.hash === next.hash;
	}
	return true;
}

function getHrefOption(next: ParsedLocation, router: AnyRouter, disabled: boolean | undefined) {
	if (disabled) {
		return undefined;
	}
	const location = next.maskedLocation ?? next;
	// A rewritten external URL must bypass history's relative-path formatting.
	const href = location.external
		? location.publicHref
		: router.history.createHref(location.publicHref) || '/';
	if (
		(location.external || href !== location.publicHref) &&
		isDangerousProtocol(href, router.protocolAllowlist)
	) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn(`Blocked Link with dangerous protocol: ${href}`);
		}
		return undefined;
	}
	return href;
}

// Merge base/active/inactive styles. Objects merge like upstream; if any is a
// string the parts join with ';' (octane host styles accept both forms).
function mergeStyles(base: any, active: any, inactive: any): any {
	if (!base && !active && !inactive) return undefined;
	const parts = [base, active, inactive].filter(Boolean);
	if (parts.length === 1) return parts[0];
	if (parts.some((p) => typeof p === 'string')) {
		return parts
			.map((p) =>
				typeof p === 'string'
					? p.replace(/;\s*$/, '')
					: Object.entries(p)
							.map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${v}`)
							.join(';'),
			)
			.join(';');
	}
	return Object.assign({}, ...parts);
}

export function useLinkProps<
	TRouter extends AnyRouter = RegisteredRouter,
	const TFrom extends string = string,
	const TTo extends string | undefined = undefined,
	const TMaskFrom extends string = TFrom,
	const TMaskTo extends string = '',
>(options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): OctaneAnchorProps;
export function useLinkProps(...args: any[]): Record<string, any> {
	const [user, slot] = splitSlot(args);
	const options = (user[0] ?? {}) as Record<string, any>;
	const router = useRouter();

	const {
		// custom props
		activeProps,
		inactiveProps,
		activeOptions,
		to,
		preload: userPreload,
		preloadDelay: userPreloadDelay,
		preloadIntentProximity: _preloadIntentProximity,
		hashScrollIntoView,
		replace,
		startTransition,
		resetScroll,
		viewTransition,
		// element props
		children: _children,
		target,
		disabled,
		style,
		class: klass,
		className,
		onClick,
		onBlur,
		onFocus,
		onMouseEnter,
		onMouseLeave,
		onTouchStart,
		ignoreBlocker,
		ref: userRef,
		// consumed by buildLocation — not spread onto the element
		params: _params,
		search: _search,
		hash: _hash,
		state: _state,
		mask: _mask,
		reloadDocument: _reloadDocument,
		unsafeRelative: _unsafeRelative,
		from: _from,
		_fromLocation,
		...propsSafeToSpread
	} = options;

	const stableSearch = useValueStable(options.search, subSlot(slot, 'lp:search'));
	const stableParams = useValueStable(options.params, subSlot(slot, 'lp:params'));
	const stableActiveOptions = useValueStable(activeOptions, subSlot(slot, 'lp:active'));
	const isHydrated = useHydrated(subSlot(slot, 'lp:hydrated'));
	const routingOptions = useMemo(
		() => options,
		[
			router,
			options.from,
			options._fromLocation,
			options.hash,
			options.to,
			stableSearch,
			stableParams,
			options.state,
			options.mask,
			options.unsafeRelative,
		],
		subSlot(slot, 'lp:options'),
	);
	const selectLinkState = useCallback(
		(location: ParsedLocation): LinkState => {
			const directExternal = resolveExternalLink(to, router.protocolAllowlist);
			if (directExternal !== undefined) return [directExternal ?? undefined];
			const next = router.buildLocation({ _fromLocation: location, ...routingOptions } as any);
			const href = getHrefOption(next, router, disabled);
			return [
				href,
				!disabled && (!href || getUrlScheme(href))
					? undefined
					: resolveIsActive(location, next, stableActiveOptions, router.basepath, isHydrated),
			];
		},
		[router, routingOptions, to, disabled, stableActiveOptions, isHydrated],
		subSlot(slot, 'lp:select'),
	);
	const [href, isActive] =
		(isServer ?? router.isServer)
			? selectLinkState(router.stores.location.get())
			: useStore(
					router.stores.location,
					selectLinkState,
					compareLinkState,
					subSlot(slot, 'lp:loc'),
				);
	const externalLink = isActive === undefined ? href : undefined;
	const linkDisabled = disabled || href === undefined;

	const resolvedActiveProps: Record<string, any> = isActive
		? (functionalUpdate(activeProps, {}) ?? STATIC_ACTIVE_OBJECT)
		: STATIC_EMPTY_OBJECT;
	const resolvedInactiveProps: Record<string, any> =
		isActive || externalLink
			? STATIC_EMPTY_OBJECT
			: (functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT);

	// Class composes clsx-style (octane normalizeClass folds arrays + falsy).
	const resolvedClass = [
		klass ?? className,
		resolvedActiveProps.class ?? resolvedActiveProps.className,
		resolvedInactiveProps.class ?? resolvedInactiveProps.className,
	].filter(Boolean);
	const resolvedStyle = mergeStyles(style, resolvedActiveProps.style, resolvedInactiveProps.style);

	const [isTransitioning, setIsTransitioning] = useState(false, subSlot(slot, 'lp:t'));
	const hasRenderFetched = useRef(false, subSlot(slot, 'lp:rf'));
	const elRef = useRef<Element | null>(null, subSlot(slot, 'lp:el'));

	const preload =
		options.reloadDocument || externalLink || linkDisabled
			? false
			: (userPreload ?? router.options.defaultPreload);
	const preloadDelay = userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0;

	const doPreload = useCallback(
		() => {
			router.preloadRoute(routingOptions as any).catch((err: unknown) => {
				console.warn(err);
				console.warn(preloadWarning);
			});
		},
		[router, routingOptions],
		subSlot(slot, 'lp:dp'),
	);

	const enqueuePreload = useCallback(
		(entry?: IntersectionObserverEntry) => {
			if (!entry || !entry.isIntersecting) {
				cancelPreload(elRef);
				return;
			}
			if (!preloadDelay) {
				doPreload();
				return;
			}
			if (!timeoutMap.has(elRef))
				timeoutMap.set(
					elRef,
					setTimeout(() => {
						timeoutMap.delete(elRef);
						doPreload();
					}, preloadDelay),
				);
		},
		[doPreload, preloadDelay],
		subSlot(slot, 'lp:enqueue'),
	);
	useEffect(
		() => {
			const element = elRef.current;
			if (!element || preload !== 'viewport' || typeof IntersectionObserver !== 'function')
				return () => cancelPreload(elRef);
			const observer = new IntersectionObserver((entries) => enqueuePreload(entries.pop()), {
				rootMargin: '100px',
			});
			observer.observe(element);
			return () => {
				observer.disconnect();
				cancelPreload(elRef);
			};
		},
		[elRef, preload, enqueuePreload],
		subSlot(slot, 'lp:io'),
	);

	// preload="render": preload once on mount.
	useEffect(
		() => {
			if (hasRenderFetched.current) return;
			if (!disabled && preload === 'render') {
				doPreload();
				hasRenderFetched.current = true;
			}
		},
		[disabled, doPreload, preload],
		subSlot(slot, 'lp:pr'),
	);

	const handleClick = (e: MouseEvent) => {
		const elementTarget = (e.currentTarget as Element | null)?.getAttribute?.('target');
		const effectiveTarget = target !== undefined ? target : elementTarget;
		if (
			!linkDisabled &&
			!isCtrlEvent(e) &&
			!e.defaultPrevented &&
			(!effectiveTarget || effectiveTarget === '_self') &&
			e.button === 0
		) {
			e.preventDefault();

			flushSync(() => {
				setIsTransitioning(true);
			});
			const unsub = router.subscribe('onResolved', () => {
				unsub();
				setIsTransitioning(false);
			});

			router.navigate({
				...routingOptions,
				replace,
				resetScroll,
				hashScrollIntoView,
				startTransition,
				viewTransition,
				ignoreBlocker,
			});
		}
	};

	const captureRef = (el: Element | null) => {
		elRef.current = el;
	};
	const composedRef = userRef ? [captureRef, userRef] : captureRef;

	if (externalLink) {
		return {
			...propsSafeToSpread,
			ref: composedRef,
			href: externalLink,
			...(target !== undefined && { target }),
			...(disabled !== undefined && { disabled }),
			...(resolvedStyle !== undefined && { style: resolvedStyle }),
			...(resolvedClass.length > 0 && { class: resolvedClass }),
			...(onClick && { onClick }),
			...(onBlur && { onBlur }),
			...(onFocus && { onFocus }),
			...(onMouseEnter && { onMouseEnter }),
			...(onMouseLeave && { onMouseLeave }),
			...(onTouchStart && { onTouchStart }),
		};
	}

	const enqueueIntentPreload = (e: MouseEvent | FocusEvent) => {
		if (linkDisabled || preload !== 'intent') return;
		if (!preloadDelay) {
			doPreload();
			return;
		}
		const eventTarget = elRef;
		if (timeoutMap.has(eventTarget)) return;
		const id = setTimeout(() => {
			timeoutMap.delete(eventTarget);
			doPreload();
		}, preloadDelay);
		timeoutMap.set(eventTarget, id);
	};

	const handleTouchStart = () => {
		if (linkDisabled || preload !== 'intent') return;
		doPreload();
	};

	const handleLeave = (e: MouseEvent | FocusEvent) => {
		if (linkDisabled || preload !== 'intent' || !preloadDelay) return;
		const eventTarget = elRef;
		const id = timeoutMap.get(eventTarget);
		if (id) {
			clearTimeout(id);
			timeoutMap.delete(eventTarget);
		}
	};

	return {
		...propsSafeToSpread,
		...resolvedActiveProps,
		...resolvedInactiveProps,
		href,
		ref: composedRef,
		onClick: composeHandlers(onClick, handleClick),
		onBlur: composeHandlers(onBlur, handleLeave),
		onFocus: composeHandlers(onFocus, enqueueIntentPreload),
		onMouseEnter: composeHandlers(onMouseEnter, enqueueIntentPreload),
		onMouseLeave: composeHandlers(onMouseLeave, handleLeave),
		onTouchStart: composeHandlers(onTouchStart, handleTouchStart),
		disabled: !!linkDisabled,
		...(target !== undefined && { target }),
		...(resolvedStyle !== undefined && { style: resolvedStyle }),
		...(resolvedClass.length > 0 && { class: resolvedClass }),
		...(linkDisabled && STATIC_DISABLED_PROPS),
		...(isActive && STATIC_ACTIVE_PROPS),
		...(isTransitioning && STATIC_TRANSITIONING_PROPS),
	};
}

// Wrap a design-system component so it navigates like <Link> — the component
// receives the fully-built link props (href, handlers, data-status, …).
export function createLink<const TComp>(
	Comp: Constrain<TComp, any, (props: CreateLinkProps) => OctaneNode>,
): LinkComponent<TComp>;
export function createLink(Comp: any): any {
	return function CreatedLink(props: any) {
		return createElement(Link as any, { ...props, _asChild: Comp });
	};
}

export type LinkOptionsFnOptions<TOptions, TComp, TRouter extends AnyRouter = RegisteredRouter> =
	TOptions extends ReadonlyArray<any>
		? ValidateLinkOptionsArray<TRouter, TOptions, string, TComp>
		: ValidateLinkOptions<TRouter, TOptions, string, TComp>;

export type LinkOptionsFn<TComp> = <const TOptions, TRouter extends AnyRouter = RegisteredRouter>(
	options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions;

// Identity helper for pre-validating and reusing navigation options.
export const linkOptions: LinkOptionsFn<'a'> = (options) => options as any;
