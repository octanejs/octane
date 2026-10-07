import { createContext, createPortal, useContext, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';

// The svg-dashboard shape: the owner passes deferred JSX values down as props,
// and the shell re-renders on its own state with those identical values. The
// shell's child slots classify each value on every one of its renders, while
// keys, context reads, and the portal body still resolve in its scope.

export const ScopedPropsTone = createContext('plain');

function Counter({ label }: { label: string }) @{
	const [count, setCount] = useState(0);
	<button class="counter" data-label={label} onClick={() => setCount((value) => value + 1)}>
		{(label + ':' + count) as string}
	</button>
}

function Toned({ label }: { label: string }) @{
	const tone = useContext(ScopedPropsTone);
	<span class="toned">{(label + '/' + tone) as string}</span>
}

function Tip({ text }: { text: string }) @{
	<span class="tip">{text as string}</span>
}

function Shell({
	head,
	layers,
	rows,
	loose,
	tip,
	bindShell,
}: {
	head: OctaneNode;
	layers: OctaneNode;
	rows: OctaneNode;
	loose: OctaneNode;
	tip: string | null;
	bindShell: (rerender: () => void) => void;
}) @{
	const [tick, setTick] = useState(0);
	const tone = useContext(ScopedPropsTone);
	const overlay = useRef<HTMLDivElement | null>(null);
	bindShell(() => setTick((value) => value + 1));

	<section data-tick={String(tick)}>
		<div class="head">{head}</div>
		<div class="layers">
			<ScopedPropsTone value={tone + '#' + tick}>{layers}</ScopedPropsTone>
		</div>
		<div class="rows">{rows}</div>
		<div class="loose">{loose}</div>
		<div class="overlay" ref={overlay}></div>
		{tip !== null && overlay.current !== null
			? createPortal(<Tip text={tip} />, overlay.current)
			: null}
	</section>
}

export interface ScopedPropsControls {
	setOrder(order: string[]): void;
	setTone(tone: string): void;
	setTip(tip: string | null): void;
	setHeadKey(key: string): void;
	rerenderShell(): void;
}

export function ScopedPropsOwner({ bind }: { bind: (controls: ScopedPropsControls) => void }) @{
	const [order, setOrder] = useState(['a', 'b', 'c']);
	const [tone, setTone] = useState('plain');
	const [tip, setTip] = useState<string | null>(null);
	const [headKey, setHeadKey] = useState('h1');
	const controls: ScopedPropsControls = {
		setOrder,
		setTone,
		setTip,
		setHeadKey,
		rerenderShell: () => {},
	};
	bind(controls);
	const prefix = order.length + '.';
	const byId: Record<string, OctaneNode> = {
		a: <Counter key="a" label={prefix + 'a'} />,
		b: <Counter key="b" label={prefix + 'b'} />,
		c: <Counter key="c" label={prefix + 'c'} />,
	};
	const looseX = <Counter label={prefix + 'x'} />;
	const looseY = <Counter label={prefix + 'y'} />;

	<ScopedPropsTone value={tone}>
		<Shell
			head={<Counter key={headKey} label={prefix + 'head'} />}
			layers={
				<>
					<Counter label={prefix + 'first'} />
					<Toned label={prefix + 'second'} />
				</>
			}
			rows={order.map((id) => byId[id])}
			loose={[looseX, looseY]}
			tip={tip}
			bindShell={(rerender) => (controls.rerenderShell = rerender)}
		/>
	</ScopedPropsTone>
}
