import type { ComponentBody } from 'octane';
import { useObserverWithSlot } from './useObserver';

export type ObserverProps = {
	children?: () => unknown;
	render?: () => unknown;
};

const observerSlot = Symbol('@octanejs/mobx:Observer');

export const Observer: ComponentBody<ObserverProps> = ({ children, render }) => {
	if (children && render) {
		console.error('MobX Observer: Do not use children and render at the same time.');
	}
	const component = children || render;
	return typeof component === 'function'
		? useObserverWithSlot(component, 'Observer', observerSlot)
		: null;
};

(Observer as ComponentBody<ObserverProps> & { displayName?: string }).displayName = 'Observer';
