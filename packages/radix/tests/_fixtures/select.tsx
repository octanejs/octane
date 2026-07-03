import { useState } from 'octane';
import { Select } from '@octanejs/radix';

// Inside a real <form> so the hidden native bubble `<select>` engages (FormData,
// change listeners). `position="popper"` matches the source package's own tests
// (item-aligned needs real layout to be meaningful).
export function SelectApp(props?: { defaultValue?: string }) {
	const [value, setValue] = useState(props?.defaultValue ?? '');
	const [changes, setChanges] = useState(0);
	const [scrolls, setScrolls] = useState(0);
	return (
		<form data-testid="form" onChange={() => setChanges((c) => c + 1)}>
			<span data-testid="value">{value === '' ? 'none' : value}</span>
			<span data-testid="changes">{changes}</span>
			<span data-testid="scrolls">{scrolls}</span>
			<Select.Root
				name="fruit"
				defaultValue={props?.defaultValue}
				onValueChange={(v: string) => setValue(v)}
			>
				<Select.Trigger data-testid="trigger" aria-label="Fruit">
					<Select.Value data-testid="trigger-value" placeholder="Pick a fruit" />
					<Select.Icon data-testid="icon" />
				</Select.Trigger>
				<Select.Portal
					children={[
						<Select.Content key="content" data-testid="content" position="popper">
							<Select.Viewport data-testid="viewport" onScroll={() => setScrolls((s) => s + 1)}>
								<Select.Group data-testid="group">
									<Select.Label data-testid="label">Fruits</Select.Label>
									<Select.Item data-testid="item-apple" value="apple">
										<Select.ItemText>Apple</Select.ItemText>
										<Select.ItemIndicator data-testid="indicator-apple">•</Select.ItemIndicator>
									</Select.Item>
									<Select.Item data-testid="item-banana" value="banana">
										<Select.ItemText>Banana</Select.ItemText>
										<Select.ItemIndicator data-testid="indicator-banana">•</Select.ItemIndicator>
									</Select.Item>
									<Select.Item data-testid="item-cherry" value="cherry">
										<Select.ItemText>Cherry</Select.ItemText>
									</Select.Item>
									<Select.Item data-testid="item-durian" value="durian" disabled>
										<Select.ItemText>Durian</Select.ItemText>
									</Select.Item>
								</Select.Group>
								<Select.Separator data-testid="separator" />
							</Select.Viewport>
						</Select.Content>,
					]}
				/>
			</Select.Root>
		</form>
	);
}

// Default (item-aligned) positioning — the SelectItemAlignedPosition path with
// scroll buttons in the flow. The zero-rect math must run without throwing.
export function ItemAlignedSelectApp() {
	const [value, setValue] = useState('b');
	return (
		<div data-testid="app">
			<span data-testid="value">{value}</span>
			<Select.Root defaultValue="b" onValueChange={(v: string) => setValue(v)}>
				<Select.Trigger data-testid="trigger" aria-label="Letter">
					<Select.Value data-testid="trigger-value" placeholder="Pick a letter" />
				</Select.Trigger>
				<Select.Portal
					children={[
						<Select.Content key="content" data-testid="content">
							<Select.ScrollUpButton data-testid="scroll-up">↑</Select.ScrollUpButton>
							<Select.Viewport data-testid="viewport">
								<Select.Item data-testid="item-a" value="a">
									<Select.ItemText>Alpha</Select.ItemText>
								</Select.Item>
								<Select.Item data-testid="item-b" value="b">
									<Select.ItemText>Bravo</Select.ItemText>
								</Select.Item>
								<Select.Item data-testid="item-c" value="c">
									<Select.ItemText>Charlie</Select.ItemText>
								</Select.Item>
							</Select.Viewport>
							<Select.ScrollDownButton data-testid="scroll-down">↓</Select.ScrollDownButton>
						</Select.Content>,
					]}
				/>
			</Select.Root>
		</div>
	);
}
