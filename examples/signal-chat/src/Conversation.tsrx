import 'octane/signals';
import { useLayoutEffect } from 'octane';
import { answer$, answerActivity$, answerComplete$, retryResponse, selection$ } from './State.tsrx';
import { recordActivation } from './measurements.ts';
import type { AnswerFrame } from './types.ts';

function Transcript({ frame }: { frame: AnswerFrame }) @{
	<div
		data-answer
		data-revision={frame.revision}
		data-total={frame.total}
		data-conversation-id={frame.conversationId}
		data-generation={frame.generation}
	>
		<div class="transcript">
			@for (const message of frame.messages.slice(0, -2); key message.id) {
				<article class={['message', message.role]} data-message-id={message.id}>
					<span class="avatar" aria-hidden="true">
						{message.role === 'user' ? 'D' : '✳'}
					</span>
					<div>
						<strong>
							{message.role === 'user' ? 'You' : 'Signal Chat'}
						</strong>
						<p>{message.content as string}</p>
					</div>
				</article>
			}
			<article class="message user current">
				<span class="avatar" aria-hidden="true">D</span>
				<div>
					<strong>You</strong>
					<p data-current-prompt>{frame.prompt as string}</p>
				</div>
			</article>
			<article class="message assistant current">
				<span class="avatar" aria-hidden="true">✳</span>
				<div>
					<strong>Signal Chat</strong>
					<pre data-current-answer>{frame.answer as string}</pre>
				</div>
			</article>
		</div>
		<div class="revision">
			<span>Snapshot {String(frame.revision)} / {String(frame.total)}</span>
			<span>{String(frame.tokens)} words · cumulative values</span>
		</div>
	</div>
}

export function Conversation() @{
	useLayoutEffect(() => recordActivation('answer'), []);
	<section class="conversation" aria-label="Conversation" data-complete={answerComplete$}>
		<header class="panel-header">
			<h2>Conversation</h2>
			<button type="button">Activate conversation</button>
		</header>
		@if (selection$.get().stopped) {
			<div>
				<p role="status">Response stopped. The last accepted snapshot is retained.</p>
				@if (answer$.latest(null) !== null) {
					<Transcript frame={answer$.latest(null)!} />
				}
			</div>
		} @else {
			<>
				@try {
					<Transcript frame={answer$.get()} />
				} @pending {
					<div class="placeholder" role="status">
						<span class="pulse" />
						Waiting for the first answer…
					</div>
				} @catch (_error, reset) {
					<div class="failure">
						<p role="alert">Response failed</p>
						<p>The selected producer failed or completed without a value.</p>
						<button
							type="button"
							onClick={() => {
								retryResponse();
								reset();
							}}
						>Retry response</button>
						@if (answer$.latest(null) !== null) {
							<Transcript frame={answer$.latest(null)!} />
						}
					</div>
				}
			</>
		}
		<output class="activity" data-conversation-state>{answerActivity$}</output>
	</section>
}
