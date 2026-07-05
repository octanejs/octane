// Ported from .base-ui/packages/react/src/toggle/Toggle.tsx (v1.6.0). A two-state button
// (`aria-pressed`). Standalone it is uncontrolled/controlled via `pressed`/`defaultPressed`;
// inside a <ToggleGroup> it derives pressed from the group value and renders through
// CompositeItem (that group path lands with ToggleGroup — here the standalone path is
// complete and the group branch is wired to the shared context).
//
// octane adaptations: forwardRef → ref-as-prop; the click handler receives the NATIVE
// event directly (Base UI reads `event.nativeEvent` off the synthetic wrapper — octane has
// none, so we pass the native event straight into the change-details); the dev
// group-value warning is dropped.
import { createElement, useMemo } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useToggleGroupContext } from './utils/ToggleGroupContext';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { CompositeItem } from './utils/composite/CompositeItem';

export interface ToggleState {
	pressed: boolean;
	disabled: boolean;
}

export interface ToggleProps {
	pressed?: boolean;
	defaultPressed?: boolean;
	disabled?: boolean;
	onPressedChange?: (pressed: boolean, eventDetails: any) => void;
	value?: string;
	nativeButton?: boolean;
	render?: RenderProp<ToggleState>;
	className?: string | ((state: ToggleState) => string | undefined);
	style?: Record<string, any> | ((state: ToggleState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function Toggle(props: ToggleProps): any {
	const slot = S('Toggle');
	const {
		className,
		defaultPressed: defaultPressedProp = false,
		disabled: disabledProp = false,
		form, // never participates in form validation
		onPressedChange,
		pressed: pressedProp,
		render,
		type, // cannot change button type
		value: valueProp,
		nativeButton = true,
		style,
		...elementProps
	} = props;

	// `|| undefined` handles a falsy value (e.g. "").
	const value = useBaseUiId(valueProp || undefined, subSlot(slot, 'value'));
	const groupContext = useToggleGroupContext();
	const groupValue = groupContext?.value ?? [];

	const defaultPressed = groupContext ? undefined : defaultPressedProp;
	const disabled = (disabledProp || groupContext?.disabled) ?? false;

	const [pressed, setPressedState] = useControlled<boolean>(
		{
			controlled: groupContext
				? value !== undefined && groupValue.indexOf(value) > -1
				: pressedProp,
			default: defaultPressed,
			name: 'Toggle',
			state: 'pressed',
		},
		subSlot(slot, 'pressed'),
	);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const state: ToggleState = { disabled, pressed };

	const refs = [buttonRef, props.ref];
	const buttonProps = [
		{
			'aria-pressed': pressed,
			onClick(event: any) {
				const nextPressed = !pressed;
				// octane: the click handler receives the native event directly.
				const details = createChangeEventDetails(REASONS.none, event);

				// `onPressedChange` runs before the group commits so canceling here can also
				// veto the group value change (they share this `details` object).
				onPressedChange?.(nextPressed, details);
				if (details.isCanceled) {
					return;
				}
				if (value) {
					groupContext?.setGroupValue?.(value, nextPressed, details);
				}
				if (details.isCanceled) {
					return;
				}
				setPressedState(nextPressed);
			},
		},
		elementProps,
		getButtonProps,
	];

	const element = useRenderElement(
		'button',
		{ render, className, style },
		{ enabled: !groupContext, state, ref: refs, props: buttonProps },
		subSlot(slot, 're'),
	);

	// A disabled toggle is natively disabled and cannot hold roving focus. Toolbar reads this
	// to compute `disabledIndices` (consumed by the group/CompositeItem path).
	const itemMetadata = useMemo(
		() => ({ disabled, focusableWhenDisabled: false }),
		[disabled],
		subSlot(slot, 'meta'),
	);

	if (groupContext) {
		// Group path: render through CompositeItem for roving focus.
		return createElement(CompositeItem, {
			tag: 'button',
			render,
			className,
			style,
			metadata: itemMetadata,
			state,
			refs,
			props: buttonProps,
		});
	}

	return element;
}

export { Toggle };
