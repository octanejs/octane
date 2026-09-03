import { createElement, Suspense, use, useMemo } from 'octane';

export function TextReturn(props: { value: string }) {
	return props.value;
}

export function MixedTextReturn(props: { value: string; text: boolean }) @{
	if (props.text) return props.value;
	<strong>{props.value}</strong>
}

export function TextNested(props: { value: string }) @{
	<section>
		<TextReturn value={props.value} />
	</section>
}

export function DynamicHostText(props: { value: string }) @{
	const tag = 'div';
	<{tag}>
		{() => props.value}
	</{tag}>
}

export function PreHole(props: { value: unknown }) @{
	<pre>{props.value}</pre>
}

export function PreHoleWithSibling(props: { value: unknown }) @{
	<pre>
		{props.value}
		<span>end</span>
	</pre>
}

export function MemoArguments(props: { value: string }) @{
	const value = useMemo((input = 'default') => input, [props.value]);
	<p>{value as string}</p>
}

function ThrowingChild() {
	throw new Error('server child failed');
}

export function SuspenseFailure() @{
	<main>
		<Suspense fallback={<p>retry on client</p>}>
			<ThrowingChild />
		</Suspense>
		<aside>tail</aside>
	</main>
}

function RecoverableChild(props: { fail: boolean }) @{
	if (props.fail) throw new Error('retry this boundary');
	<span>client ready</span>
}

export function RecoverableSuspense(props: { fail: boolean }) @{
	<main>
		<Suspense fallback={<p>retry on client</p>}>
			<RecoverableChild fail={props.fail} />
		</Suspense>
		<aside>tail</aside>
	</main>
}

export function BarePending(props: { promise: Promise<string> }) @{
	const value = use(props.promise);
	<p>{value as string}</p>
}

export function PromiseDescriptor(props: { promise: Promise<string> }) {
	return createElement('div', null, props.promise);
}

export function DocumentMetadata() @{
	<html>
		<body>
			<title>Document title</title>
			<main>body</main>
		</body>
	</html>
}
