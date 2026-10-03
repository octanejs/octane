import { describe, expect, it } from 'vitest';
import { act, flushSync, startTransition } from '../src/index.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Updates from layout effects and callback refs belong to the commit that ran
// them, as in React.
// Octane's post-await Action fallback must not capture them.
const source = `
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'octane';

export function MeasuredCount(props) @{
	const [count, setCount] = useState(0);
	const [measured, setMeasured] = useState('initial');
	const [label, setLabel] = useState('idle');
	const ref = useRef(null);
	props.expose(setLabel);
	useLayoutEffect(() => {
		setMeasured(ref.current.getAttribute('data-count'));
	}, [count]);
	<section>
		<button ref={ref} data-count={count} onClick={() => setCount(count + 1)}>
			{measured as string}
		</button>
		<output>{label as string}</output>
	</section>
}

export function RefMeasuredCount() @{
	const [count, setCount] = useState(0);
	const [measured, setMeasured] = useState('initial');
	<button
		data-count={count}
		ref={(node) => {
			if (node) setMeasured(String(count));
		}}
		onClick={() => setCount(count + 1)}
	>
		{measured as string}
	</button>
}

export function RefMount() @{
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState('closed');
	<section>
		<button onClick={() => setOpen(true)}>{'open'}</button>
		@if (open) {
			<span
				ref={(node) => {
					if (node) setLabel('mounted');
				}}
			>
				{'panel'}
			</span>
		}
		<output>{label as string}</output>
	</section>
}

export function StoreWriter(props) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		props.store.set(count);
	}, [count]);
	<button onClick={() => setCount(count + 1)}>{String(value) as string}</button>
}

export function LayoutFollower(props) @{
	const [source, setSource] = useState(0);
	const [follower, setFollower] = useState(0);
	props.expose(setSource);
	useLayoutEffect(() => {
		setFollower(source);
	}, [source]);
	<output>{source + ':' + follower as string}</output>
}
`;

async function settle(): Promise<void> {
	for (let index = 0; index < 10; index++) await Promise.resolve();
}

describe.each([true, false])('layout effect updates during an async Action (dev: %s)', (dev) => {
	const fixture = () =>
		loadCompiledFixtureSource(source, {
			id: '/packages/octane/tests/_fixtures/layout-effect-update-priority.tsrx',
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	it('commits a layout effect update before the pending Action settles', async () => {
		const { MeasuredCount } = fixture();
		let setLabel!: (value: string) => void;
		const view = mount(MeasuredCount, { expose: (setter: typeof setLabel) => (setLabel = setter) });
		let finishFirst!: () => void;
		let finishSecond!: () => void;
		const first = new Promise<void>((resolve) => (finishFirst = resolve));
		const second = new Promise<void>((resolve) => (finishSecond = resolve));
		try {
			expect(view.find('button').textContent).toBe('0');
			startTransition(async () => {
				await first;
				setLabel('continued');
				await second;
			});
			(view.find('button') as HTMLButtonElement).click();
			await settle();
			expect(view.find('button').getAttribute('data-count')).toBe('1');
			expect(view.find('button').textContent).toBe('1');

			// A post-await update in the Action still waits for the Action to settle.
			finishFirst();
			await settle();
			expect(view.find('output').textContent).toBe('idle');
			finishSecond();
			await settle();
			expect(view.find('output').textContent).toBe('continued');
		} finally {
			finishFirst();
			finishSecond();
			await settle();
			view.unmount();
		}
	});

	it('commits a callback ref update before the pending Action settles', async () => {
		const { RefMeasuredCount } = fixture();
		const view = mount(RefMeasuredCount);
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => (finish = resolve));
		try {
			expect(view.find('button').textContent).toBe('0');
			startTransition(async () => pending);
			(view.find('button') as HTMLButtonElement).click();
			await settle();
			expect(view.find('button').getAttribute('data-count')).toBe('1');
			expect(view.find('button').textContent).toBe('1');
		} finally {
			finish();
			await settle();
			view.unmount();
		}
	});

	it('commits an update from the ref callback of a newly mounted element before the Action settles', async () => {
		const { RefMount } = fixture();
		const view = mount(RefMount);
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => (finish = resolve));
		try {
			startTransition(async () => pending);
			(view.find('button') as HTMLButtonElement).click();
			await settle();
			expect(view.find('span').textContent).toBe('panel');
			expect(view.find('output').textContent).toBe('mounted');
		} finally {
			finish();
			await settle();
			view.unmount();
		}
	});

	it('commits an external store write from a layout effect before the Action settles', async () => {
		const { StoreWriter } = fixture();
		let current = 0;
		const listeners = new Set<() => void>();
		const store = {
			get: () => current,
			subscribe: (listener: () => void) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
			set: (value: number) => {
				current = value;
				for (const listener of listeners) listener();
			},
		};
		const view = mount(StoreWriter, { store });
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => (finish = resolve));
		try {
			startTransition(async () => pending);
			(view.find('button') as HTMLButtonElement).click();
			await settle();
			expect(view.find('button').textContent).toBe('1');
		} finally {
			finish();
			await settle();
			view.unmount();
		}
	});

	it('does not stage a layout effect update into a transition that flushes a commit', async () => {
		const { LayoutFollower } = fixture();
		let setSource!: (value: number) => void;
		const view = mount(LayoutFollower, {
			expose: (setter: typeof setSource) => (setSource = setter),
		});
		let observed = '';
		try {
			await act(() => {
				setSource(1);
				startTransition(() => {
					// The urgent update commits here; its layout effect is not part of
					// the surrounding transition, so flushSync also commits its update.
					flushSync(() => {});
					observed = view.find('output').textContent!;
				});
			});
			expect(observed).toBe('1:1');
			expect(view.find('output').textContent).toBe('1:1');
		} finally {
			view.unmount();
		}
	});
});
