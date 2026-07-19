import { useState } from 'octane';
import { Header } from '../../src/components/Header';
import { ListBox, ListBoxItem, ListBoxSection } from '../../src/components/ListBox';
import { Separator } from '../../src/components/Separator';

// Fixtures for the RAC ListBox component over the Phase-4 collection engine.
// ListBox builds its own collection from its children (standalone mode); the
// dynamic harness drives an `items` array through the render-function form.

export function StaticListBoxHarness(props: {
	selectionMode?: any;
	disabledKeys?: any;
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<ListBox
			aria-label="Choose an option"
			selectionMode={props.selectionMode}
			disabledKeys={props.disabledKeys}
			onSelectionChange={props.onSelectionChange}
		>
			<ListBoxItem id="apple">Apple</ListBoxItem>
			<ListBoxItem id="banana">Banana</ListBoxItem>
			<ListBoxItem id="cherry">Cherry</ListBoxItem>
		</ListBox>
	);
}

export function DynamicListBoxHarness(props: { onSelectionChange?: (keys: any) => void }) {
	const [items, setItems] = useState([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
		{ id: 'c', name: 'Gamma' },
	]);
	return (
		<div>
			<button data-action="reorder" onClick={() => setItems((prev) => [prev[2], prev[0], prev[1]])}>
				reorder
			</button>
			<ListBox
				aria-label="Dynamic options"
				items={items}
				selectionMode="single"
				onSelectionChange={props.onSelectionChange}
			>
				{(item: any) => <ListBoxItem id={item.id}>{item.name as string}</ListBoxItem>}
			</ListBox>
		</div>
	);
}

export function SectionedListBoxHarness() {
	return (
		<ListBox aria-label="Sectioned options" selectionMode="single">
			<ListBoxSection id="fruits">
				<Header>Fruits</Header>
				<ListBoxItem id="apple">Apple</ListBoxItem>
				<ListBoxItem id="banana">Banana</ListBoxItem>
			</ListBoxSection>
			<Separator />
			<ListBoxSection id="vegetables">
				<Header>Vegetables</Header>
				<ListBoxItem id="carrot">Carrot</ListBoxItem>
			</ListBoxSection>
		</ListBox>
	);
}

export function RenderPropsListBoxHarness() {
	return (
		<ListBox aria-label="Render props" selectionMode="single">
			<ListBoxItem
				id="one"
				textValue="One"
				className={({ isSelected, isFocused }: any) =>
					`item${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}`
				}
			>
				{({ isSelected }: any) => <span>{(isSelected ? 'One is selected' : 'One') as string}</span>}
			</ListBoxItem>
			<ListBoxItem
				id="two"
				textValue="Two"
				className={({ isSelected }: any) => `item${isSelected ? ' selected' : ''}`}
			>
				Two
			</ListBoxItem>
		</ListBox>
	);
}

export function EmptyListBoxHarness() {
	return (
		<ListBox
			aria-label="No options"
			items={[] as any[]}
			renderEmptyState={() => 'No results found.'}
		>
			{(item: any) => <ListBoxItem id={item.id}>{item.name as string}</ListBoxItem>}
		</ListBox>
	);
}
