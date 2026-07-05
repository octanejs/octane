/**
 * @octanejs/mdx — the runtime provider layer.
 *
 * Strategy (docs/react-library-compat-plan.md §2): @mdx-js/mdx's core is
 * framework-agnostic (the compile pipeline lives in `./compile` + `./vite`);
 * only @mdx-js/react's thin React layer is ported here, onto octane context.
 * `MDXProvider` / `useMDXComponents` are a line-for-line port of
 * @mdx-js/react/lib/index.js (v3): the same context, the same
 * function-vs-object `components` merge, the same `disableParentContext`
 * behavior.
 *
 * Compiled `.mdx` modules import `useMDXComponents` from here (the pipeline's
 * default `providerImportSource`) and merge its result under `props.components`
 * — so a components mapping can come from either the provider context or the
 * `components` prop, exactly like MDX + React.
 *
 * Octane-specific mechanics: this is a plain-`.ts` binding, so its own hook
 * calls take EXPLICIT slot symbols (the package is excluded from the compiler's
 * auto-slotting pass; published node_modules are skipped by it anyway). A
 * compiled caller of `useMDXComponents` gets a per-call-site slot appended by
 * the compiler (`use*` name), which we split off the tail and forward to
 * `useMemo`; an unslotted caller — chiefly the `_provideComponents()` alias MDX
 * emits, whose name the compiler does not recognize as a hook — falls back to a
 * stable module-level symbol (hook state is keyed per (scope, slot), so a
 * module-level symbol is a distinct slot per component instance).
 */
import { createContext, createElement, useContext, useMemo, type ComponentBody } from 'octane';

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

// Module-level slot fallbacks (see module doc): distinct per component instance
// because hook state is keyed per (scope, slot).
const USE_MDX_COMPONENTS_SLOT = Symbol.for('@octanejs/mdx:useMDXComponents');
const MDX_PROVIDER_SLOT = Symbol.for('@octanejs/mdx:MDXProvider');

/**
 * Get the current components mapping: the provider context merged with (or
 * mapped through) `components`. Port of @mdx-js/react's `useMDXComponents`,
 * including the `useMemo` on `[contextComponents, components]` so the merged
 * object is referentially stable across re-renders with unchanged inputs.
 */
export function useMDXComponents(
	components?: MDXComponentsProp | null | symbol,
	slot?: symbol,
): MDXComponents {
	// Compiled callers append their call-site slot as the TRAILING arg — which is
	// arg 0 for the common no-`components` call (`useMDXComponents()` compiles to
	// `useMDXComponents(SLOT)`). Normalize: a symbol anywhere in the tail is the
	// slot, never a components value.
	if (typeof components === 'symbol') {
		slot = components;
		components = undefined;
	}
	const contextComponents = useContext(MDXContext);
	return useMemo(
		() => {
			// Custom merge via a function (@mdx-js/react parity).
			if (typeof components === 'function') return components(contextComponents);
			return { ...contextComponents, ...(components as MDXComponents | null | undefined) };
		},
		[contextComponents, components],
		slot ?? USE_MDX_COMPONENTS_SLOT,
	);
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
		allComponents = useMDXComponents(props.components, MDX_PROVIDER_SLOT);
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
