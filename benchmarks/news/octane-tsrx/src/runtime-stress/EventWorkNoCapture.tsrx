import { useEffect, useState } from 'octane';
import {
	FORM_FIELDS,
	markFieldRender,
	recordValidation,
} from '../../../../runtime-stress/shared.js';

function FormField(props: { index: number }) @{
	const [value, setValue] = useState('');
	useEffect(() => {
		setValue('');
	}, []);
	markFieldRender(props.index);
	const onInput = (event: Event) => {
		const next = (event.currentTarget as HTMLInputElement).value;
		setValue(next);
		recordValidation(next);
	};

	<label>
		<input
			name={'field-' + props.index}
			data-field-index={String(props.index)}
			value={value}
			onInput={onInput}
		/>
		<output data-field-output={String(props.index)}>{value as string}</output>
	</label>
}

function reportMediaEvent(phase: string, event: Event) {
	const benchmark = globalThis as
		typeof globalThis & {
			__eventWorkMedia?: (phase: string, event: Event) => void;
		};
	benchmark.__eventWorkMedia?.(phase, event);
}

function reportClickEvent(phase: string, event: Event) {
	const benchmark = globalThis as
		typeof globalThis & {
			__eventWorkClick?: (phase: string, event: Event) => void;
		};
	benchmark.__eventWorkClick?.(phase, event);
}

// This separate module never registers an authored input-capture listener.
// The normal stress App does so at module load even if its handler is unset.
export function EventWorkNoCapture() @{
	<form
		id="stress-form"
		onPlayCapture={(event: Event) => reportMediaEvent('form-capture', event)}
		onPlay={(event: Event) => reportMediaEvent('form-bubble', event)}
		onClickCapture={(event: Event) => reportClickEvent('form-capture', event)}
		onClick={(event: Event) => reportClickEvent('form-bubble', event)}
	>
		@for (const index of FORM_FIELDS; key index) {
			<FormField index={index} />
		}
		<video
			id="event-work-media"
			onPlay={(event: Event) => reportMediaEvent('target-bubble', event)}
		/>
		<button
			id="event-work-trusted-click"
			type="button"
			onClick={(event: Event) => reportClickEvent('button-bubble', event)}
		>{'Click work target'}</button>
	</form>
}
