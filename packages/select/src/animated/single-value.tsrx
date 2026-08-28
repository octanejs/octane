import type { SingleValueProps } from '../components.tsrx';
import { Fade } from './transitions.tsrx';
import { asComponentElement } from './component-element';

type SingleValueComponent = typeof import('../components.tsrx').SingleValue;

export function animatedSingleValue(WrappedComponent: SingleValueComponent): SingleValueComponent {
	function AnimatedSingleValue(props: SingleValueProps) {
		return asComponentElement<SingleValueComponent>(
			createElement(Fade, {
				component: WrappedComponent as never,
				...props,
			}),
		);
	}
	return AnimatedSingleValue;
}
import { createElement } from 'octane';
