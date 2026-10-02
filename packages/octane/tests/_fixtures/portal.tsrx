import {
	useState,
	createContext,
	use,
	createPortal,
	startTransition,
	useEffect,
	useLayoutEffect,
} from 'octane';

export const Theme = createContext('light');

export type PortalPlacementMode = 'portal' | 'null' | 'inline';

export interface PortalPlacementControls {
	setMode(mode: PortalPlacementMode): void;
	rerender(): void;
}

interface PortalTargetProps {
	target: Element;
}

interface PortalPlacementProps extends PortalTargetProps {
	initialMode: PortalPlacementMode;
	bind(controls: PortalPlacementControls): void;
}

const PlacementMode = createContext<PortalPlacementMode>('portal');

export function PortalledChild() @{
	const theme = use(Theme);
	<span class="child">{theme as string}</span>
}

// React-shape: createPortal(children, target) at JSX child position.
// The compiler recognises the literal call and lowers to a `portal()` runtime
// call with no descriptor allocation.
//
// The sub-template that used to be `<tsrx>…</tsrx>` is now an arrow whose
// body is a `@{}` block (an `ArrowFunctionExpression` with a `JSXCodeBlock`
// body). Same compile-time semantics: the body is rendered inside the portal
// target rather than at the call site.
export function Modal(props) @{
	<section class="modal-anchor">
		{createPortal(() => @{
			<div class="modal">
				<PortalledChild />
			</div>
		}, props.target)}
	</section>
}

export function App(props) @{
	const [open, setOpen] = useState(true);
	<div class="app-root">
		<button onClick={() => setOpen(!open)}>{'toggle'}</button>
		<Theme value="dark">
			@if (open) {
				<Modal target={props.target} />
			}
		</Theme>
	</div>
}

// React's most common authoring shape: an INLINE element (no arrow, no @{})
// as the portal body. The compiler hoists the element into a sub-template
// render fn (same lowering as an @if branch body) — previously this printed
// the raw JSX into the emitted portal() call, producing invalid output.
export function InlineModal(props) @{
	const [n, setN] = useState(0);
	<section class="inline-anchor">
		<button id="bump" onClick={() => setN(n + 1)}>
			{'bump'}
		</button>
		{createPortal(<div class="inline-modal">{'count:' + n}</div>, props.target)}
	</section>
}

function PortalOwnedStateChild() {
	const [updated, setUpdated] = useState(false);
	if (updated) {
		return <section data-slot="portal-owned-child">{'updated'}</section>;
	}
	return (
		<button data-slot="portal-owned-child" onClick={() => setUpdated(true)}>
			{'initial'}
		</button>
	);
}

export function PortalOwnedStateApp(props: PortalTargetProps) @{
	<div data-slot="portal-owner">{createPortal(<PortalOwnedStateChild />, props.target)}</div>
}

function PlacementFirstChild(props: PortalTargetProps) {
	const mode = use(PlacementMode);
	if (mode === 'portal') {
		return createPortal(<div data-slot="portalled">{'PORTALLED'}</div>, props.target);
	}
	if (mode === 'null') return null;
	return <div data-slot="first">{'FIRST'}</div>;
}

export function PortalPlacementApp(props: PortalPlacementProps) @{
	const [mode, setMode] = useState<PortalPlacementMode>(props.initialMode);
	const [tick, setTick] = useState(0);
	props.bind({
		setMode,
		rerender: () => setTick(tick + 1),
	});
	<PlacementMode value={mode}>
		<div data-slot="parent" data-tick={tick as string}>
			<PlacementFirstChild target={props.target} />
			<main data-slot="second">{'SECOND'}</main>
			<aside data-slot="third">{'THIRD'}</aside>
		</div>
	</PlacementMode>
}

export interface KeyedPortalControls {
	setId(id: number): void;
	transitionTo(id: number): void;
}

interface KeyedPortalProps extends PortalTargetProps {
	bind(controls: KeyedPortalControls): void;
	log(entry: string): void;
	load?: (id: number) => Promise<string>;
}

function KeyedDialog(props: { id: number; log(entry: string): void }) @{
	useLayoutEffect(() => {
		props.log('layout:' + props.id);
		return () => props.log('layout-cleanup:' + props.id);
	}, []);
	useEffect(() => {
		props.log('passive:' + props.id);
		return () => props.log('passive-cleanup:' + props.id);
	}, []);
	<button class="keyed-dialog" data-id={String(props.id)}>
		{'dialog ' + props.id}
	</button>
}

function KeyedStatus(props: { id: number; load(id: number): Promise<string> }) @{
	const status = use(props.load(props.id));
	<span class="keyed-status">{status as string}</span>
}

function KeyedPortalOwner(props: KeyedPortalProps) @{
	const [id, setId] = useState(0);
	props.bind({ setId, transitionTo: (next) => startTransition(() => setId(next)) });
	<div
		class="keyed-owner"
		onClick={(event: MouseEvent) => {
			props.log('click:' + (event.target as Element).getAttribute('data-id'));
		}}
	>
		{createPortal(<KeyedDialog id={id} log={props.log} />, props.target, id)}
		@if (props.load !== undefined) {
			<KeyedStatus id={id} load={props.load} />
		}
	</div>
}

// The portal's third argument is its key: every id change replaces the whole
// portal subtree while its owner stays mounted. With `load`, a sibling after
// the portal can suspend a transition that has already rebuilt it.
export function KeyedPortalApp(props: KeyedPortalProps) @{
	<div>
		@try {
			<KeyedPortalOwner {...props} />
		} @pending {
			<span class="keyed-fallback">{'loading'}</span>
		}
	</div>
}
