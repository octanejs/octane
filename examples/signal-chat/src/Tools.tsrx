import 'octane/signals';
import { useLayoutEffect } from 'octane';
import { recordActivation } from './measurements.ts';
import { tools$ } from './State.tsrx';

export function Tools() @{
	useLayoutEffect(() => recordActivation('tools'), []);
	<section class="tools" aria-label="Tool activity">
		<header class="panel-header">
			<h2>Tool activity</h2>
			<button type="button">Activate tools</button>
		</header>
		@try {
			const frame = tools$.get();
			<ol data-tools data-revision={frame.revision} data-total={frame.total}>
				@for (const step of frame.steps; key step.id) {
					<li data-status={step.status}>
						<span class="step-dot" />
						<div>
							<strong>{step.label as string}</strong>
							<small>{step.status as string}</small>
						</div>
					</li>
				}
			</ol>
		} @pending {
			<p class="placeholder" role="status">Preparing tools…</p>
		} @catch {
			<p role="alert">Tools failed</p>
		}
	</section>
}
