import { use, useMemo } from 'octane';
import type { CardSlot, Workload } from './data';

type Props = { work: Workload };

function Value(props: { promise: Promise<string>; id: number }) @{
	const label = use(props.promise);
	<article data-item={props.id}>{label as string}</article>
}

function Cards(props: { cards: CardSlot[]; eachBoundary: boolean }) @{
	<section>
		@for (const card of props.cards; key card.id) {
			@if (props.eachBoundary) {
				<div class="slot">
					@try {
						<Value promise={card.promise} id={card.id} />
					} @pending {
						<p class="pending">Loading</p>
					}
				</div>
			} @else {
				<Value promise={card.promise} id={card.id} />
			}
		}
	</section>
}

export function LocalParent(props: Props) @{
	props.work.stats.parentPasses++;
	const cards = props.work.makeCards();
	<Cards cards={cards} eachBoundary={props.work.eachBoundary} />
}

export function InlineParent(props: Props) @{
	props.work.stats.parentPasses++;
	<Cards cards={props.work.makeCards()} eachBoundary={props.work.eachBoundary} />
}

// Deliberate negative control: ordinary server hooks are scoped to a component
// invocation, unlike the compiler's cross-suspense-pass creation cache.
export function MemoParent(props: Props) @{
	props.work.stats.parentPasses++;
	const cards = useMemo(() => props.work.makeCards(), [props.work]);
	<Cards cards={cards} eachBoundary={props.work.eachBoundary} />
}

export function PreparedParent(props: Props) @{
	props.work.stats.parentPasses++;
	<Cards cards={props.work.cards} eachBoundary={props.work.eachBoundary} />
}

function UseSiteCard(props: { work: Workload; id: number }) @{
	const label = use(props.work.load(props.id));
	<article data-item={props.id}>{label as string}</article>
}

export function UseSiteParent(props: Props) @{
	props.work.stats.parentPasses++;
	<section>
		@for (const id of props.work.indices; key id) {
			@if (props.work.eachBoundary) {
				<div class="slot">
					@try {
						<UseSiteCard work={props.work} id={id} />
					} @pending {
						<p class="pending">Loading</p>
					}
				</div>
			} @else {
				<UseSiteCard work={props.work} id={id} />
			}
		}
	</section>
}

export function Serial(props: Props) @{
	props.work.stats.parentPasses++;
	const labels = use(props.work.serial());
	<section>
		@for (const label of labels; key label) {
			<article>{label as string}</article>
		}
	</section>
}

export function Parallel(props: Props) @{
	props.work.stats.parentPasses++;
	const labels = use(props.work.parallel());
	<section>
		@for (const label of labels; key label) {
			<article>{label as string}</article>
		}
	</section>
}

export function IndependentUses(props: Props) @{
	props.work.stats.parentPasses++;
	const a = use(props.work.load(0));
	const b = use(props.work.load(1));
	const c = use(props.work.load(2));
	<section>
		<article>{a as string}</article>
		<article>{b as string}</article>
		<article>{c as string}</article>
	</section>
}

// Each key is intentionally derived from the preceding response. This is a
// real dependency and must retain three data rounds after compilation.
export function DependentUses(props: Props) @{
	props.work.stats.parentPasses++;
	const a = use(props.work.load(0));
	const b = use(props.work.load(Number(a.slice(a.lastIndexOf(':') + 1)) + 1));
	const c = use(props.work.load(Number(b.slice(b.lastIndexOf(':') + 1)) + 1));
	<section>
		<article>{a as string}</article>
		<article>{b as string}</article>
		<article>{c as string}</article>
	</section>
}

// Identical outer document for every case. With a boundary, data work delays
// the resolved content and stream end; without it, the same work blocks TTFB.
export function Page(props: Props) @{
	<main>
		<h1>Fetch patterns</h1>
		@if (props.work.shell) {
			@try {
				<Content work={props.work} />
			} @pending {
				<p class="pending">Loading</p>
			}
		} @else {
			<Content work={props.work} />
		}
	</main>
}

function Content(props: Props) @{
	@switch (props.work.pattern) {
		@case 'local': {
			<LocalParent work={props.work} />
		}
		@case 'inline': {
			<InlineParent work={props.work} />
		}
		@case 'memo': {
			<MemoParent work={props.work} />
		}
		@case 'prepared': {
			<PreparedParent work={props.work} />
		}
		@case 'use-site': {
			<UseSiteParent work={props.work} />
		}
		@case 'serial': {
			<Serial work={props.work} />
		}
		@case 'parallel': {
			<Parallel work={props.work} />
		}
		@case 'independent': {
			<IndependentUses work={props.work} />
		}
		@default: {
			<DependentUses work={props.work} />
		}
	}
}
