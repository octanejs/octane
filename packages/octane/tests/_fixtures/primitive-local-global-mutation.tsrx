import type { SignalHandle } from 'octane/signals';

export function GlobalMutationValue(props: {
	value$: SignalHandle<string>;
	replacement: (value: unknown) => unknown;
	mutation: 'assignment' | 'assign' | 'defineProperty' | 'set';
}) @{
	const env = globalThis as unknown as { String: (value: unknown) => unknown };
	const replace$ = props.replacement;
	if (props.mutation === 'assign') Object.assign(env, { String: replace$ });
	else if (props.mutation === 'defineProperty') Object.defineProperty(env, 'String', {
		value: replace$,
	});
	else if (props.mutation === 'set') Reflect.set(env, 'String', replace$);
	else env.String = replace$;
	const value = String(props.value$);
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}
