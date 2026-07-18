import { useRef } from 'octane';
import { useTab, useTabList, useTabPanel } from '@octanejs/aria';
import { Item, useTabListState } from '@octanejs/aria/stately';

// Phase-2 collections differential fixture: the SAME Tabs component runs through
// @octanejs/aria and the real react-aria/react-stately (tests/differential/_setup.ts
// rewrites the imports). Selection state surfaces as rendered text + aria wiring so the
// byte-compare covers role/tabIndex/aria-controls/aria-labelledby/id linkage.

const TABS = [
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
	return <div {...tabProps} ref={ref}>{props.item.rendered}</div>;
}

export function TabsSpec() {
	const state = useTabListState({ items: TABS, children: renderTab as any });
	const listRef = useRef<any>(null);
	const { tabListProps } = useTabList({ 'aria-label': 'Tabs' }, state, listRef);
	const panelRef = useRef<any>(null);
	const { tabPanelProps } = useTabPanel({}, state, panelRef);
	const selected = String(state.selectedKey);
	return <div>
		<div {...tabListProps} ref={listRef}>{[...state.collection].map(
			(item: any) => <Tab key={item.key} item={item} state={state} />,
		)}</div>
		<div {...tabPanelProps} ref={panelRef}>
			{'panel:' + selected}
		</div>
	</div>;
}
