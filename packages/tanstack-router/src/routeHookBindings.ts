'use strong';

import type * as Hooks from './hooks';
import type { useRouter as UseRouter } from './context';
import { splitSlot, subSlot } from './internal';

type RouteHooks = Pick<
	typeof Hooks,
	| 'useMatch'
	| 'useParams'
	| 'useSearch'
	| 'useLoaderData'
	| 'useLoaderDeps'
	| 'useRouteContext'
	| 'useNavigate'
>;

// Each entry supplies its context once. Routes retain the same hook slots and
// inherited router-core combinators without creating ordinary-renderer routes.
export function createRouteHookBindings(hooks: RouteHooks, useRouter: typeof UseRouter) {
	const {
		useMatch,
		useParams,
		useSearch,
		useLoaderData,
		useLoaderDeps,
		useRouteContext,
		useNavigate,
	} = hooks;
	function attachRouteHooks(self: any, strictLoaderHooks: boolean): void {
		self.useMatch = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useMatch(
				{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
				subSlot(slot, 'r:m'),
			);
		};
		self.useRouteContext = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useRouteContext({ ...opts, from: self.id }, subSlot(slot, 'r:ctx'));
		};
		self.useSearch = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useSearch(
				{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
				subSlot(slot, 'r:s'),
			);
		};
		self.useParams = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useParams(
				{ select: opts.select, structuralSharing: opts.structuralSharing, from: self.id },
				subSlot(slot, 'r:p'),
			);
		};
		self.useLoaderDeps = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useLoaderDeps(
				strictLoaderHooks ? { ...opts, from: self.id } : { ...opts, from: self.id, strict: false },
				subSlot(slot, 'r:d'),
			);
		};
		self.useLoaderData = (...args: any[]) => {
			const [user, slot] = splitSlot(args);
			const opts = user[0] ?? {};
			return useLoaderData(
				strictLoaderHooks ? { ...opts, from: self.id } : { ...opts, from: self.id, strict: false },
				subSlot(slot, 'r:l'),
			);
		};
	}

	function attachRouteNavigation(self: any): void {
		self.useNavigate = (...args: any[]) => {
			const [, slot] = splitSlot(args);
			return useNavigate({ from: self.fullPath }, subSlot(slot, 'r:n'));
		};
	}

	function attachLazyRouteHooks(self: any) {
		const id = self.options.id;
		self.useMatch = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			const options = user[0] ?? {};
			return useMatch(
				{
					select: options.select,
					from: id,
					structuralSharing: options.structuralSharing,
				},
				subSlot(slot, 'lr:m'),
			);
		}) as typeof self.useMatch;
		self.useRouteContext = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			return useRouteContext({ ...(user[0] ?? {}), from: id }, subSlot(slot, 'lr:c'));
		}) as typeof self.useRouteContext;
		self.useSearch = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			const options = user[0] ?? {};
			return useSearch(
				{
					select: options.select,
					from: id,
					structuralSharing: options.structuralSharing,
				},
				subSlot(slot, 'lr:s'),
			);
		}) as typeof self.useSearch;
		self.useParams = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			const options = user[0] ?? {};
			return useParams(
				{
					select: options.select,
					from: id,
					structuralSharing: options.structuralSharing,
				},
				subSlot(slot, 'lr:p'),
			);
		}) as typeof self.useParams;
		self.useLoaderDeps = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			return useLoaderDeps({ ...(user[0] ?? {}), from: id }, subSlot(slot, 'lr:d'));
		}) as typeof self.useLoaderDeps;
		self.useLoaderData = ((...args: Array<any>) => {
			const [user, slot] = splitSlot(args);
			return useLoaderData({ ...(user[0] ?? {}), from: id }, subSlot(slot, 'lr:l'));
		}) as typeof self.useLoaderData;
		self.useNavigate = ((...args: Array<any>) => {
			const [, slot] = splitSlot(args);
			const router = useRouter();
			return useNavigate(
				{ from: (router.routesById as Record<string, any>)[id].fullPath },
				subSlot(slot, 'lr:n'),
			);
		}) as typeof self.useNavigate;
	}

	return { attachRouteHooks, attachRouteNavigation, attachLazyRouteHooks };
}
