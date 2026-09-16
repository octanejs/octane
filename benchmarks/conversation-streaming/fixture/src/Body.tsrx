import { body$, selectedTurn$ } from './State.tsrx';
import { recordEvaluation } from './evaluation.ts';

recordEvaluation('body');

export function Body() @{
	<section aria-label="Conversation" data-region="body">
		<h2>Conversation</h2>
		@try {
			const frame = body$.get();
			<ol data-body data-revision={frame.revision} data-total={frame.total}>
				@for (const turn of frame.rows; key turn.id) {
					<li data-turn={turn.id}>
						<p data-prompt>{turn.prompt as string}</p>
						<p data-answer>{turn.answer as string}</p>
						<button type="button" onClick={() => selectedTurn$.set(turn.id)}>Select turn</button>
					</li>
				}
			</ol>
		} @pending {
			<p role="status" data-body-pending>Loading conversation…</p>
		} @catch (error) {
			<p role="alert" data-body-error>Conversation unavailable.</p>
		}
		<output data-selected-turn>{selectedTurn$}</output>
	</section>
}
