// Local type shim for the vendored core's type-only `react` import
// (lib/router/utils.ts references React.ReactNode / React.ComponentType on
// RouteObject's element/Component fields). This package's consumers compile
// against octane, not @types/react — alias the two names onto octane's
// equivalents. Renderables in octane are element descriptors / primitives /
// arrays (see octane's ElementDescriptor), and components are ComponentBody.
import type { ComponentBody } from 'octane';

export type ReactNode = unknown;
export type ComponentType<P = any> = ComponentBody<P>;
