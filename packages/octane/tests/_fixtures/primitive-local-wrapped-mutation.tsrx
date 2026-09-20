import type { SignalHandle } from 'octane/signals';

export function WrappedMutationValue(props: {
	value$: SignalHandle<string>;
	replacement: (value: unknown) => unknown;
	method: 'set';
	mutation: 'cast' | 'nonNull' | 'satisfies' | 'optionalCall' | 'optionalReceiver' | 'extracted';
}) @{
	const env = globalThis;
	const method = props.method;
	const replacement = props.replacement;
	if (props.mutation === 'nonNull') Reflect[method]!(env, 'String', replacement);
	else if (props.mutation === 'satisfies') (Reflect[method] satisfies typeof Reflect.set)(
		env,
		'String',
		replacement,
	);
	else if (props.mutation === 'optionalCall') (Reflect[method] as typeof Reflect.set)?.(
		env,
		'String',
		replacement,
	);
	else if (props.mutation === 'optionalReceiver') (Reflect?.[method] as typeof Reflect.set)(
		env,
		'String',
		replacement,
	);
	else if (props.mutation === 'extracted') {
		const mutate = Reflect[method];
		mutate(env, 'String', replacement);
	} else (Reflect[method] as typeof Reflect.set)(env, 'String', replacement);
	const value = String(props.value$);
	<section>
		<output title={value}>{value as string}</output>
		<input value={value} />
	</section>
}
