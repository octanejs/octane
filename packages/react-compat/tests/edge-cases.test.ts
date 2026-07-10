import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	Children,
	Component,
	StrictMode,
	Suspense,
	cloneElement,
	createContext,
	createElement,
	createRef,
	forwardRef,
	lazy,
	memo,
	useContext,
	useEffect,
	useInsertionEffect,
	useImperativeHandle,
	useId,
	useLayoutEffect,
	useState,
	useSyncExternalStore,
	octaneCompatibility,
} from 'react';
import { createPortal, findDOMNode } from 'react-dom';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { jsx, jsxs } from 'react/jsx-runtime';
import { drainPassiveEffects, flushSync } from 'octane';
import { render as renderServer, ssrChild } from 'octane/server';
import { useId as useServerId } from '@octanejs/react-compat/server';
import { jsx as serverJsx } from '@octanejs/react-compat/server-jsx-runtime';

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
	while (mounted.length > 0) {
		const { root, container } = mounted.pop()!;
		root.unmount();
		container.remove();
	}
});

function mount(node: unknown): { root: Root; container: HTMLElement } {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	root.render(node);
	flushSync(() => {});
	drainPassiveEffects();
	const result = { root, container };
	mounted.push(result);
	return result;
}

function update(root: Root, node: unknown): void {
	root.render(node);
	flushSync(() => {});
	drainPassiveEffects();
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
		flushSync(() => {});
		drainPassiveEffects();
	}
}

describe('React compatibility edge cases — supported behavior', () => {
	it('adapts a standard class Error Boundary and calls componentDidCatch once', () => {
		const caught: string[] = [];
		class Boundary extends Component<{ children?: unknown }, { error: Error | null }> {
			state = { error: null as Error | null };
			static getDerivedStateFromError(error: Error) {
				return { error };
			}
			componentDidCatch(error: Error) {
				caught.push(error.message);
			}
			render() {
				return this.state.error
					? jsx('strong', { className: 'fallback', children: this.state.error.message })
					: this.props.children;
			}
		}
		function Broken(): never {
			throw new Error('boom');
		}
		const { container } = mount(jsx(Boundary, { children: jsx(Broken, {}) }));
		expect(container.querySelector('.fallback')?.textContent).toBe('boom');
		expect(caught).toEqual(['boom']);
	});

	it('a boundary does not catch an error thrown by its own render method', () => {
		class Outer extends Component<{ children?: unknown }, { error: boolean }> {
			state = { error: false };
			static getDerivedStateFromError() {
				return { error: true };
			}
			render() {
				return this.state.error
					? jsx('span', { className: 'outer-fallback', children: 'outer' })
					: this.props.children;
			}
		}
		class SelfBrokenBoundary extends Component {
			static getDerivedStateFromError() {
				return {};
			}
			render(): never {
				throw new Error('self');
			}
		}
		const { container } = mount(jsx(Outer, { children: jsx(SelfBrokenBoundary, {}) }));
		expect(container.querySelector('.outer-fallback')?.textContent).toBe('outer');
	});

	it('supports componentDidCatch-only boundaries that call setState', () => {
		class Boundary extends Component<{ children?: unknown }, { message: string | null }> {
			state = { message: null as string | null };
			componentDidCatch(error: Error) {
				this.setState({ message: error.message });
			}
			render() {
				return this.state.message
					? jsx('span', { className: 'did-catch', children: this.state.message })
					: this.props.children;
			}
		}
		const Broken = () => {
			throw new Error('caught-with-setState');
		};
		const { container } = mount(jsx(Boundary, { children: jsx(Broken, {}) }));
		expect(container.querySelector('.did-catch')?.textContent).toBe('caught-with-setState');
	});

	it('bubbles an error thrown by an inner fallback to the next outer boundary', () => {
		class Outer extends Component<{ children?: unknown }, { error: boolean }> {
			state = { error: false };
			static getDerivedStateFromError() {
				return { error: true };
			}
			render() {
				return this.state.error
					? jsx('span', { className: 'outer-caught-fallback', children: 'outer caught' })
					: this.props.children;
			}
		}
		class Inner extends Component<{ children?: unknown }, { error: boolean }> {
			state = { error: false };
			static getDerivedStateFromError() {
				return { error: true };
			}
			render() {
				if (this.state.error) throw new Error('fallback failed');
				return this.props.children;
			}
		}
		const Broken = () => {
			throw new Error('child failed');
		};
		const { container } = mount(
			jsx(Outer, { children: jsx(Inner, { children: jsx(Broken, {}) }) }),
		);
		expect(container.querySelector('.outer-caught-fallback')?.textContent).toBe('outer caught');
	});

	it('supports common class state and mount/update/unmount lifecycles', () => {
		const log: string[] = [];
		class Counter extends Component<{ start: number }, { value: number }> {
			state = { value: this.props.start };
			componentDidMount() {
				log.push('mount');
				this.setState(
					({ value }) => ({ value: value + 1 }),
					() => log.push('callback'),
				);
			}
			componentDidUpdate(_prevProps: { start: number }, prevState: { value: number }) {
				log.push(`update:${prevState.value}->${this.state.value}`);
			}
			componentWillUnmount() {
				log.push('unmount');
			}
			render() {
				return jsx('span', { className: 'class-value', children: String(this.state.value) });
			}
		}
		const { root, container } = mount(jsx(Counter, { start: 2 }));
		flushSync(() => {});
		expect(container.querySelector('.class-value')?.textContent).toBe('3');
		expect(log).toContain('mount');
		expect(log).toContain('callback');
		root.unmount();
		expect(log.at(-1)).toBe('unmount');
	});

	it('supports class defaultProps, contextType and instance refs', () => {
		const Locale = createContext('default');
		class Greeting extends Component<{ punctuation?: string }, object> {
			static defaultProps = { punctuation: '!' };
			static contextType = Locale;
			message() {
				return `${this.context}${this.props.punctuation}`;
			}
			render() {
				return jsx('span', { className: 'class-context', children: this.message() });
			}
		}
		const ref = createRef<Greeting>();
		const { root, container } = mount(
			createElement(Locale, { value: 'pl' }, createElement(Greeting, { ref })),
		);
		expect(container.querySelector('.class-context')?.textContent).toBe('pl!');
		expect(ref.current?.message()).toBe('pl!');
		root.unmount();
		expect(ref.current).toBeNull();
	});

	it('lazy loads once, suspends, and reveals the resolved component', async () => {
		let resolve!: (module: { default: (props: { label: string }) => unknown }) => void;
		const loader = vi.fn(
			() =>
				new Promise<{ default: (props: { label: string }) => unknown }>((done) => {
					resolve = done;
				}),
		);
		const Lazy = lazy(loader);
		const { container } = mount(
			jsx(Suspense, {
				fallback: jsx('i', { className: 'loading', children: 'loading' }),
				children: jsx(Lazy, { label: 'ready' }),
			}),
		);
		expect(container.querySelector('.loading')).not.toBeNull();
		resolve({ default: ({ label }) => jsx('b', { className: 'lazy', children: label }) });
		await settle();
		expect(container.querySelector('.lazy')?.textContent).toBe('ready');
		expect(loader).toHaveBeenCalledTimes(1);
	});

	it('routes a rejected lazy import from Suspense to the nearest Error Boundary', async () => {
		let reject!: (error: Error) => void;
		const Lazy = lazy(
			() =>
				new Promise<{ default: () => unknown }>((_resolve, fail) => {
					reject = fail;
				}),
		);
		class Boundary extends Component<{ children?: unknown }, { error: Error | null }> {
			state = { error: null as Error | null };
			static getDerivedStateFromError(error: Error) {
				return { error };
			}
			render() {
				return this.state.error
					? jsx('span', { className: 'lazy-error', children: this.state.error.message })
					: this.props.children;
			}
		}
		const { container } = mount(
			jsx(Boundary, {
				children: jsx(Suspense, {
					fallback: jsx('span', { children: 'pending' }),
					children: jsx(Lazy, {}),
				}),
			}),
		);
		reject(new Error('chunk failed'));
		await settle();
		expect(container.querySelector('.lazy-error')?.textContent).toBe('chunk failed');
	});

	it('routes commit-phase effect errors to the nearest class Error Boundary', () => {
		class Boundary extends Component<{ children?: unknown }, { error: Error | null }> {
			state = { error: null as Error | null };
			static getDerivedStateFromError(error: Error) {
				return { error };
			}
			render() {
				return this.state.error
					? jsx('span', { className: 'effect-error', children: this.state.error.message })
					: this.props.children;
			}
		}
		function BrokenEffect() {
			useEffect(() => {
				throw new Error('effect failed');
			}, []);
			return jsx('span', { children: 'before effect' });
		}
		const { container } = mount(jsx(Boundary, { children: jsx(BrokenEffect, {}) }));
		flushSync(() => {});
		expect(container.querySelector('.effect-error')?.textContent).toBe('effect failed');
	});

	it('reasserts controlled input, checkbox, textarea and select properties', () => {
		function Form() {
			const [tick, setTick] = useState(0);
			return jsxs('div', {
				children: [
					jsx('input', { className: 'text', value: 'fixed', onChange: () => {} }),
					jsx('input', { className: 'check', type: 'checkbox', checked: true }),
					jsx('textarea', { className: 'area', value: 'area', onChange: () => {} }),
					jsxs('select', {
						className: 'select',
						value: 'b',
						onChange: () => {},
						children: [
							jsx('option', { value: 'a', children: 'A' }),
							jsx('option', { value: 'b', children: 'B' }),
						],
					}),
					jsx('button', { onClick: () => setTick((x) => x + 1), children: String(tick) }),
				],
			});
		}
		const { container } = mount(jsx(Form, {}));
		const text = container.querySelector('.text') as HTMLInputElement;
		const check = container.querySelector('.check') as HTMLInputElement;
		const area = container.querySelector('.area') as HTMLTextAreaElement;
		const select = container.querySelector('.select') as HTMLSelectElement;
		expect([text.value, check.checked, area.value, select.value]).toEqual([
			'fixed',
			true,
			'area',
			'b',
		]);
		text.value = 'user';
		check.checked = false;
		area.value = 'user';
		select.value = 'a';
		flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
		expect([text.value, check.checked, area.value, select.value]).toEqual([
			'fixed',
			true,
			'area',
			'b',
		]);
	});

	it('provides the common SyntheticEvent facade on translated text onChange', () => {
		const seen: any[] = [];
		const { container } = mount(
			jsx('input', {
				className: 'event',
				onChange: (event: any) => {
					event.preventDefault();
					seen.push({
						native: event.nativeEvent === event,
						prevented: event.isDefaultPrevented(),
						persistent: event.persist() === undefined,
						currentTarget: event.currentTarget,
					});
				},
			}),
		);
		const input = container.querySelector('.event') as HTMLInputElement;
		input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({ native: true, prevented: true, persistent: true });
		expect(seen[0].currentTarget).toBe(input);
	});

	it('provides SyntheticEvent helpers for non-change events and honors propagation', () => {
		const log: string[] = [];
		const { container } = mount(
			jsx('div', {
				onClick: () => log.push('parent'),
				children: jsx('button', {
					className: 'stop',
					onClick: (event: any) => {
						expect(event.nativeEvent).toBe(event);
						event.stopPropagation();
						expect(event.isPropagationStopped()).toBe(true);
						log.push('child');
					},
					children: 'stop',
				}),
			}),
		);
		(container.querySelector('.stop') as HTMLButtonElement).click();
		expect(log).toEqual(['child']);
	});

	it('preserves insertion/layout/passive phase order and dependency cleanup', () => {
		const log: string[] = [];
		function Effects(props: { value: number }) {
			useInsertionEffect(() => {
				log.push(`insert:${props.value}`);
				return () => log.push(`insert-clean:${props.value}`);
			}, [props.value]);
			useLayoutEffect(() => {
				log.push(`layout:${props.value}`);
				return () => log.push(`layout-clean:${props.value}`);
			}, [props.value]);
			useEffect(() => {
				log.push(`passive:${props.value}`);
				return () => log.push(`passive-clean:${props.value}`);
			}, [props.value]);
			return jsx('span', { children: String(props.value) });
		}
		const { root } = mount(jsx(Effects, { value: 1 }));
		expect(log.slice(0, 3)).toEqual(['insert:1', 'layout:1', 'passive:1']);
		log.length = 0;
		update(root, jsx(Effects, { value: 2 }));
		expect(log).toEqual([
			'insert-clean:1',
			'insert:2',
			'layout-clean:1',
			'layout:2',
			'passive-clean:1',
			'passive:2',
		]);
	});

	it('supports direct Context providers, Consumer render props and memo invalidation', () => {
		const Theme = createContext('default');
		const Read = memo(function Read() {
			return jsx('span', { className: 'context', children: useContext(Theme) });
		});
		function App() {
			const [theme, setTheme] = useState('dark');
			return jsx(Theme, {
				value: theme,
				children: jsxs('div', {
					children: [
						jsx(Read, {}),
						jsx(Theme.Consumer, {
							children: (value: string) => jsx('span', { className: 'consumer', children: value }),
						}),
						jsx('button', { onClick: () => setTheme('light'), children: 'change' }),
					],
				}),
			});
		}
		const { container } = mount(jsx(App, {}));
		expect(container.querySelector('.context')?.textContent).toBe('dark');
		flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
		expect(container.querySelector('.context')?.textContent).toBe('light');
		expect(container.querySelector('.consumer')?.textContent).toBe('light');
	});

	it('preserves keyed component state when automatic-runtime children reorder', () => {
		function Item(props: { id: string }) {
			const [value, setValue] = useState(props.id);
			return jsx('button', {
				className: `item-${props.id}`,
				onClick: () => setValue((x) => `${x}!`),
				children: value,
			});
		}
		function List(props: { ids: string[] }) {
			return jsx('div', {
				children: props.ids.map((id) => jsx(Item, { id }, id)),
			});
		}
		const { root, container } = mount(jsx(List, { ids: ['a', 'b'] }));
		flushSync(() => (container.querySelector('.item-a') as HTMLButtonElement).click());
		update(root, jsx(List, { ids: ['b', 'a'] }));
		expect(Array.from(container.querySelectorAll('button')).map((el) => el.textContent)).toEqual([
			'b',
			'a!',
		]);
	});

	it('supports callback/object refs, forwardRef and imperative-handle cleanup', () => {
		const callbackValues: unknown[] = [];
		const handle = createRef<{ focus(): void }>();
		const Input = forwardRef<{ focus(): void }, object>(function Input(_props, ref) {
			const inner = createRef<HTMLInputElement>();
			useImperativeHandle(ref as any, () => ({ focus: () => inner.current?.focus() }), []);
			return jsx('input', {
				className: 'ref-input',
				ref: (node: HTMLInputElement | null) => {
					inner.current = node;
					callbackValues.push(node);
				},
			});
		});
		const { root } = mount(jsx(Input, { ref: handle }));
		expect(handle.current).not.toBeNull();
		handle.current!.focus();
		expect(document.activeElement?.className).toBe('ref-input');
		root.unmount();
		expect(handle.current).toBeNull();
		expect(callbackValues.at(-1)).toBeNull();
	});

	it('subscribes/unsubscribes useSyncExternalStore exactly once', () => {
		let value = 1;
		const listeners = new Set<() => void>();
		const unsubscribe = vi.fn();
		const subscribe = vi.fn((listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
				unsubscribe();
			};
		});
		function View() {
			return jsx('span', {
				className: 'store',
				children: String(useSyncExternalStore(subscribe, () => value)),
			});
		}
		const { root, container } = mount(jsx(View, {}));
		expect(subscribe).toHaveBeenCalledTimes(1);
		value = 2;
		flushSync(() => listeners.forEach((listener) => listener()));
		expect(container.querySelector('.store')?.textContent).toBe('2');
		root.unmount();
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});

	it('preserves context and bubbling across a portal, then cleans it up', () => {
		const Value = createContext('none');
		const portalHost = document.createElement('div');
		document.body.appendChild(portalHost);
		const log: string[] = [];
		function PortalChild() {
			const value = useContext(Value);
			return jsx('button', {
				className: 'portal-child',
				onClick: () => log.push(value),
				children: value,
			});
		}
		const { root } = mount(
			jsx(Value, {
				value: 'inside',
				children: jsx('section', {
					onClick: () => log.push('parent'),
					children: createPortal(jsx(PortalChild, {}), portalHost),
				}),
			}),
		);
		expect(portalHost.querySelector('.portal-child')?.textContent).toBe('inside');
		flushSync(() => (portalHost.querySelector('button') as HTMLButtonElement).click());
		expect(log).toEqual(['inside', 'parent']);
		root.unmount();
		expect(portalHost.innerHTML).toBe('');
		portalHost.remove();
	});

	it('handles primitive/array roots and Children/cloneElement utilities', () => {
		const child = jsx('span', { className: 'cloned', children: 'x' }, 'x');
		const cloned = cloneElement(child as never, { title: 'ok' });
		expect(Children.count([null, child, false])).toBe(3);
		expect(Children.toArray([null, child, false])).toHaveLength(1);
		const { root, container } = mount([
			cloned,
			jsx('span', { className: 'tail', children: 'tail' }, 'tail'),
		]);
		expect(container.querySelector('.cloned')?.getAttribute('title')).toBe('ok');
		expect(container.textContent).toBe('xtail');
		update(root, 'plain');
		expect(container.textContent).toBe('plain');
	});

	it('keeps StrictMode inert and single-invocation (documented divergence)', () => {
		const render = vi.fn(() => jsx('span', { children: 'once' }));
		mount(jsx(StrictMode, { children: jsx(render, {}) }));
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('hydrates server compat markup, preserves useId and attaches updates', async () => {
		function ServerCounter() {
			const id = useServerId();
			return serverJsx('section', {
				children: serverJsx('button', { id, children: '0' }),
			});
		}
		const ServerRoot = (props: { node: unknown }, scope: any) => ssrChild(props.node, scope);
		const server = await renderServer(ServerRoot as never, {
			node: serverJsx(ServerCounter, {}),
		});
		const container = document.createElement('div');
		container.innerHTML = server.body;
		document.body.appendChild(container);
		const serverButton = container.querySelector('button');
		const serverId = serverButton?.id;

		function ClientCounter() {
			const id = useId();
			const [count, setCount] = useState(0);
			return jsx('section', {
				children: jsx('button', {
					id,
					onClick: () => setCount((value) => value + 1),
					children: String(count),
				}),
			});
		}
		const root = hydrateRoot(container, jsx(ClientCounter, {}));
		flushSync(() => {});
		drainPassiveEffects();
		mounted.push({ root, container });
		expect(container.querySelector('button')).toBe(serverButton);
		expect(container.querySelector('button')?.id).toBe(serverId);
		flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
		expect(container.querySelector('button')?.textContent).toBe('1');
	});
});

describe('React compatibility edge cases — explicit unsupported contracts', () => {
	it('throws a targeted error for legacy pre-render class lifecycles', () => {
		class Legacy extends Component {
			UNSAFE_componentWillMount() {}
			render() {
				return null;
			}
		}
		expect(() => mount(jsx(Legacy, {}))).toThrow(/UNSAFE_componentWillMount.*not supported/);
	});

	it('throws a Rules-of-Hooks error when a compat component changes hook count', () => {
		function Conditional(props: { extra: boolean }) {
			useState(0);
			if (props.extra) useState(1);
			return jsx('span', { children: props.extra ? 'two' : 'one' });
		}
		const { root } = mount(jsx(Conditional, { extra: false }));
		expect(() => update(root, jsx(Conditional, { extra: true }))).toThrow(/Rules of Hooks/);
	});

	it('does not let Error Boundaries swallow event-handler errors (React semantics)', () => {
		class Boundary extends Component<{ children?: unknown }, { error: boolean }> {
			state = { error: false };
			static getDerivedStateFromError() {
				return { error: true };
			}
			render() {
				return this.state.error ? jsx('span', { children: 'caught' }) : this.props.children;
			}
		}
		const { container } = mount(
			jsx(Boundary, {
				children: jsx('button', {
					onClick: () => {
						throw new Error('event-error');
					},
					children: 'throw',
				}),
			}),
		);
		const errors: unknown[] = [];
		const onError = (event: ErrorEvent) => {
			errors.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		(container.querySelector('button') as HTMLButtonElement).click();
		window.removeEventListener('error', onError);
		expect(errors).toHaveLength(1);
		expect((errors[0] as Error).message).toBe('event-error');
		expect(container.textContent).toBe('throw');
	});

	it('exposes machine-readable partial/unsupported capability explanations', () => {
		expect(octaneCompatibility.supported).toContain('class-error-boundaries');
		expect(octaneCompatibility.partial.errorBoundaryInfo).toMatch(/empty componentStack/);
		expect(octaneCompatibility.partial.controlledModeWarnings).toMatch(/not emulated/);
		expect(octaneCompatibility.unsupported.strictModeDoubleInvoke).toMatch(/not emulated/);
	});

	it('throws targeted errors for removed DOM lookup and ReactDOMServer APIs', () => {
		expect(() => findDOMNode()).toThrow(/removed by React 19.*Use a ref/);
		expect(() => renderToString()).toThrow(/Use await render.*octane\/server/);
	});
});
