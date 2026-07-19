import { useRef } from 'octane';

import { Item } from '../../src/stately/collections/Item';
import { Section } from '../../src/stately/collections/Section';
import { getChildNodes } from '../../src/stately/collections/getChildNodes';
import { useListState } from '../../src/stately/list/useListState';
import { useMenuTriggerState } from '../../src/stately/menu/useMenuTriggerState';
import { useTabListState } from '../../src/stately/tabs/useTabListState';
import { useTreeState } from '../../src/stately/tree/useTreeState';
import { useButton } from '../../src/button/useButton';
import { useListBox } from '../../src/listbox/useListBox';
import { useListBoxSection } from '../../src/listbox/useListBoxSection';
import { useOption } from '../../src/listbox/useOption';
import { useMenu } from '../../src/menu/useMenu';
import { useMenuItem } from '../../src/menu/useMenuItem';
import { useMenuTrigger } from '../../src/menu/useMenuTrigger';
import { useTab } from '../../src/tabs/useTab';
import { useTabList } from '../../src/tabs/useTabList';
import { useTabPanel } from '../../src/tabs/useTabPanel';

// ---------------------------------------------------------------------------
// ListBox: useListState → useListBox + useOption (+ useListBoxSection).
// The <output> mirrors selection-manager state so tests can assert focus and
// selection after events.
// ---------------------------------------------------------------------------

export const FRUITS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cherry', name: 'Cherry' },
];

// Module-scope render function: value-position <Item> descriptors are what the
// collection builder walks.
function renderFruit(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
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

export function ListBoxHarness(props: {
	items?: Array<{ id: string; name: string }>;
	selectionMode?: 'single' | 'multiple' | 'none';
	onAction?: (key: any) => void;
}) {
	const state = useListState({
		items: props.items ?? FRUITS,
		children: renderFruit as any,
		selectionMode: props.selectionMode ?? 'single',
	});
	const ref = useRef<any>(null);
	const { listBoxProps, labelProps } = useListBox(
		{ label: 'Fruits', onAction: props.onAction },
		state,
		ref,
	);
	return (
		<div>
			<span {...labelProps}>Fruits</span>
			<ul {...listBoxProps} ref={ref}>
				{[...state.collection].map((item: any) => (
					<Option key={item.key} item={item} state={state} />
				))}
			</ul>
			<output
				data-focused-key={String(state.selectionManager.focusedKey ?? 'null')}
				data-selected={[...state.selectionManager.selectedKeys].sort().join(',') || 'none'}
			>
				{'focused:' + String(state.selectionManager.focusedKey ?? 'null')}
			</output>
		</div>
	);
}

// One element per line: the tsrx parser rejects a JSX element after `, ` on one line.
// prettier-ignore
const fruitSection = [
	<Item key="apple">Apple</Item>,
	<Item key="banana">Banana</Item>,
];
// prettier-ignore
const veggieSection = [
	<Item key="carrot">Carrot</Item>,
	<Item key="daikon">Daikon</Item>,
];
// prettier-ignore
const sectionedChildren = [
	<Section key="s1" title="Fruits" children={fruitSection} />,
	<Section key="s2" title="Veggies" children={veggieSection} />,
];

function ListBoxSection(props: { section: any; state: any }) {
	const { itemProps, headingProps, groupProps } = useListBoxSection({
		heading: props.section.rendered,
		'aria-label': props.section['aria-label'],
	});
	const nodes = [...getChildNodes(props.section, props.state.collection)];
	return (
		<li {...itemProps} data-section={String(props.section.key)}>
			{props.section.rendered ? <span {...headingProps}>{props.section.rendered}</span> : null}
			<ul {...groupProps}>
				{nodes.map((node: any) => (
					<Option key={node.key} item={node} state={props.state} />
				))}
			</ul>
		</li>
	);
}

export function SectionedListBoxHarness() {
	const state = useListState({
		children: sectionedChildren as any,
		selectionMode: 'single',
	});
	const ref = useRef<any>(null);
	const { listBoxProps } = useListBox({ 'aria-label': 'Produce' }, state, ref);
	return (
		<ul {...listBoxProps} ref={ref}>
			{[...state.collection].map((node: any) =>
				node.type === 'section' ? (
					<ListBoxSection key={node.key} section={node} state={state} />
				) : (
					<Option key={node.key} item={node} state={state} />
				),
			)}
		</ul>
	);
}

// ---------------------------------------------------------------------------
// Menu: useTreeState → useMenu + useMenuItem; useMenuTriggerState →
// useMenuTrigger + useButton for the trigger harness.
// ---------------------------------------------------------------------------

export const ACTIONS = [
	{ id: 'cut', name: 'Cut' },
	{ id: 'copy', name: 'Copy' },
	{ id: 'paste', name: 'Paste' },
];

function renderAction(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function MenuItemRow(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { menuItemProps, isFocused } = useMenuItem({ key: props.item.key }, props.state, ref);
	return (
		<li {...menuItemProps} ref={ref} data-focused={isFocused ? 'true' : undefined}>
			{props.item.rendered}
		</li>
	);
}

export function MenuHarness(props: {
	selectionMode?: 'single' | 'multiple' | 'none';
	onAction?: (key: any, value: any) => void;
	onClose?: () => void;
}) {
	const state = useTreeState({
		items: ACTIONS,
		children: renderAction as any,
		selectionMode: props.selectionMode ?? 'none',
	});
	const ref = useRef<any>(null);
	const { menuProps } = useMenu(
		{ 'aria-label': 'Actions', onAction: props.onAction, onClose: props.onClose },
		state,
		ref,
	);
	return (
		<div>
			<ul {...menuProps} ref={ref}>
				{[...state.collection].map((item: any) => (
					<MenuItemRow key={item.key} item={item} state={state} />
				))}
			</ul>
			<output data-focused-key={String(state.selectionManager.focusedKey ?? 'null')}>
				{'focused:' + String(state.selectionManager.focusedKey ?? 'null')}
			</output>
		</div>
	);
}

function TriggeredMenu(props: { menuProps: any; onAction?: (key: any, value: any) => void }) {
	const state = useTreeState({
		items: ACTIONS,
		children: renderAction as any,
		selectionMode: 'none',
	});
	const ref = useRef<any>(null);
	const { menuProps } = useMenu({ ...props.menuProps, onAction: props.onAction }, state, ref);
	return (
		<ul {...menuProps} ref={ref}>
			{[...state.collection].map((item: any) => (
				<MenuItemRow key={item.key} item={item} state={state} />
			))}
		</ul>
	);
}

export function MenuTriggerHarness(props: { onAction?: (key: any, value: any) => void }) {
	const state = useMenuTriggerState({});
	const ref = useRef<any>(null);
	const { menuTriggerProps, menuProps } = useMenuTrigger({}, state, ref);
	const { buttonProps } = useButton(menuTriggerProps, ref);
	return (
		<div>
			<button {...buttonProps} ref={ref}>
				Open
			</button>
			{state.isOpen ? <TriggeredMenu menuProps={menuProps} onAction={props.onAction} /> : null}
			<output
				data-open={state.isOpen ? 'true' : 'false'}
				data-focus-strategy={String(state.focusStrategy ?? 'null')}
			>
				{'open:' + String(state.isOpen)}
			</output>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tabs: useTabListState → useTabList + useTab + useTabPanel.
// ---------------------------------------------------------------------------

export const TABS = [
	{ id: 'one', name: 'One' },
	{ id: 'two', name: 'Two' },
	{ id: 'three', name: 'Three' },
];

function renderTab(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

function Tab(props: { item: any; state: any }) {
	const ref = useRef<any>(null);
	const { tabProps } = useTab({ key: props.item.key }, props.state, ref);
	return (
		<div {...tabProps} ref={ref}>
			{props.item.rendered}
		</div>
	);
}

export function TabsHarness(props: {
	disabledKeys?: Iterable<string>;
	keyboardActivation?: 'automatic' | 'manual';
}) {
	const state = useTabListState({
		items: TABS,
		children: renderTab as any,
		disabledKeys: props.disabledKeys,
	});
	const listRef = useRef<any>(null);
	const { tabListProps } = useTabList(
		{ 'aria-label': 'Tabs', keyboardActivation: props.keyboardActivation },
		state,
		listRef,
	);
	const panelRef = useRef<any>(null);
	const { tabPanelProps } = useTabPanel({}, state, panelRef);
	return (
		<div>
			<div {...tabListProps} ref={listRef}>
				{[...state.collection].map((item: any) => (
					<Tab key={item.key} item={item} state={state} />
				))}
			</div>
			<div {...tabPanelProps} ref={panelRef}>
				{'panel:' + String(state.selectedKey)}
			</div>
			<output data-selected-key={String(state.selectedKey ?? 'null')}>
				{'selected:' + String(state.selectedKey ?? 'null')}
			</output>
		</div>
	);
}
