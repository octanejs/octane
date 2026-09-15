import type { HistoryAction } from '@tanstack/history';
import type { AnyRoute, AnyRouter, ParseRoute, RegisteredRouter } from '@tanstack/router-core';
import type { OctaneNode } from 'octane';
export type ShouldBlockFnLocation<
	out TRouteId = string,
	out TFullPath = string,
	out TAllParams = Record<string, string>,
	out TFullSearchSchema = Record<string, any>,
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
> = TRoute extends any
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

export type ShouldBlockFn<TRouter extends AnyRouter = RegisteredRouter> = (
	args: ShouldBlockFnArgs<TRouter>,
) => boolean | Promise<boolean>;
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

export declare function useBlocker<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = false,
>(
	opts: UseBlockerOpts<TRouter, TWithResolver>,
): TWithResolver extends true ? BlockerResolver<TRouter> : void;

/**
 * @deprecated Use the shouldBlockFn property instead
 */
export declare function useBlocker(blockerFnOrOpts?: LegacyBlockerOpts): BlockerResolver;

/**
 * @deprecated Use the UseBlockerOpts object syntax instead
 */
export declare function useBlocker(
	blockerFn?: LegacyBlockerFn,
	condition?: boolean | any,
): BlockerResolver;

type LegacyPromptProps = {
	blockerFn?: LegacyBlockerFn;
	condition?: boolean | any;
	children?: OctaneNode | ((params: BlockerResolver) => OctaneNode);
};

export type PromptProps<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = boolean,
	TParams = TWithResolver extends true ? BlockerResolver<TRouter> : void,
> = UseBlockerOpts<TRouter, TWithResolver> & {
	children?: OctaneNode | ((params: TParams) => OctaneNode);
};
export declare function Block<
	TRouter extends AnyRouter = RegisteredRouter,
	TWithResolver extends boolean = boolean,
>(opts: PromptProps<TRouter, TWithResolver>): OctaneNode;

/**
 *  @deprecated Use the UseBlockerOpts property instead
 */
