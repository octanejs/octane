import { useEffect, useState } from 'octane';

// `@{ … }` at JSX child position. Empty blocks disappear, render-only
// blocks merge into their parent template, and setup-bearing blocks own a
// render scope at their authored child position.

export function RenderOnlyChild() @{
	<div class="outer">
		<span class="lead">{'lead'}</span>
		@{
			<span class="block">{'block-body'}</span>
		}
		<span class="tail">{'tail'}</span>
	</div>
}

// Two `@{ }` siblings — each renders its own JSX root. Order is preserved
// (relies on the source-order anchor work landed earlier in tsrx-migration).
export function MultipleBlocks() @{
	<ul>
		@{
			<li class="a">{'one'}</li>
		}
		@{
			<li class="b">{'two'}</li>
		}
		@{
			<li class="c">{'three'}</li>
		}
	</ul>
}

// Empty `@{}` at child position is silently dropped — exercised here by
// placing one between two static siblings and asserting they sit adjacent.
export function EmptyBlockDropped() @{
	<div>
		<span class="before">{'before'}</span>
		@{}
		<span class="after">{'after'}</span>
	</div>
}

export function SetupBearingChild(props: { label: string }) @{
	<section class="setup-children">
		<span id="setup-before">{'before'}</span>
		@{
			let name = props.label;
			const [count, setCount] = useState(0);

			<button id="setup-action" onClick={() => setCount(count + 1)}>{name + ':' + count}</button>
		}
		<span id="setup-after">{'after'}</span>
	</section>
}

export function ConditionalHooksInSetupBearingChild(props: {
	enabled: boolean;
	log: string[];
}) @{
	<section id="conditional-hook-child">@{
		let label = 'disabled';
		let increment = () => {};

		if (props.enabled) {
			const [count, setCount] = useState(0);
			useEffect(() => {
				props.log.push('create:' + count);
				return () => {
					props.log.push('cleanup:' + count);
				};
			}, [count, props.log]);
			label = 'count:' + count;
			increment = () => setCount(count + 1);
		}

		<button id="conditional-hook-action" onClick={increment}>{label}</button>
	}</section>
}

export function TemplateIfHooksInSetupBearingChild() @{
	<section id="template-if-hook-child">@{
		const [show, setShow] = useState(true);

		<div>
			<button id="template-if-toggle" onClick={() => setShow(!show)}>
				{show ? 'hide' : 'show'}
			</button>
			@if (show) {
				const [count, setCount] = useState(0);
				<button id="template-if-action" onClick={() => setCount(count + 1)}>
					{'count:' + count}
				</button>
			}
		</div>
	}</section>
}

export function ExplicitSetupBearingChild(props: { label: string }) @{
	<section class="setup-children">
		<span id="setup-before">{'before'}</span>
		{() => @{
			const [count, setCount] = useState(0);

			<button id="setup-action" onClick={() => setCount(count + 1)}>
				{props.label + ':' + count}
			</button>
		}}
		<span id="setup-after">{'after'}</span>
	</section>
}

export function ReturnedSetupBearingChild(props: { label: string }) {
	return <section class="setup-children">
		<span id="setup-before">{'before'}</span>
		@{
			const [count, setCount] = useState(0);

			<button id="setup-action" onClick={() => setCount(count + 1)}>
				{props.label + ':' + count}
			</button>
		}
		<span id="setup-after">{'after'}</span>
	</section>;
}

export function StoredSetupBearingChild(props: { label: string }) @{
	const content = <section class="setup-children">
		<span id="setup-before">{'before'}</span>
		@{
			const [count, setCount] = useState(0);

			<button id="setup-action" onClick={() => setCount(count + 1)}>
				{props.label + ':' + count}
			</button>
		}
		<span id="setup-after">{'after'}</span>
	</section>;

	<main>{content}</main>
}

export function CodeOnlyChild(props: {
	label: string;
	observe: (value: string) => void;
}) @{
	<section id="code-only-children">
		<span id="code-only-before">{'before'}</span>
		@{
			props.observe(props.label);
		}
		<span id="code-only-after">{'after'}</span>
	</section>
}

export function SvgSetupBearingChild(props: { radius: number }) @{
	<svg id="setup-svg">@{
		const diameter = props.radius * 2;
		<circle id="setup-circle" r={props.radius} data-diameter={diameter} />
	}</svg>
}
