import { use } from 'octane';
import { ROWS } from './waterfall-data';
import { parStep, PAR_LATENCY_MS } from './parallel-data';

// SSR parallel-fetch fixture — K INDEPENDENT use(thenable) calls in ONE @try
// body, each resolving after a REAL ~PAR_LATENCY_MS timer. This is the shape
// the SSR parallel-use mirror targets: the compiler hoists the K creations and
// registers them in one batch, so the render suspends ONCE and awaits all K
// together — total wall time ≈ 1×latency + pass cost. Serial per-use()
// registration (the pre-mirror behavior) discovers
// one fetch per round: ≈ K×latency. The harness's analytic gate checks the
// summed value; the headline metric is p50 latency vs K (flat = parallel,
// linear = serial). Contrast with Waterfall.tsrx, whose levels are TRUE data
// dependencies and must stay sequential.

export function ParallelBody(props: { k: number }) @{
	<section class="par">
		@try {
			const v1 = use(parStep(1, props.k >= 1));
			const v2 = use(parStep(2, props.k >= 2));
			const v3 = use(parStep(3, props.k >= 3));
			const v4 = use(parStep(4, props.k >= 4));
			const v5 = use(parStep(5, props.k >= 5));
			const v6 = use(parStep(6, props.k >= 6));
			const v7 = use(parStep(7, props.k >= 7));
			const v8 = use(parStep(8, props.k >= 8));
			const sum = v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8;
			<div class="resolved">
				<span class="sum">
					{'sum = ' + sum}
				</span>
			</div>
		} @pending {
			<p class="waiting">PARALLEL-PENDING</p>
		}
	</section>
}

// Nested-INDEPENDENT variant: one ~4ms fetch per component level, each level
// a separate component whose props are warm-safe (level arithmetic only). The
// warm walk (Level's first suspending batch → Level.__warm recursion) starts
// every level's fetch in pass 1 — p50 ≈ 1×latency regardless of depth; without
// it each level costs its own round (≈ depth×latency).
export function NestedLevel(props: { level: number; depth: number }) @{
	const v = use(parStep(props.level, true));
	<div class="nlvl">
		<span class="nval">
			{'L' + props.level + '=' + v}
		</span>
		@if (props.level < props.depth) {
			<NestedLevel level={props.level + 1} depth={props.depth} />
		}
	</div>
}

export function NestedApp(props: { depth: number }) @{
	<div class="page">
		<h1 class="head">
			{'SSR nested parallel - depth ' + props.depth}
		</h1>
		@try {
			<NestedLevel level={1} depth={props.depth} />
		} @pending {
			<p class="waiting">NESTED-PENDING</p>
		}
	</div>
}

export function ParallelApp(props: { k: number }) @{
	<div class="page">
		<h1 class="head">
			{'SSR parallel - k ' + props.k + ' x ' + PAR_LATENCY_MS + 'ms'}
		</h1>
		<ul class="bulk">
			@for (const r of ROWS; key r.id) {
				<li class="row">
					<span class="rid">
						{'#' + r.id}
					</span>
					<span class="label">
						{r.label as string}
					</span>
				</li>
			}
		</ul>
		<ParallelBody k={props.k} />
	</div>
}
