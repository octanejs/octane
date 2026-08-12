import { Children, cloneElement, type ElementDescriptor } from 'octane';
import TransitionGroup from './TransitionGroup.tsrx';
import type { ReplaceTransitionProps, TransitionCallbacks } from './types.ts';

export function ReplaceTransition(props: ReplaceTransitionProps) @{
	const [first, second] = Children.toArray(props.children) as ElementDescriptor[];
	if (!first || !second) throw new Error('"children" must be exactly two transition components.');

	const lifecycle = (child: ElementDescriptor, name: keyof TransitionCallbacks) => (
		...args: unknown[]
	) => {
		(child.props[name] as ((...values: unknown[]) => void) | undefined)?.(...args);
		(props[name] as ((...values: unknown[]) => void) | undefined)?.(undefined);
	};
	const {
		children: _children,
		in: inProp,
		onEnter: _onEnter,
		onEntering: _onEntering,
		onEntered: _onEntered,
		onExit: _onExit,
		onExiting: _onExiting,
		onExited: _onExited,
		...groupProps
	} = props;
	const selected =
		inProp
			? cloneElement(first, {
					key: 'first',
					onEnter: lifecycle(first, 'onEnter'),
					onEntering: lifecycle(first, 'onEntering'),
					onEntered: lifecycle(first, 'onEntered'),
				})
			: cloneElement(second, {
					key: 'second',
					onEnter: lifecycle(second, 'onExit'),
					onEntering: lifecycle(second, 'onExiting'),
					onEntered: lifecycle(second, 'onExited'),
				});

	<TransitionGroup {...groupProps} children={[selected]} />
}

export default ReplaceTransition;
