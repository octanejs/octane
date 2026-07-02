// Ported from @radix-ui/react-toggle. A two-state button: `aria-pressed` +
// `data-state="on"/"off"` over a controllable `pressed`.
import { createElement } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';

export function Toggle(props: any): any {
	const slot = S('Toggle');
	const { pressed: pressedProp, defaultPressed, onPressedChange, ...buttonProps } = props ?? {};
	const [pressed, setPressed] = useControllableState<boolean>(
		{ prop: pressedProp, onChange: onPressedChange, defaultProp: defaultPressed ?? false },
		subSlot(slot, 'pressed'),
	);
	return createElement(Primitive.button, {
		type: 'button',
		'aria-pressed': pressed,
		'data-state': pressed ? 'on' : 'off',
		'data-disabled': props?.disabled ? '' : undefined,
		...buttonProps,
		onClick: composeEventHandlers(props?.onClick, () => {
			if (!props?.disabled) {
				setPressed(!pressed);
			}
		}),
	});
}

export { Toggle as Root };
