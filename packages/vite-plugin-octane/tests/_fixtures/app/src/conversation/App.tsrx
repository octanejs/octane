import { Hydrate, useLayoutEffect, useState } from 'octane';
import { interaction } from 'octane/hydration';
import 'octane/signals';
import { Composer } from './Composer.tsrx';
import { stopConversation } from './Calls.tsrx';
import { notice$, selectedConversation$, visibleConversation$ } from './State.tsrx';

export function ConversationApp() @{
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => setReady(true), []);
	<main>
		<h1>Streaming conversations</h1>
		<nav aria-label="Conversations">
			<a href="/conversations">Open a fresh document</a>
		</nav>
		<fieldset aria-busy={!ready}>
			<legend>Conversation in this document</legend>
			<button type="button" onClick={() => selectedConversation$.set('A')}>Conversation A</button>
			<button type="button" onClick={() => selectedConversation$.set('B')}>Conversation B</button>
		</fieldset>
		<h2>{'Conversation ' + selectedConversation$.get()}</h2>
		<section aria-label="Conversation history">
			@try {
				const frame = visibleConversation$.get();
				<ol data-conversation={frame.conversationId} data-revision={frame.revision}>
					@for (const turn of frame.turns; key turn.id) {
						<li data-turn={turn.id}>
							<p>{turn.prompt as string}</p>
							<p>{turn.answer as string}</p>
							<p>{turn.status as string}</p>
							@if (turn.status === 'running') {
								<button
									type="button"
									onClick={() => {
										void stopConversation(turn.id).catch(
											() => notice$.set('Stop was not acknowledged.'),
										);
									}}
								>Stop generation</button>
							}
						</li>
					}
				</ol>
			} @pending {
				<p role="status">Loading conversation…</p>
			} @catch (error) {
				<p role="alert">Conversation unavailable. Your draft is still here.</p>
			}
		</section>
		<Hydrate independent when={interaction()}>
			<Composer />
		</Hydrate>
	</main>
}
