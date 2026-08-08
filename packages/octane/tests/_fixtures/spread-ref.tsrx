import { useState } from 'octane';

// A `ref` arriving through a spread (`{...props.attrs}`) must behave exactly like
// a direct `ref={}`: attach on mount, run a callback's React-19 cleanup-return
// (or null) on detach, clear object refs, and detach on unmount. SpreadToggle
// exercises conditional mount/unmount via @if; SpreadDirect keeps the element
// mounted so the spread's ref value can change across renders.

interface SpreadProps {
	attrs: Record<string, unknown>;
}

interface SharedHostProps extends SpreadProps {
	className: string;
	label: string;
	secondary: string;
	onClick: () => void;
	onKeyDown: () => void;
	shown: boolean;
}

export function SpreadToggle(props: SpreadProps) @{
	const [shown, setShown] = useState(true);
	<div>
		<button id="toggle" onClick={() => setShown(!shown)}>{'t'}</button>
		@if (shown) {
			<span id="target" {...props.attrs}>{'x'}</span>
		}
	</div>
}

export function SpreadDirect(props: SpreadProps) @{
	<span id="target" {...props.attrs}>{'x'}</span>
}

export function SpreadSharedHost(props: SharedHostProps) @{
	<section
		{...props.attrs}
		class={props.className}
		aria-label={props.label}
		onClick={props.onClick}
		onKeyDown={props.onKeyDown}
	>
		<span class="secondary" title={props.secondary}>{'secondary'}</span>
		@if (props.shown) {
			<span class="detail">{props.label as string}</span>
		}
	</section>
}
