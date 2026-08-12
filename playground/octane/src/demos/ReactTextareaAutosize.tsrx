import TextareaAutosize, { type TextareaHeightChangeMeta } from '@octanejs/textarea-autosize';
import { useRef, useState } from 'octane';

const INITIAL = 'Octane grows with your message.';

export function ReactTextareaAutosizeDemo() @{
	const [controlled, setControlled] = useState(INITIAL);
	const [controlledHeight, setControlledHeight] = useState('waiting');
	const [uncontrolledHeight, setUncontrolledHeight] = useState('waiting');
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const report = (setValue: (value: string) => void) => (
		height: number,
		meta: TextareaHeightChangeMeta,
	) => setValue(`${height}px · row ${meta.rowHeight}px`);

	<div>
		<h2 class="demo-title">{'React Textarea Autosize on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'The exact component API with controlled and uncontrolled sizing, row clamps, refs, and form reset.'}</p>
		<div class="panel">
			<label for="autosize-controlled">{'Controlled message'}</label>
			<TextareaAutosize
				id="autosize-controlled"
				minRows={2}
				maxRows={6}
				value={controlled}
				onChange={(event) => setControlled(event.currentTarget.value)}
				onHeightChange={report(setControlledHeight)}
				ref={textareaRef}
				style={{ width: '100%', boxSizing: 'border-box' }}
			/>
			<p aria-live="polite">{'Measured: ' + controlledHeight}</p>
			<div class="row">
				<button
					class="btn"
					onClick={() => setControlled(`${controlled}\nA new line.`)}
				>{'Grow'}</button>
				<button class="btn" onClick={() => setControlled('Short')}>{'Shrink'}</button>
				<button class="btn" onClick={() => textareaRef.current?.focus()}>{'Focus'}</button>
				<button class="btn" onClick={() => setControlled(INITIAL)}>{'Reset controlled'}</button>
			</div>
		</div>
		<form class="panel">
			<label for="autosize-uncontrolled">{'Uncontrolled form message'}</label>
			<TextareaAutosize
				id="autosize-uncontrolled"
				name="message"
				minRows={2}
				maxRows={6}
				defaultValue={INITIAL}
				onHeightChange={report(setUncontrolledHeight)}
				style={{ width: '100%', boxSizing: 'border-box' }}
			/>
			<p aria-live="polite">{'Measured: ' + uncontrolledHeight}</p>
			<button class="btn" type="reset">{'Reset form'}</button>
		</form>
	</div>
}
