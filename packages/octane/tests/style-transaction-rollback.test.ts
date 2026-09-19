import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, startTransition } from 'octane';
import { renderToString } from 'octane/server';
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
function fixture(dev: boolean, mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(SOURCE, {
		id: `style-transaction-${dev}.tsrx`,
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

describe.each([false, true])('style transactions dev=%s', (dev) => {
	it('restores the browser style and draft while a root render waits, then accepts its retry', async () => {
		const client = fixture(dev);
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
		const client = fixture(dev);
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
		const client = fixture(dev);
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
		const client = fixture(dev);
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
		const client = fixture(dev),
			server = fixture(dev, 'server');
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

	it('discards a suspended native preparation before a later accepted style is published', async () => {
		const client = fixture(dev);
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
