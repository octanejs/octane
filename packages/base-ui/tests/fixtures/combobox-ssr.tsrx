import { Combobox } from '@octanejs/base-ui/combobox';

export function ComboboxInputFixture() {
	return <Combobox.Root>
		<Combobox.Input data-testid="input" />
		<Combobox.Portal>
			<Combobox.Positioner />
		</Combobox.Portal>
	</Combobox.Root>;
}

export function ComboboxTriggerFixture() {
	return <Combobox.Root>
		<Combobox.Trigger data-testid="trigger" />
		<Combobox.Portal>
			<Combobox.Positioner />
		</Combobox.Portal>
	</Combobox.Root>;
}

export function ComboboxLabelFixture() {
	return <Combobox.Root inline>
		<Combobox.Label data-testid="label">Food</Combobox.Label>
		<Combobox.Trigger data-testid="trigger">Open</Combobox.Trigger>
		<Combobox.Input data-testid="input" />
	</Combobox.Root>;
}
