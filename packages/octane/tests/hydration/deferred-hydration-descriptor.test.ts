import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Client from 'octane';
import { load, never, type HydrateProps, type HydrateWhen } from 'octane/hydration';
import * as Server from 'octane/server';
import { flushEffects } from '../_helpers.js';

type EditorProps = {
	pending?: Promise<void>;
	onInput?: (value: string) => void;
	onRef?: (element: HTMLInputElement | null) => void;
};

type AppProps = EditorProps & {
	when: HydrateWhen;
	onHydrated?: () => void;
};

type DescriptorRuntime = Pick<typeof Client, 'createElement' | 'Hydrate' | 'use'>;
type Ownership = 'component-owned' | 'directly rooted';

// Public createElement components exercise descriptor adoption without needing
// a compiled template. use() has no compiler-assigned hook slot.
function createDescriptorFixture(runtime: DescriptorRuntime) {
	function Editor(props: EditorProps) {
		if (props.pending) runtime.use(props.pending);
		return runtime.createElement('input', {
			id: 'descriptor-editor',
			defaultValue: 'Server draft',
			ref: props.onRef,
			onInput: (event: Event) => props.onInput?.((event.target as HTMLInputElement).value),
		});
	}

	function boundaryProps(props: AppProps): HydrateProps {
		return {
			when: props.when,
			split: false,
			onHydrated: props.onHydrated,
			children: runtime.createElement(Editor, {
				pending: props.pending,
				onInput: props.onInput,
				onRef: props.onRef,
			}),
		};
	}

	function App(props: AppProps) {
		return runtime.createElement(runtime.Hydrate, boundaryProps(props));
	}

	// The editor is the first item of a host's descriptor list, so the list's
	// first fill is what suspends.
	function ListApp(props: AppProps) {
		return runtime.createElement(runtime.Hydrate, {
			when: props.when,
			split: false,
			onHydrated: props.onHydrated,
			children: runtime.createElement(
				'section',
				null,
				runtime.createElement(Editor, {
					pending: props.pending,
					onInput: props.onInput,
					onRef: props.onRef,
				}),
				runtime.createElement('em', null, 'tail'),
			),
		});
	}

	return { App, ListApp, boundaryProps };
}

const client = createDescriptorFixture(Client);
const server = createDescriptorFixture(Server as unknown as DescriptorRuntime);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('deferred hydration of descriptor components', () => {
	let container: HTMLElement;
	let root: Client.Root | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		flushEffects();
	});

	function renderServer(ownership: Ownership, props: AppProps): void {
		container.innerHTML =
			ownership === 'component-owned'
				? Server.renderToString(server.App, props).html
				: Server.renderToString(Server.Hydrate, server.boundaryProps(props)).html;
	}

	function hydrate(ownership: Ownership, props: AppProps, options?: Client.RootOptions): void {
		root =
			ownership === 'component-owned'
				? Client.hydrateRoot(container, client.App, props, options)
				: Client.hydrateRoot(container, Client.Hydrate, client.boundaryProps(props), options);
	}

	function update(ownership: Ownership, props: AppProps): void {
		if (ownership === 'component-owned') root!.render(client.App, props);
		else root!.render(Client.Hydrate, client.boundaryProps(props));
	}

	for (const ownership of ['component-owned', 'directly rooted'] as const) {
		it(`${ownership}: immediately adopts the server input`, async () => {
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			expect(input).not.toBeNull();

			hydrate(ownership, { when, onInput, onRef, onHydrated }, { onRecoverableError });
			await Client.act(() => {});

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
			input.value = 'Live draft';
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
			expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft');
			expect(onRecoverableError).not.toHaveBeenCalled();
		});

		it(`${ownership}: preserves the server input when suspended activation completes`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			input.value = 'Typed before hydration';
			input.focus();
			input.setSelectionRange(3, 8);

			hydrate(
				ownership,
				{ when, pending: pending.promise, onInput, onRef, onHydrated },
				{ onRecoverableError },
			);
			await Client.act(() => {});
			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();

			await Client.act(() => pending.resolve());

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(input.value).toBe('Typed before hydration');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
			input.value = 'Live draft';
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
			expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft');
			expect(onRecoverableError).not.toHaveBeenCalled();

			root!.unmount();
			root = undefined;
			expect(onRef.mock.calls).toEqual([[input], [null]]);
			expect(container.textContent).toBe('');
		});

		it(`${ownership}: keeps canceled activation inert after its promise settles`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onInput = vi.fn();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			const props = { when, pending: pending.promise, onInput, onRef, onHydrated };
			hydrate(ownership, props);
			await Client.act(() => {});

			await Client.act(() => update(ownership, { ...props, when: never() }));
			await Client.act(() => pending.resolve());
			await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));

			expect(container.querySelector('#descriptor-editor')).toBe(input);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
			expect(onInput).not.toHaveBeenCalled();
		});

		// The island is a fallback boundary: as React does for a Suspense
		// boundary, it discards server DOM that does not match, the resumed input
		// included, and renders on the client once.
		it(`${ownership}: client-renders the island over unmatched server content once its activation resumes`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onHydrated = vi.fn();
			const onRecoverableError = vi.fn();
			renderServer(ownership, { when });
			const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
			const stale = document.createElement('p');
			stale.textContent = 'Unmatched server content';
			input.parentElement!.append(stale);
			hydrate(ownership, { when, pending: pending.promise, onHydrated }, { onRecoverableError });
			await Client.act(() => {});
			expect(stale.isConnected).toBe(true);
			expect(container.querySelector('#descriptor-editor')).toBe(input);

			await Client.act(() => pending.resolve());

			const rendered = container.querySelector('#descriptor-editor') as HTMLInputElement;
			expect(rendered).not.toBe(input);
			expect(input.isConnected).toBe(false);
			expect(rendered.value).toBe('Server draft');
			expect(stale.isConnected).toBe(false);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onRecoverableError).toHaveBeenCalledOnce();
		});

		for (const suspended of [false, true]) {
			it(`${ownership}: client-renders the island over a server-range tail on ${suspended ? 'resumed' : 'immediate'} activation`, async () => {
				const pending = deferred<void>();
				const when = load();
				const onInput = vi.fn();
				const onHydrated = vi.fn();
				const onRecoverableError = vi.fn();
				const onUncaughtError = vi.fn();
				renderServer(ownership, { when });
				const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
				input.value = 'Draft before activation';
				const wrapper = input.parentElement!;
				const stale = document.createElement('p');
				stale.textContent = 'Added before activation completed';
				// Another DOM integration can insert content at the boundary's tail
				// while Octane has left its server HTML visible but inactive.
				if (!suspended) wrapper.insertBefore(stale, wrapper.lastChild);
				hydrate(
					ownership,
					{ when, pending: suspended ? pending.promise : undefined, onInput, onHydrated },
					{ onRecoverableError, onUncaughtError },
				);
				await Client.act(() => {});
				if (suspended) {
					wrapper.insertBefore(stale, wrapper.lastChild);
					expect(stale.isConnected).toBe(true);
					expect(onHydrated).not.toHaveBeenCalled();
					await Client.act(() => pending.resolve());
				}

				// The draft typed into the discarded server input is gone, as in React.
				const rendered = container.querySelector('#descriptor-editor') as HTMLInputElement;
				expect(rendered).not.toBe(input);
				expect(input.isConnected).toBe(false);
				expect(rendered.value).toBe('Server draft');
				expect(stale.isConnected).toBe(false);
				expect(onRecoverableError).toHaveBeenCalledOnce();
				expect(onUncaughtError).not.toHaveBeenCalled();
				expect(onHydrated).toHaveBeenCalledOnce();
				rendered.value = 'Live draft after fallback';
				await Client.act(() => rendered.dispatchEvent(new Event('input', { bubbles: true })));
				expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft after fallback');
			});
		}

		it(`${ownership}: does not revive an unmounted pending activation`, async () => {
			const pending = deferred<void>();
			const when = load();
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			renderServer(ownership, { when });
			hydrate(ownership, { when, pending: pending.promise, onRef, onHydrated });
			await Client.act(() => {});

			root!.unmount();
			root = undefined;
			await Client.act(() => pending.resolve());

			expect(container.childNodes).toHaveLength(0);
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
		});

		it(`${ownership}: reports a rejected activation without committing its input`, async () => {
			const pending = deferred<void>();
			const when = load();
			const error = new Error('Descriptor data failed');
			const onRef = vi.fn();
			const onHydrated = vi.fn();
			const onUncaughtError = vi.fn();
			renderServer(ownership, { when });
			hydrate(
				ownership,
				{ when, pending: pending.promise, onRef, onHydrated },
				{ onUncaughtError },
			);
			await Client.act(() => {});

			await Client.act(() => pending.reject(error));

			expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(error);
			expect(container.querySelector('#descriptor-editor')).toBeNull();
			expect(onRef).not.toHaveBeenCalled();
			expect(onHydrated).not.toHaveBeenCalled();
		});
	}

	it('resumes a suspended list item in the server nodes of its list', async () => {
		const pending = deferred<void>();
		const when = load();
		const onInput = vi.fn();
		const onRef = vi.fn();
		const onHydrated = vi.fn();
		const onRecoverableError = vi.fn();
		container.innerHTML = Server.renderToString(server.ListApp, { when }).html;
		const section = container.querySelector('section')!;
		const nodes = Array.from(section.children);
		const input = container.querySelector('#descriptor-editor') as HTMLInputElement;
		root = Client.hydrateRoot(
			container,
			client.ListApp,
			{ when, pending: pending.promise, onInput, onRef, onHydrated },
			{ onRecoverableError },
		);
		await Client.act(() => {});
		expect(onHydrated).not.toHaveBeenCalled();

		await Client.act(() => pending.resolve());

		expect(container.querySelector('section')).toBe(section);
		expect(section.children).toHaveLength(nodes.length);
		nodes.forEach((node, i) => expect(section.children[i]).toBe(node));
		expect(section.textContent).toBe('tail');
		expect(onHydrated).toHaveBeenCalledOnce();
		expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
		expect(onRecoverableError).not.toHaveBeenCalled();
		input.value = 'Live draft';
		await Client.act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		expect(onInput).toHaveBeenCalledExactlyOnceWith('Live draft');
	});
});
