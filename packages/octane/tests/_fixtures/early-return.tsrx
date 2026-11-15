import { memo, useState, withSlot, type OctaneNode } from 'octane';

// Simple early-return: render nothing when condition holds.
// Old syntax: `if (props.hide) return;` before the JSX.
// New syntax: gate the JSX with `@if (!cond)`.
export function Maybe(props) @{
	<>
		@if (!props.hide) {
			<p class="shown">{'shown'}</p>
		}
	</>
}

// Two early-returns in sequence. Each gates the remainder.
// Old syntax interleaved JSX with `if return`. New syntax nests gates so each
// successive JSX is reached only when no prior `stop*` was set.
export function Multi(props) @{
	<>
		<p class="hello">{'hello'}</p>
		@if (!props.stopA) {
			<>
				<p class="world">{'world'}</p>
				@if (!props.stopB) {
					<p class="done">{'done'}</p>
				}
			</>
		}
	</>
}

// Early return with toggle state — re-renders should re-evaluate.
export function Toggleable() @{
	const [show, setShow] = useState(true);
	<>
		<button onClick={() => setShow(!show)}>{'toggle'}</button>
		@if (show) {
			<p class="content">{'content'}</p>
		}
	</>
}

// Early-return inside a no-braces if (semantically same as Maybe).
export function NoBraces(props) @{
	<>
		@if (!props.hide) {
			<p class="visible">{'visible'}</p>
		}
	</>
}

export function MutableCapture({ off }: { off: boolean }) {
	let item: OctaneNode = <i />;
	const read = () => item;
	if (off) return <em />;
	item = null;
	return (
		<span>
			{item}
			{read()}
		</span>
	);
}

export const cell = useState;

export function AliasedState({ hide }: { hide: boolean }) @{
	if (hide) return null;
	const [value, setValue, getValue] = cell(1);
	const [other] = cell(10);
	<button onClick={() => setValue(getValue() + 1)}>{value + ':' + other}</button>
}

export function ManualStateAlias() @{
	const slot = Symbol.for('early-return:manual-state');
	const [value] = cell(slot);
	const path = Symbol.for('early-return:manual-path');
	const first = withSlot(path, () => cell(1)[0]);
	const second = withSlot(path, () => cell(10)[0]);
	<output>{typeof value + ':' + first + ':' + second}</output>
}

export function ShadowedStateAlias() @{
	function cell(value: number, _slot?: unknown) {
		return [value, arguments.length];
	}
	const [value, count] = cell(1);
	<output>{value + ':' + count}</output>
}

// The named and memoized inner bodies own state separately from their parent.
export function NestedAliasedState({ hide }: { hide: boolean }) @{
	function Named({ hide }: { hide: boolean }) @{
		if (hide) return null;
		const [value, setValue, getValue] = cell(1);
		<button onClick={() => setValue(getValue() + 1)}>{value as number}</button>
	}
	const Memoized = memo(function Memoized({ hide }: { hide: boolean }) @{
		if (hide) return null;
		const [value, setValue, getValue] = cell(10);
		<button onClick={() => setValue(getValue() + 1)}>{value as number}</button>
	});
	<main>
		<Named hide={hide} />
		<Memoized hide={hide} />
	</main>
}

const StaticMemoized = memo(function StaticMemoized() @{
	const [value, setValue, getValue] = cell(10);
	<button onClick={() => setValue(getValue() + 1)}>{value as number}</button>
});

export function NestedAliasedExpressions() @{
	const Arrow = () => @{
		const [value, setValue, getValue] = cell(1);
		<button onClick={() => setValue(getValue() + 1)}>{value as number}</button>
	};
	<main>
		<Arrow />
		<StaticMemoized />
	</main>
}
