import { createElement, Suspense, use, useMemo, type ComponentBody } from 'octane';

export function TextReturn(props: { value: string }) {
	return props.value;
}

export function MixedTextReturn(props: { value: string; text: boolean }) @{
	if (props.text) return props.value;
	<strong>{props.value}</strong>
}

type ListItem = { id: string; value: string; text: boolean };
type ListGroup = { id: string; label: string; items: ListItem[] };

export function NestedRenderableList(props: {
	groups: ListGroup[];
	onSelect?: (id: string) => void;
}) @{
	<section>
		@for (const group of props.groups; key group.id) {
			<article data-group={group.id}>
				<h2>{group.label as string}</h2>
				<div>
					@for (const item of group.items; key item.id) {
						<>
							<button data-item={item.id} onClick={() => props.onSelect?.(item.id)}>
								<MixedTextReturn value={item.value} text={item.text} />
							</button>
							<small data-caption={item.id}>{item.value as string}</small>
						</>
					} @empty {
						<p data-empty="items">{group.label as string}</p>
					}
				</div>
			</article>
		} @empty {
			<p data-empty="groups">No groups</p>
		}
	</section>
}

export function ForwardedLoopChildren(props: { Wrapper: ComponentBody; groups: ListGroup[] }) @{
	<div>
		@for (const group of props.groups; key group.id) {
			<props.Wrapper>
				@for (const item of group.items; key item.id) {
					<strong>{item.value as string}</strong>
				} @empty {
					<em>{group.label as string}</em>
				}
			</props.Wrapper>
		} @empty {
			<props.Wrapper>
				<em>No groups</em>
			</props.Wrapper>
		}
	</div>
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
