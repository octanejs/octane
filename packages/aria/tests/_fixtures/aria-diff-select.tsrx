import { useRef } from 'octane';
import { useButton, useListBox, useOption, useSelect, HiddenSelect } from '@octanejs/aria';
import { Item, useSelectState } from '@octanejs/aria/stately';

// Phase-3 differential fixture: the SAME Select runs through @octanejs/aria and real
// react-aria/react-stately (tests/differential/_setup.ts rewrites the imports). Covers
// useSelectState + useSelect trigger wiring (aria-haspopup/-expanded, labelling), the
// HiddenSelect native <select> mirror, and the inline listbox on open. Rendered INLINE
// (no overlay portal/positioning) so both sides' container innerHTML is comparable.

const ANIMALS = [
	{ id: 'red panda', name: 'Red Panda' },
	{ id: 'cat', name: 'Cat' },
	{ id: 'dog', name: 'Dog' },
];

function renderAnimal(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function SelectOption(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps } = useOption({ key: props.item.key }, props.state, ref);
	return <li {...optionProps} ref={ref}>{props.item.rendered}</li>;
}

function ListBoxPopup(props: { state: any; menuProps: any }) {
	const ref = useRef<any>(null);
	const { listBoxProps } = useListBox(props.menuProps, props.state, ref);
	return <ul {...listBoxProps} ref={ref}>{[...props.state.collection].map(
		(item: any) => <SelectOption key={item.key} item={item} state={props.state} />,
	)}</ul>;
}

export function SelectSpec() {
	const state = useSelectState({
		label: 'Favorite Animal',
		items: ANIMALS,
		children: renderAnimal as any,
	});
	const ref = useRef<any>(null);
	const { labelProps, triggerProps, valueProps, menuProps } = useSelect(
		{ label: 'Favorite Animal', name: 'animal' },
		state,
		ref,
	);
	const { buttonProps } = useButton(triggerProps, ref);
	const valueText =
		state.selectedItem ? String(state.selectedItem.textValue) : 'Select an animal';
	return <div>
		<span {...labelProps}>Favorite Animal</span>
		<HiddenSelect state={state} triggerRef={ref} label="Favorite Animal" name="animal" />
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
	</div>;
}
