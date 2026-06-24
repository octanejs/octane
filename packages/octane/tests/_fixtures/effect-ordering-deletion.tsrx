import { useLayoutEffect, useEffect } from 'octane-ts';

// ─────────────────────────────────────────────────────────────────────────────
// Parent → Child → Grandchild tree. Each level registers a useLayoutEffect
// AND a useEffect whose setup logs "mount <phase> <name>" and whose cleanup
// logs "cleanup <phase> <name>". The log callback is threaded down via props
// so a test can assert the exact mount + cleanup ordering across the tree.
//
// React contract (ReactEffectOrdering-test.js):
//   - MOUNT setups fire CHILD-first  (deepest grandchild → child → parent).
//   - DELETION cleanups fire PARENT-first (parent → child → grandchild),
//     i.e. the REVERSE of mount.
// ─────────────────────────────────────────────────────────────────────────────

// Layout-only tree (ReactEffectOrdering-test.js:37).
function LayoutGrandchild(props) @{
	useLayoutEffect(() => {
		props.log('mount layout Grandchild');
		return () => props.log('cleanup layout Grandchild');
	}, []);
	<span id="lg" data-k="lg">{'gc'}</span>
}

function LayoutChild(props) @{
	useLayoutEffect(() => {
		props.log('mount layout Child');
		return () => props.log('cleanup layout Child');
	}, []);
	<div id="lc" data-k="lc">
		<LayoutGrandchild log={props.log} />
	</div>
}

export function LayoutParent(props) @{
	useLayoutEffect(() => {
		props.log('mount layout Parent');
		return () => props.log('cleanup layout Parent');
	}, []);
	<div id="lp" data-k="lp">
		<LayoutChild log={props.log} />
	</div>
}

// Passive (useEffect) tree (ReactEffectOrdering-test.js:64).
function PassiveGrandchild(props) @{
	useEffect(() => {
		props.log('mount passive Grandchild');
		return () => props.log('cleanup passive Grandchild');
	}, []);
	<span id="pg" data-k="pg">{'gc'}</span>
}

function PassiveChild(props) @{
	useEffect(() => {
		props.log('mount passive Child');
		return () => props.log('cleanup passive Child');
	}, []);
	<div id="pc" data-k="pc">
		<PassiveGrandchild log={props.log} />
	</div>
}

export function PassiveParent(props) @{
	useEffect(() => {
		props.log('mount passive Parent');
		return () => props.log('cleanup passive Parent');
	}, []);
	<div id="pp" data-k="pp">
		<PassiveChild log={props.log} />
	</div>
}

// Toggle host: deletes the whole layout tree via an `@if` going false, an
// alternative deletion path to r.unmount() (a reconciler-driven removal
// rather than a root teardown). props.show drives the branch.
export function LayoutToggleHost(props) @{
	<div id="host">
		@if (props.show) {
			<LayoutParent log={props.log} />
		}
	</div>
}
