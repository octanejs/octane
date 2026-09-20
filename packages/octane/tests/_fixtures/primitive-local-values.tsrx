import type { SignalHandle } from 'octane/signals';

export function PrimitiveValue(props: { value: unknown; checked: unknown }) @{
	const value = String(props.value);
	const checked = !!props.checked;
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
		<input type="checkbox" checked={checked} />
	</section>
}

export function OpaqueValue(props: { read$: () => unknown }) @{
	const value = props.read$() as string;
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}

export function MutableValue(props: {
	initial: unknown;
	replacement$: string | SignalHandle<string>;
}) @{
	let value: string | SignalHandle<string> = String(props.initial);
	value = props.replacement$;
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}

export function ShadowedValue(props: { convert$: () => SignalHandle<string> }) @{
	const String = props.convert$;
	const value = String();
	<section>
		<output title={value}>{value as unknown as string}</output>
		<input value={value} />
	</section>
}

export function ShadowedRows(props: { values$: SignalHandle<string>[] }) @{
	const value = String('outer');
	<main title={value}>
		@for (const value of props.values$; key value.key) {
			<output title={value}>{value as unknown as string}</output>
		}
	</main>
}

export function PrimitiveThrows(props: { read: () => unknown }) @{
	const value = String(props.read());
	<output title={value}>{value as string}</output>
}
