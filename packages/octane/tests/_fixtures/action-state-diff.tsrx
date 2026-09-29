import { useActionState, useState } from 'octane';

// The form action closes over the selected version. Swapping it rerenders the
// hook with a replacement action while an earlier submission is still queued.
export function VersionedActionForm(props: { gate: Promise<void> }) @{
	const [version, setVersion] = useState('old');
	const [state, formAction, isPending] = useActionState(async (prev: string, data: FormData) => {
		const name = String(data.get('name'));
		if (name === 'first') await props.gate;
		return prev + '/' + version + ':' + name;
	}, 'init');
	<form action={formAction}>
		<input id="field" name="name" />
		<button id="swap" type="button" onClick={() => setVersion('new')}>{'swap'}</button>
		<span id="state">{state as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</form>
}
