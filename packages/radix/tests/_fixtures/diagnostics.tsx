/** @jsxImportSource octane */
import { useState } from 'octane';
import { Checkbox, Switch, RadioGroup } from '@octanejs/radix';

export function ControlledCheckbox() {
	const [checked, setChecked] = useState<boolean>(false);
	const [on, setOn] = useState(false);
	return (
		<div>
			<Checkbox.Root checked={checked} onCheckedChange={(v: boolean) => setChecked(v === true)}>
				<Checkbox.Indicator>x</Checkbox.Indicator>
			</Checkbox.Root>
			<Switch.Root checked={on} onCheckedChange={setOn}>
				<Switch.Thumb />
			</Switch.Root>
			<RadioGroup.Root value="a" onValueChange={() => {}}>
				<RadioGroup.Item value="a" />
				<RadioGroup.Item value="b" />
			</RadioGroup.Root>
		</div>
	);
}
