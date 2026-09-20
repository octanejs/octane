import type { SignalHandle } from 'octane/signals';

export function NativeMutationValue(props: {
	value$: SignalHandle<string>;
	replacement: (value: unknown) => unknown;
	prototype: object;
	mutation: 'defineGetter' | 'objectPrototype' | 'reflectPrototype';
}) @{
	const env = globalThis;
	if (props.mutation === 'defineGetter') (env as unknown as {
		__defineGetter__(key: string, getter: () => unknown): void;
	}).__defineGetter__('String', () => props.replacement);
	else {
		if (props.mutation === 'objectPrototype') Object.setPrototypeOf(env, props.prototype);
		else Reflect.setPrototypeOf(env, props.prototype);
		Reflect.deleteProperty(env, 'String');
	}
	const value = String(props.value$);
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}
