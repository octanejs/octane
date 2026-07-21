// idle hydration strategy — port of @tanstack/react-start-client's
// hydration/idle.ts. Delegates the requestIdleCallback gating to
// @tanstack/start-client-core and attaches octane's GenericHydrate renderer.
import { idle as coreIdle, withHydrationRenderer } from '@tanstack/start-client-core/hydration';
import { GenericHydrate } from '../GenericHydrate.tsrx';

/* @__NO_SIDE_EFFECTS__ */
export function idle(options = {}) {
	return /* @__PURE__ */ withHydrationRenderer(coreIdle(options), GenericHydrate);
}
