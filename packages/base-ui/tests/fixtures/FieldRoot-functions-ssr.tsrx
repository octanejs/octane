import * as React from 'octane';
import { Form } from '@octanejs/base-ui/form';
import { NumberField } from '@octanejs/base-ui/number-field';
import { Radio } from '@octanejs/base-ui/radio';
import { RadioGroup } from '@octanejs/base-ui/radio-group';
import { Select } from '@octanejs/base-ui/select';
import { Checkbox } from '@octanejs/base-ui/checkbox';
import { CheckboxGroup } from '@octanejs/base-ui/checkbox-group';
import { Switch } from '@octanejs/base-ui/switch';
import { Slider } from '@octanejs/base-ui/slider';
import { Field } from '@octanejs/base-ui/field';

export function FieldRootHydrationFixture1() {
	const [showSelect, setShowSelect] = React.useState(false);

	return <React.Fragment>
		<Field.Root>
			<Field.Label nativeLabel={false} render={<div />} data-testid="label">
				Label
			</Field.Label>
			{showSelect
				? <Select.Root>
						<Select.Trigger data-testid="trigger">
							<Select.Value placeholder="Pick one" />
						</Select.Trigger>
					</Select.Root>
				: <Checkbox.Root data-testid="checkbox" />}
		</Field.Root>
		<button type="button" onClick={() => setShowSelect((prev) => !prev)}>
			Toggle
		</button>
	</React.Fragment>;
}

export function FieldRootHydrationFixture2() {
	const [showLabel, setShowLabel] = React.useState(true);

	return <React.Fragment>
		<Field.Root>
			{showLabel
				? <Field.Label nativeLabel={false} render={<div />} data-testid="label">
						Label
					</Field.Label>
				: null}
			<Select.Root>
				<Select.Trigger data-testid="trigger">
					<Select.Value placeholder="Pick one" />
				</Select.Trigger>
			</Select.Root>
		</Field.Root>
		<button type="button" onClick={() => setShowLabel(false)}>
			Remove Label
		</button>
	</React.Fragment>;
}
