/**
 * Private client-side compiler/runtime ABI. Keep this module independent of
 * the server renderer and optional RPC serialization so unused capabilities
 * never enter or even need to be resolved by ordinary browser bundles.
 */
export * from '../runtime.js';
export { isContext } from '../context-identity.js';
export {
	__captureHydrationInput,
	__hydrationComponentSlot,
	__registerHydrationInputComponent,
	__ownedHydrationInputs,
	__sameHydrationInput,
	__sameHydrationSource,
	__sameHydrationOptionalInput,
	__observeHydrationOptionalInput,
} from '../hydration-inputs.js';
export { markSingleRoot as __s } from '../runtime.js';
export { signalOwnerUse } from '../signals/owner-context.js';
