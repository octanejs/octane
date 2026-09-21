import { useLayoutEffect, useState } from 'octane';
import {
	answerActivity$,
	answer$,
	draft$,
	draftLength$,
	resumeResponse,
	sendMessage,
	stopResponse,
} from './State.tsrx';
import { recordActivation } from './measurements.ts';

export function Composer() @{
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => {
		setReady(true);
		recordActivation('composer');
	}, []);
	<section class="composer" aria-label="Composer" data-composer-ready={ready}>
		<form
			onSubmit={(event: SubmitEvent) => {
				event.preventDefault();
				sendMessage();
			}}
		>
			<label for="message">Message</label>
			<textarea
				id="message"
				name="draft"
				value={draft$}
				rows={3}
				maxLength={4_000}
				placeholder="Ask about streaming… or type before this panel hydrates."
				onKeyDown={(event: KeyboardEvent) => {
					if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
						event.preventDefault();
						sendMessage();
					}
				}}
			/>
			<div class="composer-actions">
				<span>
					<output data-draft-length>{draftLength$}</output>
					/ 4000
				</span>
				<button class="primary" type="submit">
					Send message
					<span aria-hidden="true">↑</span>
				</button>
			</div>
		</form>
		<div class="transport-actions">
			<button type="button" onClick={stopResponse}>Stop response</button>
			<button type="button" onClick={resumeResponse}>Resume response</button>
			<button type="button" onClick={() => answer$.refetch()}>Refresh response</button>
			<button type="button" onClick={() => answer$.reset()}>Reset response</button>
			<output class="activity" data-answer-state aria-live="polite">{answerActivity$}</output>
		</div>
	</section>
}
