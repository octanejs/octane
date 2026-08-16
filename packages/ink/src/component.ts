import type { UniversalRenderable } from 'octane/universal/native';

/** A component compiled for Ink's Octane universal renderer. */
export type InkComponent<P = Record<string, never>> = (props: P) => UniversalRenderable;
