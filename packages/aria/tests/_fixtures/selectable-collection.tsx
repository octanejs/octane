import { useRef } from 'octane';

import { Item } from '../../src/stately/collections/Item';
import { useListState } from '../../src/stately/list/useListState';
import { useSelectableItem } from '../../src/selection/useSelectableItem';
import { useSelectableList } from '../../src/selection/useSelectableList';

// A minimal listbox: useListState builds the collection + SelectionManager,
// useSelectableList wires the collection-level keyboard/focus behavior onto the
// <ul>, and each <li> is a useSelectableItem. The <output> mirrors the
// selection-manager state so tests can assert focusedKey/selection after events.

export const DEFAULT_ITEMS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cactus', name: 'Cactus' },
	{ id: 'cherry', name: 'Cherry' },
	{ id: 'date', name: 'Date' },
];

// Module-scope render function: value-position <Item> descriptors are what the
// collection builder walks (see collections-engine.tsx).
function renderFruit(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function Option(props: { item: any; state: any; embedTabbable?: boolean }) {
	const ref = useRef<any>(null);
	const { itemProps, isSelected, isFocused, isDisabled } = useSelectableItem({
		selectionManager: props.state.selectionManager,
		key: props.item.key,
		ref,
	});
	return (
		<li
			{...itemProps}
			ref={ref}
			role="option"
			aria-selected={isSelected}
			aria-disabled={isDisabled || undefined}
			data-focused={isFocused ? 'true' : undefined}
		>
			{props.item.rendered}
			{props.embedTabbable ? <button data-embedded="">act</button> : null}
		</li>
	);
}

export function ListBoxHarness(props: {
	selectionMode?: 'single' | 'multiple' | 'none';
	selectionBehavior?: 'toggle' | 'replace';
	shouldFocusWrap?: boolean;
	disallowEmptySelection?: boolean;
	defaultSelectedKeys?: Iterable<string>;
	disabledKeys?: Iterable<string>;
	items?: Array<{ id: string; name: string }>;
	embedTabbableInLast?: boolean;
}) {
	const items = props.items ?? DEFAULT_ITEMS;
	const state = useListState({
		items,
		children: renderFruit as any,
		selectionMode: props.selectionMode ?? 'single',
		selectionBehavior: props.selectionBehavior,
		disallowEmptySelection: props.disallowEmptySelection,
		defaultSelectedKeys: props.defaultSelectedKeys,
		disabledKeys: props.disabledKeys,
	});
	const ref = useRef<any>(null);
	const { listProps } = useSelectableList({
		selectionManager: state.selectionManager,
		collection: state.collection,
		disabledKeys: state.disabledKeys,
		ref,
		shouldFocusWrap: props.shouldFocusWrap,
		disallowEmptySelection: props.disallowEmptySelection,
	});
	const nodes = [...state.collection];
	const selected = state.selectionManager.selectedKeys;
	return (
		<div>
			<ul {...listProps} ref={ref} role="listbox" aria-label="fruits">
				{nodes.map((item: any, i: number) => (
					<Option
						key={item.key}
						item={item}
						state={state}
						embedTabbable={props.embedTabbableInLast && i === nodes.length - 1}
					/>
				))}
			</ul>
			<output
				data-focused-key={String(state.selectionManager.focusedKey ?? 'null')}
				data-selected={[...selected].sort().join(',') || 'none'}
				data-collection-focused={state.selectionManager.isFocused ? 'true' : 'false'}
			>
				{'focused:' + String(state.selectionManager.focusedKey ?? 'null')}
			</output>
		</div>
	);
}
