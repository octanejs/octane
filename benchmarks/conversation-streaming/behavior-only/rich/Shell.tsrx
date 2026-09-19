import { body$, draft$, history$ } from '../State.ts';
import { RichConversation } from './RichConversation.tsrx';
import { initialRich } from './model.ts';

export function Shell() @{
	<main>
		<label for="draft">Draft</label>
		<textarea id="draft" value={draft$} />
		<nav aria-label="Fixture conversations">
			<button id="rich-visit-b" type="button">Conversation B</button>
			<button id="rich-return-a" type="button">Return to A</button>
		</nav>
		<div id="rich-slot">
			<RichConversation {...initialRich} />
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
