import { useState } from 'octane';
import { Label } from '../../src/components/Label';
import { Meter } from '../../src/components/Meter';
import { ToggleButton } from '../../src/components/ToggleButton';
import { ToggleButtonGroup } from '../../src/components/ToggleButtonGroup';

// ---------------------------------------------------------------------------
// Standalone ToggleButton: press toggles aria-pressed/data-selected, the
// isSelected render-prop value feeds className, and onChange reports the new
// selection state through octane's native delegated events.
// ---------------------------------------------------------------------------

export function ToggleScenario() {
	const [last, setLast] = useState('none');
	return (
		<div>
			<span data-testid="toggle-last">{'last:' + last}</span>
			<ToggleButton
				id="standalone"
				className={(v: any) =>
					String(v.defaultClassName) +
					(v.isSelected ? ' is-selected' : '') +
					(v.isPressed ? ' is-pressed' : '')
				}
				onChange={(s: boolean) => setLast(String(s))}
			>
				Bold
			</ToggleButton>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Single-selection group: role=radiogroup, child buttons become radios wired
// through ToggleGroupStateContext; selecting one deselects the other.
// ---------------------------------------------------------------------------

export function SingleGroupScenario() {
	return (
		<ToggleButtonGroup id="single-group" defaultSelectedKeys={['left']} aria-label="Align">
			<ToggleButton id="left">Left</ToggleButton>
			<ToggleButton id="center">Center</ToggleButton>
			<ToggleButton id="right">Right</ToggleButton>
		</ToggleButtonGroup>
	);
}

// ---------------------------------------------------------------------------
// Multiple-selection group: buttons keep aria-pressed, several keys can be
// selected at once, and onSelectionChange surfaces the selected key set.
// ---------------------------------------------------------------------------

export function MultipleGroupScenario() {
	const [keys, setKeys] = useState('');
	return (
		<div>
			<span data-testid="multi-keys">{'keys:' + keys}</span>
			<ToggleButtonGroup
				id="multi-group"
				selectionMode="multiple"
				aria-label="Style"
				onSelectionChange={(k) => setKeys(Array.from(k, String).sort().join(','))}
			>
				<ToggleButton id="bold">Bold</ToggleButton>
				<ToggleButton id="italic">Italic</ToggleButton>
			</ToggleButtonGroup>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Disabled group: aria-disabled/data-disabled on the group, child buttons
// disabled through the shared group state.
// ---------------------------------------------------------------------------

export function DisabledGroupScenario() {
	return (
		<ToggleButtonGroup id="disabled-group" isDisabled aria-label="Disabled tools">
			<ToggleButton id="only">Only</ToggleButton>
		</ToggleButtonGroup>
	);
}

// ---------------------------------------------------------------------------
// Meter: ARIA value attributes plus the percentage/valueText render prop; a
// slotted <Label> child links up via aria-labelledby; values clamp to range.
// ---------------------------------------------------------------------------

export function MeterScenario() {
	return (
		<div>
			<Meter
				id="mt"
				value={30}
				aria-label="Storage"
				children={(v: any) => 'pct:' + String(v.percentage) + '|' + String(v.valueText)}
			/>
			<Meter id="mt-labeled" value={25}>
				<Label>Battery</Label>
			</Meter>
			<Meter
				id="mt-clamped"
				value={250}
				minValue={0}
				maxValue={200}
				aria-label="Clamped"
				children={(v: any) => 'pct:' + String(v.percentage)}
			/>
		</div>
	);
}
