import { useState, createContext, use, useLayoutEffect } from 'octane';

export function Label(props) @{
	<span class="lbl">{props.text as string}</span>
}

export function Greeting(props) @{
	<div>
		<Label text={props.name} />
	</div>
}

// Context test setup.
export const Theme = createContext('light');

export function ThemeReader() @{
	const theme = use(Theme);
	<span class="theme">{theme as string}</span>
}

export function App() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={() => setN(n + 1)}>{n as string}</button>
		<Theme value={n % 2 === 0 ? 'light' : 'dark'}>
			<ThemeReader />
		</Theme>
	</div>
}

// Nested Providers — inner overrides outer.
export function Nested() @{
	<div>
		<Theme value="outer">
			<div class="o">
				<ThemeReader />
			</div>
			<Theme value="inner">
				<div class="i">
					<ThemeReader />
				</div>
			</Theme>
		</Theme>
	</div>
}

// No Provider — falls back to default.
export function DefaultOnly() @{
	<div>
		<ThemeReader />
	</div>
}

// Key-driven remount fixtures: KeyHost wraps a Counter that owns its own
// useState + useEffect. The host passes `props.k` as the component slot's
// key — changing it triggers a fresh Block (state resets, cleanup fires,
// mount effect runs again). Same key + new props re-renders in place.
import { useEffect } from 'octane';

export let mountCount = 0;
export let cleanupCount = 0;
export function resetKeyCounters() {
	mountCount = 0;
	cleanupCount = 0;
}

export function Counter(props) @{
	const [n, setN] = useState(0);
	useEffect(() => {
		mountCount++;
		return () => {
			cleanupCount++;
		};
	}, []);
	<div class="kh">
		<span class="label">{props.label ?? ('' as string)}</span>
		<span class="count">{n as string}</span>
		<button class="inc" onClick={() => setN(n + 1)}>
			{'+'}
		</button>
	</div>
}

export function KeyHost(props) @{
	<Counter key={props.k} label={props.label} />
}

// Arrow-function component (`const X = (props) => @{…}`) — the compiler
// normalizes this to FunctionDeclaration form.
export const ArrowComp = (props) => @{
	<div id="arrow">{`hi ${props.who}`}</div>
};

// Arrow component with a fragment body + nested components (mixed shapes).
export const ArrowFragHost = () => @{
	<>
		<ArrowComp who="arrow" />
		<Label text="sibling" />
	</>
};

function SharedStaticIcon() {
	return (
		<svg class="shared-icon" viewBox="0 0 10 10" aria-hidden="true">
			<title>Shared icon</title>
			<path d="M1 1L9 9" />
		</svg>
	);
}

function SharedStaticLabel() {
	return <span class="shared-label">Shared label</span>;
}

export function useConnectedElementEffect(report: (event: string) => void) {
	useLayoutEffect(() => {
		report('connected');
		return () => report('cleanup');
	}, []);
}

function StaticCustomElement() {
	return <octane-connected-effect-probe />;
}

export function ConnectedCustomElementParent(props: { tick: string }) @{
	<main>
		<StaticCustomElement />
		<span class="connected-tick">{props.tick as string}</span>
	</main>
}

function SharedReturnedRoot() @{
	<SharedStaticIcon />
}

export function SharedReturnedChildren(props: {
	show: boolean;
	rows: string[];
	selected: string;
	tick: number;
}) @{
	<main class="shared-children" data-tick={props.tick}>
		<div class="shared-direct">
			<SharedStaticIcon />
			<SharedStaticLabel />
		</div>
		<div class="shared-if">
			@if (props.show) {
				<SharedStaticIcon />
			}
		</div>
		<div class="shared-rows">
			@for (const row of props.rows; key row) {
				<article data-row={row}>
					<SharedStaticIcon />
				</article>
			}
		</div>
		<div class="shared-switch">
			@switch (props.selected) {
				@case 'icon': {
					<SharedStaticIcon />
				}
				@default: {
					<SharedStaticLabel />
				}
			}
		</div>
		<div class="shared-sole">
			<SharedReturnedRoot />
		</div>
		<input class="shared-draft" defaultValue="seed" />
	</main>
}

function ShadowedStaticIcon() {
	return <em class="module-icon">Module icon</em>;
}

function LocallyShadowedReturnedChild() @{
	const ShadowedStaticIcon = () => <em class="local-icon">Local icon</em>;
	<aside>
		<ShadowedStaticIcon />
	</aside>
}

export function ShadowedReturnedChild() @{
	<section>
		<ShadowedStaticIcon />
		<LocallyShadowedReturnedChild />
	</section>
}

function EscapedStaticLabel() {
	return <span class="escaped-label">Escaped label</span>;
}

export function escapedReturnedDescriptor() {
	return <EscapedStaticLabel />;
}

function EscapedReturnedNeighbor() {
	return (
		<aside>
			<EscapedStaticLabel />
		</aside>
	);
}

export function EscapedReturnedChild() @{
	<section>
		<EscapedStaticLabel />
		<EscapedReturnedNeighbor />
	</section>
}

interface ReturnedRetryProps {
	promise: Promise<string>;
	failed?: boolean;
}

function ReturnedRetryValue(props: ReturnedRetryProps) @{
	if (props.failed) throw new Error('retry failed');
	const value = use(props.promise);
	<p class="retry-value">{value as string}</p>
}

export function ReturnedRetryBoundary(props: ReturnedRetryProps) @{
	<main>
		<input class="retry-sibling-draft" defaultValue="sibling seed" />
		@try {
			<section class="retry-content">
				<SharedStaticIcon />
				<ReturnedRetryValue promise={props.promise} failed={props.failed} />
				<SharedStaticLabel />
				<input class="retry-draft" defaultValue="primary seed" />
			</section>
		} @pending {
			<p class="retry-pending">Loading</p>
		} @catch (error: unknown, reset: () => void) {
			<button class="retry-reset" onClick={reset}>
				{'Retry: ' + (error as Error).message}
			</button>
		}
	</main>
}

function ParameterIcon() {
	return <span class="parameter-escaped-icon">parameter icon</span>;
}

class ReturnedIconHolder {
	constructor(public value = ParameterIcon()) {}
}

const heldParameterIcon = new ReturnedIconHolder();

export function readParameterReturnedDescriptor() {
	return heldParameterIcon.value;
}

export function ParameterReturnedChild() @{
	<main>
		<ParameterIcon />
	</main>
}

export function ForwardReturnedCard() {
	return (
		<div>
			<ForwardReturnedIcon />
		</div>
	);
}

function ForwardReturnedIcon() {
	return <span class="forward-escaped-icon">forward icon</span>;
}

export function ForwardReturnedChild() @{
	<main>
		<ForwardReturnedIcon />
	</main>
}
