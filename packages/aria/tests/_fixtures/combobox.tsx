import { useRef } from 'octane';

import { Item } from '../../src/stately/collections/Item';
import { useComboBoxState } from '../../src/stately/combobox/useComboBoxState';
import { useComboBox } from '../../src/combobox/useComboBox';
import { useListBox } from '../../src/listbox/useListBox';
import { useOption } from '../../src/listbox/useOption';

// ---------------------------------------------------------------------------
// ComboBox: useComboBoxState → useComboBox (text input) + useListBox/useOption
// for the inline listbox. The listbox is rendered INLINE (no overlay portal /
// positioning) so the jsdom container can observe roles, filtering, and
// selection. The <output> mirrors combobox state for assertions.
// ---------------------------------------------------------------------------

export const FRUITS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cherry', name: 'Cherry' },
	{ id: 'grape', name: 'Grape' },
];

// Module-scope render function: value-position <Item> descriptors are what the
// collection builder walks.
function renderFruit(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

// A simple case-insensitive substring filter (the default filter drives the
// collection when items are uncontrolled).
function contains(textValue: string, inputValue: string): boolean {
	return textValue.toLowerCase().includes(inputValue.toLowerCase());
}

function Option(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { optionProps, isFocused } = useOption({ key: props.item.key }, props.state, ref);
	return (
		<li {...optionProps} ref={ref} data-focused={isFocused ? 'true' : undefined}>
			{props.item.rendered}
		</li>
	);
}

function ListBox(props: { listBoxProps: any; state: any; listBoxRef: any }) {
	const { listBoxProps } = useListBox(props.listBoxProps, props.state, props.listBoxRef);
	return (
		<ul {...listBoxProps} ref={props.listBoxRef}>
			{[...props.state.collection].map((item: any) => (
				<Option key={item.key} item={item} state={props.state} />
			))}
		</ul>
	);
}

export function ComboBoxHarness(props: {
	items?: Array<{ id: string; name: string }>;
	allowsCustomValue?: boolean;
	onInputChange?: (value: string) => void;
	onSelectionChange?: (key: any) => void;
}) {
	const state = useComboBoxState({
		defaultItems: props.items ?? FRUITS,
		children: renderFruit as any,
		defaultFilter: contains,
		allowsCustomValue: props.allowsCustomValue,
		onInputChange: props.onInputChange,
		onSelectionChange: props.onSelectionChange,
	});
	const inputRef = useRef<any>(null);
	const listBoxRef = useRef<any>(null);
	const popoverRef = useRef<any>(null);
	const buttonRef = useRef<any>(null);
	const { inputProps, listBoxProps, labelProps } = useComboBox(
		{
			label: 'Fruit',
			inputRef,
			listBoxRef,
			popoverRef,
			buttonRef,
		},
		state,
	);
	const openState = state.isOpen ? 'true' : 'false';
	const selectedKey = String(state.selectedKey ?? 'null');
	const focusedKey = String(state.selectionManager.focusedKey ?? 'null');
	return (
		<div>
			<label {...labelProps}>Fruit</label>
			<input {...inputProps} ref={inputRef} />
			{state.isOpen ? (
				<div ref={popoverRef} data-testid="popover">
					<ListBox listBoxProps={listBoxProps} state={state} listBoxRef={listBoxRef} />
				</div>
			) : null}
			<output
				data-open={openState}
				data-input-value={state.inputValue}
				data-selected-key={selectedKey}
				data-focused-key={focusedKey}
			>
				{'open:' + openState}
			</output>
		</div>
	);
}
