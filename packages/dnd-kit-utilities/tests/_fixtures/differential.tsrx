import { useRef, useState } from 'octane';
import {
	useCombinedRefs,
	useEvent,
	useInterval,
	useIsomorphicLayoutEffect,
	useLatestValue,
	useLazyMemo,
	useNodeRef,
	usePrevious,
	useUniqueId,
} from '@octanejs/dnd-kit-utilities';

/**
 * Every utilities hook in one component. Ref callbacks and effects append to
 * plain logs; `#report` copies them into the DOM so both runtimes are compared
 * at the same points. Each hook keeps its own log: the order in which a parent
 * and a child element attach their refs is not a utilities contract
 * (octanejs/octane#2296).
 */
export function HookProbe() @{
	const [count, setCount] = useState(0);
	const [swap, setSwap] = useState(false);
	const [report, setReport] = useState('none');
	const refLog = useRef<string[]>([]);
	const nodeLog = useRef<string[]>([]);
	const effectLog = useRef<string[]>([]);
	const combined = useCombinedRefs<HTMLElement | null>(
		(node) => refLog.current.push(`a:${node?.id ?? 'null'}`),
		(node) => refLog.current.push(`b:${node?.id ?? 'null'}`),
	);
	const [nodeRef, setNodeRef] = useNodeRef((next, previous) =>
		nodeLog.current.push(`${previous?.id ?? 'null'}>${next?.id ?? 'null'}`),
	);
	const readCount = useEvent(() => count);
	const firstReadCount = useRef(readCount);
	const latest = useLatestValue(count);
	const lazy = useLazyMemo<number>((previous) => (previous ?? 100) + count, [count]);
	const previous = usePrevious(count);
	const id = useUniqueId('probe');
	const fixedId = useUniqueId('probe', 'fixed');
	const [setTimer, clearTimer] = useInterval();
	useIsomorphicLayoutEffect(() => {
		effectLog.current.push(`layout:${count}`);
	}, [count]);
	<section>
		<button id="increment" onClick={() => setCount(count + 1)}>
			increment
		</button>
		<button id="swap" onClick={() => setSwap(!swap)}>
			swap
		</button>
		<button
			id="interval"
			onClick={() => {
				setTimer(() => effectLog.current.push('tick'), 1000);
				clearTimer();
			}}
		>
			interval
		</button>
		<button
			id="report"
			onClick={() =>
				setReport(
					`refs:${refLog.current.join(',')}|node:${nodeLog.current.join(',')}|effects:${effectLog.current.join(
						',',
					)}|event:${readCount()}|latest:${latest.current}|current:${nodeRef.current?.id ?? 'null'}`,
				)
			}
		>
			report
		</button>
		@if (swap) {
			<div id="second" ref={combined}>
				<em id="node-second" ref={setNodeRef}>
					second
				</em>
			</div>
		} @else {
			<p id="first" ref={combined}>
				<i id="node-first" ref={setNodeRef}>
					first
				</i>
			</p>
		}
		<output id="values">{`count:${count}|previous:${String(previous)}|lazy:${lazy}|id:${id}|fixed:${fixedId}|stable:${String(
			firstReadCount.current === readCount,
		)}`}</output>
		<output id="report-text">{report as string}</output>
	</section>
}
