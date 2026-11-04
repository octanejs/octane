'use strong';

import { useLayoutEffect, useLayoutSnapshot, useRef, useState } from 'octane';

export interface MeasurementProps {
	width: number;
}

export function Measured(props: MeasurementProps) @{
	const target = useRef<HTMLDivElement | null>(null);
	const width = useLayoutSnapshot(() => target.current?.getBoundingClientRect().width ?? -1, {
		initial: 0,
	});
	<section>
		<div ref={target} data-width={props.width}></div>
		<output>{String(width)}</output>
	</section>
}

// A deliberately delayed publication verifies that the first-frame observer
// detects a stale snapshot instead of merely waiting until a value appears.
export function Deferred(props: MeasurementProps) @{
	const target = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const element = target.current;
		const frame = requestAnimationFrame(() =>
			setWidth(element?.getBoundingClientRect().width ?? -props.width),
		);
		return () => cancelAnimationFrame(frame);
	});
	<section>
		<div ref={target} data-width={props.width}></div>
		<output>{String(width)}</output>
	</section>
}

export interface WidthTarget {
	target: { current: HTMLDivElement | null };
}

export function MeasuredSibling(props: WidthTarget) @{
	const width = useLayoutSnapshot(() => props.target.current?.getBoundingClientRect().width ?? -1, {
		initial: 140,
	});
	<output>{String(width)}</output>
}

export function SnapshotResize(props: WidthTarget) @{
	const source = useRef<HTMLDivElement | null>(null);
	const width = useLayoutSnapshot(() => source.current?.getBoundingClientRect().width ?? -1, {
		initial: 140,
	});
	<div>
		<div ref={source} style={{ width: '260px' }} />
		<div ref={props.target} data-width={width}></div>
	</div>
}
