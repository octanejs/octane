import type { Context as OctaneContext } from 'octane';

// Renderer-facing aliases for the handful of React types used by the upstream
// adapter. Octane accepts descriptors, primitives, arrays, and nullish values
// as renderables, so the ReactNode-equivalent is intentionally broad.
export type ReactNode = unknown;
export type PropsWithChildren<P = object> = P & { children?: ReactNode };
export type FunctionComponent<P = object> = (props: P) => ReactNode;
export type ComponentType<P = object> = FunctionComponent<P>;
export type Context<T> = OctaneContext<T>;
