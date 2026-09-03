import { StrictMode, useFormState, type InputHTMLAttributes } from 'octane';

export function FormActionAndHandler(props: {
	action: (data: FormData) => void;
	onSubmit: (event: Event) => void;
}) @{
	<form action={props.action} onSubmit={props.onSubmit}>
		<input name="query" defaultValue="octane" />
		<button type="submit">Submit</button>
	</form>
}

export function LegacyActionForm() @{
	const [state, action] = useFormState((previous: number, _data: FormData) => previous + 1, 0);
	<StrictMode>
		<form action={action}>
			<button type="submit">{String(state)}</button>
		</form>
	</StrictMode>
}

export function DefaultsInput(props: { dv?: string }) @{
	<input defaultValue={props.dv} />
}

export function SpreadDefaultInput(props: {
	dv?: string;
	sp: InputHTMLAttributes<HTMLInputElement>;
}) @{
	<input {...props.sp} defaultValue={props.dv} />
}

export function DefaultTextarea(props: { dv?: string }) @{
	<textarea defaultValue={props.dv} />
}

export function DefaultSelect(props: { dv?: string }) @{
	<select defaultValue={props.dv}>
		<option value="p">P</option>
		<option value="q">Q</option>
	</select>
}
