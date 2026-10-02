import { useFormStatus } from 'octane';

function DataStatus() @{
	const status = useFormStatus();
	<output id="data-status">{(status.pending && status.data
		? JSON.stringify(Array.from(status.data.entries()))
		: 'idle') as string}</output>
}

export function FormActionData(props: {
	action?: (data: FormData) => void | Promise<void>;
	onSubmit?: (event: Event) => void;
}) @{
	<form action={props.action} onSubmit={props.onSubmit}>
		<button id="before" name="intent" value="publish">{'Publish'}</button>
		<input type="hidden" name="intent" value="draft" />
		<input id="middle" type="submit" name="intent" value="preview" />
		<input type="hidden" name="intent" value="fallback" />
		<input type="hidden" name="intent" value="ignored" disabled />
		<button id="after" name="intent" value="archive">{'Archive'}</button>
		<DataStatus />
	</form>
}
