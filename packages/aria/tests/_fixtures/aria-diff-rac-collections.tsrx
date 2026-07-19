import { useState } from 'octane';
import {
	Breadcrumb,
	Breadcrumbs,
	ComboBox,
	GridList,
	GridListItem,
	Input,
	Label,
	Link,
	ListBox,
	ListBoxItem,
	Tab,
	TabList,
	TabPanel,
	Tabs,
	Tag,
	TagGroup,
	TagList,
} from '@octanejs/aria/components';

// Phase-5 differential fixtures: the SAME react-aria-components collection trees run
// through @octanejs/aria/components (octane) and the real react-aria-components 1.19.0
// (tests/differential/_setup.ts rewrites the import). All fixtures render WITHOUT
// portals so both sides' container innerHTML is comparable; Menu/Select open-state is
// portal'd to document.body and carries behavioral coverage instead. Items use explicit
// textValue where committed text matters (octane preserves JSX whitespace verbatim).

const FRUITS = [
	{ id: 'apple', name: 'Apple' },
	{ id: 'banana', name: 'Banana' },
	{ id: 'cherry', name: 'Cherry' },
];

export function ListBoxSpec() {
	const [items, setItems] = useState(FRUITS);
	return <div>
		<ListBox aria-label="Fruits" selectionMode="single" items={items}>
			{(item: { id: string; name: string }) =>
				<ListBoxItem id={item.id} textValue={item.name}>{item.name}</ListBoxItem>}
		</ListBox>
		<button id="reverse" onClick={() => setItems((xs: typeof FRUITS) => [...xs].reverse())}>
			Reverse
		</button>
	</div>;
}

export function TabsSpec() {
	return <Tabs>
		<TabList aria-label="Tabs">
			<Tab id="one">One</Tab>
			<Tab id="two">Two</Tab>
		</TabList>
		<TabPanel id="one">First panel</TabPanel>
		<TabPanel id="two">Second panel</TabPanel>
	</Tabs>;
}

export function TagGroupSpec() {
	return <TagGroup selectionMode="multiple">
		<Label>Categories</Label>
		<TagList>
			<Tag id="news" textValue="News">News</Tag>
			<Tag id="travel" textValue="Travel">Travel</Tag>
		</TagList>
	</TagGroup>;
}

export function GridListSpec() {
	return <GridList aria-label="Rows" selectionMode="multiple">
		<GridListItem id="a" textValue="Alpha">Alpha</GridListItem>
		<GridListItem id="b" textValue="Bravo">Bravo</GridListItem>
	</GridList>;
}

export function BreadcrumbsSpec() {
	return <Breadcrumbs>
		<Breadcrumb>
			<Link href="/">Home</Link>
		</Breadcrumb>
		<Breadcrumb>
			<Link>Current</Link>
		</Breadcrumb>
	</Breadcrumbs>;
}

export function ComboBoxSpec() {
	return <ComboBox defaultItems={FRUITS} menuTrigger="input">
		<Label>Fruit</Label>
		<Input id="combo-input" />
		<ListBox>
			{(item: { id: string; name: string }) =>
				<ListBoxItem id={item.id} textValue={item.name}>{item.name}</ListBoxItem>}
		</ListBox>
	</ComboBox>;
}
