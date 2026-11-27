import { signal$ } from 'octane/signals';

const draft$ = signal$('server draft', { key: 'draft' });
const note$ = signal$('server note', { key: 'note' });
export const choice$ = signal$('a', { key: 'choice' });

export function StreamedForm(props: { updated: boolean }) @{
	<form>
		<input
			id="draft"
			name={props.updated ? 'blocked' : 'initial'}
			placeholder={props.updated ? 'Unavailable' : 'Enter a draft'}
			title={props.updated ? undefined : 'Draft help'}
			disabled={props.updated}
			value={draft$}
		/>
		<input id="note" name={props.updated ? 'note' : 'initial-note'} value={note$} />
	</form>
}

export function StreamedChoice(props: { options: string[] }) @{
	<form>
		<select name="choice" value={choice$}>
			@for (const value of props.options; key value) {
				<option value={value}>{value as string}</option>
			}
		</select>
	</form>
}
