import { CollectionBuilder } from '../../src/stately/collections/CollectionBuilder';
import { Item } from '../../src/stately/collections/Item';
import { Section } from '../../src/stately/collections/Section';

// Descriptor-array collections: value-position JSX yields walkable descriptors.
export function buildFlat() {
	const builder = new CollectionBuilder<any>();
	const boldBeta = <b>Beta</b>;
	const children = [
		<Item key="a">Alpha</Item>,
		<Item key="b" textValue="Beta" children={boldBeta} />,
	];
	return [...builder.build({ children: children as any })];
}

export function buildSectioned() {
	const builder = new CollectionBuilder<any>();
	const fruits = [<Item key="apple">Apple</Item>, <Item key="banana">Banana</Item>];
	const children = [
		<Section key="s1" title="Fruits" children={fruits} />,
		<Item key="other">Other</Item>,
	];
	return [...builder.build({ children: children as any })];
}

// Dynamic collections: items + a render function returning <Item> descriptors.
function renderItem(item: { id: string; name: string }) {
	return <Item key={item.id}>{item.name}</Item>;
}

export function buildDynamic(items: Array<{ id: string; name: string }>) {
	const builder = new CollectionBuilder<any>();
	return {
		builder,
		nodes: [...builder.build({ items, children: renderItem as any })],
	};
}

export function rebuild(
	builder: CollectionBuilder<any>,
	items: Array<{ id: string; name: string }>,
) {
	return [...builder.build({ items, children: renderItem as any })];
}

// A component whose STATIC children arrive as a compiled children block — the
// documented hooks-tier divergence: the builder must reject it descriptively.
export function ChildrenBlockProbe(props: { children?: any }) {
	let message = 'no error';
	let keys = '';
	try {
		const builder = new CollectionBuilder<any>();
		const nodes = [...builder.build({ children: props.children })];
		keys = nodes.map((n) => String(n.key)).join(',');
	} catch (e: any) {
		message = e.message;
	}
	return <output data-keys={keys}>{message as string}</output>;
}

export function StaticChildrenHarness() {
	return (
		<ChildrenBlockProbe>
			<Item key="a">Alpha</Item>
		</ChildrenBlockProbe>
	);
}

export function StaticMultiChildrenHarness() {
	return (
		<ChildrenBlockProbe>
			<Item key="a">Alpha</Item>
			<Item key="b">Beta</Item>
		</ChildrenBlockProbe>
	);
}
