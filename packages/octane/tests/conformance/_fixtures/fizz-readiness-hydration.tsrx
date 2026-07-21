import { lazy, use } from 'octane';

function StreamValue(props) @{
	const value = use(props.promise);
	<strong id={props.id}>{value as string}</strong>
}

export function InstrumentedThenableBoundary(props) @{
	<section id="instrumented-boundary">
		@try {
			<StreamValue id="instrumented-value" promise={props.promise} />
		} @pending {
			<i id="instrumented-fallback">{'loading'}</i>
		}
	</section>
}

export function ContentAndFallbackSuspend(props) @{
	<section id="double-suspending-boundary">
		@try {
			<StreamValue id="content-value" promise={props.contentPromise} />
		} @pending {
			<StreamValue id="fallback-value" promise={props.fallbackPromise} />
		}
	</section>
}

function AbandonedFallbackStyle() @{
	<>
		<span id="abandoned-late-fallback">{'late fallback'}</span>
		<style>
			.abandoned-late-fallback {
				color: rgb(123, 45, 67);
			}
		</style>
	</>
}

export function ContentAndNestedFallbackSuspend(props) @{
	<section id="nested-fallback-boundary">
		@try {
			<StreamValue id="nested-content-value" promise={props.contentPromise} />
		} @pending {
			<div id="abandoned-outer-fallback">
				@if (props.includeLateFallback) {
					<AbandonedFallbackStyle />
				}
				@try {
					<StreamValue id="abandoned-fallback-value" promise={props.fallbackPromise} />
				} @pending {
					<i id="abandoned-nested-fallback">{'still loading'}</i>
				}
			</div>
		}
	</section>
}

export function HydrationLeaf(props) @{
	<>
		<p id="hydration-leaf">{'A'}</p>
		<h2 id="hydration-text">{props.text as string}</h2>
	</>
}

let matchingModule;
let mismatchModule;

export function setMatchingHydrationModule(modulePromise) {
	matchingModule = modulePromise;
}

export function setMismatchHydrationModule(modulePromise) {
	mismatchModule = modulePromise;
}

const MatchingHydrationLeaf = lazy(() => matchingModule);
const MismatchHydrationLeaf = lazy(() => mismatchModule);

export function MatchingHydrationBoundary(props) @{
	<div id="matching-hydration-boundary">
		@try {
			@if (props.client) {
				<MatchingHydrationLeaf text={props.text} />
			} @else {
				const value = use(props.serverPromise);
				<HydrationLeaf text={props.text + value.slice(0, 0)} />
			}
		} @pending {
			<h1 class="hydration-fallback">{'Loading…'}</h1>
		}
	</div>
}

export function MismatchHydrationBoundary(props) @{
	<div id="mismatch-hydration-boundary">
		@try {
			@if (props.client) {
				<MismatchHydrationLeaf text={props.text} />
			} @else {
				const value = use(props.serverPromise);
				<HydrationLeaf text={props.text + value.slice(0, 0)} />
			}
		} @pending {
			<h1 class="hydration-fallback">{'Loading…'}</h1>
		}
	</div>
}

export function MultipleMismatchBoundary(props) @{
	<div id="multiple-mismatch-boundary">
		@try {
			<>
				<h2 class="mismatch-a">{props.text as string}</h2>
				<h2 class="mismatch-b">{props.text as string}</h2>
				<h2 class="mismatch-c">{props.text as string}</h2>
			</>
		} @pending {
			<h1>{'Loading…'}</h1>
		}
	</div>
}
