/**
 * @octanejs/mdx — the runtime provider layer.
 *
 * Strategy (docs/react-library-compat-plan.md §2): @mdx-js/mdx's core is
 * framework-agnostic (the compile pipeline lives in `./compile` + `./vite`);
 * only @mdx-js/react's thin React layer is ported here, onto octane context.
 * `MDXProvider` / `useMDXComponents` are a port of @mdx-js/react/lib/index.js
 * (v3): the same context, the same function-vs-object `components` merge, the
 * same `disableParentContext` behavior.
 *
 * Compiled `.mdx` modules import `useMDXComponents` from here (the pipeline's
 * default `providerImportSource`) and merge its result under `props.components`
 * — so a components mapping can come from either the provider context or the
 * `components` prop, exactly like MDX + React.
 *
 * ONE deliberate divergence from the React source: @mdx-js/react wraps the
 * merge in `useMemo([contextComponents, components])` — a referential-stability
 * optimization only. Octane's `useMemo` is the CLIENT runtime's (the `octane`
 * entry has no server condition), and it requires a live render scope — a
 * server-compiled document calls `useMDXComponents()` during `renderToString`,
 * where the client scope is null and `useMemo` would crash. `useContext`, by
 * contrast, is null-scope safe (it returns the context default). So the merge
 * runs unmemoized: same observable mapping every render, valid in both
 * runtimes (on the server the client context yields its default `{}`, and the
 * `props.components` route still applies — context threading across an SSR
 * pass is an open question for all octane bindings).
 */
import { createContext, createElement, useContext, type ComponentBody } from 'octane';

/**
 * A components mapping: markdown element name (`h1`, `p`, `code`, …) or
 * embedded-component name → the octane component (or replacement host tag
 * name) that renders it. The special `wrapper` key is the document layout.
 */
export interface MDXComponents {
	[name: string]: ComponentBody<any> | string | MDXComponents;
}

/** `components` as accepted by MDXProvider/useMDXComponents: a mapping, or a function of the inherited mapping (@mdx-js/react parity). */
export type MDXComponentsProp = MDXComponents | ((inherited: MDXComponents) => MDXComponents);

// Per @mdx-js/react lib/index.js: `const emptyComponents = {}` +
// `const MDXContext = React.createContext(emptyComponents)`.
const emptyComponents: MDXComponents = {};
const MDXContext = createContext<MDXComponents>(emptyComponents);

/**
 * Get the current components mapping: the provider context merged with (or
 * mapped through) `components`. Port of @mdx-js/react's `useMDXComponents`
 * (see the module doc for the deliberately-dropped `useMemo`).
 *
 * `use*`-named, so a compiled caller appends its call-site slot symbol as the
 * trailing arg — tolerated and ignored (no hook state lives here; `useContext`
 * is not slot-threaded in octane).
 */
export function useMDXComponents(
	components?: MDXComponentsProp | null | symbol,
	_slot?: symbol,
): MDXComponents {
	// The compiler-injected slot is arg 0 for the common no-`components` call
	// (`useMDXComponents()` compiles to `useMDXComponents(SLOT)`). A symbol is
	// never a components value — normalize it away.
	if (typeof components === 'symbol') components = undefined;
	const contextComponents = useContext(MDXContext);
	// Custom merge via a function (@mdx-js/react parity).
	if (typeof components === 'function') return components(contextComponents);
	return { ...contextComponents, ...components };
}

export interface MDXProviderProps {
	/** MDX content (and anything else that reads the mapping) rendered under this provider. */
	children?: unknown;
	/** Mapping to merge over (or function of) the inherited mapping. */
	components?: MDXComponentsProp | null;
	/** Ignore any parent MDXProvider and use exactly `components` (@mdx-js/react parity). */
	disableParentContext?: boolean;
}

/**
 * Provider of the MDX components context. Port of @mdx-js/react's
 * `MDXProvider`: nested providers MERGE by default (`components` over the
 * inherited mapping); `disableParentContext` starts from scratch.
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
	return createElement(MDXContext.Provider as ComponentBody<any>, {
		value: allComponents,
		children: props.children,
	});
}

/** The props every compiled MDX document component accepts. */
export interface MDXProps {
	/** Per-render components mapping, merged over the provider context. */
	components?: MDXComponents;
	[key: string]: unknown;
}
