import { useState } from 'octane';
import { Button } from '../../src/components/Button';
import { Disclosure, DisclosureGroup, DisclosurePanel } from '../../src/components/Disclosure';
import { FieldError } from '../../src/components/FieldError';
import { Group } from '../../src/components/Group';
import { Input } from '../../src/components/Input';
import { Label } from '../../src/components/Label';
import { NumberField } from '../../src/components/NumberField';
import { SearchField } from '../../src/components/SearchField';
import {
	Slider,
	SliderFill,
	SliderOutput,
	SliderThumb,
	SliderTrack,
} from '../../src/components/Slider';
import { TextField } from '../../src/components/TextField';

// ---------------------------------------------------------------------------
// TextField: label/input linkage through contexts, controlled typing over
// octane's native onInput, realtime (validationBehavior="aria") validation
// surfacing in data-invalid and <FieldError>.
// ---------------------------------------------------------------------------

export function TextFieldScenario() {
	const [value, setValue] = useState('');
	return (
		<div>
			<span id="tf-value">{'value:' + value}</span>
			<TextField
				value={value}
				onChange={setValue}
				validationBehavior="aria"
				validate={(v: string) => (v === 'bad' ? 'Bad value' : null)}
				data-testid="tf-root"
			>
				<Label>Name</Label>
				<Input />
				<FieldError data-testid="tf-error" />
			</TextField>
		</div>
	);
}

// ---------------------------------------------------------------------------
// SearchField: data-empty tracking and the context-wired clear button, which
// clears through the native path (press → state.setValue('') → controlled
// value reassertion).
// ---------------------------------------------------------------------------

export function SearchFieldScenario() {
	const [cleared, setCleared] = useState('no');
	return (
		<div>
			<span id="sf-cleared">{'cleared:' + cleared}</span>
			<SearchField data-testid="sf-root" onClear={() => setCleared('yes')}>
				<Label>Search</Label>
				<Input />
				<Button id="sf-clear">x</Button>
			</SearchField>
		</div>
	);
}

// ---------------------------------------------------------------------------
// NumberField: group wiring, stepper buttons via ButtonContext slots, the
// text input's number-field aria attributes, and the hidden form input.
// ---------------------------------------------------------------------------

export function NumberFieldScenario() {
	return (
		<NumberField defaultValue={5} minValue={0} maxValue={10} name="amount" data-testid="nf-root">
			<Label>Amount</Label>
			<Group data-testid="nf-group">
				<Button id="nf-dec" slot="decrement">
					-
				</Button>
				<Input />
				<Button id="nf-inc" slot="increment">
					+
				</Button>
			</Group>
		</NumberField>
	);
}

// ---------------------------------------------------------------------------
// Slider: the thumb's visually hidden range input carries min/max/step/value,
// SliderOutput's render prop sees the formatted default children, and
// data-orientation lands on the root/track/output.
// ---------------------------------------------------------------------------

export function SliderScenario() {
	return (
		<Slider defaultValue={30} minValue={0} maxValue={100} step={5} data-testid="slider-root">
			<Label>Volume</Label>
			<SliderOutput
				data-testid="slider-output"
				children={(v: any) => 'val:' + String(v.defaultChildren)}
			/>
			<SliderTrack data-testid="slider-track">
				<SliderFill data-testid="slider-fill" />
				<SliderThumb data-testid="slider-thumb" />
			</SliderTrack>
		</Slider>
	);
}

// ---------------------------------------------------------------------------
// Disclosure: trigger-slot button toggles aria-expanded / data-expanded and
// the panel's hidden attribute. DisclosureGroup (allowsMultipleExpanded
// defaults to false) collapses the previously expanded item.
// ---------------------------------------------------------------------------

export function DisclosureScenario() {
	return (
		<Disclosure data-testid="disc-root">
			<Button id="disc-trigger" slot="trigger">
				Toggle
			</Button>
			<DisclosurePanel data-testid="disc-panel">Panel content</DisclosurePanel>
		</Disclosure>
	);
}

export function DisclosureGroupScenario() {
	return (
		<DisclosureGroup data-testid="group-root">
			<Disclosure id="one" data-testid="disc-one">
				<Button id="trig-one" slot="trigger">
					One
				</Button>
				<DisclosurePanel data-testid="panel-one">First</DisclosurePanel>
			</Disclosure>
			<Disclosure id="two" data-testid="disc-two">
				<Button id="trig-two" slot="trigger">
					Two
				</Button>
				<DisclosurePanel data-testid="panel-two">Second</DisclosurePanel>
			</Disclosure>
		</DisclosureGroup>
	);
}
