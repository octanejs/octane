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

export function FieldRootExtraFixture1() {
	return <Field.Root>
		<Select.Root>
			<Select.Trigger data-testid="trigger">
				<Select.Value placeholder="Pick one" />
			</Select.Trigger>
		</Select.Root>
	</Field.Root>;
}
