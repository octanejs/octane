import {
	Hydrate,
	ViewTransition,
	startTransition,
	useInsertionEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';
import { interaction } from 'octane/hydration';

type EditorProps = {
	adoptInLayout: boolean;
	onAdopt?: (value: string) => void;
	onSend?: (value: string) => void;
};

function Editor(props: EditorProps) @{
	const input = useRef<HTMLInputElement | null>(null);
	const [draft, setDraft] = useState('');
	const [submitted, setSubmitted] = useState('');
	if (props.adoptInLayout) {
		useLayoutEffect(() => {
			const value = input.current!.value;
			props.onAdopt?.(value);
			setDraft(value);
		}, []);
	}
	const send = () => {
		const value = input.current!.value;
		setSubmitted(value);
		props.onSend?.(value);
	};
	<section>
		<input
			id="deferred-query"
			ref={input}
			value={draft}
			onInput={(event: Event) => setDraft((event.currentTarget as HTMLInputElement).value)}
		/>
		<output id="deferred-draft">{draft as string}</output>
		<button type="button" onClick={send}>
			{'Send'}
		</button>
		<output id="deferred-submitted">{submitted as string}</output>
	</section>
}

export function DeferredControlledEditor(props: EditorProps) @{
	<Hydrate when={interaction()} split={false}>
		<Editor adoptInLayout={props.adoptInLayout} onAdopt={props.onAdopt} onSend={props.onSend} />
	</Hydrate>
}

export function LockedEditor(props: {
	dispatchInLayout?: boolean;
	onInput?: (event: Event) => void;
}) @{
	const input = useRef<HTMLInputElement | null>(null);
	useLayoutEffect(() => {
		if (props.dispatchInLayout) {
			input.current!.value = 'rejected edit';
			input.current!.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}, []);
	<input ref={input} value="locked" onInput={(event: Event) => props.onInput?.(event)} />
}

export function PendingControlledEditor(props: {
	expose: (setter: (value: string) => void) => void;
	acceptInput?: () => boolean;
	onCapture?: (event: Event) => void;
}) @{
	const [draft, setDraft] = useState('');
	props.expose(setDraft);
	<section>
		<input
			value={draft}
			onInputCapture={(event: Event) => props.onCapture?.(event)}
			onInput={(event: Event) => {
				if (props.acceptInput?.() !== false)
					setDraft((event.currentTarget as HTMLInputElement).value);
			}}
		/>
		<output>{draft as string}</output>
	</section>
}

export function AnimatedControlledEditor(props: {
	expose: (setter: (value: number) => void) => void;
	acceptInput: boolean;
	onInput: (value: string) => void;
}) @{
	const [page, setPage] = useState(0);
	const [draft, setDraft] = useState('locked');
	props.expose(setPage);
	const onInput = (event: Event) => {
		const value = (event.currentTarget as HTMLInputElement).value;
		props.onInput(value);
		if (props.acceptInput) startTransition(() => setDraft(value));
	};
	<ViewTransition>
		<section>
			<input value={draft} onInput={onInput} />
			<output>{draft as string}</output>
			<p>
				{
					(page === 0
						? 'Initial page'
						: page === 1
							? 'First animated page'
							: 'Second animated page') as string
				}
			</p>
		</section>
	</ViewTransition>
}

type ChoiceProps = {
	kind: 'checkbox' | 'radio' | 'select';
	onEdit?: (selected: boolean, type: string) => void;
	onSend?: (selected: boolean) => void;
};

function ChoiceEditor(props: ChoiceProps) @{
	const control = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
	const setControl = (element: HTMLInputElement | HTMLSelectElement | null) => {
		control.current = element;
	};
	const [selected, setSelected] = useState(false);
	const read = (element: HTMLInputElement | HTMLSelectElement) =>
		props.kind === 'select' ? element.value === 'second' : (element as HTMLInputElement).checked;
	useLayoutEffect(() => {
		setSelected(read(control.current!));
	}, []);
	const onEdit = (event: Event) => {
		const value = read(event.currentTarget as HTMLInputElement | HTMLSelectElement);
		props.onEdit?.(value, event.type);
		setSelected(value);
	};
	<section>
		@if (props.kind === 'select') {
			<select
				id="deferred-choice"
				ref={setControl}
				value={selected ? 'second' : 'first'}
				onInput={onEdit}
				onChange={onEdit}
			>
				<option value="first">{'First'}</option>
				<option value="second">{'Second'}</option>
			</select>
		} @else {
			<>
				@if (props.kind === 'radio') {
					<input
						id="deferred-first-choice"
						type="radio"
						name="deferred-choice-group"
						checked={!selected}
						onChange={(event: Event) =>
							setSelected(!(event.currentTarget as HTMLInputElement).checked)
						}
					/>
				}
				<input
					id="deferred-choice"
					type={props.kind}
					name="deferred-choice-group"
					ref={setControl}
					checked={selected}
					onInput={onEdit}
					onChange={onEdit}
				/>
			</>
		}
		<output>{selected ? 'second' : 'first'}</output>
		<button type="button" onClick={() => props.onSend?.(read(control.current!))}>
			{'Send'}
		</button>
	</section>
}

export function DeferredControlledChoice(props: ChoiceProps) @{
	<Hydrate when={interaction()} split={false}>
		<ChoiceEditor kind={props.kind} onEdit={props.onEdit} onSend={props.onSend} />
	</Hydrate>
}

export function FailingLayout(props: {
	dispatch: () => void;
	error: Error;
	failDuringRender?: boolean;
}) @{
	const [fail, setFail] = useState(false);
	if (fail) throw props.error;
	useLayoutEffect(() => {
		props.dispatch();
		if (props.failDuringRender) {
			setFail(true);
			return;
		}
		throw props.error;
	}, []);
	<span>{'Layout owner'}</span>
}

export function ResourceHold(props: {
	text: string;
	requestFont: () => void;
	mutate: () => void;
	layout: (text: string) => void;
}) @{
	useInsertionEffect(() => {
		if (props.text === 'after') props.requestFont();
	}, [props.text]);
	useLayoutEffect(() => {
		props.layout(props.text);
		return () => props.mutate();
	}, [props.text]);
	<ViewTransition>
		<div>{props.text as string}</div>
	</ViewTransition>
}
