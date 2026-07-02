// Ported from @radix-ui/react-radio-group (source:
// .radix-primitives/packages/react/radio-group/src/radio-group.tsx). A `role=radiogroup`
// on a RovingFocusGroup: arrow keys move focus between items and CHECK the focused item
// (via a real `.click()` so the radio change event fires); each item is the internal
// Radio (see Radio.ts) with its hidden native bubble input inside forms.
import { createElement, useEffect, useRef } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import {
	createRadioScope,
	RadioBubbleInput,
	RadioIndicator,
	RadioProvider,
	RadioTrigger,
	useRadioContext,
} from './Radio';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { useControllableState } from './useControllableState';

const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

const RADIO_GROUP_NAME = 'RadioGroup';

const [createRadioGroupContext, createRadioGroupScope] = createContextScope(RADIO_GROUP_NAME, [
	createRovingFocusGroupScope,
	createRadioScope,
]);
export { createRadioGroupScope };
const useRovingFocusGroupScope = createRovingFocusGroupScope();
const useRadioScope = createRadioScope();

interface RadioGroupContextValue {
	name?: string;
	required: boolean;
	disabled: boolean;
	value: string | null;
	onValueChange(value: string): void;
}

const [RadioGroupProvider, useRadioGroupContext] =
	createRadioGroupContext<RadioGroupContextValue>(RADIO_GROUP_NAME);

export function Root(props: any): any {
	const slot = S('RadioGroup.Root');
	const {
		__scopeRadioGroup,
		name,
		defaultValue,
		value: valueProp,
		required = false,
		disabled = false,
		orientation,
		dir,
		loop = true,
		onValueChange,
		ref: forwardedRef,
		...groupProps
	} = props ?? {};
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeRadioGroup, subSlot(slot, 'rfs'));
	const direction = useDirection(dir);
	const [value, setValue] = useControllableState<string | null>(
		{ prop: valueProp, defaultProp: defaultValue ?? null, onChange: onValueChange },
		subSlot(slot, 'value'),
	);

	return createElement(RadioGroupProvider, {
		scope: __scopeRadioGroup,
		name,
		required,
		disabled,
		value,
		onValueChange: setValue,
		children: createElement(RovingFocusGroup.Root, {
			asChild: true,
			...rovingFocusGroupScope,
			orientation,
			dir: direction,
			loop,
			children: createElement(Primitive.div, {
				role: 'radiogroup',
				'aria-required': required,
				'aria-orientation': orientation,
				'data-disabled': disabled ? '' : undefined,
				dir: direction,
				...groupProps,
				ref: forwardedRef,
			}),
		}),
	});
}

function ItemProvider(props: any): any {
	const slot = S('RadioGroup.ItemProvider');
	const { __scopeRadioGroup, value, disabled, children, internal_do_not_use_render } = props;
	const context = useRadioGroupContext('RadioGroupItemProvider', __scopeRadioGroup);
	const radioScope = useRadioScope(__scopeRadioGroup, subSlot(slot, 'radio'));
	const isDisabled = context.disabled || disabled;

	return createElement(RadioProvider, {
		...radioScope,
		checked: context.value === value,
		disabled: isDisabled,
		required: context.required,
		name: context.name,
		value,
		onCheck: () => context.onValueChange(value),
		internal_do_not_use_render,
		children,
	});
}

function ItemTrigger(props: any): any {
	const slot = S('RadioGroup.ItemTrigger');
	const { __scopeRadioGroup, ref: forwardedRef, ...triggerProps } = props;
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeRadioGroup, subSlot(slot, 'rfs'));
	const radioScope = useRadioScope(__scopeRadioGroup, subSlot(slot, 'radio'));
	const { checked, disabled } = useRadioContext('RadioGroupItemTrigger', radioScope.__scopeRadio);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const isArrowKeyPressedRef = useRef(false, subSlot(slot, 'arrow'));

	useEffect(
		() => {
			const handleKeyDown = (event: KeyboardEvent): void => {
				if (ARROW_KEYS.includes(event.key)) {
					isArrowKeyPressedRef.current = true;
				}
			};
			const handleKeyUp = (): boolean => (isArrowKeyPressedRef.current = false);
			document.addEventListener('keydown', handleKeyDown);
			document.addEventListener('keyup', handleKeyUp);
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
				document.removeEventListener('keyup', handleKeyUp);
			};
		},
		[],
		subSlot(slot, 'e:keys'),
	);

	return createElement(RovingFocusGroup.Item, {
		asChild: true,
		...rovingFocusGroupScope,
		focusable: !disabled,
		active: checked,
		children: createElement(RadioTrigger, {
			...radioScope,
			...triggerProps,
			ref: composedRefs,
			onKeyDown: composeEventHandlers(triggerProps.onKeyDown, (event: KeyboardEvent) => {
				// According to WAI ARIA, radio groups don't activate items on enter keypress
				if (event.key === 'Enter') event.preventDefault();
			}),
			onFocus: composeEventHandlers(triggerProps.onFocus, () => {
				// Our `RovingFocusGroup` will focus the radio when navigating with arrow
				// keys and we need to "check" it in that case. We click it to "check" it
				// (instead of updating the group value) so that the radio change event fires.
				if (isArrowKeyPressedRef.current) {
					(ref.current as HTMLElement | null)?.click();
				}
			}),
		}),
	});
}

export function Item(props: any): any {
	const { __scopeRadioGroup, value, disabled, ref: forwardedRef, ...itemProps } = props ?? {};

	return createElement(ItemProvider, {
		__scopeRadioGroup,
		value,
		disabled,
		internal_do_not_use_render: ({ isFormControl }: { isFormControl: boolean }) => [
			createElement(ItemTrigger, {
				key: 'trigger',
				...itemProps,
				ref: forwardedRef,
				__scopeRadioGroup,
			}),
			isFormControl ? createElement(ItemBubbleInput, { key: 'bubble', __scopeRadioGroup }) : null,
		],
	});
}

function ItemBubbleInput(props: any): any {
	const slot = S('RadioGroup.ItemBubbleInput');
	const { __scopeRadioGroup, ...bubbleProps } = props;
	const radioScope = useRadioScope(__scopeRadioGroup, subSlot(slot, 'radio'));
	return createElement(RadioBubbleInput, { ...radioScope, ...bubbleProps });
}

export function Indicator(props: any): any {
	const slot = S('RadioGroup.Indicator');
	const { __scopeRadioGroup, ...indicatorProps } = props ?? {};
	const radioScope = useRadioScope(__scopeRadioGroup, subSlot(slot, 'radio'));
	return createElement(RadioIndicator, { ...radioScope, ...indicatorProps });
}

export {
	Root as RadioGroup,
	Item as RadioGroupItem,
	ItemProvider as RadioGroupItemProvider,
	ItemTrigger as RadioGroupItemTrigger,
	ItemBubbleInput as RadioGroupItemBubbleInput,
	Indicator as RadioGroupIndicator,
};
