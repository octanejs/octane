import type { ComponentBody, OctaneNode } from 'octane';
import { useObserverWithSlot } from './useObserver';

export type ObserverProps =
	| { children: () => OctaneNode; render?: never }
	| { children?: never; render: () => OctaneNode }
	| { children?: never; render?: never };

const observerSlot = Symbol('@octanejs/mobx:Observer');

export const Observer: ComponentBody<ObserverProps> & { displayName: string } = Object.assign(
	({ children, render }: ObserverProps) => {
		if (children && render) {
			console.error('MobX Observer: Do not use children and render in the same time in `Observer`');
		}
		const component = children || render;
		return typeof component === 'function'
			? useObserverWithSlot(component, 'Observer', observerSlot)
			: null;
	},
	{ displayName: 'Observer' },
);
