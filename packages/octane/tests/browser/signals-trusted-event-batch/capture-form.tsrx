import { useState } from 'octane';
import { signal$ } from 'octane/signals';

/** Written by the ancestor's capture handler on every input event. */
export const edits$ = signal$(0);

export interface CaptureFormProps {
	observe(entry: string): void;
}

export function CaptureForm(props: CaptureFormProps) @{
	const [level, setLevel] = useState(1);
	const [draft, setDraft] = useState('');
	// A body read re-renders the form, which reasserts both controlled values.
	const edits = edits$.get();
	<main
		onInputCapture={() => {
			props.observe('capture');
			edits$.set((current) => current + 1);
		}}
	>
		<output>{String(edits)}</output>
		<input
			aria-label="Level"
			type="range"
			min="0"
			max="4"
			value={String(level)}
			onInput={(event) => {
				props.observe('level:' + event.currentTarget.value);
				setLevel(event.currentTarget.valueAsNumber);
			}}
		/>
		<input
			aria-label="Draft"
			value={draft}
			onInput={(event) => {
				props.observe('draft:' + event.currentTarget.value);
				setDraft(event.currentTarget.value);
			}}
		/>
	</main>
}
