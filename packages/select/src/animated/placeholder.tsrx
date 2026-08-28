import type { PlaceholderProps } from '../components.tsrx';
import { collapseDuration, Fade } from './transitions.tsrx';
import { asComponentElement } from './component-element';

type PlaceholderComponent = typeof import('../components.tsrx').Placeholder;

export function animatedPlaceholder(WrappedComponent: PlaceholderComponent): PlaceholderComponent {
	function AnimatedPlaceholder(props: PlaceholderProps) {
		return asComponentElement<PlaceholderComponent>(
			createElement(Fade, {
				component: WrappedComponent as never,
				duration: props.isMulti ? collapseDuration : 1,
				...props,
			}),
		);
	}
	return AnimatedPlaceholder;
}
import { createElement } from 'octane';
