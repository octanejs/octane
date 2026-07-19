import { useState } from 'octane';
import {
	Checkbox,
	CheckboxButton,
	CheckboxField,
	CheckboxGroup,
} from '../../src/components/Checkbox';
import { FieldError } from '../../src/components/FieldError';
import { Label } from '../../src/components/Label';
import { Radio, RadioButton, RadioField, RadioGroup } from '../../src/components/RadioGroup';
import { Switch, SwitchButton, SwitchField } from '../../src/components/Switch';
import { Text } from '../../src/components/Text';

// ---------------------------------------------------------------------------
// Checkbox: clicking the real hidden input drives selection through the native
// change event; selection state lands in data-selected and in the className /
// children render-prop values.
// ---------------------------------------------------------------------------

export function CheckboxScenario() {
	const [selected, setSelected] = useState(false);
	return (
		<div>
			<div id="cb-value">{'selected:' + (selected ? 'yes' : 'no')}</div>
			<Checkbox
				data-testid="cb"
				isSelected={selected}
				onChange={setSelected}
				className={(v: any) => String(v.defaultClassName) + (v.isSelected ? ' is-selected' : '')}
			>
				{(v: any) => 'checkbox:' + (v.isSelected ? 'on' : 'off')}
			</Checkbox>
		</div>
	);
}

// Indeterminate is presentational: the input's `indeterminate` DOM property is
// set from an effect and data-indeterminate is exposed for styling.
export function IndeterminateCheckbox() {
	return (
		<Checkbox data-testid="ind" isIndeterminate defaultSelected>
			Partial
		</Checkbox>
	);
}

// ---------------------------------------------------------------------------
// CheckboxGroup: value aggregation across items, Label linkage via
// LabelContext, and the FieldError/validation surface. The tree stays stable —
// only prop values toggle.
// ---------------------------------------------------------------------------

export function CheckboxGroupScenario() {
	const [value, setValue] = useState<string[]>([]);
	const [invalid, setInvalid] = useState(false);
	return (
		<div>
			<div id="group-value">{'value:' + value.join(',')}</div>
			<button id="make-invalid" onClick={() => setInvalid(true)}>
				invalidate
			</button>
			<CheckboxGroup
				data-testid="group"
				value={value}
				onChange={setValue}
				isInvalid={invalid}
				validationBehavior="aria"
			>
				<Label>Options</Label>
				<Checkbox value="a" data-testid="cb-a">
					A
				</Checkbox>
				<Checkbox value="b" data-testid="cb-b">
					B
				</Checkbox>
				<FieldError data-testid="group-error">Pick fewer options</FieldError>
			</CheckboxGroup>
		</div>
	);
}

// ---------------------------------------------------------------------------
// CheckboxField + CheckboxButton (the 1.19.0 split components): field-level
// state lands on the wrapper div, the button label carries the interaction
// surface, and the description Text links via aria-describedby.
// ---------------------------------------------------------------------------

export function CheckboxFieldScenario() {
	return (
		<CheckboxField data-testid="cbf" defaultSelected>
			<CheckboxButton data-testid="cbf-btn">Accept terms</CheckboxButton>
			<Text slot="description" data-testid="cbf-desc">
				Required to proceed
			</Text>
		</CheckboxField>
	);
}

// ---------------------------------------------------------------------------
// Switch: role=switch on the hidden input; toggling drives data-selected and
// the render-prop values.
// ---------------------------------------------------------------------------

export function SwitchScenario() {
	return (
		<Switch
			data-testid="sw"
			className={(v: any) => String(v.defaultClassName) + (v.isSelected ? ' is-on' : '')}
		>
			{(v: any) => 'switch:' + (v.isSelected ? 'on' : 'off')}
		</Switch>
	);
}

export function SwitchFieldScenario() {
	return (
		<SwitchField data-testid="swf">
			<SwitchButton data-testid="swf-btn">Notifications</SwitchButton>
			<Text slot="description" data-testid="swf-desc">
				Sends you emails
			</Text>
		</SwitchField>
	);
}

// ---------------------------------------------------------------------------
// RadioGroup: single-selection semantics across Radio (deprecated composite)
// and RadioField + RadioButton (split components), orientation data attribute,
// and Label linkage via LabelContext.
// ---------------------------------------------------------------------------

export function RadioGroupScenario() {
	const [value, setValue] = useState<string | null>(null);
	return (
		<div>
			<div id="radio-value">{'value:' + (value ?? 'none')}</div>
			<RadioGroup data-testid="rg" value={value} onChange={setValue} orientation="horizontal">
				<Label>Fruit</Label>
				<Radio
					value="apple"
					data-testid="r-apple"
					className={(v: any) => String(v.defaultClassName) + (v.isSelected ? ' is-selected' : '')}
				>
					Apple
				</Radio>
				<Radio value="orange" data-testid="r-orange">
					Orange
				</Radio>
				<RadioField value="pear" data-testid="rf-pear">
					<RadioButton data-testid="rb-pear">Pear</RadioButton>
				</RadioField>
			</RadioGroup>
		</div>
	);
}
