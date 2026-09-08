import { parse as parsePattern } from 'regexparam';
import {
	Fragment,
	cloneElement,
	createContext,
	createElement as h,
	isValidElement,
	useContext,
	useIsomorphicLayoutEffect,
	useMemo,
	useRef,
	useEvent,
} from './react-deps';
import { useBrowserLocation, useSearch as useBrowserSearch } from './use-browser-location';
import { absolutePath, relativePath, sanitizeSearch } from './paths';
import { splitSlot, subSlot } from './internal';
import type {
	BaseLocationHook,
	BaseSearchHook,
	HookNavigationOptions,
	HookReturnValue,
	Path,
	PathPattern,
} from './location-hook';
import type {
	AroundNavHandler,
	NavigateOptions,
	Parser,
	RouterObject,
	RouterOptions,
	SsrContext,
} from './router';
import {
	isChildrenBlock,
	type ComponentBody,
	type ElementDescriptor,
	type OctaneNode,
} from 'octane';
import type { JSX, Octane } from 'octane/jsx-runtime';
import type { RouteParams } from 'regexparam';

export type * from './location-hook';
export type * from './router';

type RuntimeRouter = Omit<RouterObject, 'ownBase'>;

const defaultRouter: RuntimeRouter = {
	hook: useBrowserLocation,
	searchHook: useBrowserSearch,
	parser: parsePattern as Parser,
	base: '',
	ssrPath: undefined,
	ssrSearch: undefined,
	ssrContext: undefined,
	hrefs: (value) => value,
	aroundNav: (navigate, to, options) => navigate(to, options),
};

const RouterCtx = createContext(defaultRouter);

export function useRouter(): RouterObject {
	return useContext(RouterCtx) as RouterObject;
}

export interface DefaultParams {
	readonly [paramName: string | number]: string | undefined;
}

export type Params<T extends DefaultParams = DefaultParams> = T;
export type StringRouteParams<T extends string> = RouteParams<T> & {
	[param: number]: string | undefined;
};
export type RegexRouteParams = {
	[key: string | number]: string | undefined;
};
export type MatchWithParams<T extends DefaultParams = DefaultParams> = [true, Params<T>];
export type NoMatch = [false, null];
export type Match<T extends DefaultParams = DefaultParams> = MatchWithParams<T> | NoMatch;

const Params0: DefaultParams = {};
const ParamsCtx = createContext(Params0);

export function useParams<T = undefined>(): T extends string
	? StringRouteParams<T>
	: T extends undefined
		? DefaultParams
		: T {
	return useContext(ParamsCtx) as T extends string
		? StringRouteParams<T>
		: T extends undefined
			? DefaultParams
			: T;
}

type Navigate = (to: Path, options?: NavigateOptions) => void;

function useLocationFromRouter(router: RuntimeRouter, ...rest: [slot?: symbol]): [Path, Navigate] {
	const [, slot] = splitSlot(rest);
	const [location, navigate] = router.hook(router, subSlot(slot, 'location:router-hook'));

	return [
		relativePath(router.base, location),
		useEvent(
			(to: Path, options?: NavigateOptions) =>
				router.aroundNav(navigate as Navigate, absolutePath(to, router.base), options),
			subSlot(slot, 'location:navigate'),
		),
	];
}

export function useLocation<
	H extends BaseLocationHook = typeof useBrowserLocation,
>(): HookReturnValue<H>;
export function useLocation(...rest: [slot?: symbol]): [Path, Navigate] {
	const [, slot] = splitSlot(rest);
	return useLocationInternal(slot);
}

function useLocationInternal(slot: symbol | undefined): [Path, Navigate] {
	return useLocationFromRouter(useRouter() as RuntimeRouter, subSlot(slot, 'use-location'));
}

export function useSearch<H extends BaseSearchHook = typeof useBrowserSearch>(): ReturnType<H>;
export function useSearch(...rest: [slot?: symbol]): string {
	const [, slot] = splitSlot(rest);
	return useSearchInternal(slot);
}

function useSearchInternal(slot: symbol | undefined): string {
	const router = useRouter() as RuntimeRouter;
	return sanitizeSearch(router.searchHook(router, subSlot(slot, 'use-search')));
}

export function matchRoute<
	T extends DefaultParams | undefined = undefined,
	RoutePath extends PathPattern = PathPattern,
>(
	parser: Parser,
	route: RoutePath,
	path: string,
	loose?: boolean,
): Match<
	T extends DefaultParams
		? T
		: RoutePath extends string
			? StringRouteParams<RoutePath>
			: RegexRouteParams
>;
export function matchRoute(
	parser: Parser,
	route: PathPattern | undefined,
	path: string,
	loose?: boolean,
): Match & [boolean, DefaultParams | null, string?] {
	const { pattern, keys } =
		route instanceof RegExp
			? { keys: false as const, pattern: route }
			: parser(route || '*', loose);
	const execResult = pattern.exec(path);
	const result = execResult || [];
	const [$base, ...matches] = result;

	return (
		$base !== undefined
			? [
					true,
					(() => {
						const groups =
							keys !== false
								? Object.fromEntries(keys.map((key, index) => [key, matches[index]]))
								: execResult?.groups;
						const params = { ...matches } as unknown as DefaultParams;
						if (groups) {
							Object.assign(params, groups);
						}
						return params;
					})(),
					...(loose ? [$base] : []),
				]
			: [false, null]
	) as Match & [boolean, DefaultParams | null, string?];
}

export function useRoute<
	T extends DefaultParams | undefined = undefined,
	RoutePath extends PathPattern = PathPattern,
>(
	pattern: RoutePath,
): Match<
	T extends DefaultParams
		? T
		: RoutePath extends string
			? StringRouteParams<RoutePath>
			: RegexRouteParams
>;
export function useRoute(pattern: PathPattern, ...rest: [slot?: symbol]): Match {
	const [, slot] = splitSlot(rest);
	return matchRoute(
		useRouter().parser,
		pattern,
		useLocationInternal(subSlot(slot, 'use-route'))[0],
	);
}

export type RouterProps = RouterOptions & {
	children: OctaneNode;
};

const ROUTER_REF_SLOT = Symbol.for('@octanejs/wouter:Router:ref');

export function Router({ children, ...props }: RouterProps): OctaneNode {
	const parentFromContext = useRouter() as RuntimeRouter;
	const parent = props.hook ? defaultRouter : parentFromContext;
	let value = parent;

	const [path, search = props.ssrSearch ?? ''] = props.ssrPath?.split('?') ?? [];
	if (path) {
		props.ssrSearch = search;
		props.ssrPath = path;
	}

	props.hrefs = props.hrefs ?? props.hook?.hrefs;
	props.searchHook = props.searchHook ?? props.hook?.searchHook;

	const ref = useRef<Record<string, unknown>>({}, ROUTER_REF_SLOT);
	const previous = ref.current;
	let next = previous;

	for (const key in parent) {
		const option =
			key === 'base'
				? parent.base + ((props as Record<string, unknown>)[key] ?? '')
				: ((props as Record<string, unknown>)[key] ??
					(parent as unknown as Record<string, unknown>)[key]);

		if (previous === next && option !== next[key]) {
			ref.current = next = { ...next };
		}
		next[key] = option;

		if (
			option !== (parent as unknown as Record<string, unknown>)[key] ||
			option !== (value as unknown as Record<string, unknown>)[key]
		) {
			value = next as RuntimeRouter;
		}
	}

	return h(RouterCtx.Provider, { value, children });
}

export interface RouteComponentProps<T extends DefaultParams = DefaultParams> {
	params: T;
}

export interface RouteProps<
	T extends DefaultParams | undefined = undefined,
	RoutePath extends PathPattern = PathPattern,
> {
	children?:
		| ((
				params: T extends DefaultParams
					? T
					: RoutePath extends string
						? StringRouteParams<RoutePath>
						: RegexRouteParams,
		  ) => OctaneNode)
		| OctaneNode;
	path?: RoutePath;
	component?: ComponentBody<
		RouteComponentProps<
			T extends DefaultParams
				? T
				: RoutePath extends string
					? StringRouteParams<RoutePath>
					: RegexRouteParams
		>
	>;
	nest?: boolean;
}

type InternalRouteProps = RouteProps<any, any> & {
	match?: [boolean, DefaultParams | null, string?];
};

function renderRoute(
	{ children, component }: Pick<InternalRouteProps, 'children' | 'component'>,
	params: DefaultParams,
): OctaneNode {
	if (component) {
		return h(component as ComponentBody<{ params: DefaultParams }>, { params });
	}
	return typeof children === 'function' && !isChildrenBlock(children) ? children(params) : children;
}

function useCachedParams(value: DefaultParams, slot: symbol | undefined): DefaultParams {
	const previous = useRef(Params0, slot);
	const current = previous.current;
	return (previous.current =
		Object.keys(value).length !== Object.keys(current).length ||
		Object.entries(value).some(([key, item]) => item !== current[key])
			? value
			: current);
}

const ROUTE_LOCATION_SLOT = Symbol.for('@octanejs/wouter:Route:location');
const ROUTE_PARAMS_SLOT = Symbol.for('@octanejs/wouter:Route:params');

export function Route<
	T extends DefaultParams | undefined = undefined,
	RoutePath extends PathPattern = PathPattern,
>({
	path,
	nest,
	match,
	...renderProps
}: RouteProps<T, RoutePath> & {
	match?: [boolean, DefaultParams | null, string?];
}): OctaneNode {
	const router = useRouter() as RuntimeRouter;
	const [location] = useLocationFromRouter(router, ROUTE_LOCATION_SLOT);
	const [matches, routeParams, base] =
		match ?? matchRoute(router.parser, path as PathPattern, location, nest);
	const params = useCachedParams({ ...useParams(), ...routeParams }, ROUTE_PARAMS_SLOT);

	if (!matches) {
		return null;
	}

	const children = base
		? h(Router, { base, children: renderRoute(renderProps, params) } as RouterProps)
		: renderRoute(renderProps, params);

	return h(ParamsCtx.Provider, { value: params, children });
}

export type NavigationalProps<H extends BaseLocationHook = typeof useBrowserLocation> = (
	{ to: Path; href?: never } | { href: Path; to?: never }
) &
	HookNavigationOptions<H>;

export type RedirectProps<H extends BaseLocationHook = typeof useBrowserLocation> =
	NavigationalProps<H> & {
		children?: never;
	};

type HTMLLinkAttributes = Omit<JSX.IntrinsicElements['a'], 'className' | 'ref'> & {
	className?: string | ((isActive: boolean) => string | undefined);
	ref?: Octane.Ref<HTMLAnchorElement>;
};

type AsChildProps =
	| ({ asChild?: false } & HTMLLinkAttributes)
	| {
			asChild: true;
			children: ElementDescriptor;
			onClick?: (event: MouseEvent) => void;
			ref?: Octane.Ref<HTMLAnchorElement>;
	  };

export type LinkProps<H extends BaseLocationHook = typeof useBrowserLocation> =
	NavigationalProps<H> & AsChildProps;

const LINK_LOCATION_SLOT = Symbol.for('@octanejs/wouter:Link:location');
const LINK_EVENT_SLOT = Symbol.for('@octanejs/wouter:Link:event');

export function Link<H extends BaseLocationHook = typeof useBrowserLocation>(
	props: LinkProps<H>,
): OctaneNode {
	const router = useRouter() as RuntimeRouter;
	const [currentPath, navigate] = useLocationFromRouter(router, LINK_LOCATION_SLOT);

	const {
		to = '',
		href: targetPath = to,
		onClick: onClickProp,
		asChild,
		children,
		className,
		replace: _replace,
		state: _state,
		transition: _transition,
		ref,
		...restProps
	} = props as unknown as {
		to?: Path;
		href?: Path;
		onClick?: (event: MouseEvent) => void;
		asChild?: boolean;
		children?: OctaneNode;
		className?: string | ((isActive: boolean) => string | undefined);
		replace?: boolean;
		state?: unknown;
		transition?: boolean;
		ref?: Octane.Ref<HTMLAnchorElement>;
		[key: string]: unknown;
	};

	const onClick = useEvent((event: MouseEvent) => {
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0) {
			return;
		}

		onClickProp?.(event);
		if (!event.defaultPrevented) {
			event.preventDefault();
			navigate(targetPath, props);
		}
	}, LINK_EVENT_SLOT);

	const resolvedHref = router.hrefs(
		targetPath[0] === '~' ? targetPath.slice(1) : router.base + targetPath,
		router,
	);

	return asChild && isValidElement(children)
		? cloneElement(children, { onClick, href: resolvedHref })
		: h('a', {
				...restProps,
				onClick,
				href: resolvedHref,
				className:
					typeof className === 'function' ? className(currentPath === targetPath) : className,
				children,
				ref,
			});
}

function flattenChildren(children: OctaneNode): OctaneNode[] {
	return Array.isArray(children)
		? children.flatMap((child) =>
				flattenChildren(
					child && isValidElement(child) && child.type === Fragment ? child.props.children : child,
				),
			)
		: [children];
}

export interface SwitchProps {
	location?: string;
	children: OctaneNode;
}

const SWITCH_LOCATION_SLOT = Symbol.for('@octanejs/wouter:Switch:location');

export function Switch({ children, location }: SwitchProps): OctaneNode {
	const router = useRouter() as RuntimeRouter;
	const [originalLocation] = useLocationFromRouter(router, SWITCH_LOCATION_SLOT);

	for (const element of flattenChildren(children)) {
		let match: [boolean, DefaultParams | null, string?] | 0 = 0;

		if (
			isValidElement(element) &&
			(match = matchRoute(
				router.parser,
				element.props.path,
				location || originalLocation,
				element.props.nest,
			) as [boolean, DefaultParams | null, string?])[0]
		) {
			return cloneElement(element, { match });
		}
	}

	return null;
}

const REDIRECT_LOCATION_SLOT = Symbol.for('@octanejs/wouter:Redirect:location');
const REDIRECT_EVENT_SLOT = Symbol.for('@octanejs/wouter:Redirect:event');
const REDIRECT_EFFECT_SLOT = Symbol.for('@octanejs/wouter:Redirect:effect');

export function Redirect<H extends BaseLocationHook = typeof useBrowserLocation>(
	props: RedirectProps<H>,
): null {
	const { to, href = to } = props as RedirectProps & {
		to?: Path;
		href?: Path;
	};
	const router = useRouter() as RuntimeRouter;
	const [, navigate] = useLocationFromRouter(router, REDIRECT_LOCATION_SLOT);
	const redirect = useEvent(() => navigate(to || href || '', props), REDIRECT_EVENT_SLOT);

	useIsomorphicLayoutEffect(
		() => {
			redirect();
		},
		[],
		REDIRECT_EFFECT_SLOT,
	);

	if (router.ssrContext) {
		router.ssrContext.redirectTo = to;
	}
	return null;
}

export type URLSearchParamsInit = ConstructorParameters<typeof URLSearchParams>[0];
export type SetSearchParams = (
	nextInit: URLSearchParamsInit | ((previous: URLSearchParams) => URLSearchParamsInit),
	options?: { replace?: boolean; state?: any },
) => void;

export function useSearchParams(): [URLSearchParams, SetSearchParams];
export function useSearchParams(...rest: [slot?: symbol]): [URLSearchParams, SetSearchParams] {
	const [, slot] = splitSlot(rest);
	const [location, navigate] = useLocationInternal(subSlot(slot, 'search-params:location'));
	const search = useSearchInternal(subSlot(slot, 'search-params:search'));
	const searchParams = useMemo(
		() => new URLSearchParams(search),
		[search],
		subSlot(slot, 'search-params:memo'),
	);
	let temporarySearchParams = searchParams;

	const setSearchParams = useEvent<SetSearchParams>(
		(nextInit, options) => {
			temporarySearchParams = new URLSearchParams(
				typeof nextInit === 'function' ? nextInit(temporarySearchParams) : nextInit,
			);
			navigate(location + (temporarySearchParams.size ? '?' + temporarySearchParams : ''), options);
		},
		subSlot(slot, 'search-params:setter'),
	);

	return [searchParams, setSearchParams];
}

export type { AroundNavHandler, NavigateOptions, Parser, RouterObject, RouterOptions, SsrContext };
