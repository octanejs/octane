import type { SignalHandle } from 'octane/signals';

export function SatisfiesWriteValue(props: {
	value$: SignalHandle<string>;
	env: { String: (value: unknown) => unknown };
	replacement: (value: unknown) => unknown;
}) @{
	const env = props.env;
	(env.String satisfies (value: unknown) => unknown) = props.replacement;
	const value = String(props.value$);
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}
