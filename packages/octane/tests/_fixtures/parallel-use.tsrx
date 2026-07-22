import { use } from 'octane';
import {
	useImportedCaptured,
	useImportedDependent,
	useImportedPair,
} from './parallel-use-custom-hook.ts';

// Fixtures for the parallel-use pipeline (docs/suspense-parallel-use-plan.md).
// These exercise the compiler's unconditional memoize/hoist/batch transforms
// and fetch-tree warming.

// 3-level nested async chain — the benchmark shape (benchmarks/async-waterfall):
// each level fetches its own independent data and renders the next level as
// its child. The level 0 batch warm-walks the whole chain
// (`ChainLevel.__warm` recursion), so every level's fetch starts in the FIRST
// attempt instead of one level per suspension round.
export function ChainLevel(props) @{
	const data = use(props.fetch(props.level, props.version));
	<div class="lvl">
		<span class="val">{data as string}</span>
		@if (props.level < props.max - 1) {
			<ChainLevel
				level={props.level + 1}
				version={props.version}
				max={props.max}
				fetch={props.fetch}
			/>
		}
	</div>
}

export function ChainHost(props) @{
	<>
		@try {
			<ChainLevel level={0} version={props.version} max={props.max} fetch={props.fetch} />
		} @pending {
			<div class="fallback">{'chain-loading'}</div>
		}
	</>
}

// A TRUE data dependency: fetchB needs a's value, so it cannot be hoisted or
// warmed — the second stratum starts only after the first resolves.
export function DependentChain(props) @{
	<>
		@try {
			const a = use(props.fetchA());
			const b = use(props.fetchB(a));
			<div class="dep">{a + '/' + b as string}</div>
		} @pending {
			<div class="fallback">{'dep-loading'}</div>
		}
	</>
}

// Batched rejection routing: the batch wakes on the first rejection; the
// replay unwraps in textual order, so the winning reason reaches @catch.
export function BatchCatch(props) @{
	<>
		@try {
			const a = use(props.a);
			const b = use(props.b);
			<div class="ok">{a + '/' + b as string}</div>
		} @pending {
			<div class="fallback">{'w'}</div>
		} @catch (err) {
			<div class="err">{'caught:' + err.message}</div>
		}
	</>
}

export function ElseIfDirectUse({
	load,
	mode,
}: {
	load: (key: string) => Promise<string>;
	mode: string;
}) @{
	if (mode === 'a') {
		use(load('a'));
	} else if (mode === 'b') {
		use(load('b'));
	}
	<p class="else-if-use">{'mode=' + mode}</p>
}

export function BracelessDirectUse({
	active,
	load,
}: {
	active: boolean;
	load: (key: string) => Promise<string>;
}) @{
	if (active) use(load('braceless'));
	<p class="braceless-use">{'active=' + active}</p>
}

export function NestedIfDirectUse({
	inner,
	load,
	outer,
}: {
	inner: boolean;
	load: (key: string) => Promise<string>;
	outer: boolean;
}) @{
	if (outer)
		if (inner) use(load('nested'));
	<p class="nested-if-use">{'active=' + (outer && inner)}</p>
}

export function ConditionalDirectUseWarmHost({
	gate,
	load,
	mode,
}: {
	gate: Promise<string>;
	load: (key: string) => Promise<string>;
	mode: string;
}) @{
	<>
		@try {
			use(gate);
			<ElseIfDirectUse load={load} mode={mode} />
		} @pending {
			<p class="conditional-warm-fallback">loading</p>
		}
	</>
}

// Warm exclusion: the leaf's `id` prop reads the suspended value `a`, so the
// compiler must NOT prefetch it — its fetch correctly starts on resume.
export function GatedLeaf(props) @{
	const v = use(props.fetch(props.id));
	<span class="leaf">{v as string}</span>
}

export function GatedHost(props) @{
	<>
		@try {
			const a = use(props.fetchA());
			<GatedLeaf id={a.id} fetch={props.fetchLeaf} />
		} @pending {
			<div class="fallback">{'g'}</div>
		}
	</>
}

export function ImportedHookHost(props) @{
	<>
		@try {
			const pair = useImportedPair(props.load, props.version);
			<div class="imported-pair">
				<span class="project">{pair.project as string}</span>
				<span class="viewer">{pair.viewer as string}</span>
			</div>
		} @pending {
			<div class="fallback">{'pair-loading'}</div>
		}
	</>
}

export function ImportedHookTwiceHost(props) @{
	<>
		@try {
			const left = useImportedPair(props.load, props.version);
			const right = useImportedPair(props.load, props.version);
			<div class="imported-pair-twice">{left.project + '|' + left.viewer + '|' + right.project +
				'|' +
				right.viewer as string}</div>
		} @pending {
			<div class="fallback">{'pairs-loading'}</div>
		}
	</>
}

export function ImportedDependentHookHost(props) @{
	<>
		@try {
			const result = useImportedDependent(props.loadProject, props.loadOwner);
			<div class="imported-dependent">{result.project.ownerId + '/' + result.owner as string}</div>
		} @pending {
			<div class="fallback">{'dependent-loading'}</div>
		}
	</>
}

export function ImportedCapturedHookHost(props) @{
	<>
		@try {
			const captured = useImportedCaptured(props.load, props.version);
			<div class="imported-captured">{captured as string}</div>
		} @pending {
			<div class="fallback">{'captured-loading'}</div>
		}
	</>
}

function AlternatePanel(props) @{
	const value = use(props.load('alternate', props.version));
	<span class="alternate-panel">{value as string}</span>
}

function FinalPanel(props) @{
	const value = use(props.load('final', props.version));
	<span class="final-panel">{value as string}</span>
}

function EarlyReturnPanels(props) @{
	if (props.alternate) return <AlternatePanel load={props.load} version={props.version} />;
	<FinalPanel load={props.load} version={props.version} />
}

export function EarlyReturnPanelsHost(props) @{
	<>
		@try {
			<EarlyReturnPanels load={props.load} version={props.version} alternate={props.alternate} />
		} @pending {
			<div class="fallback">{'early-loading'}</div>
		}
	</>
}

function ActivitySummary(props) @{
	const summary = use(props.load('activity-summary', props.version));
	<span class="activity-summary">{summary as string}</span>
}

function ActivityPanel(props) @{
	const activity = use(props.load('activity', props.version));
	<section class="activity">
		<span class="activity-value">{activity as string}</span>
		<ActivitySummary load={props.load} version={props.version} />
	</section>
}

function InsightsChart(props) @{
	const chart = use(props.load('insights-chart', props.version));
	<span class="insights-chart">{chart as string}</span>
}

function InsightsPanel(props) @{
	const insights = use(props.load('insights', props.version));
	<section class="insights">
		<span class="insights-value">{insights as string}</span>
		<InsightsChart load={props.load} version={props.version} />
	</section>
}

// The parent itself has no data read. Its distinct adjacent panels and their
// nested children are nevertheless one independent fetch tree.
function AdjacentPanels(props) @{
	<main>
		<ActivityPanel load={props.load} version={props.version} />
		<InsightsPanel load={props.load} version={props.version} />
	</main>
}

function VersionedPanel(props) @{
	const value = use(props.load(props.resource, props.version));
	<span class={props.resource}>{value as string}</span>
}

function VersionedSiblings(props) @{
	<main>
		<VersionedPanel resource="stable" load={props.load} version={props.stableVersion} />
		<VersionedPanel resource="changing" load={props.load} version={props.changingVersion} />
	</main>
}

export function VersionedSiblingsHost(props) @{
	<>
		@try {
			<VersionedSiblings
				load={props.load}
				stableVersion={props.stableVersion}
				changingVersion={props.changingVersion}
			/>
		} @pending {
			<div class="fallback">{'siblings-loading'}</div>
		}
	</>
}

function RepeatedPanel(props) @{
	const value = use(props.load('repeated', props.version));
	<span class="repeated-panel">{value as string}</span>
}

function RepeatedPanels(props) @{
	<main>
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
	</main>
}

// Keep this as a large authored sibling set: every concrete occurrence shares
// the same component and data dependencies but still owns its returned value.
function ManyRepeatedPanels(props) @{
	<main>
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
		<RepeatedPanel load={props.load} version={props.version} />
	</main>
}

export function RepeatedPanelsHost(props) @{
	<>
		@try {
			<RepeatedPanels load={props.load} version={props.version} />
		} @pending {
			<div class="fallback">{'repeated-loading'}</div>
		}
	</>
}

export function ManyRepeatedPanelsHost(props) @{
	<>
		@try {
			<ManyRepeatedPanels load={props.load} version={props.version} />
		} @pending {
			<div class="fallback">{'many-repeated-loading'}</div>
		}
	</>
}

export function AdjacentPanelsHost(props) @{
	<>
		@try {
			@if (props.show !== false) {
				<AdjacentPanels load={props.load} version={props.version} />
			}
		} @pending {
			<div class="fallback">{'panels-loading'}</div>
		}
	</>
}
