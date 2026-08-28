import Select from '../src/index';
import type { SelectProps } from '../src/select.tsrx';

export type SelectOption = { label: string; value: string; disabled?: boolean };

export function SelectFixture(props: SelectProps<SelectOption, boolean>) @{
	<Select {...props} />
}
