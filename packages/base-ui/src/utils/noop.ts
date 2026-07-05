// Ported from .base-ui/packages/react/src/internals/noop.ts (@base-ui/utils/empty NOOP).
// A single shared no-op — context hooks compare against it BY IDENTITY to detect "no
// provider" (e.g. `context.setValidityData === NOOP`), so it must be one module-level value.
export function NOOP(): void {}
