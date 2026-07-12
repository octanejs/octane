// Fixtures for conformance/event-listener.test.ts — port of
// react-dom/src/__tests__/ReactDOMEventListener-test.js. Kept minimal: each
// component models exactly the tree shape one React case dispatches into.
import { useState } from 'octane';

// Nested-root propagation (:32/:65) — one div per root, handler + name via props.
export function RootDiv(props: { name: string; onOut: (e: Event) => void }) @{
	<div class={props.name} onMouseOut={props.onOut}>{props.name}</div>
}

// :106 — the clicked element is REMOVED by the update its own handler schedules.
export function DisappearingButton() @{
	const [clicked, setClicked] = useState(false);
	<div class="dwrap">
		@if (clicked) {
			<span>{'clicked!'}</span>
		} @else {
			<button onClick={() => setClicked(true)}>{'not yet clicked'}</button>
		}
	</div>
}

// :157/:231 — cross-root batching. Child owns state; the setter escapes via
// `register` so the PARENT ROOT's handler can schedule into the child root.
export function BatchChild(props: {
	register: (set: (v: string) => void) => void;
	onEvent: () => void;
}) @{
	const [state, setState] = useState('Child');
	props.register(setState);
	<span class="child-span" onClick={props.onEvent} onMouseOut={props.onEvent}>{state}</span>
}

export function BatchParent(props: { onEvent: () => void }) @{
	<section
		class="parent-section"
		onClick={props.onEvent}
		onMouseOut={props.onEvent}
	>{'Parent'}</section>
}

// :295 — single tree, handler on an ancestor, dispatch on the inner node.
export function SingleTreeDedup(props: { onOut: (e: Event) => void }) @{
	<div>
		<div class="outer" onMouseOut={props.onOut}>
			<div class="inner">{'Inner'}</div>
		</div>
	</div>
}

// :334/:400 — form + input, with an interim non-octane div a test can put a
// NATIVE stopPropagation handler on.
export function FormEvents(props: {
	onInvalid: (e: Event) => void;
	onReset: (e: Event) => void;
	onSubmit: (e: Event) => void;
}) @{
	<div class="interim">
		<form class="frm" onReset={props.onReset} onSubmit={props.onSubmit}>
			<input class="inp" onInvalid={props.onInvalid} />
		</form>
	</div>
}

// :446/:607 — direct handlers for events the browser fires WITHOUT bubbling.
export function MediaLoadTargets(props: { log: (s: string) => void }) @{
	<div>
		<img class="img" onLoadStart={() => props.log('img-loadstart')} />
		<video class="video" onLoadStart={() => props.log('video-loadstart')}></video>
		<embed class="embed" onLoad={() => props.log('embed-load')} />
	</div>
}

// :706/:733/:767 — non-bubbling events with a handler on BOTH the target and
// an ancestor. Octane capture-delegates these so both fire like React.
export function NonBubblingPairs(props: { log: (s: string) => void }) @{
	<div
		class="anc"
		onToggle={() => props.log('anc-toggle')}
		onCancel={() => props.log('anc-cancel')}
		onClose={() => props.log('anc-close')}
		onPlay={() => props.log('anc-play')}
	>
		<details class="det" onToggle={() => props.log('det-toggle')}>{'d'}</details>
		<dialog
			class="dlg"
			onCancel={() => props.log('dlg-cancel')}
			onClose={() => props.log('dlg-close')}
		></dialog>
		<video class="vid" onPlay={() => props.log('vid-play')}></video>
	</div>
}

// :638/:669 — ancestor handlers only; the targets deliberately have none.
export function AncestorOnlyHandlers(props: { log: (s: string) => void }) @{
	<div
		class="anc"
		onPlay={() => props.log('anc-play')}
		onCancel={() => props.log('anc-cancel')}
		onClose={() => props.log('anc-close')}
	>
		<video class="vid"></video>
		<dialog class="dlg"></dialog>
	</div>
}

// :794 — invalid doesn't bubble natively, but a form's onInvalid observes its
// controls' invalid events (octane deliberately walks ancestors for it).
export function InvalidForm(props: { log: (s: string) => void }) @{
	<form class="frm" onInvalid={() => props.log('form-invalid')}>
		<input class="inp" onInvalid={() => props.log('input-invalid')} />
	</form>
}

// :822 — capture handlers for a non-bubbling event (capture reaches the root
// even when the event doesn't bubble).
export function PlayCaptureTree(props: { log: (s: string) => void }) @{
	<div
		class="outer"
		onPlayCapture={(e) => props.log('cap:' + (e.currentTarget as Element).className)}
	>
		<div
			class="mid"
			onPlayCapture={(e) => props.log('cap:' + (e.currentTarget as Element).className)}
		>
			<div
				class="inner"
				onPlayCapture={(e) => props.log('cap:' + (e.currentTarget as Element).className)}
			>{'x'}</div>
		</div>
	</div>
}

// :875 — scroll/scrollend, capture + bubble on every level.
export function ScrollTreeFull(props: { log: (s: string) => void }) @{
	<div
		class="grand"
		onScroll={(e) => props.log('onScroll:bubble:' + (e.currentTarget as Element).className)}
		onScrollCapture={(e) => props.log('onScroll:capture:' + (e.currentTarget as Element).className)}
		onScrollEnd={(e) => props.log('onScrollEnd:bubble:' + (e.currentTarget as Element).className)}
		onScrollEndCapture={(e) => props.log(
			'onScrollEnd:capture:' + (e.currentTarget as Element).className,
		)}
	>
		<div
			class="parent"
			onScroll={(e) => props.log('onScroll:bubble:' + (e.currentTarget as Element).className)}
			onScrollCapture={(e) => props.log(
				'onScroll:capture:' + (e.currentTarget as Element).className,
			)}
			onScrollEnd={(e) => props.log('onScrollEnd:bubble:' + (e.currentTarget as Element).className)}
			onScrollEndCapture={(e) => props.log(
				'onScrollEnd:capture:' + (e.currentTarget as Element).className,
			)}
		>
			<div
				class="child"
				onScroll={(e) => props.log('onScroll:bubble:' + (e.currentTarget as Element).className)}
				onScrollCapture={(e) => props.log(
					'onScroll:capture:' + (e.currentTarget as Element).className,
				)}
				onScrollEnd={(e) => props.log(
					'onScrollEnd:bubble:' + (e.currentTarget as Element).className,
				)}
				onScrollEndCapture={(e) => props.log(
					'onScrollEnd:capture:' + (e.currentTarget as Element).className,
				)}
			>{'c'}</div>
		</div>
	</div>
}

// :951 — same tree but the scrolled child deliberately has NO handlers.
export function ScrollTreeNoChild(props: { log: (s: string) => void }) @{
	<div
		class="grand"
		onScroll={(e) => props.log('onScroll:bubble:' + (e.currentTarget as Element).className)}
		onScrollCapture={(e) => props.log('onScroll:capture:' + (e.currentTarget as Element).className)}
		onScrollEnd={(e) => props.log('onScrollEnd:bubble:' + (e.currentTarget as Element).className)}
		onScrollEndCapture={(e) => props.log(
			'onScrollEnd:capture:' + (e.currentTarget as Element).className,
		)}
	>
		<div
			class="parent"
			onScroll={(e) => props.log('onScroll:bubble:' + (e.currentTarget as Element).className)}
			onScrollCapture={(e) => props.log(
				'onScroll:capture:' + (e.currentTarget as Element).className,
			)}
			onScrollEnd={(e) => props.log('onScrollEnd:bubble:' + (e.currentTarget as Element).className)}
			onScrollEndCapture={(e) => props.log(
				'onScrollEnd:capture:' + (e.currentTarget as Element).className,
			)}
		>
			<div class="child">{'c'}</div>
		</div>
	</div>
}

// :1013 — handlers arrive/leave via props so a test can attach, refresh
// (dedup), and detach them across updates on the SAME elements.
export function ScrollSubscribe(props: {
	onScroll?: (e: Event) => void;
	onScrollCapture?: (e: Event) => void;
	onScrollEnd?: (e: Event) => void;
	onScrollEndCapture?: (e: Event) => void;
}) @{
	<div
		class="grand"
		onScroll={props.onScroll}
		onScrollCapture={props.onScrollCapture}
		onScrollEnd={props.onScrollEnd}
		onScrollEndCapture={props.onScrollEndCapture}
	>
		<div
			class="parent"
			onScroll={props.onScroll}
			onScrollCapture={props.onScrollCapture}
			onScrollEnd={props.onScrollEnd}
			onScrollEndCapture={props.onScrollEndCapture}
		>
			<div
				class="child"
				onScroll={props.onScroll}
				onScrollCapture={props.onScrollCapture}
				onScrollEnd={props.onScrollEnd}
				onScrollEndCapture={props.onScrollEndCapture}
			>{'c'}</div>
		</div>
	</div>
}
