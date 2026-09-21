import 'octane/signals';
import { useLayoutEffect } from 'octane';
import { recordActivation } from './measurements.ts';
import { history$ } from './State.tsrx';

export function History() @{
	useLayoutEffect(() => recordActivation('history'), []);
	<section class="history" aria-label="Recent conversations">
		<header class="panel-header">
			<h2>Recent chats</h2>
			<button type="button">Activate history</button>
		</header>
		@try {
			const frame = history$.get();
			<ul data-history data-revision={frame.revision} data-total={frame.total}>
				@for (const row of frame.rows; key row.id) {
					<li>
						<span aria-hidden="true">◌</span>
						<div>
							<strong>{row.title as string}</strong>
							<p>{row.preview as string}</p>
						</div>
					</li>
				}
			</ul>
		} @pending {
			<p class="placeholder" role="status">Loading recent chats…</p>
		} @catch {
			<p role="alert">History failed</p>
		}
		<p class="panel-note">An independent stream. A slow history does not hold the answer.</p>
	</section>
}
