import { use } from 'octane';
import { ROWS, step } from './waterfall-data';

// SSR waterfall fixture — D sequentially-dependent use(thenable) Suspense
// boundaries under a ~1000-node page. Each @try level calls use() on a thenable
// derived from the PREVIOUS level's resolved value, so the server render loop
// (runtime.server.ts render(): suspend -> await -> full re-render, capped by
// MAX_SUSPENSE_PASSES) needs exactly depth+1 passes, re-serializing the whole
// bulk list every pass. The harness times renderWaterfall(depth) for
// depth 1 / 2 / 4 — the slope across depths IS the per-pass full-tree cost.
//
// The @pending arms render a greppable 'WATERFALL-PENDING' marker; the harness
// gate asserts the FINAL body carries none of them (every level resolved) and
// contains the analytically expected final chain value.

export function Chain(props: { level: number; depth: number; prev: number }) @{
	<section class="level">
		@try {
			const value = use(step(props.level, props.prev));
			<div class="resolved">
				<span class="value">{'level ' + props.level + ' = ' + value}</span>
				@if (props.level < props.depth) {
					<Chain level={props.level + 1} depth={props.depth} prev={value} />
				}
			</div>
		} @pending {
			<p class="waiting">{'WATERFALL-PENDING level ' + props.level}</p>
		}
	</section>
}

export function WaterfallApp(props: { depth: number }) @{
	<div class="page">
		<h1 class="head">{'SSR waterfall - depth ' + props.depth}</h1>
		<ul class="bulk">
			@for (const r of ROWS; key r.id) {
				<li class="row">
					<span class="rid">{'#' + r.id}</span>
					<span class="label">
						{r.label as string}
					</span>
					<em class="score">{'score ' + r.score}</em>
				</li>
			}
		</ul>
		<Chain level={1} depth={props.depth} prev={1} />
	</div>
}
