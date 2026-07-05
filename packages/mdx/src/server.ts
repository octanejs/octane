/**
 * @octanejs/mdx/server — the provider layer for SERVER renders.
 *
 * octane's client and server runtimes are separate modules with disjoint
 * context stores, so the client `MDXProvider` (./index.ts, built on `octane`
 * context) cannot thread a mapping through `renderToString` — its `useContext`
 * runs null-scope on the server and yields the `{}` default. The server
 * runtime has its own full context implementation (`scope.$$ctxValues`,
 * top-down within one render pass), so this entry mirrors the provider layer
 * onto `octane/server` context: same merge, same function-form `components`,
 * same `disableParentContext` — see ./index.ts for the @mdx-js/react port
 * notes. KEEP THE MERGE SEMANTICS IN LOCKSTEP with ./index.ts (both are the
 * same ~40-line port; only the runtime import differs).
 *
 * The compile pipeline points a server-mode document's `providerImportSource`
 * here (client mode keeps `@octanejs/mdx`), so `useMDXComponents()` inside a
 * server-compiled document reads THIS context — and a document rendered under
 * this `MDXProvider` serializes with the same mapping the client provider
 * produces at hydration. Client bundles never import this module.
 */
import { createContext, createElement, useContext } from 'octane/server';
import type { MDXComponents, MDXComponentsProp, MDXProviderProps } from './index';

export type { MDXComponents, MDXComponentsProp, MDXProviderProps, MDXProps } from './index';

const emptyComponents: MDXComponents = {};
const MDXContext = createContext<MDXComponents>(emptyComponents);

/**
 * Server `useMDXComponents`: the provider context merged with (or mapped
 * through) `components`. Same contract as the client export (./index.ts).
 */
export function useMDXComponents(
	components?: MDXComponentsProp | null | symbol,
	_slot?: symbol,
): MDXComponents {
	// Tolerate a compiler-injected trailing slot symbol, like the client export.
	if (typeof components === 'symbol') components = undefined;
	const contextComponents = useContext(MDXContext);
	if (typeof components === 'function') return components(contextComponents);
	return { ...contextComponents, ...components };
}

/**
 * Server `MDXProvider`: provides the mapping for every document rendered
 * below it in this `renderToString` pass. Mount shape mirrors the client
 * provider exactly (one provider component frame + one context frame), so a
 * document server-rendered under this provider hydrates byte-for-byte into
 * the client `MDXProvider`.
 */
export function MDXProvider(props: MDXProviderProps): unknown {
	let allComponents: MDXComponents;
	if (props.disableParentContext) {
		allComponents =
			typeof props.components === 'function'
				? props.components(emptyComponents)
				: (props.components ?? emptyComponents);
	} else {
		allComponents = useMDXComponents(props.components);
	}
	return createElement(MDXContext.Provider as any, {
		value: allComponents,
		children: props.children,
	});
}
