import type { SignalHandle } from 'octane/signals';

export function GlobalSatisfiesWriteValue(props: {
	value$: SignalHandle<string>;
	replacement: typeof String;
}) @{
	(String satisfies typeof String) = props.replacement;
	const value = String(props.value$);
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}
