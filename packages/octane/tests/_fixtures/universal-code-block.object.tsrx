import { useEffect, useState } from 'octane';

// `@{ … }` at JSX child position on a universal renderer. Empty blocks
// disappear, render-only blocks merge into the parent template, and
// setup-bearing blocks own a persistent child scope at their authored
// sibling position — matching the DOM childSlot contract.

export function RenderOnlyChild() @{
	<scene>
		<node name="lead" value="lead" />
		@{
			<node name="block" value="block-body" />
		}
		<node name="tail" value="tail" />
	</scene>
}

export function EmptyBlockDropped() @{
	<scene>
		<node name="before" value="before" />
		@{}
		<node name="after" value="after" />
	</scene>
}

export function SetupBearingChild(props: { label: string; value: number }) @{
	<scene>
		<node name="setup-before" value="before" />
		@{
			const doubled = props.value * 2;
			const [count, setCount] = useState(0);
			<node
				name="setup-action"
				value={`${props.label}:${doubled}:${count}`}
				onPress={() => setCount(count + 1)}
			/>
		}
		<node name="setup-after" value="after" />
	</scene>
}

// `{() => @{ … }}` is the explicit scoped-child spelling; it must lower to
// the same scoped block as bare `@{ … }`.
export function ExplicitSetupBearingChild(props: { label: string }) @{
	<scene>
		{() => @{
			const [count, setCount] = useState(0);
			<node
				name="explicit-action"
				value={`${props.label}:${count}`}
				onPress={() => setCount(count + 1)}
			/>
		}}
	</scene>
}

// `@{ … }` inside a control-flow body previously leaked into the emitted
// module as a raw statement and failed printing.
export function BlockInsideForBody(props: { items: readonly { id: string; qty: number }[] }) @{
	<scene>
		@for (const item of props.items; key item.id) {
			@{
				const summary = `${item.id} x${item.qty}`;
				<node name={item.id} value={summary} />
			}
		}
	</scene>
}

export function BlockInsideIfBody(props: { show: boolean; label: string }) @{
	<scene>
		@if (props.show) {
			@{
				const greeting = `hello ${props.label}`;
				<node name="if-block" value={greeting} />
			}
		}
	</scene>
}

export function ScopedEffectChild(props: { log: (entry: string) => void }) @{
	<scene>@{
		const [count, setCount] = useState(0);
		useEffect(() => {
			props.log(`create:${count}`);
			return () => props.log(`cleanup:${count}`);
		}, [count]);
		<node name="effect-action" value={`count:${count}`} onPress={() => setCount(count + 1)} />
	}</scene>
}
