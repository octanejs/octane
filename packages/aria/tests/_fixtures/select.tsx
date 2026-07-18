import { useRef } from 'octane';

import { Item } from '../../src/stately/collections/Item';
import { useSelectState } from '../../src/stately/select/useSelectState';
import { useButton } from '../../src/button/useButton';
import { useListBox } from '../../src/listbox/useListBox';
import { useOption } from '../../src/listbox/useOption';
import { useSelect } from '../../src/select/useSelect';
import { HiddenSelect } from '../../src/select/HiddenSelect';

// ---------------------------------------------------------------------------
// Select: useSelectState → useSelect (+ useButton trigger, HiddenSelect native
// <select>, and an INLINE listbox via useListBox/useOption while open). The
// <output> mirrors select state so tests can assert open/selection after events.
// Positioning/overlays are intentionally not used — the popup renders inline.
// ---------------------------------------------------------------------------

export const ANIMALS = [
	{ id: 'red panda', name: 'Red Panda' },
	{ id: 'cat', name: 'Cat' },
	{ id: 'dog', name: 'Dog' },
];

// Module-scope render function: value-position <Item> descriptors are what the
// collection builder walks.
function renderAnimal(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function SelectOption(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps, isSelected, isFocused } = useOption(
		{ key: props.item.key },
		props.state,
		ref,
	);
	return (
		<li
			{...optionProps}
			ref={ref}
			data-selected={isSelected ? 'true' : undefined}
			data-focused={isFocused ? 'true' : undefined}
		>
			{props.item.rendered}
		</li>
	);
}

function ListBoxPopup(props: { state: any; menuProps: any }) {
	const ref = useRef<any>(null);
	const { listBoxProps } = useListBox(props.menuProps, props.state, ref);
	return (
		<ul {...listBoxProps} ref={ref}>
			{[...props.state.collection].map((item: any) => (
				<SelectOption key={item.key} item={item} state={props.state} />
			))}
		</ul>
	);
}

export function SelectHarness(props: {
	items?: Array<{ id: string; name: string }>;
	isDisabled?: boolean;
	name?: string;
}) {
	const state = useSelectState({
		label: 'Favorite Animal',
		items: props.items ?? ANIMALS,
		children: renderAnimal as any,
		isDisabled: props.isDisabled,
	});
	const ref = useRef<any>(null);
	const { labelProps, triggerProps, valueProps, menuProps } = useSelect(
		{ label: 'Favorite Animal', name: props.name ?? 'animal', isDisabled: props.isDisabled },
		state,
		ref,
	);
	const { buttonProps } = useButton(triggerProps, ref);

	const valueText = state.selectedItem ? String(state.selectedItem.textValue) : 'Select an animal';

	return (
		<div>
			<span {...labelProps}>Favorite Animal</span>
			<HiddenSelect
				state={state}
				triggerRef={ref}
				label="Favorite Animal"
				name={props.name ?? 'animal'}
			/>
			<button {...buttonProps} ref={ref}>
				<span {...valueProps}>{valueText}</span>
			</button>
			{state.isOpen ? <ListBoxPopup state={state} menuProps={menuProps} /> : null}
			<output
				data-open={state.isOpen ? 'true' : 'false'}
				data-selected-key={String(state.selectedKey ?? 'null')}
			>
				{'selected:' + String(state.selectedKey ?? 'null')}
			</output>
		</div>
	);
}
