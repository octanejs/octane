import { useEffect } from 'octane';

useEffect(() => {});
useEffect(() => () => {});

// Effects must start synchronously so the returned value can be interpreted as
// an optional cleanup. Start async work inside the body instead.
// @ts-expect-error — an async effect returns a Promise, not an optional cleanup.
useEffect(async () => {});

// @ts-expect-error — an effect may return only undefined or a cleanup function.
useEffect(() => 42);

// Async cleanups cannot participate in synchronous teardown ordering and their
// rejected promises would otherwise escape the lifecycle error boundary.
// @ts-expect-error — a cleanup must finish synchronously.
useEffect(() => async () => {});
