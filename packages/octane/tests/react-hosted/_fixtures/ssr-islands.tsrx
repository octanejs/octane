import { use, useId, useLayoutEffect, useRef, useState } from 'octane';

/**
 * Phase 4 islands, compiled BOTH ways: the client project imports this module
 * normally; the SSR tests run it through `loadServerFixture` (which forbids
 * sibling imports — so React contexts and fetch factories arrive via props).
 */

export function SsrGreeting(props) @{
	const [count, setCount] = useState(0);
	<section class="ssr-island">
		<h3 class="ssr-title">
			{'island ' + props.name}
		</h3>
		<button class="ssr-count" onClick={() => setCount(count + 1)}>
			{'clicks:' + count}
		</button>
	</section>
}

export function SsrIdIsland() @{
	const id = useId();
	<p class="ssr-id" data-oid={id}>{'id island'}</p>
}

/** Reads a REAL React context object handed through props (§6.4 on the server). */
export function SsrThemed(props) @{
	const theme = use(props.themeContext);
	<p class="ssr-theme">
		{'theme:' + theme as string}
	</p>
}

export function SsrAsync(props) @{
	props.log?.('render:async');
	const value = use(props.resource);
	<p class="ssr-async">
		{'value:' + value as string}
	</p>
}

/** Two sequential strata: the second fetch exists only once the first resolved. */
export function SsrChained(props) @{
	props.log?.('render:chained');
	const first = use(props.first);
	const second = use(props.makeSecond(first));
	<p class="ssr-chained">
		{first as string + '+' + second as string}
	</p>
}

/** Two INDEPENDENT fetch creations — the parallel-use stratum shape. */
export function SsrParallel(props) @{
	props.log?.('render:parallel');
	const first = use(props.fetchA());
	const second = use(props.fetchB());
	<p class="ssr-parallel">
		{first as string + '+' + second as string}
	</p>
}

export function SsrRejecting(props) @{
	const value = use(props.resource);
	<p class="ssr-rejecting">
		{'value:' + value as string}
	</p>
}

/** A local @try: its @pending arm ships in the shell; the client completes it. */
export function SsrLocallyGuarded(props) @{
	<div class="ssr-guarded">
		@try {
			<SsrInner resource={props.resource} />
		} @pending {
			<p class="ssr-local-pending">{'local pending'}</p>
		} @catch (error) {
			<p class="ssr-local-caught">
				{'caught:' + (error as Error).message}
			</p>
		}
	</div>
}

function SsrInner(props) @{
	const value = use(props.resource);
	<p class="ssr-inner">
		{'value:' + value as string}
	</p>
}

/** Stamps its DOM from a layout effect — observable only if island layout
 *  effects complete inside the React layout commit that attached the island. */
export function SsrLayout() @{
	const ref = useRef(null);
	useLayoutEffect(() => {
		ref.current?.setAttribute('data-laid-out', 'yes');
	});
	<p class="ssr-layout" ref={ref}>{'layout'}</p>
}

/** Scoped style — exercises the §9.2 style-resource channel. */
export function SsrStyled(props) @{
	<p class="ssr-styled">
		{'styled ' + props.name}
		<style>
			.ssr-styled {
				color: rgb(1, 2, 3);
			}
		</style>
	</p>
}
