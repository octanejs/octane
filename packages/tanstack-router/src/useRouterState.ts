// The reactive base every router hook reads through: subscribe to the router's
// canonical snapshot store (`router.stores.__store`) and select a slice.
import { useStructuralSharing } from './hooks';
import { useStore } from './useStore';
import { useRouter } from './context';
import { splitSlot, subSlot } from './internal';
import type { AnyRouter, RegisteredRouter, RouterState } from '@tanstack/router-core';
import type { StructuralSharingOption, ValidateSelected } from './structuralSharing';

export type UseRouterStateOptions<TRouter extends AnyRouter, TSelected, TStructuralSharing> = {
	router?: TRouter;
	select?: (
		state: RouterState<TRouter['routeTree']>,
	) => ValidateSelected<TRouter, TSelected, TStructuralSharing>;
} & StructuralSharingOption<TRouter, TSelected, TStructuralSharing>;

export type UseRouterStateResult<TRouter extends AnyRouter, TSelected> = unknown extends TSelected
	? RouterState<TRouter['routeTree']>
	: TSelected;

export function useRouterState<
	TRouter extends AnyRouter = RegisteredRouter,
	TSelected = unknown,
	TStructuralSharing extends boolean = boolean,
>(
	opts?: UseRouterStateOptions<TRouter, TSelected, TStructuralSharing>,
): UseRouterStateResult<TRouter, TSelected>;
export function useRouterState(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = user[0] ?? {};
	const router = useRouter(opts.router ? { router: opts.router } : undefined);
	return useStore(
		router.stores.__store,
		useStructuralSharing(opts, router, subSlot(slot, 'rs:ss')),
		undefined,
		subSlot(slot, 'rs'),
	);
}
