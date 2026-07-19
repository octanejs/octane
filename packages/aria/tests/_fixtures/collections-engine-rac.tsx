import { createContext, createElement, useContext, useState } from 'octane';
import {
	Collection,
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../../src/collections/CollectionBuilder';
import { Hidden, createHideableComponent } from '../../src/collections/Hidden';
import { DefaultCollectionRenderer } from '../../src/components/Collection';

// Fixtures for the RAC collections ENGINE (src/collections/*): the hidden
// structural copy renders through octane createPortal into the Document's
// detached real container; refs register placeholder elements; snapshots
// rebuild by walking that container. The wrapper render functions use
// createElement (mirroring the plain-`.ts` RAC binding components that consume
// the engine); user-visible item content is JSX so descriptor caching is
// exercised the way applications exercise it.

// The real tree reads the collection through fixture context, standing in for
// RAC's state contexts (e.g. ListStateContext).
const CollectionCtx = createContext<any>(null);

// Render-phase capture so tests can assert against the built collection object
// the content render function receives.
export const captured: { collection?: any } = {};

const CollectionRootR = DefaultCollectionRenderer.CollectionRoot;
const CollectionBranchR = DefaultCollectionRenderer.CollectionBranch;

// Leaf item: renders the node's cached content in the REAL tree only. Declaring
// the third (node) parameter makes standalone rendering outside a collection an
// error, like upstream collection-only leaves.
const Option = createLeafComponent('item', (props: any, _ref: any, node?: any) =>
	createElement('li', {
		'data-key': String(node!.key),
		'data-text': node!.textValue,
		'data-level': String(node!.level),
		children: node!.rendered,
	}),
);

// Branch section: renders its child items from the built collection.
const GroupSection = createBranchComponent('section', (_props: any, _ref: any, section: any) =>
	createElement(SectionView, { section }),
);

function SectionView(props: { section: any }) {
	const collection = useContext(CollectionCtx);
	const sectionKey = String(props.section.key);
	return (
		<section data-key={sectionKey}>
			<CollectionBranchR collection={collection} parent={props.section} />
		</section>
	);
}

function ListView(props: { collection: any }) {
	captured.collection = props.collection;
	const size = String(props.collection.size);
	const firstKey = String(props.collection.getFirstKey());
	return (
		<CollectionCtx.Provider value={props.collection}>
			<ul data-size={size} data-first={firstKey}>
				<CollectionRootR collection={props.collection} />
			</ul>
		</CollectionCtx.Provider>
	);
}

export function StaticListHarness() {
	return (
		<CollectionBuilder
			content={
				<Collection>
					<Option id="a">Alpha</Option>
					<Option id="b" textValue="Beta">
						<b>Beta!</b>
					</Option>
				</Collection>
			}
			children={(collection: any) => <ListView collection={collection} />}
		/>
	);
}

export function SectionedHarness() {
	return (
		<CollectionBuilder
			content={
				<Collection>
					<GroupSection id="s1">
						<Option id="x">Xen</Option>
						<Option id="y">Yak</Option>
					</GroupSection>
					<Option id="z">Zed</Option>
				</Collection>
			}
			children={(collection: any) => <ListView collection={collection} />}
		/>
	);
}

export function DynamicListHarness() {
	const [items, setItems] = useState([
		{ id: 'a', name: 'Alpha' },
		{ id: 'b', name: 'Beta' },
		{ id: 'c', name: 'Gamma' },
	]);
	return (
		<div>
			<button data-action="reorder" onClick={() => setItems([items[2], items[0], items[1]])}>
				reorder
			</button>
			<button data-action="remove" onClick={() => setItems(items.filter((i) => i.id !== 'b'))}>
				remove
			</button>
			<button data-action="add" onClick={() => setItems([...items, { id: 'd', name: 'Delta' }])}>
				add
			</button>
			<button
				data-action="rename"
				onClick={() => setItems(items.map((i) => (i.id === 'a' ? { id: 'a', name: 'Aleph' } : i)))}
			>
				rename
			</button>
			<CollectionBuilder
				content={
					<Collection
						items={items}
						children={(item: any) => (
							<Option id={item.id} textValue={item.name}>
								{item.name}
							</Option>
						)}
					/>
				}
				children={(collection: any) => <ListView collection={collection} />}
			/>
		</div>
	);
}

// Standalone Hidden: children render off-document only.
export function StandaloneHiddenHarness() {
	return (
		<div>
			<span data-live-probe="">live</span>
			<Hidden>
				<span data-hidden-probe="">secret</span>
			</Hidden>
		</div>
	);
}

// Hideable component: renders normally in the live tree, null in hidden trees.
const HideableNote = createHideableComponent((props: any) =>
	createElement('em', { 'data-note': '', children: props.children }),
);

export function HideableHarness() {
	return (
		<div>
			<HideableNote>visible</HideableNote>
			<Hidden>
				<HideableNote>never</HideableNote>
			</Hidden>
		</div>
	);
}
