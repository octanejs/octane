import { Hydrate, useId } from 'octane';
import { never } from 'octane/hydration';

function StaticHtml(props: { onRender?: () => void }) @{
	const id = useId();
	props.onRender?.();
	<article id="static-browser-article" data-static-id={id}>
		<div id="externally-owned-range">
			<span id="server-owned-initial">Server-owned initial content</span>
		</div>
	</article>
}

function LiveAction(props: { label: string; onClick?: (id: string) => void }) @{
	const id = useId();
	<button
		id="static-browser-live-action"
		data-runtime-id={id}
		onClick={() => props.onClick?.(id)}
	>{props.label}</button>
}

export function PermanentStaticBrowser(props: {
	label: string;
	onStaticRender?: () => void;
	onLiveClick?: (id: string) => void;
}) @{
	<main id="static-browser-layout">
		<Hydrate split={false} when={never()}>
			<StaticHtml onRender={props.onStaticRender} />
		</Hydrate>
		<svg id="static-browser-svg" viewBox="0 0 10 10">
			<Hydrate split={false} when={never()}>
				<g id="static-browser-svg-group">
					<circle cx="5" cy="5" r="4" />
				</g>
			</Hydrate>
		</svg>
		<math id="static-browser-math">
			<Hydrate split={false} when={never()}>
				<mrow id="static-browser-math-row">
					<mi>{'x'}</mi>
				</mrow>
			</Hydrate>
		</math>
		<LiveAction label={props.label} onClick={props.onLiveClick} />
	</main>
}
