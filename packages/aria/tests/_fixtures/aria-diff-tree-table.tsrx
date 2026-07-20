import { useState } from 'octane';
import {
	Button,
	Cell,
	Checkbox,
	Column,
	Row,
	Table,
	TableBody,
	TableHeader,
	Tree,
	TreeItem,
	TreeItemContent,
} from '@octanejs/aria/components';

// Tree/Table-phase differential fixtures: the SAME react-aria-components trees run
// through @octanejs/aria/components (octane) and the real react-aria-components 1.19.0
// (tests/differential/_setup.ts rewrites the import). Both render inline — no portals —
// so the full container compare applies. Column-resize pixel behavior is layout-driven
// (jsdom zero rects) and stays behavioral; sorting/selection/expansion are compared here.

function TreeFiles(props: { expanded: string[]; selected?: string[] }) {
	return <Tree
		aria-label="Files"
		selectionMode="multiple"
		expandedKeys={props.expanded}
		selectedKeys={props.selected ?? []}
	>
		<TreeItem id="docs" textValue="Documents">
			<TreeItemContent>
				<Button slot="chevron">v</Button>
				<Checkbox slot="selection" />
				Documents
			</TreeItemContent>
			<TreeItem id="report" textValue="Report">
				<TreeItemContent>
					<Button slot="chevron">v</Button>
					<Checkbox slot="selection" />
					Report
				</TreeItemContent>
			</TreeItem>
		</TreeItem>
		<TreeItem id="photos" textValue="Photos">
			<TreeItemContent>
				<Button slot="chevron">v</Button>
				<Checkbox slot="selection" />
				Photos
			</TreeItemContent>
			<TreeItem id="beach" textValue="Beach">
				<TreeItemContent>
					<Button slot="chevron">v</Button>
					<Checkbox slot="selection" />
					Beach
				</TreeItemContent>
			</TreeItem>
		</TreeItem>
	</Tree>;
}

export function TreeSpec() {
	return <TreeFiles expanded={['docs']} />;
}

export function TreeExpandedSelectedSpec() {
	return <TreeFiles expanded={['docs', 'photos']} selected={['beach']} />;
}

export function TreeCollapsedSpec() {
	return <TreeFiles expanded={[]} />;
}

const ROWS = [
	{ id: 'r1', name: 'Charizard', type: 'Fire' },
	{ id: 'r2', name: 'Blastoise', type: 'Water' },
	{ id: 'r3', name: 'Venusaur', type: 'Grass' },
];

export function TableSpec() {
	const [sort, setSort] = useState<any>(null);
	let items = ROWS;
	if (sort) {
		items = [...ROWS].sort((a: any, b: any) => {
			const cmp = String(a[sort.column]).localeCompare(String(b[sort.column]));
			return sort.direction === 'descending' ? -cmp : cmp;
		});
	}
	return <Table
		aria-label="Pokemon"
		selectionMode="multiple"
		sortDescriptor={sort}
		onSortChange={setSort}
	>
		<TableHeader>
			<Column id="name" isRowHeader allowsSorting>
				Name
			</Column>
			<Column id="type">Type</Column>
		</TableHeader>
		<TableBody items={items}>
			{(item: { id: string; name: string; type: string }) => <Row
				id={item.id}
				textValue={item.name}
			>
				<Cell>{item.name}</Cell>
				<Cell>{item.type}</Cell>
			</Row>}
		</TableBody>
	</Table>;
}
