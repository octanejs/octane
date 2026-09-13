import { body$, draft$, draftLength$, history$, selectedDay$ } from './State.ts';

// Server-owned DOM. This component is never an entry in the browser graph.
export function Shell() @{
	<main>
		<h1>Renderer-free streaming conversation</h1>
		<label for="draft">Draft</label>
		<textarea id="draft" value={draft$} />
		<output id="draft-length">{draftLength$}</output>
		<button id="day" type="button">Next day</button>
		<output id="selected-day">{String(selectedDay$.get())}</output>
		<button id="optional" type="button">Load optional controller</button>
		<output id="optional-value" />
		<section aria-label="Conversation">
			@try {
				const frame = body$.get();
				<ol data-body data-revision={frame.revision}>
					@for (const row of frame.rows; key row.id) {
						<li data-turn={row.id}>
							<p>{row.prompt as string}</p>
							<p>{row.answer as string}</p>
						</li>
					}
				</ol>
			} @pending {
				<p data-body-pending>Loading conversation…</p>
			} @catch (error) {
				<p data-body-error>Conversation unavailable.</p>
			}
			<output id="body-live" />
		</section>
		<section aria-label="History">
			@try {
				const frame = history$.get();
				<ol data-history data-revision={frame.revision}>
					@for (const row of frame.rows; key row.id) {
						<li data-conversation={row.id}>{row.title as string}</li>
					}
				</ol>
			} @pending {
				<p data-history-pending>Loading history…</p>
			} @catch (error) {
				<p data-history-error>History unavailable.</p>
			}
			<output id="history-live" />
		</section>
	</main>
}
