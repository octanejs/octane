// Ported from .base-ui/packages/react/src/button/Button.tsx (v1.6.0). A button that can be
// used to trigger actions. Renders a `<button>` element.
import { S, subSlot } from './internal';
import { useButton } from './utils/useButton';
import { useRenderElement } from './utils/useRenderElement';

export interface ButtonState {
	/** Whether the button should ignore user interaction. */
	disabled: boolean;
}

export interface ButtonProps {
	disabled?: boolean;
	/**
	 * Whether the button should be focusable when disabled.
	 * @default false
	 */
	focusableWhenDisabled?: boolean;
	/**
	 * Whether the component renders a native `<button>` element when replacing it via the
	 * `render` prop.
	 * @default true
	 */
	nativeButton?: boolean;
	className?: string | ((state: ButtonState) => string | undefined);
	render?: import('./utils/useRenderElement').RenderProp<ButtonState>;
	ref?: any;
	[key: string]: any;
}

// octane: forwardRef → ref-as-prop.
export function Button(props: ButtonProps): any {
	const slot = S('Button');
	const {
		render,
		className,
		disabled = false,
		focusableWhenDisabled = false,
		nativeButton = true,
		style,
		ref,
		...elementProps
	} = props;

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, focusableWhenDisabled, native: nativeButton },
		subSlot(slot, 'btn'),
	);

	const state: ButtonState = { disabled };

	return useRenderElement(
		'button',
		{ className, render, style },
		{ state, ref: [ref, buttonRef], props: [elementProps, getButtonProps] },
		subSlot(slot, 're'),
	);
}

export namespace Button {
	export type Props = ButtonProps;
	export type State = ButtonState;
}
