/// <reference lib="esnext.collection" />

// MobX 7's public observable-set methods use ReadonlySetLike. Carry that
// standard-library declaration for consumers with an older explicit lib set.
import './utils/assertEnvironment';
import { observerFinalizationRegistry } from './utils/observerFinalizationRegistry';
import { TimerBasedFinalizationRegistry } from './utils/UniversalFinalizationRegistry';

export * from 'mobx';
export { Observer } from './ObserverComponent';
export type { ObserverProps } from './ObserverComponent';
export { observer } from './observer';
export type { ObserverComponent } from './observer';
export {
	enableStaticRendering,
	isUsingStaticRendering,
	useStaticRendering,
} from './staticRendering';
export { useLocalObservable } from './useLocalObservable';
export { useObserver } from './useObserver';
export { observerFinalizationRegistry as _observerFinalizationRegistry };
export const clearTimers: () => void =
	observerFinalizationRegistry instanceof TimerBasedFinalizationRegistry
		? observerFinalizationRegistry.finalizeAllImmediately
		: () => {};
