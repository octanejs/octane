import { body$, draft$, history$ } from '../../conversation-streaming/behavior-only/State.ts';
import { ConversationStatus } from './View.tsrx';
import { initial } from './initial.ts';

export function Shell() @{
	<main>
		<label for="draft">Draft</label>
		<textarea id="draft" value={draft$} />
		<button id="automatic-action" type="button">Count interaction</button>
		<div id="automatic-slot">
			<ConversationStatus {...initial} />
		</div>
		<section hidden aria-hidden="true">
			@try {
				const body = body$.get();
				<span data-body-authority>{body.revision as number}</span>
			} @pending {
				<span data-body-pending />
			}
			@try {
				const history = history$.get();
				<span data-history-authority>{history.revision as number}</span>
			} @pending {
				<span data-history-pending />
			}
		</section>
	</main>
}
