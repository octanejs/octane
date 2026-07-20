import { useRef, useState } from 'octane';
import {
	useButton,
	useCheckbox,
	useProgressBar,
	useRadio,
	useRadioGroup,
	useSwitch,
	useTextField,
	useToggleButton,
} from '@octanejs/aria';
import { useRadioGroupState, useToggleState } from '@octanejs/aria/stately';

// Phase-1 leaf-hook differential fixtures: the SAME components run through
// @octanejs/aria and the real react-aria/react-stately (tests/differential/_setup.ts
// rewrites the imports). Hook state surfaces as data-* attributes and rendered text.

export function ButtonBasic() {
	const [log, setLog] = useState('');
	const ref = useRef<any>(null);
	const { buttonProps, isPressed } = useButton(
		{ onPress: () => setLog((l: string) => l + 'p') },
		ref,
	);
	return <button id="btn" ref={ref} {...buttonProps} data-pressed={isPressed || undefined}>
		{'log:' + log}
	</button>;
}

export function SpanButton() {
	const [log, setLog] = useState('');
	const ref = useRef<any>(null);
	const { buttonProps } = useButton(
		{ elementType: 'span', onPress: () => setLog((l: string) => l + 'p') },
		ref,
	);
	return <span id="span-btn" ref={ref} {...buttonProps}>{'log:' + log}</span>;
}

export function ToggleButtonSpec() {
	const state = useToggleState({});
	const ref = useRef<any>(null);
	const { buttonProps } = useToggleButton({}, state, ref);
	return <button id="toggle-btn" ref={ref} {...buttonProps}>
		{'sel:' + (state.isSelected ? 'y' : 'n')}
	</button>;
}

export function CheckboxSpec() {
	const state = useToggleState({});
	const ref = useRef<any>(null);
	const { inputProps, labelProps, isSelected } = useCheckbox({ 'aria-label': 'agree' }, state, ref);
	return <div>
		<label {...labelProps}>
			<input id="cb" ref={ref} {...inputProps} />
			{'sel:' + (isSelected ? 'y' : 'n')}
		</label>
	</div>;
}

export function SwitchSpec() {
	const state = useToggleState({});
	const ref = useRef<any>(null);
	const { inputProps, labelProps, isSelected } = useSwitch({ 'aria-label': 'power' }, state, ref);
	return <div>
		<label {...labelProps}>
			<input id="sw" ref={ref} {...inputProps} />
			{'on:' + (isSelected ? 'y' : 'n')}
		</label>
	</div>;
}

function RadioOption(props: { value: string; state: any }) {
	const ref = useRef<any>(null);
	const { inputProps, isSelected } = useRadio(
		{ value: props.value, 'aria-label': props.value },
		props.state,
		ref,
	);
	return <input
		id={'radio-' + props.value}
		ref={ref}
		{...inputProps}
		data-selected={isSelected || undefined}
	/>;
}

export function RadioGroupSpec() {
	const state = useRadioGroupState({ defaultValue: 'a' });
	const { radioGroupProps, labelProps } = useRadioGroup(
		{ label: 'Pick', 'aria-label': 'Pick' },
		state,
	);
	return <div {...radioGroupProps}>
		<span {...labelProps}>Pick</span>
		<RadioOption value="a" state={state} />
		<RadioOption value="b" state={state} />
		<span>{'val:' + (state.selectedValue ?? 'none')}</span>
	</div>;
}

export function TextFieldSpec() {
	const [value, setValue] = useState('');
	const ref = useRef<any>(null);
	const { inputProps, labelProps, descriptionProps } = useTextField(
		{
			label: 'Name',
			description: 'Your full name',
			value,
			onChange: setValue,
		},
		ref,
	);
	return <div>
		<label {...labelProps}>Name</label>
		<input id="tf" ref={ref} {...inputProps} />
		<div {...descriptionProps}>Your full name</div>
		<span>{'val:' + value}</span>
	</div>;
}

export function ProgressSpec() {
	const { progressBarProps, labelProps } = useProgressBar({ label: 'Loading', value: 30 });
	return <div id="progress" {...progressBarProps}>
		<span {...labelProps}>Loading</span>
	</div>;
}
