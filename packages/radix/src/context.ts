// Ported from @radix-ui/react-context (createContextScope). Scoped context factories so a
// primitive can be composed inside another (e.g. Accordion's internal Collapsible) without
// its context colliding with a user's separate instance of the same primitive. React's
// createContext → octane createContext; the `scope` indirection + scope composition are
// preserved. The hooks are slot-threaded for octane's plain-`.ts` consumption
// (S/splitSlot/subSlot) since these files skip the compiler's auto-slotting pass.
import {
	createContext as octaneCreateContext,
	createElement,
	useContext as octaneUseContext,
	useMemo,
} from 'octane';

import { S, splitSlot, subSlot } from './internal';

type Scope<C = any> = { [scopeName: string]: (C | undefined)[] } | undefined;
type ScopeHook = (...args: any[]) => any;
interface CreateScope {
	scopeName: string;
	(): ScopeHook;
}

export function createContextScope(
	scopeName: string,
	createContextScopeDeps: CreateScope[] = [],
): [
	<T>(
		rootComponentName: string,
		defaultContext?: T,
	) => [(props: any) => any, (consumerName: string, scope?: Scope, ...slot: any[]) => T],
	CreateScope,
] {
	let defaultContexts: any[] = [];

	function createContext<T>(
		rootComponentName: string,
		defaultContext?: T,
	): [(props: any) => any, (consumerName: string, scope?: Scope, ...slot: any[]) => T] {
		const BaseContext = octaneCreateContext(defaultContext);
		const index = defaultContexts.length;
		defaultContexts = [...defaultContexts, defaultContext];

		function Provider(props: any): any {
			const { scope, children, ...context } = props;
			const Context = scope?.[scopeName]?.[index] || BaseContext;
			const value = useMemo(() => context, Object.values(context), S(scopeName + ':P' + index));
			return createElement(Context.Provider, { value, children });
		}

		function useContext(consumerName: string, scope?: Scope): T {
			const Context = scope?.[scopeName]?.[index] || BaseContext;
			const context = octaneUseContext(Context);
			if (context) return context as T;
			if (defaultContext !== undefined) return defaultContext;
			throw new Error(`\`${consumerName}\` must be used within \`${rootComponentName}\``);
		}

		return [Provider, useContext];
	}

	const createScope: CreateScope = (() => {
		const scopeContexts = defaultContexts.map((defaultContext) =>
			octaneCreateContext(defaultContext),
		);
		return function useScope(...args: any[]): Record<string, Scope> {
			const [user, slotArg] = splitSlot(args);
			const slot = slotArg ?? S(scopeName + ':useScope');
			const scope = user[0] as Scope;
			const contexts = scope?.[scopeName] || scopeContexts;
			return useMemo(
				() => ({ [`__scope${scopeName}`]: { ...scope, [scopeName]: contexts } }),
				[scope, contexts],
				subSlot(slot, 'm'),
			);
		};
	}) as CreateScope;
	createScope.scopeName = scopeName;

	return [createContext, composeContextScopes(createScope, ...createContextScopeDeps)];
}

function composeContextScopes(...scopes: CreateScope[]): CreateScope {
	const baseScope = scopes[0];
	if (scopes.length === 1) return baseScope;

	const createScope: CreateScope = (() => {
		const scopeHooks = scopes.map((createScope2) => ({
			useScope: createScope2(),
			scopeName: createScope2.scopeName,
		}));
		return function useComposedScopes(...args: any[]): any {
			const [user, slotArg] = splitSlot(args);
			const slot = slotArg ?? S('composed:' + baseScope.scopeName);
			const overrideScopes = user[0] as Scope;
			const nextScopes = scopeHooks.reduce((acc: any, { useScope, scopeName }, i) => {
				const scopeProps = useScope(overrideScopes, subSlot(slot, 's' + i));
				const currentScope = scopeProps[`__scope${scopeName}`];
				return { ...acc, ...currentScope };
			}, {} as any);
			return useMemo(
				() => ({ [`__scope${baseScope.scopeName}`]: nextScopes }),
				[nextScopes],
				subSlot(slot, 'm'),
			);
		};
	}) as CreateScope;
	createScope.scopeName = baseScope.scopeName;
	return createScope;
}
