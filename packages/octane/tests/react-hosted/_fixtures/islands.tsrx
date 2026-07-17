import { bindRendererRegionOwner, memo, use, useId, useLayoutEffect, useState } from 'octane';
import { MirrorLocale, MirrorTheme } from './mirror-context.js';

/**
 * Root envelope for a React-hosted island: bind the React owner bridge to the
 * hosted root first, then render the transported child element. This is the
 * private compiled root envelope the plan's §5 describes — the child component
 * itself stays an unmodified compiled Octane component.
 */
export function HostedIslandEnvelope(props) @{
	bindRendererRegionOwner(props);
	<{props.body} {...props.bodyProps} />
}

function Counter(props) @{
	const [count, setCount] = useState(0);
	<button class="count" onClick={() => setCount(count + 1)}>
		{'count:' + count}
	</button>
}

export function GreetingIsland(props) @{
	useLayoutEffect(() => {
		props.log?.('island-layout:' + props.name);
		return () => {
			props.log?.('island-cleanup:' + props.name);
		};
	}, [props.name]);
	<section class="island">
		<h2 class="greeting">
			{'Hello ' + props.name}
		</h2>
		<Counter />
	</section>
}

export function BadgeIsland(props) @{
	<p class="badge">
		{'badge:' + props.label}
	</p>
}

/** Reads the mirror context with no local provider — every read must reach the owner bridge. */
export function ThemedIsland() @{
	const theme = use(MirrorTheme);
	<p class="themed">
		{'theme:' + theme}
	</p>
}

function ThemedLeafBody() @{
	const theme = use(MirrorTheme);
	<p class="memo-themed">
		{'memo-theme:' + theme}
	</p>
}

/**
 * memo() consumer with no props: only the mirror context's `$$version` bump can
 * invalidate it, which is exactly the publish step the plan's §6.2 step 9 pins.
 */
const MemoThemedLeaf = memo(ThemedLeafBody);

export function MemoThemedIsland() @{
	<div class="memo-shell">
		<MemoThemedLeaf />
	</div>
}

export function TwoContextIsland() @{
	const theme = use(MirrorTheme);
	const locale = use(MirrorLocale);
	<p class="two-ctx">
		{'theme:' + theme + ' locale:' + locale}
	</p>
}

/** Suspends at the hosted root with NO local boundary — must escape to React. */
export function SuspendingIsland(props) @{
	const value = use(props.resource);
	<p class="resolved">
		{'value:' + value as string}
	</p>
}

/** Discovers the mirror context AND suspends in the same initial attempt (§6.2 step 7 / OQ15). */
export function ThemedSuspendingIsland(props) @{
	const theme = use(MirrorTheme);
	const value = use(props.resource);
	<p class="themed-resolved">
		{theme + ':' + value as string}
	</p>
}

/** Two sequential dependencies: A settles, the retry suspends again on B. */
export function ChainedIsland(props) @{
	const first = use(props.first);
	const second = use(props.second);
	<p class="chained">
		{first as string + '+' + second as string}
	</p>
}

function InnerAwait(props) @{
	const value = use(props.resource);
	<p class="resolved">
		{'value:' + value as string}
	</p>
}

/** Local Octane boundary — the throw must be handled here, never reaching React. */
export function LocallyGuardedIsland(props) @{
	<div class="guarded">
		@try {
			<InnerAwait resource={props.resource} />
		} @pending {
			<p class="local-pending">{'local pending'}</p>
		} @catch (error) {
			<p class="local-caught">
				{'caught:' + (error as Error).message}
			</p>
		}
	</div>
}

export function ThrowingIsland(props) @{
	if (props.fail) throw new Error('island exploded');
	<p class="ok">{'ok'}</p>
}

/** Layout-effect cleanup throws — exercised during final React deletion. */
export function CleanupThrowIsland(props) @{
	useLayoutEffect(() => {
		return () => {
			throw new Error('island cleanup exploded');
		};
	}, []);
	<p class="cleanup-throw">{'armed'}</p>
}

/** React 19 passes `ref` through element props; the island treats it as an ordinary Octane ref prop. */
export function RefIsland(props) @{
	<section class="ref-island" ref={props.ref}>{'ref island'}</section>
}

/** Calls a React state setter from an Octane layout effect during the hosted synchronous flush. */
export function NotifyIsland(props) @{
	useLayoutEffect(() => {
		props.onReady('island-ready');
	}, []);
	<p class="notify">{'notify island'}</p>
}

/** Logs every BODY execution — observes the §10 unchanged-parent-rerender bail. */
export function RenderLogIsland(props) @{
	props.log('render:' + props.label);
	<p class="render-log">
		{'label:' + props.label}
	</p>
}

/** Exposes the island's Octane useId so identifier stability/distinctness is observable. */
export function UseIdIsland() @{
	const id = useId();
	<p class="use-id" data-oid={id}>{'id island'}</p>
}
