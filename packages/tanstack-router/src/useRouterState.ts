// The reactive base every router hook reads through: subscribe to the router's
// canonical snapshot store (`router.stores.__store`) and select a slice.
import { useStore } from './useStore';
import { useRouter } from './context';
import { splitSlot, subSlot } from './internal';

export function useRouterState(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const opts = (user[0] ?? {}) as { select?: (s: any) => any; router?: any };
	const router = useRouter(opts.router ? { router: opts.router } : undefined);
	return useStore(
		router.stores.__store,
		opts.select ?? ((s: any) => s),
		undefined,
		subSlot(slot, 'rs'),
	);
}
