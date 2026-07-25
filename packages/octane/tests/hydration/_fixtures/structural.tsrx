// P3 structural-mismatch fixtures: branches whose ROOT TAG differs, so a server/client
// branch swap is a true structural divergence the hydration recovery detects + rebuilds.
import { Suspense, useState } from 'octane';

export function Pick(props) @{
	<div id="pick">
		@switch (props.k) {
			@case 'a': {
				<em class="a">{'AAA' as string}</em>
			}
			@case 'b': {
				<strong class="b">{'BBB' as string}</strong>
			}
			@default: {
				<span class="d">{'???' as string}</span>
			}
		}
	</div>
}

function RecoveryButton(props: { id: string; label: string }) @{
	const [count, setCount] = useState(0);
	<button id={props.id} onClick={() => setCount(count + 1)}>{props.label + ':' + count}</button>
}

// RDX-HYD-006: a mismatch at the root has no narrower ownership scope. Recovery
// must leave one clean client tree and install handlers on the replacement.
export function RootScopedRecovery(props: { isClient: boolean }) @{
	@if (props.isClient) {
		<article id="root-client">
			<RecoveryButton id="root-recovered-action" label="root" />
		</article>
	} @else {
		<section id="root-server">
			<span id="root-stale">{'server root'}</span>
		</section>
	}
}

// RDX-HYD-006: the divergent range is nested beneath a stable host. The host and
// its outside siblings must stay adopted while only the failed range is rebuilt.
export function HostScopedRecovery(props: { isClient: boolean }) @{
	<main id="host-recovery-root">
		<header id="host-stable-header">{'header'}</header>
		<section id="host-recovery-scope">
			@if (props.isClient) {
				<article id="host-client-range">
					<RecoveryButton id="host-recovered-action" label="inside" />
				</article>
			} @else {
				<aside id="host-server-range">
					<span id="host-stale">{'server range'}</span>
				</aside>
			}
		</section>
		<footer id="host-stable-footer">
			<RecoveryButton id="host-outside-action" label="outside" />
		</footer>
	</main>
}

// RDX-HYD-006: the failed range is owned inside Suspense. Recovery must not
// remount siblings outside the boundary, and the regenerated handler must work.
export function SuspenseScopedRecovery(props: { isClient: boolean }) @{
	<main id="suspense-recovery-root">
		<header id="suspense-stable-header">
			<RecoveryButton id="suspense-outside-action" label="outside" />
		</header>
		<Suspense fallback={<p id="suspense-recovery-fallback">{'loading'}</p>}>
			@if (props.isClient) {
				<section id="suspense-client-range">
					<RecoveryButton id="suspense-recovered-action" label="inside" />
				</section>
			} @else {
				<article id="suspense-server-range">
					<span id="suspense-stale">{'server boundary'}</span>
				</article>
			}
		</Suspense>
		<footer id="suspense-stable-footer">{'footer'}</footer>
	</main>
}
