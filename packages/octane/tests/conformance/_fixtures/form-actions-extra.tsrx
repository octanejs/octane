import { useActionState, useFormStatus, useTransition } from 'octane';

// useActionState with the dispatcher exposed to the test (direct dispatch, no
// form) — drives the queue-order and error-handling ports.
export function ExposedActionState(props) @{
	const [state, dispatch, isPending] = useActionState(props.action, props.initial);
	props.expose(dispatch);
	<div>
		<span id="state">{String(state) as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</div>
}

// The same, wrapped in an octane error boundary (@try/@catch) — the port target
// for React's ErrorBoundary-around-useActionState cases.
export function BoundaryActionState(props) @{
	<div>
		@try {
			<ExposedActionState action={props.action} initial={props.initial} expose={props.expose} />
		} @catch (e) {
			<span id="err">{'Caught an error: ' + e.message}</span>
		}
	</div>
}

// useFormStatus read from a child of the form.
function StatusOut(props) @{
	const { pending } = useFormStatus();
	<span id="out">{(pending ? props.value + ' (pending...)' : props.value) as string}</span>
}

// Manual onSubmit: preventDefault + startTransition(async). Activates
// useFormStatus (React parity — the manual-action idiom).
export function ManualTransitionForm(props) @{
	const [, startFormTransition] = useTransition();
	<form
		onSubmit={(event) => {
			event.preventDefault();
			startFormTransition(async () => {
				await props.wait();
			});
		}}
	>
		<input type="text" name="search" />
		<div>
			<StatusOut value={props.value} />
		</div>
	</form>
}

// Manual onSubmit WITHOUT startTransition (plain async event handler).
export function PlainSubmitForm(props) @{
	<form
		onSubmit={(event) => {
			event.preventDefault();
			props.onSubmit(event);
		}}
	>
		<input type="text" name="search" />
		<div>
			<StatusOut value={props.value} />
		</div>
	</form>
}

// Manual onSubmit that does NOT preventDefault (but does start a transition).
export function NoPreventDefaultForm(props) @{
	const [, startFormTransition] = useTransition();
	<form
		onSubmit={() => {
			startFormTransition(async () => {
				await props.wait();
			});
		}}
	>
		<input type="text" name="search" />
		<div>
			<StatusOut value={props.value} />
		</div>
	</form>
}

// Intercepted-submit path: <form action={fn}> with a status reader that hands
// the PENDING status object to the test (fields probe).
function StatusFields(props) @{
	const status = useFormStatus();
	if (status.pending) {
		props.expose(status);
	}
	<span id="sf">{(status.pending ? 'pending' : 'idle') as string}</span>
}
export function InterceptedForm(props) @{
	<form action={props.action}>
		<input name="q" value="init" />
		<StatusFields expose={props.expose} />
	</form>
}
