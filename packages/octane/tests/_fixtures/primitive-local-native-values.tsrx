import 'octane/signals';

export function NativePrimitiveValue(props: { read$: () => string; numeric$: () => number }) @{
	const value = String(props.read$());
	const numeric = props.numeric$() + 1;
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
		<p title={String(numeric)}>{numeric as unknown as string}</p>
	</section>
}

export function NativePrimitiveBoundary(props: { read$: () => string; numeric$: () => number }) @{
	<section>
		@try {
			<NativePrimitiveValue {...props} />
		} @pending {
			<p>waiting</p>
		} @catch (error) {
			<strong>{String(error)}</strong>
		}
	</section>
}
