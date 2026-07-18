import { useRef } from 'octane';
import { useListBox, useOption } from '@octanejs/aria';
import { Item, useListState } from '@octanejs/aria/stately';

// Phase-2 collections differential fixture: the SAME ListBox runs through @octanejs/aria
// and real react-aria/react-stately (tests/differential/_setup.ts rewrites the imports).
// Covers useListState collection building, useListBox roles/labelling, useOption
// selection wiring, and click-to-select through the native pointer path.

const FRUITS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cherry', name: 'Cherry' },
];

function renderFruit(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function Option(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps, isSelected } = useOption({ key: props.item.key }, props.state, ref);
	return <li
		{...optionProps}
		ref={ref}
		data-selected={isSelected ? 'y' : 'n'}
	>{props.item.rendered}</li>;
}

export function ListBoxSpec() {
	const state = useListState({
		items: FRUITS,
		children: renderFruit as any,
		selectionMode: 'single',
	});
	const ref = useRef<any>(null);
	const { listBoxProps, labelProps } = useListBox({ label: 'Fruits' }, state, ref);
	const selected = [...state.selectionManager.selectedKeys].sort().join(',') || 'none';
	return <div>
		<span {...labelProps}>Fruits</span>
		<ul {...listBoxProps} ref={ref}>{[...state.collection].map(
			(item: any) => <Option key={item.key} item={item} state={state} />,
		)}</ul>
		<output>
			{'selected:' + selected}
		</output>
	</div>;
}
