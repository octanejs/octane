import { Select } from '@octanejs/base-ui/select';
import { Combobox } from '@octanejs/base-ui/combobox';

export function PackedBindingForm() @{
	<form>
		<Select.Root
			name="selected"
			defaultValue="pear"
			items={[
				{ value: 'pear', label: 'Pear' },
			]}
		>
			<Select.Trigger aria-label="Fruit">
				<Select.Value />
			</Select.Trigger>
		</Select.Root>
		<Combobox.Root name="search" defaultValue="Apple" items={['Apple', 'Pear']}>
			<Combobox.Input aria-label="Search fruit" />
		</Combobox.Root>
	</form>
}
