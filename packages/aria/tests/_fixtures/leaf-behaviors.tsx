import { useRef, useState } from 'octane';
import {
	mergeProps,
	useDisclosure,
	useRadio,
	useRadioGroup,
	useSearchField,
	useToolbar,
	VisuallyHidden,
} from '@octanejs/aria';
import {
	useDisclosureState,
	useRadioGroupState,
	useSearchFieldState,
} from '@octanejs/aria/stately';

function LabelledRadio(props: {
	value: string;
	state: any;
	onNativeInput: () => void;
	pressProps?: Record<string, any>;
}) {
	const ref = useRef<any>(null);
	const { inputProps, labelProps } = useRadio(
		{ value: props.value, children: props.value, ...props.pressProps },
		props.state,
		ref,
	);
	return (
		<label {...labelProps}>
			<input
				data-testid={'radio-' + props.value}
				ref={ref}
				{...mergeProps(inputProps, { onInput: props.onNativeInput })}
			/>
			{props.value}
		</label>
	);
}

export function RadioLabelHarness(props: { pressProps?: Record<string, any> }) {
	const state = useRadioGroupState({ defaultValue: 'a' });
	const { radioGroupProps } = useRadioGroup({ 'aria-label': 'pick' }, state);
	// Tracks the platform's own activation signal (the native `input` event) the way a
	// consumer would: their own onInput merged into inputProps.
	const [nativeInputs, setNativeInputs] = useState(0);
	const onNativeInput = () => setNativeInputs((n: number) => n + 1);
	return (
		<div {...radioGroupProps}>
			<LabelledRadio
				value="a"
				state={state}
				onNativeInput={onNativeInput}
				pressProps={props.pressProps}
			/>
			<LabelledRadio
				value="b"
				state={state}
				onNativeInput={onNativeInput}
				pressProps={props.pressProps}
			/>
			<output
				data-selected={state.selectedValue ?? 'none'}
				data-native-inputs={String(nativeInputs)}
			>
				{'v:' + (state.selectedValue ?? 'none')}
			</output>
		</div>
	);
}

export function SearchFieldHarness() {
	const [submitted, setSubmitted] = useState('');
	const state = useSearchFieldState({});
	const ref = useRef<any>(null);
	const { inputProps } = useSearchField(
		{ 'aria-label': 'search', onSubmit: (v: string) => setSubmitted(v) },
		state,
		ref,
	);
	return (
		<div>
			<input ref={ref} {...inputProps} />
			<output data-submitted={submitted}>{submitted}</output>
		</div>
	);
}

export function DisclosureHarness() {
	const state = useDisclosureState({});
	const panelRef = useRef<any>(null);
	const { buttonProps, panelProps } = useDisclosure({}, state, panelRef);
	const { onPress, onPressStart, isDisabled: _d, ...buttonDom } = buttonProps as any;
	return (
		<div>
			<button
				{...buttonDom}
				onClick={() => {
					// The differential-covered press machinery is exercised elsewhere; drive the
					// toggle handler directly (buttonProps.onPress expects a press event).
					state.toggle();
				}}
			>
				toggle
			</button>
			<div ref={panelRef} {...panelProps}>
				content
			</div>
		</div>
	);
}

export function ToolbarHarness() {
	const ref = useRef<any>(null);
	const { toolbarProps } = useToolbar({ 'aria-label': 'tools' }, ref);
	return (
		<div ref={ref} {...toolbarProps}>
			<button>one</button>
			<button>two</button>
		</div>
	);
}

export function VisuallyHiddenHarness() {
	return (
		<div>
			<VisuallyHidden elementType="div" isFocusable data-vh="" style={{ outline: 'none' }}>
				<a href="#main">Skip to content</a>
			</VisuallyHidden>
		</div>
	);
}
