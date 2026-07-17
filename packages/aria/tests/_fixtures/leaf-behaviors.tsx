import { useRef, useState } from 'octane';
import { useDisclosure, useSearchField, useToolbar, VisuallyHidden } from '@octanejs/aria';
import { useDisclosureState, useSearchFieldState } from '@octanejs/aria/stately';

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
