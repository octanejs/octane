import { useRef } from 'octane';

export function TextField(props: { id: string; label: string; ref: unknown }) @{
	<>
		<label htmlFor={props.id}>{props.label as string}</label>
		<input id={props.id} type="text" ref={props.ref} />
	</>
}

export function App(props: { inputRef: unknown }) @{
	const internalRef = useRef<HTMLInputElement | null>(null);

	<section>
		<TextField id="email" label="Email" ref={[props.inputRef, internalRef]} />
		<button type="button" onClick={() => internalRef.current?.focus()}>
			Focus email
		</button>
	</section>
}
