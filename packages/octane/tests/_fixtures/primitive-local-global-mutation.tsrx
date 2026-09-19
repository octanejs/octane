import type { SignalHandle } from 'octane/signals';

export function GlobalMutationValue(props: {
	value$: SignalHandle<string>;
	mutation: 'assignment' | 'assign' | 'defineProperty' | 'set';
}) @{
	const builtin = String;
	const env = globalThis as unknown as { String: (value: unknown) => unknown };
	// Replace only this handle's conversion so other framework String calls
	// keep their original behavior. The caller restores the global afterward.
	const replace$ = (value: unknown) => value === props.value$ ? value : builtin(value);
	// Keep built-in static conversion methods available to DOM implementations.
	Object.setPrototypeOf(replace$, builtin);
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
