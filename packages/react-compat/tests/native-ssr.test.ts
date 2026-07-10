import { describe, expect, it } from 'vitest';
import { createStore } from 'redux';
import { Provider, useSelector } from 'react-redux';
import {
	Component,
	Suspense,
	createContext,
	createElement,
	useContext,
	useEffect,
	useLayoutEffect,
	useSyncExternalStore,
} from 'react';
import { jsx } from 'react/jsx-runtime';
import { render, ssrChild } from 'octane/server';

describe('unmodified React packages during Octane SSR', () => {
	const renderNode = (node: unknown) => {
		const Root = (props: { node: unknown }, scope: any) => ssrChild(props.node, scope);
		return render(Root as never, { node });
	};

	it('renders react-redux Provider/useSelector through server facades', async () => {
		const store = createStore(() => ({ count: 7 }));
		function Counter() {
			const count = useSelector((state: { count: number }) => state.count);
			return jsx('strong', { className: 'count', children: String(count) });
		}
		const node = jsx(Provider, { store, children: jsx(Counter, {}) });
		const result = await renderNode(node);
		expect(result.body).toContain('<strong class="count">7</strong>');
	});

	it('renders class components and classic React.createElement on the server', async () => {
		class Greeting extends Component<{ name: string }> {
			render() {
				return createElement('span', { className: 'greeting' }, `Hi ${this.props.name}`);
			}
		}
		const result = await renderNode(createElement(Greeting, { name: 'Ada' }));
		expect(result.body).toContain('<span class="greeting">Hi Ada</span>');
	});

	it('uses server snapshots and never runs client effects during SSR', async () => {
		const effects: string[] = [];
		function View() {
			useEffect(() => effects.push('passive'));
			useLayoutEffect(() => effects.push('layout'));
			const value = useSyncExternalStore(
				() => () => {},
				() => 'client',
				() => 'server',
			);
			return jsx('span', { className: 'snapshot', children: value });
		}
		const result = await renderNode(jsx(View, {}));
		expect(result.body).toContain('>server</span>');
		expect(effects).toEqual([]);
	});

	it('supports direct Context providers during SSR', async () => {
		const Context = createContext('default');
		function Read() {
			return jsx('span', { className: 'context', children: useContext(Context) });
		}
		const result = await renderNode(
			jsx(Context, { value: 'server-context', children: jsx(Read, {}) }),
		);
		expect(result.body).toContain('>server-context</span>');
	});

	it('does not catch descendant render errors with class boundaries during SSR', async () => {
		class Boundary extends Component<{ children?: unknown }, { error: boolean }> {
			state = { error: false };
			static getDerivedStateFromError() {
				return { error: true };
			}
			render() {
				return this.state.error ? jsx('span', { children: 'fallback' }) : this.props.children;
			}
		}
		function Broken(): never {
			throw new Error('ssr-errors-propagate');
		}
		await expect(renderNode(jsx(Boundary, { children: jsx(Broken, {}) }))).rejects.toThrow(
			'ssr-errors-propagate',
		);
	});

	it('reports the unsupported React Suspense server-error recovery contract explicitly', async () => {
		function Broken(): never {
			throw new Error('server-child-error');
		}
		await expect(
			renderNode(
				jsx(Suspense, {
					fallback: jsx('span', { children: 'React would emit this fallback' }),
					children: jsx(Broken, {}),
				}),
			),
		).rejects.toThrow(/Suspense server-error fallback recovery is not supported/);
	});
});
