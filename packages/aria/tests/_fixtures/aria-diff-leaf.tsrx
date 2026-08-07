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
import { useNumberFieldState, useRadioGroupState, useToggleState } from '@octanejs/aria/stately';

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

export function NumberFieldStateSpec() {
	const [value, setValue] = useState(1234.5);
	const [locale, setLocale] = useState('en-US');
	const [fractionDigits, setFractionDigits] = useState(1);
	const [, refresh] = useState(0);
	const state = useNumberFieldState({
		value,
		locale,
		formatOptions: { minimumFractionDigits: fractionDigits, maximumFractionDigits: 3 },
		onChange: setValue,
	});

	return <div>
		<button id="number-draft" onClick={() => state.setInputValue('9,876.500')}>edit</button>
		<button id="number-latin" onClick={() => state.setInputValue('9876.5')}>latin</button>
		<button id="number-refresh" onClick={() => refresh((current: number) => current + 1)}>
			refresh
		</button>
		<button id="number-value" onClick={() => setValue(2500.25)}>value</button>
		<button id="number-german" onClick={() => setLocale('de-DE')}>german</button>
		<button id="number-arabic" onClick={() => setLocale('ar-EG')}>arabic</button>
		<button id="number-precision" onClick={() => setFractionDigits(2)}>precision</button>
		<output id="number-input">{state.inputValue as string}</output>
		<output id="number-parsed">{String(state.numberValue) as string}</output>
	</div>;
}

export function NumberFieldCurrencyRoundingSpec(props: {
	currency: string;
	locale?: string;
	initiallyFormatted?: boolean;
}) {
	const [formatOptions, setFormatOptions] = useState(
		props.initiallyFormatted === false
			? undefined
			: { style: 'currency' as const, currency: props.currency, roundingIncrement: 5 },
	);
	const state = useNumberFieldState({
		value: 12.27,
		locale: props.locale ?? 'en-US',
		formatOptions,
	});

	return <div>
		<button
			id="currency-enable"
			onClick={() => setFormatOptions({
				style: 'currency',
				currency: props.currency,
				roundingIncrement: 5,
			})}
		>
			enable
		</button>
		<output id="currency-input">{state.inputValue as string}</output>
		<output id="currency-parsed">{String(state.numberValue) as string}</output>
	</div>;
}
