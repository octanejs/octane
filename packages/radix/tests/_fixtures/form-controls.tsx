import { useState } from 'octane';
import { Checkbox, Switch, RadioGroup, Slider } from '@octanejs/radix';

// All controls inside a real <form> so the hidden bubble inputs engage
// (FormData, reset, change listeners).
export function CheckboxApp(props?: { defaultChecked?: boolean | 'indeterminate' }) {
	const [changes, setChanges] = useState(0);
	return (
		<form data-testid="form" onChange={() => setChanges((c) => c + 1)}>
			<span data-testid="changes">{changes}</span>
			<Checkbox.Root
				data-testid="checkbox"
				name="notifications"
				defaultChecked={props?.defaultChecked}
			>
				<Checkbox.Indicator data-testid="indicator">✓</Checkbox.Indicator>
			</Checkbox.Root>
			<button type="reset" data-testid="reset">
				reset
			</button>
		</form>
	);
}

export function SwitchApp() {
	const [changes, setChanges] = useState(0);
	return (
		<form data-testid="form" onChange={() => setChanges((c) => c + 1)}>
			<span data-testid="changes">{changes}</span>
			<Switch.Root data-testid="switch" name="airplane">
				<Switch.Thumb data-testid="thumb" />
			</Switch.Root>
		</form>
	);
}

export function RadioGroupApp() {
	const [value, setValue] = useState<string | null>(null);
	return (
		<form data-testid="form">
			<span data-testid="value">{value ?? 'none'}</span>
			<RadioGroup.Root data-testid="group" name="flavor" onValueChange={setValue}>
				<RadioGroup.Item data-testid="radio-vanilla" value="vanilla">
					<RadioGroup.Indicator data-testid="vanilla-indicator" />
				</RadioGroup.Item>
				<RadioGroup.Item data-testid="radio-chocolate" value="chocolate">
					<RadioGroup.Indicator data-testid="chocolate-indicator" />
				</RadioGroup.Item>
				<RadioGroup.Item data-testid="radio-mint" value="mint" disabled>
					<RadioGroup.Indicator data-testid="mint-indicator" />
				</RadioGroup.Item>
			</RadioGroup.Root>
		</form>
	);
}

export function SliderApp() {
	const [committed, setCommitted] = useState('none');
	const DEFAULTS = [30];
	return (
		<form data-testid="form">
			<span data-testid="committed">{committed}</span>
			<Slider.Root
				data-testid="slider"
				name="volume"
				min={0}
				max={100}
				step={10}
				defaultValue={DEFAULTS}
				onValueCommit={(v: number[]) => setCommitted(String(v))}
			>
				<Slider.Track data-testid="track">
					<Slider.Range data-testid="range" />
				</Slider.Track>
				<Slider.Thumb data-testid="thumb" />
			</Slider.Root>
		</form>
	);
}

export function RangeSliderApp() {
	const RANGE_DEFAULTS = [20, 80];
	return (
		<form data-testid="form">
			<Slider.Root
				data-testid="slider"
				name="range"
				min={0}
				max={100}
				defaultValue={RANGE_DEFAULTS}
			>
				<Slider.Track data-testid="track">
					<Slider.Range data-testid="range" />
				</Slider.Track>
				<Slider.Thumb data-testid="thumb-a" />
				<Slider.Thumb data-testid="thumb-b" />
			</Slider.Root>
		</form>
	);
}
