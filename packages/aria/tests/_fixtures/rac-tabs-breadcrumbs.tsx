import { useState } from 'octane';
import { Breadcrumb, Breadcrumbs } from '../../src/components/Breadcrumbs';
import { Collection } from '../../src/components/Collection';
import { Link } from '../../src/components/Link';
import { Tab, TabList, TabPanel, Tabs } from '../../src/components/Tabs';

// Fixtures for the RAC Tabs and Breadcrumbs components over the Phase-4
// collection engine. Tabs builds its collection at the <Tabs> root (the whole
// children tree renders once hidden, TabPanels are hideable there), so items
// live in TabList and panels pair by id; Breadcrumbs builds its own collection
// from its direct children.

export function StaticTabsHarness(props: { onSelectionChange?: (key: any) => void }) {
	return (
		<Tabs onSelectionChange={props.onSelectionChange}>
			<TabList aria-label="History of Ancient Rome">
				<Tab id="founding">Founding</Tab>
				<Tab id="monarchy">Monarchy</Tab>
				<Tab id="empire">Empire</Tab>
			</TabList>
			<TabPanel id="founding">Founding panel</TabPanel>
			<TabPanel id="monarchy">Monarchy panel</TabPanel>
			<TabPanel id="empire">Empire panel</TabPanel>
		</Tabs>
	);
}

export function DynamicTabsHarness() {
	const [items, setItems] = useState([
		{ id: 'a', title: 'Alpha' },
		{ id: 'b', title: 'Beta' },
		{ id: 'c', title: 'Gamma' },
	]);
	return (
		<div>
			<button
				data-action="add"
				onClick={() => setItems((prev) => [...prev, { id: 'd', title: 'Delta' }])}
			>
				add
			</button>
			<Tabs>
				<TabList aria-label="Dynamic tabs" items={items}>
					{(item: any) => <Tab id={item.id}>{item.title}</Tab>}
				</TabList>
				<Collection items={items}>
					{(item: any) => <TabPanel id={item.id}>{item.title + ' panel'}</TabPanel>}
				</Collection>
			</Tabs>
		</div>
	);
}

export function ForceMountTabsHarness() {
	return (
		<Tabs>
			<TabList aria-label="Force mounted">
				<Tab id="one">One</Tab>
				<Tab id="two">Two</Tab>
			</TabList>
			<TabPanel id="one" shouldForceMount>
				One panel
			</TabPanel>
			<TabPanel id="two" shouldForceMount>
				Two panel
			</TabPanel>
		</Tabs>
	);
}

export function StaticBreadcrumbsHarness(props: { onAction?: (key: any) => void }) {
	return (
		<Breadcrumbs onAction={props.onAction}>
			<Breadcrumb id="home">
				<Link href="/">Home</Link>
			</Breadcrumb>
			<Breadcrumb id="library">
				<Link href="/library">Library</Link>
			</Breadcrumb>
			<Breadcrumb id="current">
				<Link>March 2022 Assets</Link>
			</Breadcrumb>
		</Breadcrumbs>
	);
}

export function DynamicBreadcrumbsHarness(props: { onAction?: (key: any) => void }) {
	const [items, setItems] = useState([
		{ id: 1, name: 'Home' },
		{ id: 2, name: 'Trendy' },
		{ id: 3, name: 'March 2022 Assets' },
	]);
	return (
		<div>
			<button data-action="pop" onClick={() => setItems((prev) => prev.slice(0, -1))}>
				pop
			</button>
			<Breadcrumbs items={items} onAction={props.onAction}>
				{(item: any) => (
					<Breadcrumb id={item.id}>
						<Link>{item.name}</Link>
					</Breadcrumb>
				)}
			</Breadcrumbs>
		</div>
	);
}
