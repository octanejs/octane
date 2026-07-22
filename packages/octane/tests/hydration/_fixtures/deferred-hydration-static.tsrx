import { Hydrate, useId } from 'octane';
import { never } from 'octane/hydration';

function StaticLeaf(props) @{
	const id = useId();
	props.onRender?.();
	<nav id="static-navigation" data-runtime-id={id}>
		<a href="/">{'Home'}</a>
		<a href="/about">{'About'}</a>
	</nav>
}

function LiveSibling(props) @{
	const id = useId();
	<button
		id="live-sibling"
		data-runtime-id={id}
		onClick={() => props.onClick?.(id)}
	>{props.label as string}</button>
}

export function PermanentStaticHtml(props) @{
	<main id="static-layout">
		<Hydrate split={false} when={never()}>
			<aside id="static-sidebar">
				<StaticLeaf onRender={props.onStaticRender} />
			</aside>
			<span id="static-tail">{'Static tail'}</span>
		</Hydrate>
		<LiveSibling label={props.label} onClick={props.onLiveClick} />
	</main>
}

export function EmptyPermanentStatic(props) @{
	<main id="empty-static-layout">
		<Hydrate split={false} when={never()} />
		<LiveSibling label="Live after empty range" onClick={props.onLiveClick} />
	</main>
}

export function NestedPermanentStatic() @{
	<main id="nested-static-layout">
		<Hydrate split={false} when={never()}>
			<section id="outer-static-content">
				<Hydrate split={false} when={never()}>
					<span id="inner-static-content">{'Nested static content'}</span>
				</Hydrate>
			</section>
		</Hydrate>
	</main>
}

export function NestedInteractiveHydrate(props) @{
	<Hydrate split={false} when={props.when}>
		<button id="static-nested-native-action">{'Native static action'}</button>
	</Hydrate>
}

export function PermanentStaticWithNestedHydrate(props) @{
	<main id="static-nested-hydrate-layout">
		<Hydrate split={false} when={never()}>
			<props.Child when={props.when} />
		</Hydrate>
	</main>
}

export function PermanentStaticForeign() @{
	<>
		<svg id="static-svg" viewBox="0 0 20 20">
			<Hydrate split={false} when={never()}>
				<g id="static-svg-group">
					<path d="M0 0h20v20H0z" />
				</g>
			</Hydrate>
		</svg>
		<math id="static-math">
			<Hydrate split={false} when={never()}>
				<mrow id="static-math-row">
					<mi>{'x'}</mi>
				</mrow>
			</Hydrate>
		</math>
	</>
}

export function PermanentStaticInsideDeferred(props) @{
	<main id="nested-deferred-static-layout">
		<Hydrate split={false} when={props.when}>
			<section id="nested-deferred-content">
				<Hydrate split={false} when={never()}>
					<StaticLeaf onRender={props.onStaticRender} />
				</Hydrate>
				<LiveSibling label="Inner live sibling" onClick={props.onInnerLiveClick} />
			</section>
		</Hydrate>
		<LiveSibling label="Outer live sibling" onClick={props.onOuterLiveClick} />
	</main>
}

function ExternallyPatchedRange(props) @{
	props.onRender?.();
	<div
		id="server-owned-range"
		dangerouslySetInnerHTML={{
			__html: props.html,
		}}
	/>
}

export function PermanentExternallyPatched(props) @{
	<section id="server-owned-layout">
		<Hydrate split={false} when={never()}>
			<ExternallyPatchedRange html={props.html} onRender={props.onStaticRender} />
		</Hydrate>
		<span id="server-owned-live-label">{props.label as string}</span>
	</section>
}
