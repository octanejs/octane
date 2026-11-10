import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Server from 'octane/server';
import {
	act,
	createRoot,
	flushLayoutSync,
	flushSync,
	hasPendingWork,
	RenderingPhase,
	setLayoutSnapshotTiming,
} from '../src/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const NAMES = ['IDLE', 'READ', 'WRITE'];

const source = `
import { getPhase, useLayoutSnapshot, useRef } from 'octane';

export function Measured(props) @{
	const ref = useRef(null);
	props.log('render ' + props.name);
	const value = useLayoutSnapshot(
		() => {
			props.log('measure ' + props.name + ' in ' + props.phaseName(getPhase()));
			return ref.current?.getAttribute('data-value');
		},
		{ initial: 'initial' },
	);
	<output ref={ref} data-value={props.value}>{value as string}</output>
}

export function Pair(props) @{
	<div>
		<Measured {...props} name="a" />
		<Measured {...props} name="b" />
	</div>
}

// The second snapshot measures text the first one's published value renders.
export function Chained(props) @{
	const first = useRef(null);
	const second = useRef(null);
	const a = useLayoutSnapshot(() => first.current?.getAttribute('data-value'), { initial: '' });
	const b = useLayoutSnapshot(() => second.current?.textContent, { initial: '' });
	<div>
		<span ref={first} data-value={props.value} />
		<span ref={second}>{a as string}</span>
		<output>{b as string}</output>
	</div>
}
`;

afterEach(() => {
	setLayoutSnapshotTiming('commit');
	flushLayoutSync();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe.each([true, false])('frame-timed layout snapshots (dev: %s)', (dev) => {
	const { Measured, Pair, Chained } = loadCompiledFixtureSource(source, {
		id: '/packages/octane/tests/_fixtures/layout-snapshot-frame.tsrx',
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	function props(value: string, log: string[]) {
		return {
			value,
			name: 'a',
			log: (entry: string) => log.push(entry),
			phaseName: (phase: number) => NAMES[phase],
		};
	}

	it('measures in the layout queue instead of the commit', () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Measured, props('first', log));
		try {
			const output = view.find('output');
			// flushSync has returned without measuring.
			expect(output.textContent).toBe('initial');
			expect(log).toEqual(['render a']);

			flushLayoutSync();
			expect(output.textContent).toBe('first');
			expect(log).toEqual(['render a', 'measure a in READ', 'render a', 'measure a in READ']);

			log.length = 0;
			view.update(Measured, props('second', log));
			expect(output.textContent).toBe('first');
			flushLayoutSync();
			expect(output.textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});

	it('measures every waiting snapshot before any of them renders', () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Pair, props('first', log));
		try {
			flushLayoutSync();
			log.length = 0;
			view.update(Pair, props('second', log));
			flushLayoutSync();
			expect(log).toEqual([
				'render a',
				'render b',
				'measure a in READ',
				'measure b in READ',
				'render a',
				'render b',
				'measure a in READ',
				'measure b in READ',
			]);
			expect([...view.container.querySelectorAll('output')].map((o) => o.textContent)).toEqual([
				'second',
				'second',
			]);
		} finally {
			view.unmount();
		}
	});

	it('settles snapshots that depend on each other within one flush', () => {
		setLayoutSnapshotTiming('frame');
		const view = mount(Chained, { value: 'first' });
		try {
			flushLayoutSync();
			expect(view.find('output').textContent).toBe('first');
			view.update(Chained, { value: 'second' });
			flushLayoutSync();
			expect(view.find('output').textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});

	it('measures on its own once the queue runs', async () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Measured, props('first', log));
		try {
			expect(view.find('output').textContent).toBe('initial');
			// The queue's next frame, or its host task on a page without frames.
			await vi.waitFor(() => expect(view.find('output').textContent).toBe('first'));
		} finally {
			view.unmount();
		}
	});

	it('counts as pending work until the queue has measured', () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Measured, props('first', log));
		try {
			expect(hasPendingWork()).toBe(true);
			flushLayoutSync();
			expect(hasPendingWork()).toBe(false);
		} finally {
			view.unmount();
		}
	});

	it('does not measure a snapshot unmounted before its frame', () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Measured, props('first', log));
		view.unmount();
		flushLayoutSync();
		expect(log).toEqual(['render a']);
	});

	it('is settled by act', async () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(Measured, props('first', log)));
			expect(container.textContent).toBe('first');
			act(() => root.render(Measured, props('second', log)));
			expect(container.textContent).toBe('second');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('measures waiting snapshots with the next commit after switching back', async () => {
		setLayoutSnapshotTiming('frame');
		const log: string[] = [];
		const view = mount(Measured, props('first', log));
		try {
			expect(view.find('output').textContent).toBe('initial');
			setLayoutSnapshotTiming('commit');
			await Promise.resolve();
			expect(view.find('output').textContent).toBe('first');
			// The commit's own read pass measured it.
			expect(log).toContain('measure a in READ');
			// The queue has nothing left to measure.
			log.length = 0;
			flushLayoutSync();
			expect(log).toEqual([]);
		} finally {
			view.unmount();
		}
	});
});

it('accepts either timing on the server, where snapshots never measure', () => {
	expect(() => Server.setLayoutSnapshotTiming('frame')).not.toThrow();
	expect(() => Server.setLayoutSnapshotTiming('commit')).not.toThrow();
	expect(Server.getPhase()).toBe(RenderingPhase.IDLE);
});
