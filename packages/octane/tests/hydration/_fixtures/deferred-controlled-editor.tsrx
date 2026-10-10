import { Hydrate, useLayoutEffect, useRef, useState } from 'octane';
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
		<button type="button" onClick={send}>{'Send'}</button>
		<output id="deferred-submitted">{submitted as string}</output>
	</section>
}

export function DeferredControlledEditor(props: EditorProps) @{
	<Hydrate when={interaction()} split={false}>
		<Editor
			adoptInLayout={props.adoptInLayout}
			onAdopt={props.onAdopt}
			onSend={props.onSend}
		/>
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
}) @{
	const [draft, setDraft] = useState('');
	props.expose(setDraft);
	<section>
		<input
			value={draft}
			onInput={(event: Event) => setDraft((event.currentTarget as HTMLInputElement).value)}
		/>
		<output>{draft as string}</output>
	</section>
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
