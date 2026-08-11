// React's experimental channel shipped Activity as `unstable_Activity` before
// 19.2 — the alias must compile and behave identically to Activity, mirroring
// the unstable_ViewTransition alias.
import { unstable_Activity } from 'octane';

export function UnstableActivityHost(props: { mode: string }) @{
	<section class="ua">
		<unstable_Activity mode={props.mode as 'visible' | 'hidden'}>
			<div id="ua-child">content</div>
		</unstable_Activity>
	</section>
}
