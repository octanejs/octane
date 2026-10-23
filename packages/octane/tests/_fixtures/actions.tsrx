import {
	createContext,
	createPortal,
	useActionState,
	useContext,
	useFormStatus,
	useOptimistic,
	useState,
	Suspense,
	startTransition,
	useTransition,
	use,
} from 'octane';

// useActionState wired to <form action={formAction}>. The action receives
// (previousState, formData) and its resolved value becomes the new state.
export function ActionForm(props) @{
	const [state, formAction, isPending] = useActionState(props.action, props.initial);
	<form action={formAction}>
		<input id="field" name="name" />
		<button id="submit" type="submit">
			{'submit'}
		</button>
		<span id="state">{String(state) as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</form>
}

export function SubmitterActionForm(props: {
	action: (previous: string, data: FormData) => string | Promise<string>;
	initial: string;
}) @{
	const [state, formAction, isPending] = useActionState(props.action, props.initial);
	<form>
		<input id="field" name="name" />
		<button id="submit" type="submit" formAction={formAction}>
			{'submit'}
		</button>
		<span id="state">{String(state) as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</form>
}

// useFormStatus read from a CHILD component of the form.
function StatusReader() @{
	const status = useFormStatus();
	<span id="status">{(status.pending ? 'pending:' + status.method : 'idle') as string}</span>
}

export function FormWithStatus(props) @{
	const [, formAction] = useActionState(props.action, null);
	<form action={formAction}>
		<input name="q" />
		<StatusReader />
		<button id="submit" type="submit">
			{'go'}
		</button>
	</form>
}

const PortalStatusContext = createContext('missing');

function PortaledStatusButton() @{
	const status = useFormStatus();
	const scope = useContext(PortalStatusContext);
	<button
		id="portal-status"
		type="submit"
		form="save-form"
		disabled={status.pending}
		data-scope={scope}
	>
		{(status.pending ? 'pending:' + String(status.data?.get('draft')) : 'idle') as string}
	</button>
}

export function PortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	target: HTMLElement;
}) @{
	<PortalStatusContext value="owned">
		<form id="save-form" action={props.action}>
			<input id="field" name="draft" defaultValue="saved" />
			{createPortal(<PortaledStatusButton />, props.target)}
		</form>
	</PortalStatusContext>
}

export function FrontierPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	target: HTMLElement;
	expose: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.expose(() => setShow(true));
	<PortalStatusContext value="frontier">
		<form id="save-form" action={props.action}>
			<input id="field" name="draft" defaultValue="saved" />
			@if (show) {
				<div id="portal-frontier">{createPortal(<PortaledStatusButton />, props.target)}</div>
			}
		</form>
	</PortalStatusContext>
}

export function CommittedWrapperFrontierPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	target: HTMLElement;
	expose: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.expose(() => setShow(true));
	<PortalStatusContext value="committed-wrapper">
		<form id="save-form" action={props.action}>
			<input id="field" name="draft" defaultValue="saved" />
			<div id="committed-wrapper">
				@if (show) {
					<div id="portal-frontier">{createPortal(<PortaledStatusButton />, props.target)}</div>
				}
			</div>
		</form>
	</PortalStatusContext>
}

export function NestedPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	outerTarget: HTMLElement;
	innerTarget: HTMLFormElement;
}) @{
	<PortalStatusContext value="nested">
		<form id="save-form" action={props.action}>
			<input id="field" name="draft" defaultValue="saved" />
			{createPortal(
				<div id="outer-portal-host">
					{createPortal(<PortaledStatusButton />, props.innerTarget)}
				</div>,
				props.outerTarget,
			)}
		</form>
	</PortalStatusContext>
}

export function NestedFrontierPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	outerTarget: HTMLFormElement;
	innerTarget: HTMLElement;
	expose: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.expose(() => setShow(true));
	<PortalStatusContext value="nested-frontier">
		<form id="save-form" action={props.action}>
			<input id="field" name="draft" defaultValue="saved" />
			{createPortal(
				<div id="outer-portal-host">
					@if (show) {
						<div id="inner-portal-frontier">
							{createPortal(<PortaledStatusButton />, props.innerTarget)}
						</div>
					}
				</div>,
				props.outerTarget,
			)}
		</form>
	</PortalStatusContext>
}

export function FrontierInnerFormPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	target: HTMLElement;
	expose: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.expose(() => setShow(true));
	<PortalStatusContext value="frontier-inner-form">
		<form id="outer-form">
			@if (show) {
				<form id="save-form" action={props.action}>
					<input id="field" name="draft" defaultValue="saved" />
					{createPortal(<PortaledStatusButton />, props.target)}
				</form>
			}
		</form>
	</PortalStatusContext>
}

export function FrontierWrappedInnerFormPortaledFormWithStatus(props: {
	action: (data: FormData) => void | Promise<void>;
	target: HTMLElement;
	expose: (show: () => void) => void;
}) @{
	const [show, setShow] = useState(false);
	props.expose(() => setShow(true));
	<PortalStatusContext value="wrapped-frontier-inner-form">
		<form id="outer-form">
			@if (show) {
				<div id="frontier-wrapper">
					<form id="save-form" action={props.action}>
						<input id="field" name="draft" defaultValue="saved" />
						{createPortal(<PortaledStatusButton />, props.target)}
					</form>
				</div>
			}
		</form>
	</PortalStatusContext>
}

// RAW <form action={fn}> (not useActionState) + a useFormStatus child. Used to
// verify a SYNCHRONOUSLY-throwing action still clears the form's pending status.
export function RawFormWithStatus(props) @{
	<form action={props.action}>
		<StatusReader />
		<button id="submit" type="submit">
			{'go'}
		</button>
	</form>
}

// useFormStatus + a self re-render trigger — used to verify the hook re-resolves
// its ancestor <form> on each render (so a form that appears later is picked up).
function StatusProbeInner(props) @{
	const [, setN] = useState(0);
	const status = useFormStatus();
	props.expose(() => setN((n) => n + 1));
	<span id="probe">{(status.pending ? 'pending' : 'idle') as string}</span>
}
// The probe is a CHILD so it has real block markers — the test inserts a <form>
// as an ancestor of #wrap, which becomes the probe's nearest ancestor form.
export function StatusProbe(props) @{
	<div id="wrap">
		<StatusProbeInner expose={props.expose} />
	</div>
}

// useFormStatus called in the SAME component that renders the form must NOT see
// that form (React parity) — it has no ancestor form, so it stays idle.
export function SelfFormStatus(props) @{
	const status = useFormStatus();
	props.expose(status);
	<form action={props.action}>
		<span id="self">{(status.pending ? 'pending' : 'idle') as string}</span>
		<button id="submit" type="submit">
			{'go'}
		</button>
	</form>
}

// The same component rendered as a child, where its single <form> root is
// the start of its own range.
export function NestedSelfFormStatus(props) @{
	<section>
		<SelfFormStatus action={props.action} expose={props.expose} />
	</section>
}

// useOptimistic: optimisticState shows the pending value during the action, then
// converges to the real committed state.
export function OptimisticForm(props) @{
	const [items, setItems] = useState(props.initial);
	const [optimistic, addOptimistic] = useOptimistic(items, (cur, v) => [...cur, v + '?']);
	const [, formAction] = useActionState(async (prev, fd) => {
		const v = String(fd.get('item'));
		addOptimistic(v);
		await props.action();
		setItems((cur) => [...cur, v]);
		return prev;
	}, null);
	<form action={formAction}>
		<input id="field" name="item" />
		<span id="list">{optimistic.join(',') as string}</span>
		<button id="add" type="submit">
			{'add'}
		</button>
	</form>
}

// useOptimistic with addOptimistic called OUTSIDE any transition (a bare click).
// React shows the optimistic value only briefly; it must NOT stay stuck.
export function BareOptimistic(props) @{
	const [items] = useState(props.initial);
	const [optimistic, addOptimistic] = useOptimistic(items, (cur, v) => [...cur, v]);
	<div>
		<span id="list">{optimistic.join(',') as string}</span>
		<button id="add" onClick={() => addOptimistic('x')}>
			{'add'}
		</button>
	</div>
}

// useOptimistic without a reducer: a function action updates the pending
// optimistic state, as in useState.
export function OptimisticCounter(props: {
	count: number;
	expose: (add: (action: number | ((pending: number) => number)) => void) => void;
}) @{
	const [count, addOptimistic] = useOptimistic(props.count);
	props.expose(addOptimistic);
	<span id="count">{String(count) as string}</span>
}

function OptimisticDetails(props: { version: number; read: () => string }) @{
	<span id="detail">{props.version === 0 ? 'old' : (props.read() as string)}</span>
}

export function OptimisticSuspenseAction(props: {
	save: Promise<void>;
	read: () => string;
	suspend: boolean;
}) @{
	const [saved, setSaved] = useState(0);
	const [pending, start] = useTransition();
	const [optimistic, add] = useOptimistic(saved, (state: number, delta: number) => state + delta);
	<div>
		<button
			id="save"
			onClick={() =>
				start(async () => {
					add(1);
					await props.save;
					startTransition(() => setSaved(1));
				})
			}
		>
			{'save'}
		</button>
		<button id="bare-add" onClick={() => add(10)}>
			{'add outside transition'}
		</button>
		<output id="saved">{String(saved) as string}</output>
		<output id="optimistic">{String(optimistic) as string}</output>
		<output id="pending">{(pending ? 'pending' : 'idle') as string}</output>
		<Suspense fallback={<span id="fallback">{'loading'}</span>}>
			<OptimisticDetails version={props.suspend ? saved : 0} read={props.read} />
		</Suspense>
	</div>
}

export function SuspendedTransitionRoot(props: { read: () => string }) @{
	const [version, setVersion] = useState(0);
	const [pending, start] = useTransition();
	<section>
		<button id="navigate" onClick={() => start(() => setVersion(1))}>
			{'navigate'}
		</button>
		<output id="pending">{(pending ? 'pending' : 'idle') as string}</output>
		<Suspense fallback={<span id="fallback">{'loading'}</span>}>
			<OptimisticDetails version={version} read={props.read} />
		</Suspense>
	</section>
}

// An urgent update supersedes a held transition while the boundary renders,
// finishing the batch that owns the parent's optimistic update mid-render.
export function OptimisticSupersededTransition(props: {
	initial: Promise<string>;
	next: Promise<string>;
	urgent: Promise<string>;
}) @{
	const [optimistic, add] = useOptimistic(0, (state: number, delta: number) => state + delta);
	<div>
		<output id="optimistic">{String(optimistic) as string}</output>
		<SupersededValue {...props} add={add} />
	</div>
}

function SupersededValue(props: {
	initial: Promise<string>;
	next: Promise<string>;
	urgent: Promise<string>;
	add: (delta: number) => void;
}) @{
	const [promise, setPromise] = useState(props.initial);
	const [pending, start] = useTransition();
	<section>
		<button
			id="transition"
			onClick={() =>
				start(() => {
					props.add(1);
					setPromise(props.next);
				})
			}
		>
			{'transition'}
		</button>
		<button id="urgent" onClick={() => setPromise(props.urgent)}>
			{'urgent'}
		</button>
		<output id="pending">{(pending ? 'pending' : 'idle') as string}</output>
		@try {
			const value = use(promise);
			<span id="value">{value as string}</span>
		} @pending {
			<span id="fallback">{'loading'}</span>
		}
	</section>
}

// Direct dispatch: formAction(payload) called outside a <form>.
export function DirectAction(props) @{
	const [state, formAction, isPending] = useActionState(props.action, props.initial);
	<div>
		<button id="run" onClick={() => formAction(props.payload)}>
			{'run'}
		</button>
		<span id="state">{String(state) as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</div>
}

// Direct dispatch through the exposed dispatcher, so a test can call it from
// its own transition.
export function ExposedDispatch<P>(props: {
	action: (previous: string, payload: P) => string | Promise<string>;
	initial: string;
	expose: (dispatch: (payload: P) => void) => void;
}) @{
	const [state, dispatch, isPending] = useActionState(props.action, props.initial);
	props.expose(dispatch);
	<div>
		<span id="state">{String(state) as string}</span>
		<span id="pending">{(isPending ? 'pending' : 'idle') as string}</span>
	</div>
}

// Raw <form action={fn}> (no useActionState): auto-resets uncontrolled fields on
// success.
export function RawForm(props) @{
	<form action={props.action}>
		<input id="field" name="field" />
		<button id="submit" type="submit">
			{'go'}
		</button>
	</form>
}
