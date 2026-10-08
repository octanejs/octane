/**
 * Type surface for the boundaries the shared TSRX transform's type-only output
 * renders for `@try`: `<Suspense>` for a `@pending` clause and
 * `<TsrxErrorBoundary>` for a `@catch` clause. The volar virtual TSX imports
 * both from this subpath (the platform's `imports.suspense` and
 * `imports.errorBoundary`). Runtime compilation lowers `@try` to `tryBlock` and
 * never imports this module, so nothing calls these values.
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
