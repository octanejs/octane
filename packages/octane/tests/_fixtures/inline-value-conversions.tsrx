import type { SignalHandle } from 'octane/signals';

export type Mutation =
	| 'cast'
	| 'nonNull'
	| 'satisfies'
	| 'optionalCall'
	| 'optionalReceiver'
	| 'extracted'
	| 'receiverAlias'
	| 'destructured'
	| 'assignment'
	| 'assign'
	| 'getter'
	| 'prototype';

export function InlineValue(props: {
	value$: SignalHandle<string>;
	replacement: (value: unknown) => unknown;
	method: 'set';
	mutation: Mutation;
	prototype: object;
}) @{
	const env = globalThis as any;
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
	} else if (props.mutation === 'receiverAlias') {
		const receiver = Reflect;
		receiver[method](env, 'String', replacement);
	} else if (props.mutation === 'destructured') {
		const { set: mutate } = Reflect;
		mutate(env, 'String', replacement);
	} else if (props.mutation === 'assignment') env.String = replacement;
	else if (props.mutation === 'assign') Object.assign(env, { String: replacement });
	else if (props.mutation === 'getter') env.__defineGetter__('String', () => replacement);
	else if (props.mutation === 'prototype') {
		Reflect.setPrototypeOf(env, props.prototype);
		Reflect.deleteProperty(env, 'String');
	} else (Reflect[method] as typeof Reflect.set)(env, 'String', replacement);
	<section>
		<output title={String(props.value$)}>{String(props.value$) as string}</output>
		<input value={String(props.value$)} />
	</section>
}
