import { useLayoutEffect, useState } from 'octane';
import { checkedDraft$, draft$, draftLength$ } from './State.tsrx';
import { recordEvaluation } from './evaluation.ts';

recordEvaluation('composer');

export function Composer() @{
	const [ready, setReady] = useState(false);
	useLayoutEffect(() => setReady(true), []);
	<section aria-label="Composer" data-region="composer" data-composer-ready={ready}>
		<label>
			Message
			<textarea name="draft" value={draft$} maxLength={4_000} rows={4} />
		</label>
		<p>
			Characters:
			<output data-draft-length>{draftLength$}</output>
		</p>
		<button type="button" data-composer-check onClick={() => checkedDraft$.set(draft$.get())}>
			Check draft
		</button>
		<output data-composer-check-result>{checkedDraft$}</output>
	</section>
}
