/**
 * Octane replacements for the React types the upstream binding uses in its
 * public props. Upstream reaches for `React.CSSProperties`, `React.ReactNode`
 * and `React.Ref`; this module is where those three become Octane types so the
 * ported components read like their upstream counterparts everywhere else.
 *
 * There is no upstream module at this path. It is a port-owned addition.
 */
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

/** Structural equivalent of `React.CSSProperties`, taken from the host typing. */
export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
> & {
	[customProperty: `--${string}`]: string | number | undefined;
};

/** Anything renderable in a child position — upstream's `React.ReactNode`. */
export type MapChildren = OctaneNode;

/**
 * Octane has no `forwardRef`: a ref is an ordinary prop, so a component that
 * exposes an imperative handle declares `ref?: Ref<T>` in its own props.
 */
export type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;
