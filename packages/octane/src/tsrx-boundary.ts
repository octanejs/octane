import type { Octane } from './jsx-runtime.js';

/**
 * Type surface for components the shared TSRX transform's type-only output
 * imports from this subpath: the boundaries it renders for `@try` and the
 * `Dynamic` component it uses to type-check dynamic tags. Runtime compilation
 * lowers these constructs directly and never imports this module, so nothing
 * calls these values.
 *
 * One virtual TSX lowering serves every renderer, so neither boundary can take
 * the DOM runtime's component types: a universal renderer's JSX (ink, Lynx,
 * OpenTUI) types `JSX.Element` as the closed `UniversalRenderable` and declares
 * no `JSX.ElementType`, so it rejects a component returning `void` or
 * `unknown`. Both return `never`, which every renderer's JSX accepts.
 *
 * `content` is the transform's expression-position prop form of children. The
 * `@catch` clause becomes a function-typed `fallback`, which gives authored
 * `@catch (error, reset)` bindings contextual parameter types under
 * `noImplicitAny`.
 */

interface BoundaryContentProps {
	content?: unknown;
	children?: unknown;
}

function typeOnlyBoundary(): void {}

export const Suspense = typeOnlyBoundary as unknown as (
	props: BoundaryContentProps & { fallback?: unknown },
) => never;

export const TsrxErrorBoundary = typeOnlyBoundary as unknown as (
	props: BoundaryContentProps & {
		fallback?: (error: unknown, reset: () => void) => unknown;
	},
) => never;

type DynamicTag = string | ((props: any) => unknown);

type DynamicTagProps<
	T extends DynamicTag,
	IntrinsicElements extends object,
> = T extends keyof IntrinsicElements
	? IntrinsicElements[T]
	: T extends string
		? IntrinsicElements[keyof IntrinsicElements]
		: T extends (props: infer Props) => unknown
			? Props
			: never;

/** Preserve the selected host element's or component's props in Volar's TSX view. */
export type DynamicFor<IntrinsicElements extends object> = <T extends DynamicTag>(
	props: { is: T } & DynamicTagProps<T, IntrinsicElements>,
) => never;

export const Dynamic = typeOnlyBoundary as unknown as DynamicFor<Octane.JSX.IntrinsicElements>;
