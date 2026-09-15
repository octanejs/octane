// useBlocker / Block — port of react-router's useBlocker.tsx. Registers a
// history blocker (`history.block`) whose composed blockerFn resolves the
// current/next locations to matched-route shapes, asks `shouldBlockFn`, and —
// with `withResolver` — parks the navigation in a promise the caller settles
// via the returned resolver's `proceed()` / `reset()`. Also supports the legacy
// `(blockerFn, condition)` and `{ blockerFn, condition }` signatures. Authored
// in .tsrx so the compiler slots the internal useState/useEffect and callers'
// withSlot wrapping keeps per-call-site state independent.
import { useState, useEffect, isChildrenBlock } from 'octane';
import type { OctaneNode } from 'octane';
import type { BlockerFnArgs, HistoryAction, HistoryLocation } from '@tanstack/history';
import type { AnyRoute, AnyRouter, ParseRoute, RegisteredRouter } from '@tanstack/router-core';
import { useRouter } from './context.ts';

export type ShouldBlockFnLocation<
	TRouteId = string,
	TFullPath = string,
	TAllParams = Record<string, string>,
	TFullSearchSchema = Record<string, any>,
> = {
	routeId: TRouteId;
	fullPath: TFullPath;
	pathname: string;
	params: TAllParams;
	search: TFullSearchSchema;
};

type AnyShouldBlockFnLocation = ShouldBlockFnLocation<any, any, any, any>;
type MakeShouldBlockFnLocationUnion<
	TRouter extends AnyRouter = RegisteredRouter,
	TRoute extends AnyRoute = ParseRoute<TRouter['routeTree']>,
> =
	TRoute extends any
		? ShouldBlockFnLocation<
				TRoute['id'],
				TRoute['fullPath'],
				TRoute['types']['allParams'],
				TRoute['types']['fullSearchSchema']
			>
		: never;

export type BlockerResolver<TRouter extends AnyRouter = RegisteredRouter> =
	| {
			status: 'blocked';
			current: MakeShouldBlockFnLocationUnion<TRouter>;
			next: MakeShouldBlockFnLocationUnion<TRouter>;
			action: HistoryAction;
			proceed: () => void;
			reset: () => void;
	  }
	| {
			status: 'idle';
			current: undefined;
			next: undefined;
			action: undefined;
			proceed: undefined;
			reset: undefined;
	  };

export type ShouldBlockFnArgs<TRouter extends AnyRouter = RegisteredRouter> = {
	current: MakeShouldBlockFnLocationUnion<TRouter>;
	next: MakeShouldBlockFnLocationUnion<TRouter>;
	action: HistoryAction;
};

export type ShouldBlockFn<TRouter extends AnyRouter = RegisteredRouter> =
	(args: ShouldBlockFnArgs<TRouter>) => boolean | Promise<boolean>;
export type UseBlockerOpts<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = boolean,
> = {
	shouldBlockFn: ShouldBlockFn<TRouter>;
	enableBeforeUnload?: boolean | (() => boolean);
	disabled?: boolean;
	withResolver?: TWithResolver;
};

type LegacyBlockerFn = () => Promise<any> | any;
type LegacyBlockerOpts = {
	blockerFn?: LegacyBlockerFn;
	condition?: boolean | any;
};

const IDLE_RESOLVER: BlockerResolver = {
	status: 'idle',
	current: undefined,
	next: undefined,
	action: undefined,
	proceed: undefined,
	reset: undefined,
};

function _resolveBlockerOpts(
	opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
	condition?: boolean | any,
): UseBlockerOpts {
	if (opts === undefined) {
		return { shouldBlockFn: () => true, withResolver: false };
	}
	if ('shouldBlockFn' in opts) return opts;
	if (typeof opts === 'function') {
		const shouldBlock = Boolean(condition ?? true);
		const _customBlockerFn = async () => {
			if (shouldBlock) return await opts();
			return false;
		};
		return {
			shouldBlockFn: _customBlockerFn,
			enableBeforeUnload: shouldBlock,
			withResolver: false,
		};
	}
	const shouldBlock = Boolean(opts.condition ?? true);
	const fn = opts.blockerFn;
	const _customBlockerFn = async () => {
		if (shouldBlock && fn !== undefined) return await fn();
		return shouldBlock;
	};
	return {
		shouldBlockFn: _customBlockerFn,
		enableBeforeUnload: shouldBlock,
		withResolver: fn === undefined,
	};
}

export function useBlocker<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = false,
>(
	opts: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void;

/**
 * @deprecated Use the shouldBlockFn property instead
 */
export function useBlocker(blockerFnOrOpts?: LegacyBlockerOpts): BlockerResolver;

/**
 * @deprecated Use the UseBlockerOpts object syntax instead
 */
export function useBlocker(blockerFn?: LegacyBlockerFn, condition?: boolean | any): BlockerResolver;

export function useBlocker(
	opts?: UseBlockerOpts | LegacyBlockerOpts | LegacyBlockerFn,
	condition?: boolean | any,
): BlockerResolver {
	const { shouldBlockFn, enableBeforeUnload = true, disabled = false, withResolver = false } =
		_resolveBlockerOpts(opts, condition);

	const router = useRouter();
	const { history } = router;

	const [resolver, setResolver] = useState<BlockerResolver>(IDLE_RESOLVER);

	useEffect(() => {
		const blockerFnComposed = async (blockerFnArgs: BlockerFnArgs) => {
			function getLocation(location: HistoryLocation): AnyShouldBlockFnLocation {
				const parsedLocation = router.parseLocation(location);
				const [, rawParams, foundRoute] = router.getMatchedRoutes(parsedLocation.pathname);
				if (foundRoute === undefined) {
					return {
						routeId: '__notFound__',
						fullPath: parsedLocation.pathname,
						pathname: parsedLocation.pathname,
						params: rawParams,
						search: router.options.parseSearch(location.search),
					};
				}
				return {
					routeId: foundRoute.id,
					fullPath: foundRoute.fullPath,
					pathname: parsedLocation.pathname,
					params: rawParams,
					search: router.options.parseSearch(location.search),
				};
			}

			const current = getLocation(blockerFnArgs.currentLocation);
			const next = getLocation(blockerFnArgs.nextLocation);

			if (current.routeId === '__notFound__' && next.routeId !== '__notFound__') {
				return false;
			}

			const shouldBlock = await shouldBlockFn({
				action: blockerFnArgs.action,
				current,
				next,
			});
			if (!withResolver) return shouldBlock;
			if (!shouldBlock) return false;

			const promise = new Promise<boolean>((resolve) => {
				setResolver({
					status: 'blocked',
					current,
					next,
					action: blockerFnArgs.action,
					proceed: () => resolve(false),
					reset: () => resolve(true),
				});
			});

			const canNavigateAsync = await promise;
			setResolver(IDLE_RESOLVER);
			return canNavigateAsync;
		};

		return disabled
			? undefined
			: history.block({ blockerFn: blockerFnComposed, enableBeforeUnload });
	}, [shouldBlockFn, enableBeforeUnload, disabled, withResolver, history, router]);

	return resolver;
}

type LegacyPromptProps = {
	blockerFn?: LegacyBlockerFn;
	condition?: boolean | any;
	children?: OctaneNode | ((params: BlockerResolver) => OctaneNode);
};

export type PromptProps<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = boolean,
	TParams = TWithResolver extends true ? BlockerResolver<TRouter> : void,
> =
	UseBlockerOpts<TRouter, TWithResolver> & {
		children?: OctaneNode | ((params: TParams) => OctaneNode);
	};

export function Block<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = boolean,
>(opts: PromptProps<TRouter, TWithResolver>): OctaneNode;

/**
 *  @deprecated Use the UseBlockerOpts property instead
 */

// Declarative blocker: registers useBlocker and renders children (optionally a
// render prop receiving the resolver).
export function Block(props: PromptProps | LegacyPromptProps) @{
	const { children, ...rest } = props;
	const resolver = useBlocker(_resolveBlockerOpts(rest));
	const out =
		children
			? typeof children === 'function' && !isChildrenBlock(children)
				? children(resolver as any)
				: children
			: null;
	<>
		{out}
	</>
}
