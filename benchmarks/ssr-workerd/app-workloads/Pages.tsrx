import { createContext, use, useContext, type OctaneNode } from 'octane';
import type { Item, Payload, Workload } from './data';

type Props = { work: Workload };
const Scope = createContext('missing');
const Locale = createContext('missing');
const Theme = createContext('missing');
const Density = createContext('missing');
const Zone = createContext('missing');
const Collection = createContext('missing');

function Providers(props: {
	profile: Payload;
	preferences: Payload;
	collection: Payload;
	children: OctaneNode;
}) @{
	<Scope.Provider value={props.profile.label}>
		<Locale.Provider value={props.preferences.label + '/locale'}>
			<Theme.Provider value={props.preferences.label + '/theme'}>
				<Density.Provider value={props.preferences.label + '/density'}>
					<Zone.Provider value={props.preferences.label + '/zone'}>
						<Collection.Provider
							value={props.collection.label}
						>{props.children}</Collection.Provider>
					</Zone.Provider>
				</Density.Provider>
			</Theme.Provider>
		</Locale.Provider>
	</Scope.Provider>
}

function ContextLabels(props: { prefix: string }) @{
	const scope = useContext(Scope);
	const locale = useContext(Locale);
	const theme = useContext(Theme);
	const density = useContext(Density);
	const zone = useContext(Zone);
	const collection = useContext(Collection);
	<footer>
		<span data-proof={props.prefix + '/scope'}>{scope as string}</span>
		<span data-proof={props.prefix + '/locale'}>{locale as string}</span>
		<span data-proof={props.prefix + '/theme'}>{theme as string}</span>
		<span data-proof={props.prefix + '/density'}>{density as string}</span>
		<span data-proof={props.prefix + '/zone'}>{zone as string}</span>
		<span data-proof={props.prefix + '/collection'}>{collection as string}</span>
	</footer>
}

function SharedProfile(props: Props & { prefix: string }) @{
	// Repeated consumers deliberately share one request-owned promise. The
	// cache is part of the workload, not an optimization of the SSR runtime.
	const profile = use(props.work.load('profile'));
	<span data-proof={props.prefix + '/profile'}>{profile.label as string}</span>
}

function ItemHeading(props: { item: Item; prefix: string }) @{
	<header>
		<h2 data-proof={props.prefix + '/title'}>{props.item.title as string}</h2>
	</header>
}

function ItemBody(props: { item: Item; prefix: string }) @{
	<div class="item-body">
		<p data-proof={props.prefix + '/text'}>{props.item.text as string}</p>
		<pre>
			<code data-proof={props.prefix + '/code'}>{props.item.code as string}</code>
		</pre>
		<ul>
			@for (const tag of props.item.tags; key tag) {
				<li data-proof={props.prefix + '/' + tag}>{tag as string}</li>
			}
		</ul>
	</div>
}

function Navigation(props: Props) @{
	const data = use(props.work.load('navigation'));
	<nav aria-label="Synthetic navigation">
		<SharedProfile work={props.work} prefix="navigation" />
		<ul>
			@for (const item of data.items; key item.id) {
				<li>
					<a href={'#item-' + item.id} data-proof={'nav/' + item.id}>{item.title as string}</a>
				</li>
			}
		</ul>
	</nav>
}

function Tile(props: Props & { item: Item }) @{
	const prefix = 'tile/' + props.item.id;
	<article data-tile={props.item.id}>
		<ItemHeading item={props.item} prefix={prefix} />
		<ItemBody item={props.item} prefix={prefix} />
		<SharedProfile work={props.work} prefix={prefix} />
		<ContextLabels prefix={prefix} />
	</article>
}

function Tiles(props: Props) @{
	const data = use(props.work.load('tiles'));
	<section data-content="workspace">
		@for (const item of data.items; key item.id) {
			<Tile work={props.work} item={item} />
		}
	</section>
}

function Summary(props: Props) @{
	const data = use(props.work.load('summary'));
	<aside>
		<p data-proof="summary">{data.label as string}</p>
	</aside>
}

function Workspace(props: Props) @{
	props.work.stats.bootstrapPasses++;
	const profile = use(props.work.load('profile'));
	const preferences = use(props.work.load('preferences'));
	const catalog = use(props.work.load('catalog'));
	// This key really depends on a response; it cannot be prefetched as an
	// independent bootstrap fetch without changing the workload.
	const access = use(props.work.load('access:' + profile.next));
	<Providers profile={profile} preferences={preferences} collection={catalog}>
		<div class="workspace">
			<p data-proof="access">{access.label as string}</p>
			@try {
				<Navigation work={props.work} />
			} @pending {
				<p class="pending">Navigation pending</p>
			}
			@try {
				<Tiles work={props.work} />
			} @pending {
				<p class="pending">Tiles pending</p>
			}
			@try {
				<Summary work={props.work} />
			} @pending {
				<p class="pending">Summary pending</p>
			}
		</div>
	</Providers>
}

function Author(props: Props & { item: Item }) @{
	const data = use(props.work.load('author:' + props.item.author));
	<span data-proof={'row/' + props.item.id + '/author'}>{data.label as string}</span>
}

function HistoryRow(props: Props & { item: Item }) @{
	const prefix = 'row/' + props.item.id;
	<article data-row={props.item.id}>
		<ItemHeading item={props.item} prefix={prefix} />
		<ItemBody item={props.item} prefix={prefix} />
		<SharedProfile work={props.work} prefix={prefix} />
		<ContextLabels prefix={prefix} />
		@try {
			<Author work={props.work} item={props.item} />
		} @pending {
			<span class="pending">Author pending</span>
		}
	</article>
}

function HistoryRows(props: Props & { record: Payload }) @{
	const data = use(props.work.load('history:' + props.record.next));
	<section data-content="history">
		@for (const item of data.items; key item.id) {
			<HistoryRow work={props.work} item={item} />
		}
	</section>
}

function Related(props: Props) @{
	const data = use(props.work.load('related'));
	<aside>
		<ul>
			@for (const item of data.items; key item.id) {
				<li data-proof={'related/' + item.id}>{item.title as string}</li>
			}
		</ul>
	</aside>
}

function History(props: Props) @{
	props.work.stats.bootstrapPasses++;
	const profile = use(props.work.load('profile'));
	const preferences = use(props.work.load('preferences'));
	const record = use(props.work.load('record'));
	<Providers profile={profile} preferences={preferences} collection={record}>
		<div class="history">
			<p data-proof="record">{record.label as string}</p>
			@try {
				<HistoryRows work={props.work} record={record} />
			} @pending {
				<p class="pending">History pending</p>
			}
			@try {
				<Related work={props.work} />
			} @pending {
				<p class="pending">Related pending</p>
			}
		</div>
	</Providers>
}

export function Page(props: Props) @{
	<main>
		<header>
			<h1 data-shell="app">Synthetic workspace</h1>
		</header>
		@if (props.work.streamShell) {
			@try {
				<Content work={props.work} />
			} @pending {
				<p class="pending">Workspace pending</p>
			}
		} @else {
			<Content work={props.work} />
		}
	</main>
}

function Content(props: Props) @{
	@if (props.work.scenario === 'workspace') {
		<Workspace work={props.work} />
	} @else {
		<History work={props.work} />
	}
}
