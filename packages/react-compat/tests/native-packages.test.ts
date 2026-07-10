import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'redux';
import { Provider as ReduxProvider, connect, useDispatch, useSelector } from 'react-redux';
import { Provider as JotaiProvider, atom, useAtom } from 'jotai';
import { Controller, useForm } from 'react-hook-form';
import { compile } from 'tailwindcss';
import { ErrorBoundary as PublishedErrorBoundary } from 'react-error-boundary';
import { createRoot, type Root } from 'react-dom/client';
import { jsx, jsxs } from 'react/jsx-runtime';
import { Suspense, useState } from 'react';
import { drainPassiveEffects, flushSync } from 'octane';

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
	while (mounted.length > 0) {
		const { root, container } = mounted.pop()!;
		root.unmount();
		container.remove();
	}
});

function mount(node: unknown): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(node);
	flushSync(() => {});
	drainPassiveEffects();
	mounted.push({ root, container });
	return container;
}

function click(container: HTMLElement, selector: string): void {
	flushSync(() => (container.querySelector(selector) as HTMLElement).click());
	drainPassiveEffects();
}

async function settle(): Promise<void> {
	for (let i = 0; i < 4; i++) {
		await Promise.resolve();
		flushSync(() => {});
		drainPassiveEffects();
	}
}

describe('unmodified published React packages on Octane', () => {
	it('react-redux Provider/useSelector/useDispatch update through the real binding', () => {
		const store = createStore((state = { count: 0 }, action: { type: string }) =>
			action.type === 'increment' ? { count: state.count + 1 } : state,
		);

		function Counter() {
			const count = useSelector((state: { count: number }) => state.count);
			const dispatch = useDispatch();
			return jsx('button', {
				className: 'redux-count',
				onClick: () => dispatch({ type: 'increment' }),
				children: String(count),
			});
		}

		const container = mount(jsx(ReduxProvider, { store, children: jsx(Counter, {}) }));
		expect(container.querySelector('.redux-count')?.textContent).toBe('0');
		click(container, '.redux-count');
		expect(container.querySelector('.redux-count')?.textContent).toBe('1');
	});

	it('jotai Provider/useAtom preserve atom state and rerender consumers', () => {
		const countAtom = atom(2);

		function Counter() {
			const [count, setCount] = useAtom(countAtom);
			return jsx('button', {
				className: 'jotai-count',
				onClick: () => setCount((value) => value + 1),
				children: String(count),
			});
		}

		const container = mount(jsx(JotaiProvider, { children: jsx(Counter, {}) }));
		expect(container.querySelector('.jotai-count')?.textContent).toBe('2');
		click(container, '.jotai-count');
		expect(container.querySelector('.jotai-count')?.textContent).toBe('3');
	});

	it('react-redux connect() class-era API renders and receives store updates', () => {
		const store = createStore((state = { count: 4 }, action: { type: string }) =>
			action.type === 'increment' ? { count: state.count + 1 } : state,
		);
		const View = (props: { count: number; increment: () => void }) =>
			jsx('button', {
				className: 'connected-count',
				onClick: props.increment,
				children: String(props.count),
			});
		const Connected = connect(
			(state: { count: number }) => ({ count: state.count }),
			(dispatch) => ({ increment: () => dispatch({ type: 'increment' }) }),
		)(View);
		const container = mount(jsx(ReduxProvider, { store, children: jsx(Connected, {}) }));
		expect(container.querySelector('.connected-count')?.textContent).toBe('4');
		click(container, '.connected-count');
		expect(container.querySelector('.connected-count')?.textContent).toBe('5');
	});

	it('react-hook-form register/watch receives React onChange semantics', () => {
		function Form() {
			const { register, watch } = useForm({ defaultValues: { name: 'Ada' } });
			return jsxs('form', {
				children: [
					jsx('input', { className: 'name', ...register('name') }),
					jsx('output', { className: 'value', children: watch('name') }),
				],
			});
		}

		const container = mount(jsx(Form, {}));
		const input = container.querySelector('.name') as HTMLInputElement;
		expect(input.value).toBe('Ada');
		expect(container.querySelector('.value')?.textContent).toBe('Ada');
		input.value = 'Grace';
		flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		drainPassiveEffects();
		expect(container.querySelector('.value')?.textContent).toBe('Grace');
	});

	it('react-hook-form Controller receives controlled value/onChange semantics', () => {
		function Form() {
			const { control, watch } = useForm({ defaultValues: { city: 'Warsaw' } });
			return jsxs('form', {
				children: [
					jsx(Controller, {
						name: 'city',
						control,
						render: ({ field }) => jsx('input', { className: 'city', ...field }),
					}),
					jsx('output', { className: 'city-value', children: watch('city') }),
				],
			});
		}
		const container = mount(jsx(Form, {}));
		const input = container.querySelector('.city') as HTMLInputElement;
		expect(input.value).toBe('Warsaw');
		input.value = 'Kraków';
		flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		drainPassiveEffects();
		expect(container.querySelector('.city-value')?.textContent).toBe('Kraków');
		expect(input.value).toBe('Kraków');
	});

	it('Tailwind v4 compiles classes that pass unchanged through Octane JSX', async () => {
		const compiler = await compile(
			'@theme { --spacing: .25rem; --color-red-500: red; } @tailwind utilities;',
		);
		const css = compiler.build(['p-4', 'text-red-500']);
		expect(css).toContain('.p-4');
		expect(css).toContain('.text-red-500');

		const container = mount(jsx('div', { className: 'p-4 text-red-500', children: 'styled' }));
		expect(container.firstElementChild?.getAttribute('class')).toBe('p-4 text-red-500');
	});

	it('controlled input values use ReactDOM property semantics in compat JSX', () => {
		function Controlled() {
			const [value, setValue] = useState('one');
			return jsxs('label', {
				children: [
					jsx('input', {
						className: 'controlled',
						value,
						onChange: (event: Event) => setValue((event.target as HTMLInputElement).value),
					}),
					jsx('output', { children: value }),
				],
			});
		}
		const container = mount(jsx(Controlled, {}));
		const input = container.querySelector('.controlled') as HTMLInputElement;
		expect(input.value).toBe('one');
		input.value = 'two';
		flushSync(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		expect(container.querySelector('output')?.textContent).toBe('two');
		expect(input.value).toBe('two');
	});

	it('a raw thrown Promise is routed to Suspense and retried', async () => {
		let ready = false;
		let resolve!: () => void;
		const pending = new Promise<void>((done) => {
			resolve = () => {
				ready = true;
				done();
			};
		});
		function AsyncChild() {
			if (!ready) throw pending;
			return jsx('span', { className: 'ready', children: 'ready' });
		}
		const container = mount(
			jsx(Suspense, {
				fallback: jsx('span', { className: 'pending', children: 'pending' }),
				children: jsx(AsyncChild, {}),
			}),
		);
		expect(container.querySelector('.pending')?.textContent).toBe('pending');
		resolve();
		await settle();
		expect(container.querySelector('.ready')?.textContent).toBe('ready');
	});

	it('react-error-boundary catches and imperatively resets a failed subtree', async () => {
		let broken = true;
		const onError = vi.fn();
		function Child() {
			if (broken) throw new Error('published boundary');
			return jsx('span', { className: 'recovered', children: 'recovered' });
		}
		const container = mount(
			jsx(PublishedErrorBoundary, {
				onError,
				fallbackRender: ({ error, resetErrorBoundary }) =>
					jsx('button', {
						className: 'published-fallback',
						onClick: () => {
							broken = false;
							resetErrorBoundary();
						},
						children: error.message,
					}),
				children: jsx(Child, {}),
			}),
		);
		expect(container.querySelector('.published-fallback')?.textContent).toBe('published boundary');
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][1]).toEqual({ componentStack: '' });
		flushSync(() => (container.querySelector('.published-fallback') as HTMLButtonElement).click());
		await settle();
		expect(container.querySelector('.recovered')?.textContent).toBe('recovered');
	});
});
