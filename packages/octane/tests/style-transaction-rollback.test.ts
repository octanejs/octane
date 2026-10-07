import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, startTransition } from 'octane';
import { renderToString } from 'octane/server';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks';

const SOURCE = `
import { Suspense, ViewTransition } from 'octane';
function Reader(props) @{ <span id="label">{props.read() as string}</span> }
function Styled(props) @{
	<div id="target" title={props.token} style={{ color: props.color, backgroundColor: props.background, width: props.width, height: props.height, opacity: props.opacity, '--token': props.token }}><input /></div>
}
export function App(props) @{
	<main><Styled {...props} /><Reader read={props.read} /></main>
}
export function Nested(props) @{
	<Suspense fallback={<p>outer pending</p>}>
		<Styled {...props} />
		<Suspense fallback={<p>inner pending</p>}><Reader read={props.read} /></Suspense>
		<Reader read={props.tail} />
	</Suspense>
}
export function Native(props) @{
	<ViewTransition name="style-transaction"><App {...props} /></ViewTransition>
}
export function Siblings(props) @{
	<main>
		<div id="first" style={{ color: props.color, width: props.width }} />
		<div id="second" style={{ color: props.color, width: props.last }} />
	</main>
}
function Forward(props) @{
	props.record?.();
	<div id="target" title={props.title} style={props.style}><input /></div>
}
export function Forwarded(props) @{
	<main><Forward style={props.style} title={props.title} record={props.record} /><Reader read={props.read} /></main>
}
export function SuspendedForwarded(props) @{
	<Suspense fallback={<p>pending</p>}>
		<Forward style={props.style} title={props.title} record={props.record} />
		<Reader read={props.read} />
	</Suspense>
}
`;

const before = {
	color: 'red',
	background: 'black',
	width: 10,
	height: 30,
	opacity: 0.5,
	token: 'before',
};
const after = {
	color: 'blue',
	background: 'white',
	width: 20,
	height: 40,
	opacity: 0.8,
	token: 'after',
};
// A signals import turns these opaque style literals into native style bindings.
// Their scalar values take the direct writer, so rollback must restore its cache.
function fixture(dev: boolean, native: boolean, mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(native ? `import 'octane/signals';\n${SOURCE}` : SOURCE, {
		id: `style-transaction-${dev}-${native}.tsrx`,
		mode,
		compileOptions: { dev, hmr: false },
	});
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function style(element: HTMLElement) {
	return [
		element.style.color,
		element.style.backgroundColor,
		element.style.width,
		element.style.height,
		element.style.opacity,
		element.style.getPropertyValue('--token'),
	];
}

describe.each([
	[false, false],
	[true, false],
	[false, true],
	[true, true],
])('style transactions dev=%s native=%s', (dev, native) => {
	it('restores the browser style and draft while a root render waits, then accepts its retry', async () => {
		const client = fixture(dev, native);
		const pending = deferred();
		let ready = true;
		const read = () => {
			if (!ready) throw pending.promise;
			return ready ? 'ready' : 'pending';
		};
		const root = mount(client.App, { ...before, read });
		const element = root.find('#target') as HTMLElement;
		const input = element.querySelector('input')!;
		input.value = 'retained draft';
		input.focus();
		input.setSelectionRange(2, 5);
		// Rollback must restore live browser state, including edits outside Octane.
		element.style.borderColor = 'green';
		const original = element.style.cssText;
		try {
			ready = false;
			root.update(client.App, { ...after, read });
			expect(root.find('#target')).toBe(element);
			expect(element.style.cssText).toBe(original);
			expect(element.title).toBe('before');
			expect(element.querySelector('input')).toBe(input);
			expect(input.value).toBe('retained draft');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
			ready = true;
			await act(() => pending.resolve());
			expect(root.find('#target')).toBe(element);
			expect(style(element)).toEqual(['blue', 'white', '20px', '40px', '0.8', 'after']);
			expect(element.title).toBe('after');
			expect(element.style.borderColor).toBe('green');
			expect(input.value).toBe('retained draft');
		} finally {
			pending.resolve();
			root.unmount();
		}
	});

	it('restores each host when a later CSS value throws after earlier declarations changed', () => {
		const client = fixture(dev, native);
		const root = mount(client.Siblings, { color: 'red', width: 10, last: 10 });
		const first = root.find('#first') as HTMLElement;
		const second = root.find('#second') as HTMLElement;
		const originals = [first.style.cssText, second.style.cssText];
		const seen: string[] = [];
		try {
			expect(() =>
				root.update(client.Siblings, {
					color: 'blue',
					width: 20,
					last: {
						toString() {
							seen.push(second.style.color);
							throw new Error('CSS coercion failed');
						},
					},
				}),
			).toThrow('CSS coercion failed');
			expect(seen).toEqual(['blue']);
			expect([first.style.cssText, second.style.cssText]).toEqual(originals);
		} finally {
			root.unmount();
		}
	});

	it('keeps the accepted style through nested suspensions and a second retry savepoint', async () => {
		const client = fixture(dev, native);
		const inner = deferred(),
			tail = deferred();
		let innerReady = true,
			tailReady = true;
		const read = () => {
			if (!innerReady) throw inner.promise;
			return 'inner';
		};
		const tailRead = () => {
			if (!tailReady) throw tail.promise;
			return 'tail';
		};
		const root = mount(client.Nested, { ...before, read, tail: tailRead });
		const element = root.find('#target') as HTMLElement;
		const input = element.querySelector('input')!;
		input.value = 'nested draft';
		const original = style(element);
		try {
			innerReady = tailReady = false;
			await act(() =>
				startTransition(() => root.root.render(client.Nested, { ...after, read, tail: tailRead })),
			);
			expect(root.find('#target')).toBe(element);
			expect(style(element)).toEqual(original);
			innerReady = true;
			await act(() => inner.resolve());
			expect(root.find('#target')).toBe(element);
			expect(style(element)).toEqual(original);
			expect(input.value).toBe('nested draft');
			tailReady = true;
			await act(() => tail.resolve());
			expect(root.find('#target')).toBe(element);
			expect(style(element)).toEqual(['blue', 'white', '20px', '40px', '0.8', 'after']);
			expect(input.value).toBe('nested draft');
		} finally {
			innerReady = tailReady = true;
			inner.resolve();
			tail.resolve();
			root.unmount();
		}
	});

	it('preserves CSS coercion order when a value synchronously refreshes another root', () => {
		const client = fixture(dev, native);
		const other = mount(client.App, { ...before, read: () => 'other' });
		const root = mount(client.App, { ...before, read: () => 'main' });
		const element = root.find('#target') as HTMLElement;
		const otherElement = other.find('#target') as HTMLElement;
		const seen: string[] = [];
		try {
			root.update(client.App, {
				...after,
				read: () => 'main',
				width: {
					toString() {
						seen.push(element.style.color, element.style.backgroundColor, element.style.height);
						other.update(client.App, { ...after, read: () => 'other' });
						return '20px';
					},
				},
			});
			expect(seen).toEqual(['blue', 'white', '30px']);
			expect(root.find('#target')).toBe(element);
			expect(other.find('#target')).toBe(otherElement);
			expect(style(element)).toEqual(style(otherElement));
		} finally {
			root.unmount();
			other.unmount();
		}
	});

	it('adopts styled SSR nodes and preserves an uncontrolled draft on updates', () => {
		const client = fixture(dev, native),
			server = fixture(dev, native, 'server');
		const props = { ...before, read: () => 'ready' };
		const host = document.createElement('div');
		document.body.append(host);
		host.innerHTML = renderToString(server.App, props).html;
		const element = host.querySelector('#target') as HTMLElement;
		const input = element.querySelector('input')!;
		input.value = 'before hydration';
		const errors: unknown[] = [];
		const root = hydrateRoot(host, client.App, props, {
			onRecoverableError: (error) => errors.push(error),
		});
		try {
			flushSync(() => root.render(client.App, { ...after, read: props.read }));
			expect(host.querySelector('#target')).toBe(element);
			expect(element.querySelector('input')).toBe(input);
			expect(input.value).toBe('before hydration');
			expect(style(element)).toEqual(['blue', 'white', '20px', '40px', '0.8', 'after']);
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
			expect(host.childNodes.length).toBe(0);
			host.remove();
		}
	});

	// Components often forward an optional style prop that is unset or a string.
	// Native and ordinary bindings write those the same way, and a root render
	// that waits must restore both the attribute and the value later writes diff against.
	it('writes forwarded unset and string styles in place and restores them while a root render waits', async () => {
		const client = fixture(dev, native);
		const pending = deferred();
		let ready = true;
		const read = () => {
			if (!ready) throw pending.promise;
			return 'ready';
		};
		const root = mount(client.Forwarded, { style: undefined, title: 'unset', read });
		const element = root.find('#target') as HTMLElement;
		const input = element.querySelector('input')!;
		input.value = 'retained draft';
		try {
			expect(element.hasAttribute('style')).toBe(false);
			root.update(client.Forwarded, { style: 'color: red; width: 10px;', title: 'string', read });
			expect(element.style.cssText).toBe('color: red; width: 10px;');
			element.style.borderColor = 'green';
			const original = element.style.cssText;
			ready = false;
			root.update(client.Forwarded, { style: undefined, title: 'waiting', read });
			expect(root.find('#target')).toBe(element);
			expect(element.style.cssText).toBe(original);
			expect(element.title).toBe('string');
			ready = true;
			await act(() => pending.resolve());
			// Unsetting a string style clears the attribute's declarations, as it
			// would have without the wait, including the edit made outside Octane.
			expect(element.style.cssText).toBe('');
			expect(element.title).toBe('waiting');
			const steps: Array<[unknown, string]> = [
				['color: blue;', 'color: blue;'],
				[null, ''],
				['width: 5px;', 'width: 5px;'],
				[false, ''],
				[{ color: 'green', width: 5 }, 'color: green; width: 5px;'],
				['', ''],
				['color: red;', 'color: red;'],
				[undefined, ''],
			];
			for (const [value, css] of steps) {
				root.update(client.Forwarded, { style: value, title: 'step', read });
				expect(element.style.cssText).toBe(css);
			}
			expect(root.find('#target')).toBe(element);
			expect(element.querySelector('input')).toBe(input);
			expect(input.value).toBe('retained draft');
		} finally {
			ready = true;
			pending.resolve();
			root.unmount();
		}
	});

	it('discards a suspended native preparation before a later accepted style is published', async () => {
		const client = fixture(dev, native);
		const mocks = installViewTransitionMocks();
		const pending = deferred(),
			finished = deferred();
		const handles: Array<() => void | Promise<void>> = [];
		document.startViewTransition = ((options: { update: () => void | Promise<void> }) => {
			handles.push(options.update);
			return { ready: finished.promise, finished: finished.promise, skipTransition() {} };
		}) as typeof document.startViewTransition;
		let ready = true;
		const read = () => {
			if (!ready) throw pending.promise;
			return 'ready';
		};
		const root = mount(client.Native, { ...before, read });
		const element = root.find('#target') as HTMLElement;
		const original = element.style.cssText;
		try {
			ready = false;
			startTransition(() => root.root.render(client.Native, { ...after, read }));
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			expect(element.style.cssText).toBe(original);
			await handles[0]();
			finished.resolve();
			expect(element.style.cssText).toBe(original);
			ready = true;
			root.update(client.Native, { ...after, color: 'purple', read });
			await act(() => pending.resolve());
			expect(root.find('#target')).toBe(element);
			expect(element.style.color).toBe('purple');
			expect(element.style.width).toBe('20px');
		} finally {
			ready = true;
			pending.resolve();
			finished.resolve();
			root.unmount();
			mocks.restore();
		}
	});
});

// A forwarded style that starts unset or as a string can later carry signal
// handles. The handle must then update the style without its component, and stop
// doing so once the style is unset, without leaking an abandoned attempt's reads.
describe.each([false, true])('forwarded native style handles dev=%s', (dev) => {
	function colorScope$(name: string) {
		const scope = createScope({ scopeKey: `forwarded-style-${name}-${dev}` });
		return { scope, color$: scope.signal$('color', 'red') };
	}

	it('upgrades an unset style to a live handle and releases it when unset again', () => {
		const client = fixture(dev, true);
		const { scope, color$ } = colorScope$('upgrade');
		const read = () => 'ready';
		const root = mount(client.Forwarded, { style: undefined, title: 'unset', read });
		const element = root.find('#target') as HTMLElement;
		try {
			expect(element.hasAttribute('style')).toBe(false);
			root.update(client.Forwarded, { style: { color: color$, width: 10 }, title: 'live', read });
			expect(element.style.cssText).toBe('color: red; width: 10px;');
			flushSync(() => color$.set('blue'));
			expect(element.style.color).toBe('blue');
			root.update(client.Forwarded, { style: undefined, title: 'unset', read });
			expect(element.style.cssText).toBe('');
			flushSync(() => color$.set('green'));
			expect(element.style.cssText).toBe('');
			root.update(client.Forwarded, { style: 'width: 3px;', title: 'string', read });
			expect(element.style.cssText).toBe('width: 3px;');
			root.update(client.Forwarded, { style: { color: color$ }, title: 'live', read });
			expect(element.style.cssText).toBe('color: green;');
			flushSync(() => color$.set('purple'));
			expect(element.style.cssText).toBe('color: purple;');
			expect(root.find('#target')).toBe(element);
			root.unmount();
			flushSync(() => color$.set('black'));
			expect(element.style.cssText).toBe('color: purple;');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	it('rolls back a handle upgrade while a root render waits, then publishes its retry', async () => {
		const client = fixture(dev, true);
		const { scope, color$ } = colorScope$('root-wait');
		const pending = deferred();
		let ready = true;
		const read = () => {
			if (!ready) throw pending.promise;
			return 'ready';
		};
		const root = mount(client.Forwarded, { style: undefined, title: 'before', read });
		const element = root.find('#target') as HTMLElement;
		element.style.borderColor = 'green';
		const original = element.style.cssText;
		try {
			ready = false;
			root.update(client.Forwarded, { style: { color: color$ }, title: 'after', read });
			expect(element.style.cssText).toBe(original);
			expect(element.title).toBe('before');
			// The abandoned attempt read the handle; its write must not publish.
			flushSync(() => color$.set('blue'));
			expect(element.style.cssText).toBe(original);
			ready = true;
			await act(() => pending.resolve());
			expect(root.find('#target')).toBe(element);
			expect(element.style.cssText).toBe('border-color: green; color: blue;');
			expect(element.title).toBe('after');
			flushSync(() => color$.set('purple'));
			expect(element.style.color).toBe('purple');
			root.update(client.Forwarded, { style: undefined, title: 'unset', read });
			expect(element.style.cssText).toBe('border-color: green;');
			flushSync(() => color$.set('red'));
			expect(element.style.cssText).toBe('border-color: green;');
		} finally {
			ready = true;
			pending.resolve();
			root.unmount();
			scope.dispose();
		}
	});

	it('holds a handle upgrade in a transition that suspends a visible boundary until it commits', async () => {
		const client = fixture(dev, true);
		const { scope, color$ } = colorScope$('transition');
		const pending = deferred();
		let ready = true;
		const read = () => {
			if (!ready) throw pending.promise;
			return 'ready';
		};
		const root = mount(client.SuspendedForwarded, { style: 'width: 4px;', title: 'before', read });
		const element = root.find('#target') as HTMLElement;
		try {
			ready = false;
			await act(() =>
				startTransition(() =>
					root.root.render(client.SuspendedForwarded, {
						style: { color: color$ },
						title: 'after',
						read,
					}),
				),
			);
			expect(root.find('#target')).toBe(element);
			expect(element.style.cssText).toBe('width: 4px;');
			expect(element.title).toBe('before');
			flushSync(() => color$.set('blue'));
			expect(element.style.cssText).toBe('width: 4px;');
			ready = true;
			await act(() => pending.resolve());
			expect(root.find('#target')).toBe(element);
			expect(element.style.cssText).toBe('color: blue;');
			expect(element.title).toBe('after');
			flushSync(() => color$.set('purple'));
			expect(element.style.cssText).toBe('color: purple;');
		} finally {
			ready = true;
			pending.resolve();
			root.unmount();
			scope.dispose();
		}
	});

	it('server-renders and hydrates unset and string styles like ordinary styles, then upgrades them', () => {
		const client = fixture(dev, true);
		const server = fixture(dev, true, 'server');
		const ordinary = { client: fixture(dev, false), server: fixture(dev, false, 'server') };
		const { scope, color$ } = colorScope$('hydrate');
		const read = () => 'ready';
		const host = document.createElement('div');
		document.body.append(host);
		try {
			for (const style of [undefined, null, '', 'color: red; width: 10px;']) {
				const props = { style, title: 'server', read };
				const html = renderToString(server.Forwarded, props).html;
				expect(html).toBe(renderToString(ordinary.server.Forwarded, props).html);
				host.innerHTML = html;
				const element = host.querySelector('#target') as HTMLElement;
				const input = element.querySelector('input')!;
				input.value = 'before hydration';
				const serverStyle = element.getAttribute('style');
				const errors: unknown[] = [];
				const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
				const root = hydrateRoot(host, client.Forwarded, props, {
					onRecoverableError: (error) => errors.push(error),
				});
				try {
					flushSync(() => {});
					expect(host.querySelector('#target')).toBe(element);
					expect(element.getAttribute('style')).toBe(serverStyle);
					expect(errors).toEqual([]);
					expect(consoleError).not.toHaveBeenCalled();
					flushSync(() => root.render(client.Forwarded, { ...props, style: { color: color$ } }));
					expect(element.style.cssText).toBe(`color: ${color$.get()};`);
					flushSync(() => color$.set(color$.get() === 'red' ? 'blue' : 'red'));
					expect(element.style.cssText).toBe(`color: ${color$.get()};`);
					flushSync(() => root.render(client.Forwarded, { ...props, style: undefined }));
					expect(element.style.cssText).toBe('');
					expect(host.querySelector('#target')).toBe(element);
					expect(input.value).toBe('before hydration');
				} finally {
					root.unmount();
					consoleError.mockRestore();
				}
			}
			// A server style the client leaves unset is an ordinary attribute
			// difference: both bindings keep it rather than rebuilding the host.
			const outcomes = [client, ordinary.client].map((view) => {
				host.innerHTML = renderToString(server.Forwarded, {
					style: 'color: red;',
					title: 'server',
					read,
				}).html;
				const element = host.querySelector('#target') as HTMLElement;
				const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
				const errors: unknown[] = [];
				const root = hydrateRoot(
					host,
					view.Forwarded,
					{ style: undefined, title: 'server', read },
					{ onRecoverableError: (error) => errors.push(error) },
				);
				try {
					flushSync(() => {});
					return {
						adopted: host.querySelector('#target') === element,
						style: element.getAttribute('style'),
						errors: errors.length,
					};
				} finally {
					root.unmount();
					consoleError.mockRestore();
				}
			});
			expect(outcomes[0]).toEqual(outcomes[1]);
			expect(outcomes[0]).toEqual({ adopted: true, style: 'color: red;', errors: 0 });
		} finally {
			host.remove();
			scope.dispose();
		}
	});
});
