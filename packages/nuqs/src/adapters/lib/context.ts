import { createContext, createElement, useContext, type Context, type OctaneNode } from 'octane';
import type { Options } from '../../defs';
import { error } from '../../lib/errors';
import { globalWeakSingleton } from '../../lib/global-singleton';
import type { AdapterInterface, UseAdapterHook } from './defs';

export type AdapterProps = {
	defaultOptions?: Partial<
		Pick<Options, 'history' | 'shallow' | 'clearOnDefault' | 'scroll' | 'limitUrlUpdates'>
	>;
	processUrlSearchParams?: (search: URLSearchParams) => URLSearchParams;
};

export type AdapterContext = AdapterProps & {
	useAdapter: UseAdapterHook;
};

// Keyed by createContext identity: copies sharing one octane instance share
// the context, while distinct octane instances keep isolated contexts. Same
// dedup hazard as @octanejs/jotai's store context and @octanejs/redux's
// Context — duplicate module instances under Vite dev would otherwise each
// mint their own context object, and a Provider from one would be invisible to
// a consumer reading the other.
export const context: Context<AdapterContext> = globalWeakSingleton(
	'adapter-context',
	createContext,
	() => {
		const ctx = createContext<AdapterContext>({
			useAdapter() {
				throw new Error(error(404));
			},
		});
		// Octane's Context carries no `displayName`; assign for parity with
		// upstream (harmless if unused by tooling).
		(ctx as { displayName?: string }).displayName = 'NuqsAdapterContext';
		return ctx;
	},
);

declare global {
	interface Window {
		__NuqsAdapterContext?: typeof context;
	}
}

// Detect adapter contexts that cannot be shared across duplicate copies:
// nuqs version mismatch, or multiple octane instances. Same-version copies
// on one octane runtime share a single context via globalWeakSingleton above.
if (typeof window !== 'undefined') {
	if (window.__NuqsAdapterContext && window.__NuqsAdapterContext !== context) {
		console.error(error(303));
	}
	window.__NuqsAdapterContext = context;
}

export type AdapterProvider = (
	props: AdapterProps & {
		children: OctaneNode;
	},
) => OctaneNode;

/**
 * Create a custom adapter (context provider) for nuqs to work with your framework / router.
 *
 * Adapters are based on octane Context.
 *
 * @param useAdapter
 * @returns
 */
export function createAdapterProvider(useAdapter: UseAdapterHook): AdapterProvider {
	return ({ children, defaultOptions, processUrlSearchParams, ...props }) =>
		createElement(
			context.Provider,
			{
				...props,
				value: { useAdapter, defaultOptions, processUrlSearchParams },
			},
			children,
		);
}

export function useAdapter(watchKeys: string[]): AdapterInterface {
	const value = useContext(context);
	if (!('useAdapter' in value)) {
		throw new Error(error(404));
	}
	return value.useAdapter(watchKeys);
}

export const useAdapterDefaultOptions = (): AdapterProps['defaultOptions'] =>
	useContext(context).defaultOptions;

export const useAdapterProcessUrlSearchParams = (): AdapterProps['processUrlSearchParams'] =>
	useContext(context).processUrlSearchParams;
