import type { TransitionProps } from '@octanejs/transition-group';
import type { MultiValueProps } from '../components.tsrx';
import { Collapse } from './transitions.tsrx';
import { asComponentElement } from './component-element';

type MultiValueComponent = typeof import('../components.tsrx').MultiValue;
type AnimatedTransitionProps = Pick<TransitionProps, 'in' | 'onExited'>;
export type AnimatedMultiValueProps = MultiValueProps & AnimatedTransitionProps;

export function animatedMultiValue(WrappedComponent: MultiValueComponent): MultiValueComponent {
	function AnimatedMultiValue(props: AnimatedMultiValueProps) {
		const { in: inProp, onExited, ...multiValueProps } = props;
		return asComponentElement<MultiValueComponent>(
			createElement(
				Collapse,
				{ in: inProp, onExited },
				createElement(WrappedComponent, { cropWithEllipsis: inProp, ...multiValueProps }),
			),
		);
	}
	return AnimatedMultiValue;
}
import { createElement } from 'octane';
