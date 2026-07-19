import { useState } from 'octane';
import { Button } from '../../src/components/Button';
import { ComboBox } from '../../src/components/ComboBox';
import { FieldError } from '../../src/components/FieldError';
import { Input } from '../../src/components/Input';
import { Label } from '../../src/components/Label';
import { ListBox, ListBoxItem } from '../../src/components/ListBox';
import { Popover } from '../../src/components/Popover';
import { Select, SelectValue } from '../../src/components/Select';

// Fixtures for the RAC Select and ComboBox components over the Phase-4 collection
// engine and overlay composition: both render their children twice (a hidden
// CollectionBuilder copy builds the collection while the popover is closed; the
// visible copy consumes the state contexts), the trigger/input props arrive via
// Button/Input contexts, and the open Popover portals to document.body. The open
// listbox is ./ListBox short-circuiting into ListBoxInner through ListStateContext.

export function BasicSelectHarness(props: {
	name?: string;
	onSelectionChange?: (key: any) => void;
	onOpenChange?: (isOpen: boolean) => void;
}) {
	return (
		<Select
			data-testid="select-root"
			name={props.name}
			onSelectionChange={props.onSelectionChange}
			onOpenChange={props.onOpenChange}
		>
			<Label data-testid="select-label">Favorite Animal</Label>
			<Button data-testid="select-trigger">
				<SelectValue data-testid="select-value" />
			</Button>
			<Popover data-testid="select-popover">
				<ListBox data-testid="select-listbox">
					<ListBoxItem id="cat" data-testid="option-cat">
						Cat
					</ListBoxItem>
					<ListBoxItem id="dog" data-testid="option-dog">
						Dog
					</ListBoxItem>
					<ListBoxItem id="kangaroo" data-testid="option-kangaroo">
						Kangaroo
					</ListBoxItem>
				</ListBox>
			</Popover>
		</Select>
	);
}

export function DynamicSelectHarness(props: { onSelectionChange?: (key: any) => void }) {
	const [items, setItems] = useState([
		{ id: 'red', name: 'Red' },
		{ id: 'green', name: 'Green' },
	]);
	return (
		<div>
			<button
				data-action="add"
				onClick={() => setItems((prev) => [...prev, { id: 'blue', name: 'Blue' }])}
			>
				add
			</button>
			<Select data-testid="select-root" onSelectionChange={props.onSelectionChange}>
				<Label>Color</Label>
				<Button data-testid="select-trigger">
					<SelectValue data-testid="select-value" />
				</Button>
				<Popover>
					<ListBox data-testid="select-listbox" items={items}>
						{(item: any) => <ListBoxItem id={item.id}>{item.name}</ListBoxItem>}
					</ListBox>
				</Popover>
			</Select>
		</div>
	);
}

export function BasicComboBoxHarness(props: {
	name?: string;
	onSelectionChange?: (key: any) => void;
	onOpenChange?: (isOpen: boolean) => void;
	allowsEmptyCollection?: boolean;
	isInvalid?: boolean;
}) {
	return (
		<ComboBox
			data-testid="combobox-root"
			name={props.name}
			onSelectionChange={props.onSelectionChange}
			onOpenChange={props.onOpenChange}
			allowsEmptyCollection={props.allowsEmptyCollection}
			isInvalid={props.isInvalid}
		>
			<Label data-testid="combobox-label">Favorite Animal</Label>
			<div>
				<Input data-testid="combobox-input" />
				<Button data-testid="combobox-button">open</Button>
			</div>
			<FieldError data-testid="combobox-error">Invalid animal</FieldError>
			<Popover data-testid="combobox-popover">
				{/* Explicit textValues: the ComboBox commits an item's textValue into the
				    input verbatim, so pin it rather than relying on rendered-text extraction
				    (which would include the fixture's JSX indentation). */}
				<ListBox data-testid="combobox-listbox" renderEmptyState={() => 'No results'}>
					<ListBoxItem id="cat" textValue="Cat" data-testid="option-cat">
						Cat
					</ListBoxItem>
					<ListBoxItem id="dog" textValue="Dog" data-testid="option-dog">
						Dog
					</ListBoxItem>
					<ListBoxItem id="kangaroo" textValue="Kangaroo" data-testid="option-kangaroo">
						Kangaroo
					</ListBoxItem>
				</ListBox>
			</Popover>
		</ComboBox>
	);
}
