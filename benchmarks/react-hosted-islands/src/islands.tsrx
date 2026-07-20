import { bindRendererRegionOwner, use } from 'octane';
import { BenchTheme } from './host-context.js';

/**
 * Root envelope for one hosted island — the same shape the Phase 0 test spike
 * uses (packages/octane/tests/react-hosted): bind the owner bridge first, then
 * render the transported child component.
 */
export function IslandEnvelope(props) @{
	bindRendererRegionOwner(props);
	<{props.body} {...props.bodyProps} />
}

/** An island with NO event bindings — the zero-cost ready-path case (§11). */
export function EmptyIsland(props) @{
	<section class="empty-island">
		<span class="idx">{'island ' + props.index}</span>
	</section>
}

/** An island with one delegated click binding. */
export function ClickIsland(props) @{
	<section class="click-island">
		<button class="go" onClick={() => props.onPing(props.index)}>{'go ' + props.index}</button>
	</section>
}

/** Reads a REAL React context through the transparent Phase 2 path. */
export function ContextIsland() @{
	const theme = use(BenchTheme);
	<p class="ctx-island">{'theme:' + theme}</p>
}
