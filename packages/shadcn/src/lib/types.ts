// Host-element prop bases for the ported components. Octane exposes the same
// per-tag prop tables React does (`JSX.IntrinsicElements`), so a component that
// spreads onto a `<button>` types its rest props as that tag's real props —
// misspellings and wrong-typed handlers are caught at the call site.
import type { JSX } from 'octane/jsx-runtime';

export type HostProps<T extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[T];

/** Props for a component whose host is a `<div>` (the common wrapper shape). */
export type DivProps = HostProps<'div'>;
