import { use } from 'octane';

// Fixtures for the parallel-use pipeline (docs/suspense-parallel-use-plan.md).
// The test suite compiles with `parallelUse: true` (see vitest.config.js), so
// these exercise the memoize/hoist/batch transforms and fetch-tree warming.

// 3-level nested async chain — the benchmark shape (benchmarks/async-waterfall):
// each level fetches its own independent data and renders the next level as
// its child. Under parallelUse, level 0's batch warm-walks the whole chain
// (`ChainLevel.__warm` recursion), so every level's fetch starts in the FIRST
// attempt instead of one level per suspension round.
export function ChainLevel(props) @{
	const data = use(props.fetch(props.level, props.version));
	<div class="lvl">
		<span class="val">
			{data as string}
		</span>
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
			<div class="dep">
				{a + '/' + b as string}
			</div>
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
			<div class="ok">
				{a + '/' + b as string}
			</div>
		} @pending {
			<div class="fallback">{'w'}</div>
		} @catch (err) {
			<div class="err">
				{'caught:' + err.message}
			</div>
		}
	</>
}

// Warm exclusion: the leaf's `id` prop reads the suspended value `a`, so the
// compiler must NOT prefetch it — its fetch correctly starts on resume.
export function GatedLeaf(props) @{
	const v = use(props.fetch(props.id));
	<span class="leaf">
		{v as string}
	</span>
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
