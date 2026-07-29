import { memo } from 'octane';
import type { ComponentBody } from 'octane';
import { isUsingStaticRendering } from './staticRendering';
import { useObserverWithSlot } from './useObserver';

const OBSERVED = Symbol.for('@octanejs/mobx/observed');

export type ObserverComponent<P> = ComponentBody<P> & {
	displayName?: string;
};

export function observer<P>(baseComponent: ComponentBody<P>): ObserverComponent<P> {
	const observedBase = baseComponent as ObserverComponent<P>;
	if ((observedBase as ObserverComponent<P> & { [OBSERVED]?: true })[OBSERVED]) {
		throw new Error(
			'[@octanejs/mobx] You are trying to apply observer to an already observed component.',
		);
	}
	if (isUsingStaticRendering()) return observedBase;

	const baseComponentName = observedBase.displayName || observedBase.name || 'observed';
	const hookSlot = Symbol(`@octanejs/mobx:observer:${baseComponentName}`);
	const observerComponent: ObserverComponent<P> = (props, scope, extra) =>
		useObserverWithSlot(() => baseComponent(props, scope, extra), baseComponentName, hookSlot);

	observerComponent.displayName = observedBase.displayName;
	if (Object.getOwnPropertyDescriptor(observerComponent, 'name')?.configurable) {
		Object.defineProperty(observerComponent, 'name', {
			value: observedBase.name,
			configurable: true,
		});
	}
	const memoized = memo(observerComponent) as ObserverComponent<P>;
	Object.defineProperty(memoized, OBSERVED, { value: true });
	return memoized;
}
