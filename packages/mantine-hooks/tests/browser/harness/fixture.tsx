/** @jsxImportSource octane */
import { useRef } from 'octane';
import {
	useCollapse,
	useDebouncedValue,
	useDidUpdate,
	useInterval,
	useScrollSpy,
	useFloatingWindow,
} from '@octanejs/mantine-hooks';
export interface FixtureProps {
	value?: string;
	epoch?: number;
	expanded?: boolean;
	onEvent?: (kind: string, value: string | number) => void;
}
export function HooksFixture({
	value = 'initial',
	epoch = 0,
	expanded = false,
	onEvent,
}: FixtureProps = {}) {
	const collapse = useCollapse({
		expanded,
		keepMounted: true,
		transitionDuration: 40,
		onTransitionEnd: () => onEvent?.('collapse', expanded ? 'entered' : 'exited'),
	});
	const host = useRef<HTMLDivElement | null>(null);
	const spy = useScrollSpy({ scrollHost: host, selector: '#scroll-host h2' });
	const [debounced] = useDebouncedValue(value, 200, { leading: true });
	useDidUpdate(() => onEvent?.('value', value), [value]);
	useInterval(() => onEvent?.('tick', epoch), 80, { autoInvoke: true });
	const drag = useFloatingWindow<HTMLDivElement>({
		initialPosition: { left: 500, top: 500 },
		onDragStart: () => onEvent?.('drag', 'start'),
		onDragEnd: () => onEvent?.('drag', 'end'),
	});
	return (
		<section>
			<input id="survivor" aria-label="Retained input" defaultValue="retained" />
			<output id="debounced">{debounced}</output>
			<output id="collapse-state">{collapse.state}</output>
			<div id="panel" {...collapse.getCollapseProps()} />
			<div id="scroll-host" ref={host} style={{ height: 100, overflow: 'auto' }}>
				<h2 id="first" style={{ margin: 0, height: 300 }}>
					First
				</h2>
				<h2 id="second" style={{ margin: 0, height: 300 }}>
					Second
				</h2>
			</div>
			<output id="active-heading">{String(spy.active)}</output>
			<div
				id="drag"
				ref={drag.ref}
				style={{ position: 'fixed', width: 30, height: 30, background: 'gray' }}
			>
				Drag
			</div>
		</section>
	);
}
