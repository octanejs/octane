import type { TransitionProps } from '@octanejs/transition-group';
import type { InputProps } from '../components.tsrx';
import { asComponentElement } from './component-element';

type InputComponent = typeof import('../components.tsrx').Input;
type AnimatedTransitionProps =
	Pick<TransitionProps, 'in' | 'onExited' | 'appear' | 'enter' | 'exit'>;
export type AnimatedInputProps = InputProps & AnimatedTransitionProps;

export function animatedInput(WrappedComponent: InputComponent): InputComponent {
	function AnimatedInput(props: AnimatedInputProps) {
		const {
			in: _in,
			onExited: _onExited,
			appear: _appear,
			enter: _enter,
			exit: _exit,
			...inputProps
		} = props;
		return asComponentElement<InputComponent>(createElement(WrappedComponent, inputProps));
	}
	return AnimatedInput;
}
import { createElement } from 'octane';
