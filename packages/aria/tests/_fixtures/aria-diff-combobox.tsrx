import { useRef } from 'octane';
import { useComboBox, useListBox, useOption } from '@octanejs/aria';
import { Item, useComboBoxState } from '@octanejs/aria/stately';

// Phase-3 differential fixture: the SAME ComboBox runs through @octanejs/aria and real
// react-aria/react-stately (tests/differential/_setup.ts rewrites the imports). Covers
// useComboBoxState filtering + useComboBox input wiring (role=combobox, aria-expanded/
// -controls, native input-event typing) + the inline listbox. The listbox is rendered
// INLINE (no overlay portal/positioning) so both sides' container innerHTML is comparable.

const FRUITS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cherry', name: 'Cherry' },
	{ id: 'grape', name: 'Grape' },
];

function renderFruit(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function contains(textValue: string, inputValue: string): boolean {
	return textValue.toLowerCase().includes(inputValue.toLowerCase());
}

function Option(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps } = useOption({ key: props.item.key }, props.state, ref);
	return <li {...optionProps} ref={ref}>{props.item.rendered}</li>;
}

function ComboListBox(props: { listBoxProps: any; state: any; listBoxRef: any }) {
	const { listBoxProps } = useListBox(props.listBoxProps, props.state, props.listBoxRef);
	return <ul {...listBoxProps} ref={props.listBoxRef}>{[...props.state.collection].map(
		(item: any) => <Option key={item.key} item={item} state={props.state} />,
	)}</ul>;
}

export function ComboBoxSpec() {
	const state = useComboBoxState({
		defaultItems: FRUITS,
		children: renderFruit as any,
		defaultFilter: contains,
	});
	const inputRef = useRef<any>(null);
	const listBoxRef = useRef<any>(null);
	const popoverRef = useRef<any>(null);
	const buttonRef = useRef<any>(null);
	const { inputProps, listBoxProps, labelProps } = useComboBox(
		{ label: 'Fruit', inputRef, listBoxRef, popoverRef, buttonRef },
		state,
	);
	const openState = state.isOpen ? 'true' : 'false';
	const selectedKey = String(state.selectedKey ?? 'null');
	return <div>
		<label {...labelProps}>Fruit</label>
		<input {...inputProps} ref={inputRef} />
		{state.isOpen
			? <div ref={popoverRef}>
					<ComboListBox listBoxProps={listBoxProps} state={state} listBoxRef={listBoxRef} />
				</div>
			: null}
		<output
			data-open={openState}
			data-input-value={state.inputValue}
			data-selected-key={selectedKey}
		>
			{'open:' + openState}
		</output>
	</div>;
}
