import { Select } from '@octanejs/base-ui/select';

export function SelectLabelFixture() {
	return <Select.Root>
		<Select.Label data-testid="label">Font</Select.Label>
		<Select.Trigger data-testid="trigger">
			<Select.Value />
		</Select.Trigger>
	</Select.Root>;
}
