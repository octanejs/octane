import { history$, selectedHistory$ } from './State.tsrx';
import { recordEvaluation } from './evaluation.ts';

recordEvaluation('history');

export function History() @{
	<section aria-label="Recent conversations" data-region="history">
		<h2>Recent conversations</h2>
		@try {
			const frame = history$.get();
			<ul data-history data-revision={frame.revision} data-total={frame.total}>
				@for (const conversation of frame.rows; key conversation.id) {
					<li data-conversation={conversation.id}>
						<p data-title>{conversation.title as string}</p>
						<p data-preview>{conversation.preview as string}</p>
						<button type="button" onClick={() => selectedHistory$.set(conversation.id)}>
							Select conversation
						</button>
					</li>
				}
			</ul>
		} @pending {
			<p role="status" data-history-pending>Loading recent conversations…</p>
		} @catch (error) {
			<p role="alert" data-history-error>Recent conversations unavailable.</p>
		}
		<output data-selected-history>{selectedHistory$}</output>
	</section>
}
