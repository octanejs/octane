import { useState } from 'octane';
import { Button } from '../../src/components/Button';
import { Checkbox } from '../../src/components/Checkbox';
import { Collection } from '../../src/components/Collection';
import { Tree, TreeItem, TreeItemContent, TreeLoadMoreItem } from '../../src/components/Tree';

// Fixtures for the RAC Tree components over the Phase-4 collection engine. Tree
// flattens its collection by expandedKeys (collapsed child rows are NOT in the
// DOM); each TreeItem renders its TreeItemContent inline and its nested rows as
// flattened siblings. The chevron Button rides the ButtonContext `chevron` slot
// and the selection Checkbox the CheckboxContext `selection` slot.

export function StaticTreeHarness(props: {
	selectionMode?: any;
	disabledKeys?: any;
	defaultExpandedKeys?: any;
	onExpandedChange?: (keys: any) => void;
	onSelectionChange?: (keys: any) => void;
}) {
	return (
		<Tree
			aria-label="Files"
			selectionMode={props.selectionMode}
			disabledKeys={props.disabledKeys}
			defaultExpandedKeys={props.defaultExpandedKeys}
			onExpandedChange={props.onExpandedChange}
			onSelectionChange={props.onSelectionChange}
		>
			<TreeItem id="documents" textValue="Documents">
				<TreeItemContent>
					{({ hasChildItems }: any) => (
						<>
							{hasChildItems ? <Button slot="chevron">▸</Button> : null}
							<Checkbox slot="selection" />
							Documents
						</>
					)}
				</TreeItemContent>
				<TreeItem id="project" textValue="Project">
					<TreeItemContent>
						{({ hasChildItems }: any) => (
							<>
								{hasChildItems ? <Button slot="chevron">▸</Button> : null}
								<Checkbox slot="selection" />
								Project
							</>
						)}
					</TreeItemContent>
					<TreeItem id="report" textValue="Report">
						<TreeItemContent>
							{({ hasChildItems }: any) => (
								<>
									{hasChildItems ? <Button slot="chevron">▸</Button> : null}
									<Checkbox slot="selection" />
									Report
								</>
							)}
						</TreeItemContent>
					</TreeItem>
				</TreeItem>
			</TreeItem>
			<TreeItem id="photos" textValue="Photos">
				<TreeItemContent>
					{({ hasChildItems }: any) => (
						<>
							{hasChildItems ? <Button slot="chevron">▸</Button> : null}
							<Checkbox slot="selection" />
							Photos
						</>
					)}
				</TreeItemContent>
			</TreeItem>
		</Tree>
	);
}

type FoodItem = { id: string; name: string; childItems?: FoodItem[] };

const initialFood: FoodItem[] = [
	{
		id: 'fruit',
		name: 'Fruit',
		childItems: [
			{ id: 'apple', name: 'Apple' },
			{ id: 'banana', name: 'Banana' },
		],
	},
	{
		id: 'vegetables',
		name: 'Vegetables',
		childItems: [{ id: 'carrot', name: 'Carrot' }],
	},
];

export function DynamicTreeHarness(props: { onExpandedChange?: (keys: any) => void }) {
	const [items, setItems] = useState(initialFood);
	const renderItem = (item: FoodItem) => (
		<TreeItem id={item.id} textValue={item.name}>
			<TreeItemContent>
				{({ hasChildItems }: any) => (
					<>
						{hasChildItems ? <Button slot="chevron">▸</Button> : null}
						{item.name}
					</>
				)}
			</TreeItemContent>
			<Collection items={item.childItems ?? []}>{renderItem}</Collection>
		</TreeItem>
	);
	return (
		<>
			<button
				data-action="add-root"
				onClick={() => setItems((prev) => [...prev, { id: 'grains', name: 'Grains' }])}
			>
				add
			</button>
			<Tree
				aria-label="Food"
				defaultExpandedKeys={['fruit']}
				items={items}
				onExpandedChange={props.onExpandedChange}
			>
				{renderItem}
			</Tree>
		</>
	);
}

export function EmptyTreeHarness() {
	return (
		<Tree aria-label="Nothing" items={[] as any[]} renderEmptyState={() => 'No files found.'}>
			{(item: any) => (
				<TreeItem id={item.id} textValue={item.name}>
					<TreeItemContent>{item.name}</TreeItemContent>
				</TreeItem>
			)}
		</Tree>
	);
}

export function LoadMoreTreeHarness(props: { isLoading?: boolean }) {
	return (
		<Tree aria-label="Loadable">
			<TreeItem id="a" textValue="A">
				<TreeItemContent>A</TreeItemContent>
			</TreeItem>
			<TreeItem id="b" textValue="B">
				<TreeItemContent>B</TreeItemContent>
			</TreeItem>
			<TreeLoadMoreItem isLoading={props.isLoading}>Loading more…</TreeLoadMoreItem>
		</Tree>
	);
}

export function ControlledTreeHarness(props: {
	expandedKeys: Iterable<any>;
	onExpandedChange?: (keys: any) => void;
}) {
	return (
		<Tree
			aria-label="Controlled"
			expandedKeys={props.expandedKeys}
			onExpandedChange={props.onExpandedChange}
		>
			<TreeItem id="parent" textValue="Parent">
				<TreeItemContent>
					{({ hasChildItems }: any) => (
						<>
							{hasChildItems ? <Button slot="chevron">▸</Button> : null}
							Parent
						</>
					)}
				</TreeItemContent>
				<TreeItem id="child" textValue="Child">
					<TreeItemContent>Child</TreeItemContent>
				</TreeItem>
			</TreeItem>
		</Tree>
	);
}
